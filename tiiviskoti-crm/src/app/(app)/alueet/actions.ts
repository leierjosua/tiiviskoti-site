'use server';

import { revalidatePath } from 'next/cache';
import type { ISql } from 'postgres';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { postalsWithin } from '@/lib/postinumerot';

export type ActionState = { error?: string; ok?: string };

/** '00, 01,02' → ['00','01','02']. Vain numerot, 1–5 merkkiä. */
function parsePrefixes(raw: string): string[] | null {
  const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((p) => !/^\d{1,5}$/.test(p))) return null;
  return [...new Set(parts)];
}

const areaSchema = z.object({
  name: z.string().min(1, 'Anna alueelle nimi').max(100),
  travelFee: z.coerce.number().min(0, 'Matkalisä ei voi olla negatiivinen').max(2000),
});

type AreaGeometry = {
  prefixes: string[];
  centerPostal: string | null;
  radiusKm: number | null;
  excluded: string[];
};

/* Lomakkeen valintatapa → mitä tallennetaan. Etäisyysalueen postinumerot
   lasketaan AINA tässä uudelleen; lomakkeen kartta on vain esikatselu. */
function readGeometry(formData: FormData): AreaGeometry | { error: string } {
  if (formData.get('mode') !== 'distance') {
    const prefixes = parsePrefixes(String(formData.get('prefixes') ?? ''));
    if (!prefixes) return { error: 'Anna postinumeron etuliitteet, esim. "00 01 02" tai "33".' };
    return { prefixes, centerPostal: null, radiusKm: null, excluded: [] };
  }

  const center = String(formData.get('centerPostal') ?? '').trim();
  const radius = Number(String(formData.get('radiusKm') ?? '').replace(',', '.'));
  if (!/^\d{5}$/.test(center)) return { error: 'Keskipostinumero on 5 numeroa.' };
  if (!(radius > 0 && radius <= 300)) return { error: 'Säde on 1–300 km.' };
  const excluded = String(formData.get('excluded') ?? '').split(',').filter((c) => /^\d{5}$/.test(c));

  const result = postalsWithin(center, radius, excluded);
  if (!result) return { error: `Postinumeroa ${center} ei löydy.` };
  return {
    prefixes: result.included,
    centerPostal: center,
    radiusKm: Math.round(radius * 10) / 10,
    excluded: result.excluded,
  };
}

/** Ketkä palvelevat aluetta. Sama tieto kuin kalenterin sivulla, toisesta päästä. */
async function setAreaCalendars(tx: ISql, areaId: string, calendarIds: string[]) {
  await tx`delete from tk.calendar_areas where area_id = ${areaId}`;
  for (const calendarId of calendarIds) {
    await tx`
      insert into tk.calendar_areas (calendar_id, area_id) values (${calendarId}, ${areaId})
      on conflict do nothing
    `;
  }
}

function readCalendarIds(formData: FormData): string[] {
  return [...new Set(formData.getAll('calendarIds').map(String).filter(Boolean))];
}

export async function createArea(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const parsed = areaSchema.safeParse({
    name: String(formData.get('name') ?? '').trim(),
    travelFee: formData.get('travelFee') || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const g = readGeometry(formData);
  if ('error' in g) return g;

  await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into tk.areas (name, postal_prefixes, travel_fee_cents,
                            center_postal, radius_km, excluded_postals)
      values (${parsed.data.name}, ${g.prefixes}, ${Math.round(parsed.data.travelFee * 100)},
              ${g.centerPostal}, ${g.radiusKm}, ${g.excluded})
      returning id
    `;
    await setAreaCalendars(tx, row!.id, readCalendarIds(formData));
  });
  revalidatePath('/alueet');
  revalidatePath('/kalenterit', 'layout');
  return { ok: `Alue ${parsed.data.name} luotu — ${g.prefixes.length} postinumero${g.prefixes.length === 1 ? '' : 'a'}.` };
}

export async function updateArea(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const id = String(formData.get('id') ?? '');
  const parsed = areaSchema.safeParse({
    name: String(formData.get('name') ?? '').trim(),
    travelFee: formData.get('travelFee') || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const g = readGeometry(formData);
  if ('error' in g) return g;

  await sql.begin(async (tx) => {
    await tx`
      update tk.areas
         set name = ${parsed.data.name},
             postal_prefixes = ${g.prefixes},
             travel_fee_cents = ${Math.round(parsed.data.travelFee * 100)},
             center_postal = ${g.centerPostal},
             radius_km = ${g.radiusKm},
             excluded_postals = ${g.excluded},
             active = ${formData.get('active') === 'on'}
       where id = ${id}
    `;
    await setAreaCalendars(tx, id, readCalendarIds(formData));
  });
  revalidatePath('/alueet');
  revalidatePath('/kalenterit', 'layout');
  return { ok: 'Alue tallennettu.' };
}

export async function deleteArea(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');

  // Alue jolla on töitä ei katoa: poistetaan käytöstä sen sijaan, jottei
  // historian työn alue muuttuisi tuntemattomaksi.
  const [used] = await sql<{ n: number }[]>`
    select count(*)::int as n from tk.jobs j
      join tk.calendar_areas ca on ca.calendar_id = j.calendar_id
     where ca.area_id = ${id}
  `;
  if (used && used.n > 0) {
    await sql`update tk.areas set active = false where id = ${id}`;
  } else {
    await sql`delete from tk.areas where id = ${id}`;
  }
  revalidatePath('/alueet');
}

/** Kalenterin alueet: mitkä alueet tämä kalenteri palvelee. */
export async function setCalendarAreas(formData: FormData) {
  await requireManager();
  const calendarId = String(formData.get('calendarId') ?? '');
  const areaIds = formData.getAll('areaIds').map((v) => String(v));

  await sql.begin(async (tx) => {
    await tx`delete from tk.calendar_areas where calendar_id = ${calendarId}`;
    for (const areaId of areaIds) {
      await tx`
        insert into tk.calendar_areas (calendar_id, area_id) values (${calendarId}, ${areaId})
        on conflict do nothing
      `;
    }
  });

  revalidatePath(`/kalenterit/${calendarId}`);
  revalidatePath('/alueet');
}

/* `no_answer` = soitettu, ei vastattu. Se ei ole `contacted` (mitään ei ole
   vielä opittu) eikä `new` (yrityksiä on jo tehty) — ja juuri se ero katosi
   ennen: väärä tila sai liidin joko näyttämään hoidetulta tai koskemattomalta.
   Vaatii db/027:n; ilman sitä kanta hylkää arvon 22P02:lla. */
const LEAD_STATUSES = ['new', 'contacted', 'no_answer', 'converted', 'rejected'] as const;

/**
 * Poista liidi pysyvästi.
 *
 * Tarkoitettu testirivien siivoamiseen. Liidi on yhteydenottopyyntö, ei
 * kirjanpitoaineistoa — jos liidistä on jo tehty työ, työ jää omaan
 * tauluunsa koskematta. Käyttöliittymä vaatii vahvistuksen.
 */
export async function deleteLead(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await sql`delete from tk.leads where id = ${id}`;
  revalidatePath('/liidit');
}

export async function setLeadStatus(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) return;

  try {
    await sql`update tk.leads set status = ${status}, updated_at = now() where id = ${id}::uuid`;
  } catch (e) {
    /* 22P02 = enumissa ei ole tätä arvoa, eli db/027 on ajamatta. Muut tilat
       toimivat silti, joten vain tämä valinta jää tekemättä — ei 500. */
    if ((e as { code?: string })?.code !== '22P02') throw e;
    console.error('setLeadStatus: db/027 ajamatta, tila', status);
  }
  revalidatePath('/liidit');
}

