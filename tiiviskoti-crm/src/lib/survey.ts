import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from './db';
import { supabaseAdmin, adminAuthConfigured } from './supabase-admin';
import { PHOTO_SLOTS, type PhotoSlot, type SurveyAnswers } from './survey-schema';

/* =========================================================
   Kohdetiedot — asiakkaan kysely ennen keikkaa (db/037).

   Asiakas avaa kyselyn tiiviskoti.fi/kohdetiedot.html?t=<token> joko heti
   varauksen jälkeen tai vahvistuspostin linkistä. Sivu on staattinen ja
   puhuu julkiselle rajapinnalle /api/public/kohdetiedot.

   TOKEN ON AINOA TUNNISTE. Kuka tahansa jolla on linkki, voi täyttää
   kyselyn — sama luottamustaso kuin vahvistuspostilla. Siksi kysely ei
   näytä mitään mitä postissa ei jo ole (aika, osoite, etunimi), eikä
   koskaan muiden asiakkaiden tietoja.

   Kuvat menevät samaan yksityiseen ämpäriin ja `tk.job_photos`-tauluun
   kuin asentajan kuvat, kuvatekstillä "Asiakas: …". Näin ne näkyvät
   työn sivulla ilman uutta näkymää.

   Puuttuva taulu (db/037 ajamatta) ei kaada varausta: ensureSurvey
   palauttaa null ja vahvistusposti lähtee ilman kyselylinkkiä.
   ========================================================= */

const BUCKET = 'tyokuvat';
const SITE_URL = (process.env.SITE_URL ?? 'https://tiiviskoti.fi').replace(/\/$/, '');

const SALLITUT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif',
};

function missingTable(e: unknown): boolean {
  return (e as { code?: string })?.code === '42P01';
}

export function surveyUrl(token: string): string {
  return `${SITE_URL}/kohdetiedot.html?t=${token}`;
}

/** Linkin muoto: 32 merkkiä base64url. Tarkistetaan ennen kantaa. */
export const isToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t);

/**
 * Työn kyselytunniste — luodaan ensimmäisellä kutsulla, sama sen jälkeen.
 * Uudelleenlähetetty vahvistus kantaa siis saman linkin kuin ensimmäinen.
 */
export async function ensureSurvey(jobId: string): Promise<string | null> {
  try {
    const token = randomBytes(24).toString('base64url');
    await sql`
      insert into tk.job_surveys (job_id, token) values (${jobId}::uuid, ${token})
      on conflict (job_id) do nothing
    `;
    const [row] = await sql<{ token: string }[]>`
      select token from tk.job_surveys where job_id = ${jobId}::uuid
    `;
    return row?.token ?? null;
  } catch (e) {
    if (missingTable(e)) return null;
    console.error('ensureSurvey:', e);
    return null;
  }
}

type SurveyRow = {
  job_id: string; job_number: string; starts_at: Date; status: string;
  address: string | null; customer_name: string | null;
  answers: SurveyAnswers; submitted_at: Date | null;
  windows: number; doors: number;
};

async function rowByToken(token: string): Promise<SurveyRow | null> {
  if (!isToken(token)) return null;
  try {
    const [row] = await sql<SurveyRow[]>`
      select s.job_id, j.job_number, j.starts_at, j.status::text as status, j.address,
             c.full_name as customer_name, s.answers, s.submitted_at,
             coalesce((select sum(quantity) from tk.job_lines l
                        where l.job_id = j.id and l.name ilike '%ikkuna%'), 0)::int as windows,
             coalesce((select sum(quantity) from tk.job_lines l
                        where l.job_id = j.id and l.name ~* 'ovi' and l.name !~* 'kynnys'), 0)::int as doors
        from tk.job_surveys s
        join tk.jobs j on j.id = s.job_id
        left join tk.customers c on c.id = j.customer_id
       where s.token = ${token}
    `;
    return row ?? null;
  } catch (e) {
    if (missingTable(e)) return null;
    throw e;
  }
}

/** Kyselyä saa muokata keikkaa seuraavaan päivään asti, ei peruttua. */
function editable(r: SurveyRow): boolean {
  return r.status !== 'cancelled' && Date.now() < r.starts_at.getTime() + 24 * 3600_000;
}

export type PublicSurvey = {
  jobNumber: string;
  startsAt: string;
  address: string | null;
  firstName: string;
  /** Mitä varaukseen kuuluu — sivu näyttää vain osuvat osiot. 0/0 = ei tiedossa, näytä molemmat. */
  windows: number;
  doors: number;
  answers: Omit<SurveyAnswers, 'photos'>;
  photos: Partial<Record<PhotoSlot, string>>;
  submittedAt: string | null;
  editable: boolean;
};

export async function loadSurvey(token: string): Promise<PublicSurvey | null> {
  const r = await rowByToken(token);
  if (!r) return null;
  const { photos: paths = {}, ...answers } = r.answers ?? {};

  /* Esikatselukuvat allekirjoitetaan tunniksi. Ämpäri on yksityinen. */
  const photos: Partial<Record<PhotoSlot, string>> = {};
  const list = Object.entries(paths) as [PhotoSlot, string][];
  if (list.length && adminAuthConfigured()) {
    const { data } = await supabaseAdmin().storage.from(BUCKET)
      .createSignedUrls(list.map(([, p]) => p), 3600);
    const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    for (const [slot, p] of list) {
      const u = byPath.get(p);
      if (u) photos[slot] = u;
    }
  }

  return {
    jobNumber: r.job_number,
    startsAt: r.starts_at.toISOString(),
    address: r.address,
    firstName: (r.customer_name ?? '').trim().split(/\s+/)[0] ?? '',
    windows: r.windows,
    doors: r.doors,
    answers,
    photos,
    submittedAt: r.submitted_at?.toISOString() ?? null,
    editable: editable(r),
  };
}

/**
 * Tallenna vastaukset. `submit` = asiakas painoi "Lähetä"; muuten
 * välitallennus. Kuvapolut säilyvät — ne eivät tule selaimelta.
 */
export async function saveSurvey(
  token: string, answers: Omit<SurveyAnswers, 'photos'>, submit: boolean,
): Promise<'ok' | 'not_found' | 'locked'> {
  const r = await rowByToken(token);
  if (!r) return 'not_found';
  if (!editable(r)) return 'locked';
  const photos = r.answers?.photos ?? {};
  await sql`
    update tk.job_surveys
       set answers = ${sql.json({ ...answers, photos })},
           submitted_at = case when ${submit} then now() else submitted_at end,
           updated_at = now()
     where token = ${token}
  `;
  return 'ok';
}

/** Allekirjoitettu latausosoite yhdelle kuvalle. Selain PUTtaa suoraan Storageen. */
export async function preparePhoto(
  token: string, slot: PhotoSlot, contentType: string,
): Promise<{ error: string } | { path: string; uploadUrl: string }> {
  const r = await rowByToken(token);
  if (!r) return { error: 'not_found' };
  if (!editable(r)) return { error: 'locked' };
  if (!adminAuthConfigured()) return { error: 'storage_unavailable' };
  const ext = SALLITUT[contentType];
  if (!ext) return { error: 'bad_type' };

  const path = `job/${r.job_id}/asiakas-${slot}-${randomUUID()}.${ext}`;
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: 'sign_failed' };
  return { path, uploadUrl: data.signedUrl };
}

/**
 * Kirjaa ladatun kuvan. Saman paikan vanha kuva poistetaan: asiakas
 * vaihtaa kuvan ottamalla uuden, eikä työlle jää kahta "ikkuna ulkoa".
 */
export async function confirmPhoto(
  token: string, slot: PhotoSlot, path: string,
): Promise<'ok' | 'not_found' | 'locked' | 'bad_path'> {
  const r = await rowByToken(token);
  if (!r) return 'not_found';
  if (!editable(r)) return 'locked';
  // Polun on oltava tämän työn ja tämän paikan — muuten tällä voisi liittää
  // työhön minkä tahansa ämpärin tiedoston.
  if (!path.startsWith(`job/${r.job_id}/asiakas-${slot}-`) || path.includes('..')) return 'bad_path';

  const old = r.answers?.photos?.[slot];
  await sql.begin(async (tx) => {
    await tx`
      insert into tk.job_photos (job_id, path, caption, sort_order)
      values (${r.job_id}::uuid, ${path}, ${`Asiakas: ${PHOTO_SLOTS[slot].toLowerCase()}`},
              coalesce((select max(sort_order) + 1 from tk.job_photos where job_id = ${r.job_id}::uuid), 0))
      on conflict (path) do nothing
    `;
    if (old && old !== path) await tx`delete from tk.job_photos where path = ${old}`;
    await tx`
      update tk.job_surveys
         set answers = jsonb_set(answers, '{photos}',
                                 coalesce(answers->'photos', '{}'::jsonb) || jsonb_build_object(${slot}::text, ${path}::text)),
             updated_at = now()
       where token = ${token}
    `;
  });
  if (old && old !== path && adminAuthConfigured()) {
    await supabaseAdmin().storage.from(BUCKET).remove([old]).catch(() => {});
  }
  return 'ok';
}

/** Työn sivulle: vastaukset ja lähetysaika, tai null jos kyselyä ei ole. */
export async function surveyForJob(jobId: string): Promise<
  { token: string; answers: SurveyAnswers; submittedAt: Date | null; updatedAt: Date } | null
> {
  try {
    const [row] = await sql<{ token: string; answers: SurveyAnswers; submitted_at: Date | null; updated_at: Date }[]>`
      select token, answers, submitted_at, updated_at from tk.job_surveys where job_id = ${jobId}::uuid
    `;
    return row ? { token: row.token, answers: row.answers ?? {}, submittedAt: row.submitted_at, updatedAt: row.updated_at } : null;
  } catch (e) {
    if (missingTable(e)) return null;
    throw e;
  }
}
