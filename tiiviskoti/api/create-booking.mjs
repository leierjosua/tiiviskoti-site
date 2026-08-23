// TiivisKoti — julkinen varausendpoint.
//
// Tämä on ohut sovitin: se validoi lomakkeen, laskee hinnan `pricing.mjs`:stä
// ja antaa varauksen CRM:lle. CRM (tiiviskoti-crm, `tk`-skeema) varaa ajan,
// tallentaa rivit, lähettää vahvistuspostin ja luo kalenteritapahtuman.
//
// Miksi hinta lasketaan täällä eikä CRM:ssä: `pricing.mjs` on hinnoittelun
// ainoa totuuden lähde ja sitä käyttää myös selaimen laskuri. Sen
// kahdentaminen CRM:ään rikkoisi juuri sen säännön, jonka takia hinnat
// keskitettiin — aiemmin hinta oli kolmessa paikassa ja jokainen verkkovaraus
// tallentui kertaalleen 0 €:na.
//
// Clientin lähettämiin summiin ei luoteta: lomake lähettää vain raa'at
// valinnat (`counts`, `extras`) sekä valitun ajan.
//
// HUOM: tämä ei enää kirjoita `public.bookings`-tauluun eikä tarvitse
// Supabase-tunnuksia. Vanhat taulut jäävät paikoilleen historiadataksi.

import { computePricing } from '../pricing.mjs';
import { sendMetaEvent, buildUserData } from '../meta-capi.mjs';

const CRM_BASE_URL = process.env.CRM_BASE_URL;
const BOOKING_SECRET = process.env.BOOKING_SECRET;

// ─────────────────────────────────────────────────────────────
// CRM-varaus. `tk.jobs`-taulussa on exclusion constraint, joka estää
// päällekkäisyyden kannan tasolla — se on ainoa luotettava paikka estää
// kaksi yhtaikaista varausta samaan aikaan.
//
// Miksi HTTP eikä suora kantayhteys: `tk`-skeema ei ole PostgRESTissä
// julkaistu ja sen omistaa CRM. Näin kantalogiikka pysyy yhdessä paikassa
// eikä markkinointisivun funktio tarvitse kantayhteyttä lainkaan.
// ─────────────────────────────────────────────────────────────
async function reserveCrmJob(payload) {
  if (!CRM_BASE_URL || !BOOKING_SECRET) {
    return { misconfigured: true, reason: 'CRM_BASE_URL / BOOKING_SECRET puuttuu' };
  }
  const r = await fetch(`${CRM_BASE_URL}/api/public/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tk-secret': BOOKING_SECRET },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  // 409 tarkoittaa nyt useaa asiaa: aika varattu, postinumero palvelualueen
  // ulkopuolella, tai kalenteri ei palvele sitä aluetta. Ne on erotettava,
  // muuten asiakkaalle valitetaan varatusta ajasta kun kyse on alueesta.
  // `reason` kuuluu 409:ään alennuskoodin takia: koodi voi kaatua monella
  // eri tavalla (vanhentunut, loppuun käytetty, jo käytetty), ja asiakkaalle
  // on kerrottava kumpi — muuten hän yrittää samaa koodia uudelleen.
  if (r.status === 409) {
    return { conflict: data.error || 'slot_taken', area: data.area, postal: data.postal, reason: data.reason };
  }
  if (!r.ok) return { failed: true, status: r.status, error: data.error };
  return data;
}

async function releaseCrmJob(jobId) {
  if (!jobId || !CRM_BASE_URL || !BOOKING_SECRET) return;
  try {
    await fetch(`${CRM_BASE_URL}/api/public/booking?jobId=${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
      headers: { 'x-tk-secret': BOOKING_SECRET },
    });
  } catch (e) {
    console.error('create-booking: CRM-varauksen peruutus ei onnistunut:', jobId, String(e).slice(0, 200));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let crmJobId = null;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { name, email, phone, address, postal, notes } = body;
    /* Alennuskoodi välitetään sellaisenaan CRM:lle, joka laskee vähennyksen
       omasta taulustaan. Tässä ei lasketa siitä mitään — sama sääntö kuin
       matkalisällä: kampanjakohtaiset vähennykset elävät kannassa, eivät
       `pricing.mjs`:ssä, jottei uusi kampanja vaadi julkaisua. */
    const discountCode = typeof body.discountCode === 'string'
      ? body.discountCode.slice(0, 40)
      : undefined;
    /* Mainoskampanjan tunniste, jonka sivu poimi osoitteen ?src=-parametrista.
       Kelvoton arvo pudotetaan pois eikä hylätä varausta: tämä on pelkkä
       merkintä raportointia varten, eikä rikkinäinen mainoslinkki saa estää
       kauppaa. Sama muotorajaus kuin CRM:ssä ja kannassa. */
    const campaignRaw = typeof body.campaign === 'string'
      && /^[a-z0-9][a-z0-9._-]{0,59}$/.test(body.campaign)
      ? body.campaign
      : undefined;
    /* Google Ads -klikin tunniste. Kulkee CRM:lle työn omana kenttänä, josta
       adminin Ads-konversiot -näkymä ja Googlen konversiotuonti sen lukevat.
       Kelvoton arvo pudotetaan pois samalla perusteella kuin kampanja. */
    const gclid = typeof body.gclid === 'string'
      && /^[A-Za-z0-9_-]{10,200}$/.test(body.gclid)
      ? body.gclid
      : undefined;

    /* Kumpi Googlen klikkitunnisteista `gclid` on: tavallinen gclid vai
       iOS-liikenteen wbraid/gbraid. Arvot näyttävät samalta, mutta Adsin
       rajapinnassa kullakin on oma kenttänsä — väärässä kentässä konversio
       hylätään. Tuntematon arvo tulkitaan gclidiksi, koska se on niistä
       ylivoimaisesti yleisin. */
    const gclidKind = ['gclid', 'wbraid', 'gbraid'].includes(body.gclidKind)
      ? body.gclidKind
      : 'gclid';

    /* CRM näyttää `campaign`-arvon työn "Lähde"-kenttänä, ja ilman sitä siinä
       lukee vain "Verkkosivu". Mainoksesta tullut varaus merkitään siksi
       kampanjaksi `google-ads`, jotta sen näkee työstä yhdellä silmäyksellä
       ilman että konversiotaulua tarvitsee avata.

       Oikea ?src=-kampanja voittaa aina: jos kävijä tuli postilaatikkomainoksen
       QR-koodista ja klikkasi joskus myös mainosta, kunnia kuuluu sille
       kampanjalle joka on nimenomaisesti merkitty. Gclid on vain vara-arvo. */
    const campaign = campaignRaw || (gclid ? 'google-ads' : undefined);
    const counts = (body.counts && typeof body.counts === 'object') ? body.counts : {};
    const extras = (body.extras && typeof body.extras === 'object') ? body.extras : {};
    // Täsmällinen alkuhetki ja kalenteri siitä slotista jonka asiakas näki.
    const startsAt = typeof body.startsAt === 'string' ? body.startsAt : null;
    const calendarId = typeof body.calendarId === 'string' ? body.calendarId : null;

    // --- validointi ---
    const fields = [];
    if (!name || !String(name).trim()) fields.push('name');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) fields.push('email');
    if (!phone || !String(phone).trim()) fields.push('phone');
    if (!address || !String(address).trim()) fields.push('address');
    if (!/^\d{5}$/.test(String(postal || ''))) fields.push('postal');
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) fields.push('startsAt');
    if (!calendarId || !/^[0-9a-f-]{36}$/i.test(calendarId)) fields.push('calendarId');
    if (fields.length) return res.status(400).json({ error: 'validation', fields });

    // Mennyt aika ei ole varattavissa. CRM tarkistaa saman, mutta virhe on
    // selkeämpi täällä.
    if (Date.parse(startsAt) < Date.now()) {
      return res.status(400).json({ error: 'in_past' });
    }

    // --- hinta: sama laskenta kuin sivun laskurissa ---
    const quote = computePricing(counts, extras);

    // Emme tee ilmaisia kartoituskäyntejä: varaus vaatii vähintään yhden
    // kohteen. Aiemmin nolla kohdetta tuotti hiljaisesti 0 €:n varauksen.
    if (quote.work <= 0 || quote.count <= 0) {
      return res.status(400).json({ error: 'no_items' });
    }

    /* Lähetetään TYÖN hinta ilman matkalisää. Matkalisä on palvelualueen
       ominaisuus (`tk.areas`) eikä tämän moduulin tiedossa, joten CRM lisää
       sen — näin kummallakin luvulla on täsmälleen yksi lähde ja asiakkaan
       lähettämä matkalisä ei voi vaikuttaa veloitukseen. */
    const workCents = Math.round(quote.work * 100);

    // Varmiste: työn rivien summan on täsmättävä työn hintaan. Säilytetty
    // vanhasta polusta, koska hinnan hajoaminen kaatoi varaukset kertaalleen.
    const lineSum = quote.lines.reduce((s, l) => s + Math.round(l.sum * 100), 0);
    if (lineSum !== workCents) {
      console.error('create-booking: rivisumma', lineSum, '!= työn hinta', workCents);
      return res.status(500).json({ error: 'pricing_mismatch' });
    }

    // Työn kesto = arvioitu työaika. Vähintään 30 min, ettei kalenteriin
    // synny nollan mittaisia tapahtumia.
    const durationMinutes = Math.max(30, quote.minutes);

    // --- varaus CRM:ään ---
    const reservation = await reserveCrmJob({
      calendarId,
      startsAt,
      durationMinutes,
      name: String(name).trim(),
      email: String(email).trim(),
      phone: String(phone).trim(),
      address: String(address).trim(),
      postalCode: String(postal),
      notes: notes ? String(notes) : undefined,
      discountCode,
      campaign,
      gclid,
      gclidKind,
      workCents,
      title: `Tiivistys: ${quote.count} kohdetta`,
      // Rivit sellaisenaan pricing.mjs:stä: CRM tallentaa ne työn riveiksi ja
      // listaa vahvistuspostissa, joten hinnat pysyvät yhdessä paikassa.
      lines: quote.lines.map((l) => ({
        name: l.name, qty: l.qty, unit: l.unit, sum: l.sum,
        unitName: l.unitName, note: l.note,
      })),
    });

    if (reservation.conflict) {
      return res.status(409).json({
        error: reservation.conflict,
        area: reservation.area,
        postal: reservation.postal,
        reason: reservation.reason,
      });
    }
    if (reservation.misconfigured) {
      console.error('create-booking: CRM-asetukset puuttuvat —', reservation.reason);
      return res.status(500).json({ error: 'server_misconfigured' });
    }
    if (reservation.failed) {
      console.error('create-booking: CRM-varaus epäonnistui:', reservation.status, reservation.error);
      return res.status(503).json({ error: 'booking_unavailable' });
    }
    crmJobId = reservation.jobId ?? null;

    // Posti tai kalenteri voi pettää ilman että varaus on pilalla. Asiakkaalle
    // näytetään onnistuminen — varaus on voimassa — mutta syy on saatava
    // lokista, jotta puuttuva vahvistus huomataan.
    if (reservation.mailSent === false) {
      console.error('create-booking: vahvistuspostia EI lähetetty:', reservation.jobNumber, reservation.mailError);
    }
    if (reservation.workOrderSent === false) {
      console.error('create-booking: työmääräintä EI lähetetty:', reservation.jobNumber, reservation.workOrderError);
    }
    if (reservation.calendarCreated === false) {
      console.error('create-booking: kalenteritapahtumaa EI luotu:', reservation.jobNumber, reservation.calendarError);
    }

    /* Meta CAPI: ilmoitetaan toteutunut varaus ostoksena (Purchase) palvelimelta.
       Varaus on kiinteähintainen työtilaus = maksullinen kauppa, joten sitä
       optimoidaan Metan Purchase-tapahtumana (arvo = varauksen hinta EUR).
       Sama periaate kuin gclidissä — vain oikeasta kaupasta, vasta kun se
       tapahtui. sendMetaEvent ei koskaan heitä eikä muuta vastausta, joten
       markkinointiseuranta ei voi kaataa jo tehtyä varausta. event_id =
       jobId, jotta mahdollinen selain-Pixel deduplikoituu tähän. */
    await sendMetaEvent({
      eventName: 'Purchase',
      eventId: reservation.jobId || reservation.jobNumber,
      eventSourceUrl: req.headers?.referer || 'https://tiiviskoti.fi/varaa.html',
      userData: buildUserData({
        email, phone, name, postal,
        fbc: typeof body.fbc === 'string' ? body.fbc : undefined,
        fbp: typeof body.fbp === 'string' ? body.fbp : undefined,
        req,
      }),
      customData: {
        currency: 'EUR',
        value: (reservation.totalCents ?? workCents) / 100,
        content_category: 'booking',
        num_items: quote.count,
      },
    });

    return res.status(200).json({
      ok: true,
      ref: reservation.jobNumber,
      booking_id: reservation.jobId,
      total_cents: reservation.totalCents ?? workCents,
      // Toteutunut alennus, jotta kiitosnäkymä kertoo saman summan kuin
      // vahvistusposti — myös silloin kun koodi antoi vähemmän kuin
      // nimellisarvonsa (esim. tilaus pienempi kuin alennus).
      discount_cents: reservation.discountCents ?? 0,
      discount_code: reservation.discountCode ?? null,
    });
  } catch (e) {
    console.error('create-booking error:', e);
    // Aika ehdittiin varata, mutta ketju katkesi — vapautetaan slotti, jottei
    // kalenteriin jää haamuvarausta.
    await releaseCrmJob(crmJobId);
    return res.status(500).json({ error: 'server_error' });
  }
}
