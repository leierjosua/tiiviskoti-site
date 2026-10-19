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
  sent_at: Date | null;
};

const kartoitusSelect = sql`
  select k.id, k.job_id, k.offer_id, k.staff_id, k.data, k.created_at, k.updated_at,
         s.full_name as staff_name,
         o.offer_number, o.status::text as offer_status, o.total_cents as offer_total_cents,
         o.accept_token, o.accepted_at, o.accepted_name, o.sent_at
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
};

export async function offerByToken(token: string): Promise<PublicOffer | null> {
  if (!isAcceptToken(token)) return null;
  try {
    const [row] = await sql<PublicOffer[]>`
      select id, offer_number, kind, customer_name, contact_name, email, address, postal_code, city,
             lines, total_cents, customer_note, inclusions, status::text as status, valid_until,
             created_at, accepted_at, accepted_name
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
