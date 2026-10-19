import 'server-only';
import { randomBytes } from 'node:crypto';
import { sql } from './db';
import { kartoitusCalendarId } from './data';
import type { Staff } from './session';
import type { KartoitusData } from './kartoitus-schema';

/* =========================================================
   Kartoitus (db/038) ja tarjouksen sähköinen hyväksyntä.

   Hyväksyntälinkki: /hyvaksy/<accept_token> CRM:n omalla osoitteella.
   Sivu on julkinen (ei kirjautumista) — token on ainoa tunniste, sama
   luottamustaso kuin tarjouksen sähköpostilla, jossa linkki kulkee.

   Puuttuva taulu tai sarake (db/038 ajamatta) ei kaada mitään:
   ensureAcceptToken palauttaa null ja tarjous lähtee ilman linkkiä.
   ========================================================= */

const PUBLIC_BASE = (process.env.CRM_PUBLIC_URL ?? 'https://admin.tiiviskoti.fi').replace(/\/$/, '');

export const acceptUrl = (token: string) => `${PUBLIC_BASE}/hyvaksy/${token}`;
export const isAcceptToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t);

const code = (e: unknown) => (e as { code?: string })?.code;
/** 42P01 = taulu puuttuu, 42703 = sarake puuttuu → db/038 ajamatta. */
export const migrationMissing = (e: unknown) => code(e) === '42P01' || code(e) === '42703';

/** Tarjouksen hyväksyntätunniste; luodaan kerran, sama sen jälkeen. */
export async function ensureAcceptToken(offerId: string): Promise<string | null> {
  try {
    const token = randomBytes(24).toString('base64url');
    const [row] = await sql<{ accept_token: string }[]>`
      update tk.offers set accept_token = coalesce(accept_token, ${token})
       where id = ${offerId}::uuid
      returning accept_token
    `;
    return row?.accept_token ?? null;
  } catch (e) {
    if (migrationMissing(e)) return null;
    throw e;
  }
}

/* ---------- kartoitukset ---------- */

export type KartoitusJob = {
  id: string; job_number: string; starts_at: Date; title: string;
  address: string | null; postal_code: string | null; city: string | null;
  customer_name: string | null; email: string | null; phone: string | null;
  kartoitus_id: string | null;
};

/**
 * Kalenterin kartoituskäynnit viikko taaksepäin – kuukausi eteenpäin.
 * Kartoitukseksi tunnistetaan kartoituskalenterin työ tai otsikko jossa on
 * "kartoitus" (kotikartoitukset ja käsin luodut). Asentaja näkee omansa.
 */
export async function listKartoitusJobs(staff: Staff): Promise<KartoitusJob[]> {
  const calId = kartoitusCalendarId();
  const run = (withK: boolean) => sql<KartoitusJob[]>`
    select j.id, j.job_number, j.starts_at, j.title, j.address, j.postal_code, j.city,
           cu.full_name as customer_name, cu.email, cu.phone,
           ${withK ? sql`(select k.id from tk.kartoitukset k where k.job_id = j.id order by k.created_at desc limit 1)` : sql`null::uuid`} as kartoitus_id
      from tk.jobs j
      join tk.calendars c on c.id = j.calendar_id
      left join tk.customers cu on cu.id = j.customer_id
     where j.status <> 'cancelled'
       and j.starts_at between now() - interval '7 days' and now() + interval '31 days'
       and (${calId}::uuid is not null and j.calendar_id = ${calId}::uuid or j.title ilike '%kartoitu%')
       ${staff.role === 'installer' ? sql`and c.staff_id = ${staff.id}::uuid` : sql``}
     order by j.starts_at
     limit 60
  `;
  try {
    return await run(true);
  } catch (e) {
    if (migrationMissing(e)) return run(false);
    throw e;
  }
}

export type KartoitusRow = {
  id: string; job_id: string | null; offer_id: string | null; staff_id: string | null;
  data: KartoitusData; created_at: Date; updated_at: Date;
  staff_name: string | null;
  offer_number: string | null; offer_status: string | null; offer_total_cents: number | null;
  accept_token: string | null; accepted_at: Date | null; accepted_name: string | null;
  sent_at: Date | null; confirmed_at: string | null;
};

const kartoitusSelect = sql`
  select k.id, k.job_id, k.offer_id, k.staff_id, k.data, k.created_at, k.updated_at,
         s.full_name as staff_name,
         o.offer_number, o.status::text as offer_status, o.total_cents as offer_total_cents,
         o.accept_token, o.accepted_at, o.accepted_name, o.sent_at,
         o.accepted_meta->'confirm'->>'confirmedAt' as confirmed_at
    from tk.kartoitukset k
    left join tk.staff s on s.id = k.staff_id
    left join tk.offers o on o.id = k.offer_id
`;

/** Viimeisimmät kartoitukset. null = db/038 ajamatta. */
export async function listKartoitukset(staff: Staff): Promise<KartoitusRow[] | null> {
  try {
    return await sql<KartoitusRow[]>`
      ${kartoitusSelect}
      ${staff.role === 'installer' ? sql`where k.staff_id = ${staff.id}::uuid` : sql``}
      order by k.updated_at desc limit 50
    `;
  } catch (e) {
    if (migrationMissing(e)) return null;
    throw e;
  }
}

export async function getKartoitus(id: string, staff: Staff): Promise<KartoitusRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const [row] = await sql<KartoitusRow[]>`
      ${kartoitusSelect}
      where k.id = ${id}::uuid
      ${staff.role === 'installer' ? sql`and k.staff_id = ${staff.id}::uuid` : sql``}
    `;
    return row ?? null;
  } catch (e) {
    if (migrationMissing(e)) return null;
    throw e;
  }
}

/* ---------- julkinen hyväksyntä ---------- */

export type PublicOffer = {
  id: string; offer_number: string; kind: string;
  customer_name: string; contact_name: string | null; email: string;
  address: string | null; postal_code: string | null; city: string | null;
  lines: { name: string; quantity: number; unit_price_cents: number }[];
  total_cents: number; customer_note: string | null; inclusions: string[] | null;
  status: string; valid_until: Date | null; created_at: Date;
  accepted_at: Date | null; accepted_name: string | null;
  /** Sähköpostivahvistuksen aika (accepted_meta.confirm.confirmedAt). */
  confirmed_at: string | null;
};

export async function offerByToken(token: string): Promise<PublicOffer | null> {
  if (!isAcceptToken(token)) return null;
  try {
    const [row] = await sql<PublicOffer[]>`
      select id, offer_number, kind, customer_name, contact_name, email, address, postal_code, city,
             lines, total_cents, customer_note, inclusions, status::text as status, valid_until,
             created_at, accepted_at, accepted_name,
             accepted_meta->'confirm'->>'confirmedAt' as confirmed_at
        from tk.offers where accept_token = ${token}
    `;
    return row ?? null;
  } catch (e) {
    if (migrationMissing(e)) return null;
    throw e;
  }
}

/**
 * Kirjaa hyväksynnän. Palauttaa false jos tarjous oli jo hyväksytty,
 * peruttu tai vanhentunut — ehto on samassa UPDATEssa, jotta kaksi
 * yhtaikaista painallusta ei kirjaa kahta hyväksyntää.
 */
export async function acceptOffer(
  token: string, name: string, meta: Record<string, unknown>,
): Promise<'ok' | 'not_found' | 'closed'> {
  const offer = await offerByToken(token);
  if (!offer) return 'not_found';
  const rows = await sql`
    update tk.offers
       set status = 'accepted'::tk.offer_status, accepted_at = now(), accepted_name = ${name},
           accepted_meta = ${sql.json({
             ...meta,
             total_cents: offer.total_cents,
             lines: offer.lines,
           } as never)},
           updated_at = now()
     where accept_token = ${token}
       and accepted_at is null
       and status in ('sent', 'draft')
       and (valid_until is null or valid_until > now() - interval '1 day')
    returning id
  `;
  return rows.length ? 'ok' : 'closed';
}

/* ---------- sähköpostivahvistus ----------
   Josua 19.10.2026: sivulla hyväksymisen jälkeen asiakkaan on vielä
   VAHVISTETTAVA tarjous vastaamalla sähköpostiin. Hyväksyntä kartoittajan
   puhelimella ei yksin todista, että asiakas itse on samaa mieltä — vastaus
   omasta postista todistaa.

   Tila tallentuu `accepted_meta.confirm`-kenttään (ei uutta migraatiota):
     { threadId, sentAt, confirmedAt?, from?, snippet?, manualBy? }
   Vastaus tunnistetaan lukemalla Gmail-ketju (gmail.readonly): ketjussa on
   viesti jonka lähettäjä ei ole oma osoite ja joka tuli vahvistuspyynnön
   jälkeen. Jos lukeminen ei onnistu (oikeus puuttuu, asiakas vastasi uutena
   viestinä), toimisto merkitsee vahvistuksen käsin. */

export type ConfirmState = {
  threadId?: string | null; sentAt?: string; confirmedAt?: string;
  from?: string; snippet?: string; manualBy?: string;
};

export async function setConfirmSent(offerId: string, threadId: string | null): Promise<void> {
  await sql`
    update tk.offers
       set accepted_meta = coalesce(accepted_meta, '{}'::jsonb)
           || jsonb_build_object('confirm', jsonb_build_object('threadId', ${threadId}::text, 'sentAt', now()))
     where id = ${offerId}::uuid
  `;
}

export async function getConfirm(offerId: string): Promise<ConfirmState | null> {
  try {
    const [r] = await sql<{ c: ConfirmState | null }[]>`select accepted_meta->'confirm' as c from tk.offers where id = ${offerId}::uuid`;
    return r?.c ?? null;
  } catch (e) {
    if (migrationMissing(e)) return null;
    throw e;
  }
}

async function markConfirmed(offerId: string, patch: Partial<ConfirmState>): Promise<boolean> {
  const rows = await sql`
    update tk.offers
       set accepted_meta = jsonb_set(coalesce(accepted_meta, '{}'::jsonb), '{confirm}',
             coalesce(accepted_meta->'confirm', '{}'::jsonb) || ${sql.json({ ...patch, confirmedAt: new Date().toISOString() } as never)})
     where id = ${offerId}::uuid and accepted_at is not null
       and (accepted_meta->'confirm'->>'confirmedAt') is null
    returning id
  `;
  return rows.length > 0;
}

/** Toimisto merkitsee vahvistuksen käsin (esim. asiakas vastasi uutena viestinä tai soitti). */
export async function confirmManually(offerId: string, staffName: string): Promise<boolean> {
  return markConfirmed(offerId, { manualBy: staffName });
}

/**
 * Tarkistaa onko asiakas vastannut vahvistuspyyntöön. Kutsutaan sivujen
 * latauksessa — yksi Gmail-pyyntö odottavaa tarjousta kohti.
 * Palauttaa tilan; `error` kun ketjua ei voitu lukea.
 */
export async function checkConfirmation(offerId: string): Promise<ConfirmState & { error?: string }> {
  const c = await getConfirm(offerId);
  if (!c || c.confirmedAt || !c.threadId) return c ?? {};
  const { getThreadMessages, SENDER_EMAIL } = await import('./google');
  try {
    const sentAt = c.sentAt ? new Date(c.sentAt).getTime() : 0;
    const reply = (await getThreadMessages(c.threadId)).find((m) =>
      m.at.getTime() > sentAt && !m.from.toLowerCase().includes(SENDER_EMAIL.toLowerCase()));
    if (!reply) return c;
    if (await markConfirmed(offerId, { from: reply.from.slice(0, 200), snippet: reply.snippet })) {
      await notifyConfirmed(offerId, reply.from, reply.snippet).catch((e) => console.error('vahvistusilmoitus:', e));
    }
    return { ...c, confirmedAt: reply.at.toISOString(), from: reply.from, snippet: reply.snippet };
  } catch (e) {
    return { ...c, error: (e as Error).message };
  }
}

async function notifyConfirmed(offerId: string, from: string, snippet: string) {
  const [o] = await sql<{ offer_number: string; customer_name: string; total_cents: number }[]>`
    select offer_number, customer_name, total_cents from tk.offers where id = ${offerId}::uuid`;
  if (!o) return;
  const { sendMail, SENDER_EMAIL } = await import('./google');
  const to = (process.env.LEAD_NOTIFY_TO ?? SENDER_EMAIL).split(',')[0].trim();
  const eur = (o.total_cents / 100).toLocaleString('fi-FI', { maximumFractionDigits: 2 }) + ' €';
  const text = [
    `Asiakas vahvisti tarjouksen ${o.offer_number} sähköpostilla.`,
    `Asiakas: ${o.customer_name} · ${eur}`,
    `Vastaus: ${from}`,
    snippet ? `"${snippet}"` : '',
    '',
    'Seuraava askel: sovi asennusaika ja tee työ tarjoukselta CRM:ssä (Laita aika).',
  ].filter(Boolean).join('\n');
  await sendMail({
    to, subject: `✅ Tarjous ${o.offer_number} vahvistettu — ${o.customer_name} ${eur}`,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${text.replace(/</g, '&lt;')}</pre>`, text,
  });
}
