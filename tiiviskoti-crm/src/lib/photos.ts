import 'server-only';
import { randomUUID } from 'node:crypto';
import { sql } from './db';
import { supabaseAdmin, adminAuthConfigured } from './supabase-admin';

/* =========================================================
   Työn kuvat — muistiinpano siitä missä oltiin.

   Kartoituskäynnillä nähdään asiat jotka eivät mahdu tarjouksen riveille:
   mikä ikkuna vuotaa, mistä ovesta mennään sisään, missä kerroksessa
   asunto on. Viikkoa myöhemmin se on muistin varassa.

   KUVAT OVAT SISÄISIÄ eivätkä mene asiakkaalle. Se on koko idea: kun
   kuvaa ei tarvitse ottaa esityskelpoisena, sen uskaltaa ottaa myös
   sotkusta ja ongelmakohdasta.

   YKSITYINEN ÄMPÄRI: `tyokuvat` ei ole julkinen, joten pelkkä osoite ei
   riitä kuvan katseluun. Näyttöhetkellä haetaan allekirjoitettu osoite
   joka vanhenee tunnissa. Asiakkaan koti ei kuulu julkiseen verkkoon.

   Kanta voi olla ilman `tk.job_photos`-taulua (db/028 ajamatta). Silloin
   kuvat puuttuvat, mutta työn sivu toimii — sama periaate kuin muualla.
   ========================================================= */

const BUCKET = 'tyokuvat';
const SIGNED_URL_SECONDS = 3600;

/** Kuvan enimmäiskoko. Puhelimen kamerakuva on 2–8 MB; 15 MB riittää
 *  myös HEIC-alkuperäiselle eikä päästä läpi vahinkovideoita. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const SALLITUT = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export type JobPhoto = {
  id: string;
  path: string;
  caption: string | null;
  sortOrder: number;
  createdAt: Date;
  /** Allekirjoitettu osoite, vanhenee tunnissa. null jos allekirjoitus epäonnistui. */
  url: string | null;
};

/** Puuttuva taulu (db/028 ajamatta). */
function missingTable(e: unknown): boolean {
  return (e as { code?: string })?.code === '42P01';
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif',
};

/**
 * Työn kuvat järjestyksessä, allekirjoitetuin osoittein.
 *
 * Osoitteet haetaan yhtenä eränä eikä kuva kerrallaan: kymmenen kuvan
 * käynnillä se on yksi pyyntö kymmenen sijaan.
 */
export async function listJobPhotos(jobId: string): Promise<JobPhoto[]> {
  let rows: { id: string; path: string; caption: string | null; sort_order: number; created_at: Date }[];
  try {
    rows = await sql`
      select id, path, caption, sort_order, created_at
        from tk.job_photos where job_id = ${jobId}::uuid
       order by sort_order, created_at
    `;
  } catch (e) {
    if (missingTable(e)) return [];
    throw e;
  }
  if (rows.length === 0 || !adminAuthConfigured()) {
    return rows.map((r) => ({
      id: r.id, path: r.path, caption: r.caption,
      sortOrder: r.sort_order, createdAt: r.created_at, url: null,
    }));
  }

  const admin = supabaseAdmin();
  const { data } = await admin.storage.from(BUCKET)
    .createSignedUrls(rows.map((r) => r.path), SIGNED_URL_SECONDS);
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));

  return rows.map((r) => ({
    id: r.id, path: r.path, caption: r.caption,
    sortOrder: r.sort_order, createdAt: r.created_at,
    url: urls.get(r.path) ?? null,
  }));
}

/**
 * Tallenna yksi kuva työlle.
 *
 * Palauttaa virhetekstin tai null. Rivi kantaan vasta kun tiedosto on
 * ämpärissä: toisin päin jäisi rivi joka osoittaa tyhjään.
 */
export async function saveJobPhoto(
  jobId: string, file: File, staffId: string | null,
): Promise<string | null> {
  if (!adminAuthConfigured()) return 'SUPABASE_SECRET_KEY puuttuu — kuvia ei voi tallentaa.';
  if (file.size === 0) return null;
  if (file.size > MAX_PHOTO_BYTES) return `${file.name}: liian suuri (yli 15 MB).`;
  if (!SALLITUT.has(file.type)) return `${file.name}: vain kuvatiedostot käyvät.`;

  const path = `job/${jobId}/${randomUUID()}.${EXT[file.type] ?? 'jpg'}`;
  const admin = supabaseAdmin();
  const { error } = await admin.storage.from(BUCKET).upload(
    path, new Uint8Array(await file.arrayBuffer()),
    { contentType: file.type, upsert: false },
  );
  if (error) return `${file.name}: ${error.message}`;

  try {
    /* Järjestysnumero jatkaa työn viimeisestä. Ilman tätä kaikki kuvat
       olisivat nollassa ja järjestys jäisi lisäysajan varaan. */
    await sql`
      insert into tk.job_photos (job_id, path, sort_order, created_by)
      values (
        ${jobId}::uuid, ${path},
        coalesce((select max(sort_order) + 1 from tk.job_photos where job_id = ${jobId}::uuid), 0),
        ${staffId}
      )
    `;
  } catch (e) {
    // Rivi jäi syntymättä: poistetaan tiedosto, ettei ämpäriin jää orpoa.
    await admin.storage.from(BUCKET).remove([path]);
    if (missingTable(e)) return 'Tietokannasta puuttuu taulu — aja db/028_job_photos.sql.';
    throw e;
  }
  return null;
}

/** Poista kuva: ensin rivi, sitten tiedosto. Orpo tiedosto on
 *  vaarattomampi kuin rivi joka osoittaa tyhjään. */
export async function removeJobPhoto(id: string): Promise<void> {
  let rows: { path: string }[];
  try {
    rows = await sql`delete from tk.job_photos where id = ${id}::uuid returning path`;
  } catch (e) {
    if (missingTable(e)) return;
    throw e;
  }
  if (rows.length === 0 || !adminAuthConfigured()) return;
  await supabaseAdmin().storage.from(BUCKET).remove([rows[0].path]);
}

/** Kuvan työ — oikeustarkistusta varten. */
export async function photoJobId(id: string): Promise<string | null> {
  try {
    const [row] = await sql<{ job_id: string }[]>`
      select job_id from tk.job_photos where id = ${id}::uuid
    `;
    return row?.job_id ?? null;
  } catch (e) {
    if (missingTable(e)) return null;
    throw e;
  }
}

export async function setJobPhotoCaption(id: string, caption: string): Promise<void> {
  try {
    await sql`
      update tk.job_photos set caption = ${caption.trim() || null} where id = ${id}::uuid
    `;
  } catch (e) {
    if (!missingTable(e)) throw e;
  }
}
