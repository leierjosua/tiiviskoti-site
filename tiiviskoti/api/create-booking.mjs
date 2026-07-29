// TiivisKoti — julkinen varausendpoint.
// Ottaa vastaan varauslomakkeen, luo asiakkaan + varauksen Supabaseen
// service_role-avaimella (vain palvelinpuolella).
//
// Hinta lasketaan aina uudelleen pricing.mjs:stä — samasta moduulista jota
// sivun laskuri käyttää — eikä clientin lähettämiin summiin luoteta lainkaan.
// Lomake lähettää vain raa'at valinnat (`counts`, `extras`).

import { TYPES, EXTRAS, computePricing } from '../pricing.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const baseHeaders = () => ({
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  'Content-Type': 'application/json',
});

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...baseHeaders(), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) throw new Error(`Supabase ${res.status} ${path}: ${text}`);
  return data;
}

const norm = (s) => String(s || '').trim().toLowerCase();

// Kannan label voi olla pidempi kuin sivun nimi
// (esim. "Ulko-ovi (sivutiivisteet + kynnyskumi, säätö)" vs "Ulko-ovi").
// Sovita: tarkka osuma → label alkaa nimellä → nimi alkaa labelilla → sanavastaavuus.
const words = (s) =>
  norm(s).split(/[^0-9a-zäöåà-ÿ]+/).filter((t) => t.length > 2);

// Viimeinen keino: jokaiselle kannan labelin sanalle löytyy sivun nimestä sana,
// joka on sen alku tai päinvastoin. Kattaa esim. "Pelkkä kynnyskumi" → "Kynnyskumi"
// ja "Väli- / huoneovi" → "Väliovi", joita pelkkä startsWith ei löydä.
function wordMatch(label, wanted) {
  const lw = words(label), ww = words(wanted);
  if (!lw.length || !ww.length) return false;
  return lw.every((a) =>
    ww.some((b) => (a.length >= 4 && b.length >= 4) && (a.startsWith(b) || b.startsWith(a)))
  );
}

function matchByName(arr, key, wanted) {
  const w = norm(wanted);
  if (!w) return null;
  return (
    arr.find((x) => norm(x[key]) === w) ||
    arr.find((x) => norm(x[key]).startsWith(w)) ||
    arr.find((x) => w.startsWith(norm(x[key]))) ||
    arr.find((x) => wordMatch(x[key], wanted)) ||
    null
  );
}

// Yrityksen lähettäjäosoite — sama kuin supabase/functions/_shared/constants.ts.
const SENDER_EMAIL = 'info@tiiviskoti.fi';

// Asettaa varauksen keston. Erillinen PATCH, koska sarake tulee vasta
// migraatiossa 20260724200000 — ennen sitä kutsu epäonnistuu eikä saa
// vaikuttaa itse varaukseen.
async function setBookingDuration(bookingId, minutes) {
  try {
    await sb(`bookings?id=eq.${bookingId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ duration_minutes: minutes }),
    });
  } catch (e) {
    console.warn('create-booking: duration_minutes ei asetettu (migraatio ajamatta?):', String(e).slice(0, 200));
  }
}

// Kirjoittaa rivin email_outboxiin. Kannassa oleva INSERT-trigger + 2 min cron
// ajavat process-email-outbox -funktion, joka rakentaa ja lähettää viestin
// Gmailin kautta. Jos Google-tunnukset puuttuvat, rivi uusitaan backoffilla
// ~8,5 h ajan ja päätyy sen jälkeen dead_letteriin — varaus itse ei kaadu.
async function queueConfirmationEmail(bookingId) {
  try {
    await sb('email_outbox', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        type: 'booking',
        payload: { booking_id: bookingId, email_type: 'confirmation' },
        sender_email: SENDER_EMAIL,
        status: 'pending',
        // Oletus 3 yritystä = backoffilla (2^n min) vain ~6 min ikkuna, jonka
        // jälkeen rivi kuolee dead_letteriin. 8 yritystä antaa ~8,5 h, joten
        // ohimenevä Google-katko tai puuttuva tunnus ei hukkaa vahvistusta.
        max_attempts: 8,
        reference_type: 'booking',
        reference_id: bookingId,
      }),
    });
  } catch (e) {
    console.error('create-booking: vahvistussähköpostin jonotus epäonnistui:', e);
  }
}

// Kutsuu create-booking-calendar-event -edge-funktiota. Ilman Google-tunnuksia
// tämä palauttaa virheen, joka logitetaan — varaus jää silti voimaan ja
// kalenteritapahtuman voi luoda jälkikäteen administa.
async function createCalendarEvent(bookingId) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/create-booking-calendar-event`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ booking_id: bookingId }),
    });
    if (!r.ok) {
      console.error('create-booking: kalenteritapahtuma epäonnistui:', r.status, await r.text());
    }
  } catch (e) {
    console.error('create-booking: kalenterikutsu epäonnistui:', e);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('create-booking: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { name, email, phone, address, postal, notes, date, slot } = body;
    const counts = (body.counts && typeof body.counts === 'object') ? body.counts : {};
    const extras = (body.extras && typeof body.extras === 'object') ? body.extras : {};

    // --- validointi ---
    const fields = [];
    if (!name || !String(name).trim()) fields.push('name');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) fields.push('email');
    if (!phone || !String(phone).trim()) fields.push('phone');
    if (!address || !String(address).trim()) fields.push('address');
    if (!/^\d{5}$/.test(String(postal || ''))) fields.push('postal');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) fields.push('date');
    if (!/^\d{2}:\d{2}$/.test(String(slot || ''))) fields.push('slot');
    if (fields.length) return res.status(400).json({ error: 'validation', fields });

    // --- hinta: sama laskenta kuin sivun laskurissa ---
    const quote = computePricing(counts, extras);

    // Emme tee ilmaisia kartoituskäyntejä: varaus vaatii vähintään yhden kohteen.
    // Aiemmin nolla kohdetta tuotti hiljaisesti 0 €:n "veloituksettoman
    // kartoituskäynnin" — ja koska laskurin valinta ei siirtynyt varaussivulle,
    // JOKA verkkovaraus osui siihen haaraan.
    if (quote.total <= 0 || quote.count <= 0) {
      return res.status(400).json({ error: 'no_items' });
    }

    // --- hae palvelu, kalenteri, variantit, lisäpalvelut ---
    const [svcRows, calRows, variants, addons] = await Promise.all([
      sb('services?active=eq.true&select=id&order=sort_order&limit=1'),
      sb('installer_calendars?active=eq.true&select=id,employee_id&limit=1'),
      sb('service_variants?select=id,label,price_cents,duration_minutes'),
      sb('addon_services?select=id,name,price_cents,duration_minutes'),
    ]);
    const service = svcRows && svcRows[0];
    const cal = (calRows && calRows[0]) || null;
    if (!service) return res.status(500).json({ error: 'no_service_configured' });

    // --- rakenna kannan rivit lasketun hinnoittelun pohjalta ---
    // Hinta, määrä ja kesto tulevat AINA pricing.mjs:stä. Kantaa käytetään vain
    // rivin linkittämiseen katalogiin (variant_id / addon_service_id), jotta
    // admin ja tarjous-PDF osaavat näyttää oikean tuotteen. Jos linkkiä ei
    // löydy, rivi kirjataan `custom`-rivinä oikealla hinnalla — katalogivirhe
    // ei saa muuttaa asiakkaan laskua eikä kaataa varausta.
    const unmatched = [];
    let primaryVariant = null;

    const lines = quote.lines.map((l, i) => {
      const base = {
        service_id: null,
        variant_id: null,
        addon_service_id: null,
        name: l.name,
        price_cents: Math.round(l.unit * 100),
        quantity: l.qty,
        duration_minutes: l.min || 0,
        sort_order: i,
      };
      if (l.kind === 'type') {
        const t = TYPES.find((x) => x.id === l.id);
        const v = matchByName(variants, 'label', t ? t.name : l.name);
        if (v) {
          if (!primaryVariant) primaryVariant = v;
          return { ...base, line_type: 'service', service_id: service.id, variant_id: v.id, name: v.label };
        }
        unmatched.push(l.name);
        return { ...base, line_type: 'custom' };
      }
      if (l.kind === 'extra') {
        const e = EXTRAS.find((x) => x.id === l.id);
        // Osan hinta ei sisälly (kahvan vaihto) — merkitään riville, jotta
        // asentaja ja lasku näkevät sen ilman erillistä muistisääntöä.
        const suffix = l.note ? ` (${l.note})` : '';
        const a = matchByName(addons, 'name', e ? e.name : l.name);
        if (a) return { ...base, line_type: 'addon_service', addon_service_id: a.id, name: a.name + suffix };
        unmatched.push(l.name);
        return { ...base, line_type: 'custom', name: base.name + suffix };
      }
      return { ...base, line_type: 'custom' }; // aloitusmaksu
    });

    if (unmatched.length) {
      console.error('create-booking: katalogista puuttuu:', unmatched.join(' | '));
    }

    const total = Math.round(quote.total * 100);

    // Varmiste: rivien summan on täsmättävä veloitettavaan hintaan, muuten
    // admin ja lasku näyttäisivät eri luvun kuin asiakkaalta veloitetaan.
    const lineSum = lines.reduce((s, l) => s + l.price_cents * l.quantity, 0);
    if (lineSum !== total) {
      console.error('create-booking: rivisumma', lineSum, '!= kokonaishinta', total);
      return res.status(500).json({ error: 'pricing_mismatch' });
    }

    // Kalenteritapahtuman kesto. Vähintään 30 min, ettei kalenteriin synny
    // nollan mittaisia tapahtumia.
    const durationMinutes = Math.max(30, quote.minutes);

    // --- asiakas: etsi sähköpostilla tai luo uusi ---
    const parts = String(name).trim().split(/\s+/);
    const first = parts.shift();
    const last = parts.join(' ');
    let customer;
    const existing = await sb(
      `customers?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
    );
    if (existing.length) {
      customer = existing[0];
      await sb(`customers?id=eq.${customer.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          first_name: first, last_name: last, phone,
          address, postal_code: String(postal),
        }),
      });
    } else {
      const created = await sb('customers', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          first_name: first, last_name: last, email, phone,
          address, postal_code: String(postal),
        }),
      });
      customer = created[0];
    }

    // --- varaus ---
    const created = await sb('bookings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        customer_id: customer.id,
        service_id: service.id,
        variant_id: primaryVariant ? primaryVariant.id : null,
        calendar_id: cal ? cal.id : null,
        employee_id: cal ? cal.employee_id : null,
        booking_date: date,
        time_slot: slot,
        postal_code: String(postal),
        address,
        price_cents: total,
        status: 'pending',
        notes: notes ? String(notes) : null,
      }),
    });
    const booking = created[0];

    // --- rivit ---
    if (lines.length > 0) {
      await sb('booking_line_items', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(lines.map((l) => ({ ...l, booking_id: booking.id }))),
      });
    }

    // Kesto omana PATCHina, ei insertissä: sarake `bookings.duration_minutes`
    // syntyy vasta migraatiossa 20260724200000. Jos migraatiota ei ole vielä
    // ajettu, tämä epäonnistuu hiljaisesti eikä kaada varausta — ja alkaa
    // toimia itsestään heti kun `supabase db push` on ajettu.
    await setBookingDuration(booking.id, durationMinutes);

    // --- Vaihe 3: vahvistussähköposti + kalenteritapahtuma ---
    // Kumpikaan ei saa kaataa varausta: varaus on jo kannassa ja näkyy
    // adminissa, joten sähköpostin tai kalenterin virhe logitetaan vain.
    await queueConfirmationEmail(booking.id);
    await createCalendarEvent(booking.id);

    const ref = 'TK-' + booking.id.replace(/-/g, '').slice(0, 6).toUpperCase();
    return res.status(200).json({ ok: true, ref, booking_id: booking.id, total_cents: total });
  } catch (e) {
    console.error('create-booking error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
}
