import 'server-only';
import { sql } from '@/lib/db';
import { addDays, isoWeekday, todayKey } from '@/lib/time';

/* =========================================================
   Kuka on käytettävissä ja milloin.

   Sama laskenta palvelee kahta sivua: asentajan omaa ilmoitussivua
   (/omat-ajat) ja toimiston koontinäkymää (/saatavuus). Ne näyttävät
   eri asiaa mutta EIVÄT SAA olla eri mieltä — jos asentaja merkitsee
   päivän vapaaksi, toimiston on nähtävä sama päivä vapaana samalla
   sekunnilla. Siksi tila lasketaan täällä yhdessä paikassa eikä
   kummassakaan näkymässä erikseen.

   KOLME TILAA, koska niitä on oikeasti kolme:
     tyossa      — päivälle on työaika (viikkoaikataulu tai lisäaika)
     poissa      — päivälle on poissaolomerkintä
     ilmoittamatta — ei kumpaakaan

   Kolmas on tärkein. Tyhjä päivä ei tarkoita "vapaa" vaan "ei tiedetä",
   ja juuri sen sekoittaminen on aiheuttanut sen että kalenteri näyttää
   täydeltä vaikka asentaja olisi käytettävissä. Siksi sitä ei piirretä
   samalla värillä kuin poissaoloa.
   ========================================================= */

export type PaivanTila = 'tyossa' | 'poissa' | 'ilmoittamatta';

export type SaatavuusPaiva = {
  date: string;
  tila: PaivanTila;
  /** Mistä työaika tulee: viikkoaikataulusta vai tälle päivälle erikseen. */
  lahde: 'viikko' | 'lisaaika' | null;
  alku: string | null;
  loppu: string | null;
  /** Poikkeusrivin tunniste, jos päivälle on sellainen — tarvitaan poistoon. */
  poikkeusId: string | null;
  note: string | null;
  /** Kuinka monta työtä päivälle on jo varattu. */
  toita: number;
};

export type SaatavuusKalenteri = {
  calendarId: string;
  calendarName: string;
  staffId: string;
  staffName: string;
  paivat: SaatavuusPaiva[];
};

/**
 * Oletuskellonajat yhdelle kalenterille.
 *
 * TÄMÄ EI OLE KOSMETIIKKAA. Varauslogiikka OHITTAA lisäaikapoikkeuksen,
 * jolla ei ole kellonaikoja — rivi näyttää kalenterissa oikealta mutta ei
 * tuota yhtään varattavaa aikaa. Se on kaatanut asentajien saatavuuden
 * kertaalleen (Eeliksen lokakuun päivät 19.9.2026). Siksi jokaiselle
 * "voin tehdä töitä" -merkinnälle on pakko saada kellonajat, ja ne
 * haetaan tässä järjestyksessä:
 *   1. henkilön oma viikkoaikataulu (yleisin alku ja loppu)
 *   2. henkilön viimeisin lisäaikamerkintä
 *   3. 08:00–16:00
 */
export async function oletusAjat(calendarId: string): Promise<{ alku: string; loppu: string }> {
  const [viikko] = await sql<{ start_time: string; end_time: string }[]>`
    select start_time, end_time from tk.calendar_hours
     where calendar_id = ${calendarId}
     group by start_time, end_time
     order by count(*) desc, start_time
     limit 1
  `;
  if (viikko) return { alku: viikko.start_time.slice(0, 5), loppu: viikko.end_time.slice(0, 5) };

  const [viimeisin] = await sql<{ start_time: string | null; end_time: string | null }[]>`
    select start_time, end_time from tk.calendar_exceptions
     where calendar_id = ${calendarId} and kind = 'open'
       and start_time is not null and end_time is not null
     order by date desc
     limit 1
  `;
  if (viimeisin?.start_time && viimeisin.end_time) {
    return { alku: viimeisin.start_time.slice(0, 5), loppu: viimeisin.end_time.slice(0, 5) };
  }
  return { alku: '08:00', loppu: '16:00' };
}

/**
 * Saatavuus päivä kerrallaan.
 *
 * @param calendarIds  rajaa kalentereihin; tyhjä = kaikki aktiiviset
 * @param alkaen       ensimmäinen päivä (oletus tänään)
 * @param paivia       montako päivää eteenpäin
 */
export async function saatavuus(
  calendarIds: string[] | null,
  paivia: number,
  alkaen: string = todayKey(),
): Promise<SaatavuusKalenteri[]> {
  const loppuun = addDays(alkaen, paivia);

  const [kalenterit, tunnit, poikkeukset, tyot] = await Promise.all([
    sql<{ id: string; name: string; staff_id: string; staff_name: string }[]>`
      select c.id, c.name, c.staff_id, s.full_name as staff_name
        from tk.calendars c
        join tk.staff s on s.id = c.staff_id
       where ${calendarIds?.length ? sql`c.id = any(${calendarIds})` : sql`true`}
       order by s.full_name, c.name
    `,
    sql<{ calendar_id: string; weekday: number; start_time: string; end_time: string }[]>`
      select calendar_id, weekday, start_time, end_time
        from tk.calendar_hours
       where ${calendarIds?.length ? sql`calendar_id = any(${calendarIds})` : sql`true`}
    `,
    sql<{
      id: string; calendar_id: string; date: string; kind: 'open' | 'closed';
      start_time: string | null; end_time: string | null; note: string | null;
    }[]>`
      select id, calendar_id, to_char(date, 'YYYY-MM-DD') as date, kind,
             start_time, end_time, note
        from tk.calendar_exceptions
       where date >= ${alkaen}::date and date < ${loppuun}::date
         ${calendarIds?.length ? sql`and calendar_id = any(${calendarIds})` : sql``}
    `,
    sql<{ calendar_id: string; date: string; n: number }[]>`
      /* Päivä luetaan HELSINGIN ajassa, ja myös rajaus tehdään siinä.
         Jos rajaus tehtäisiin timestamptz vastaan date, Postgres tulkitsisi
         päivän palvelimen aikavyöhykkeessä ja aamukahdeksan keikka voisi
         pudota edelliselle päivälle. Sama kolmen tunnin virhe on osunut
         tähän kantaan jo kerran varauksen tallennuksessa. */
      select calendar_id,
             to_char(starts_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD') as date,
             count(*)::int as n
        from tk.jobs
       where (starts_at at time zone 'Europe/Helsinki')::date >= ${alkaen}::date
         and (starts_at at time zone 'Europe/Helsinki')::date < ${loppuun}::date
         and status <> 'cancelled'
         ${calendarIds?.length ? sql`and calendar_id = any(${calendarIds})` : sql``}
       group by 1, 2
    `,
  ]);

  const avain = (c: string, d: string) => `${c}|${d}`;

  /* Samalle päivälle voi olla useampi rivi — kanta ei estä sitä, ja
     kahden vuoron merkitseminen on laillista. Tämä sivu esittää päivän
     yhtenä tilana, joten valinnan on oltava sama joka kerta:
       1. poissaolo voittaa, koska se on rajoittavampi. Jos päivälle on
          sekä poissaolo että lisäaika, päivää ei saa näyttää vapaana.
       2. muuten kellonajallinen voittaa kellonajattoman, koska vain se
          tuottaa varattavaa aikaa.
     Ilman tätä järjestys tulisi kannan palautusjärjestyksestä, ja sama
     päivä voisi näyttää eri tilaa eri latauksilla. */
  const paino = (p: { kind: string; start_time: string | null }) =>
    p.kind === 'closed' ? 2 : p.start_time ? 1 : 0;
  const poikkeusKartta = new Map<string, (typeof poikkeukset)[number]>();
  for (const p of poikkeukset) {
    const k = avain(p.calendar_id, p.date);
    const vanha = poikkeusKartta.get(k);
    if (!vanha || paino(p) > paino(vanha)) poikkeusKartta.set(k, p);
  }
  const tyoKartta = new Map(tyot.map((t) => [avain(t.calendar_id, t.date), t.n]));

  return kalenterit.map((c) => {
    const paivat: SaatavuusPaiva[] = [];
    for (let i = 0; i < paivia; i++) {
      const date = addDays(alkaen, i);
      const p = poikkeusKartta.get(avain(c.id, date));
      const viikko = tunnit.find((t) => t.calendar_id === c.id && t.weekday === isoWeekday(date));
      const toita = tyoKartta.get(avain(c.id, date)) ?? 0;

      if (p?.kind === 'closed') {
        paivat.push({
          date, tila: 'poissa', lahde: null,
          alku: p.start_time?.slice(0, 5) ?? null, loppu: p.end_time?.slice(0, 5) ?? null,
          poikkeusId: p.id, note: p.note, toita,
        });
      } else if (p?.kind === 'open' && p.start_time && p.end_time) {
        paivat.push({
          date, tila: 'tyossa', lahde: 'lisaaika',
          alku: p.start_time.slice(0, 5), loppu: p.end_time.slice(0, 5),
          poikkeusId: p.id, note: p.note, toita,
        });
      } else if (viikko) {
        paivat.push({
          date, tila: 'tyossa', lahde: 'viikko',
          alku: viikko.start_time.slice(0, 5), loppu: viikko.end_time.slice(0, 5),
          /* Kellonajaton lisäaikarivi ei tuota työaikaa, mutta se on
             olemassa ja se pitää voida poistaa — muuten sivulle jää
             rivi jota ei näy eikä saa pois. */
          poikkeusId: p?.id ?? null, note: p?.note ?? null, toita,
        });
      } else {
        paivat.push({
          date, tila: 'ilmoittamatta', lahde: null, alku: null, loppu: null,
          poikkeusId: p?.id ?? null, note: p?.note ?? null, toita,
        });
      }
    }
    return {
      calendarId: c.id, calendarName: c.name,
      staffId: c.staff_id, staffName: c.staff_name,
      paivat,
    };
  });
}

/** Kirjautuneen henkilön omat kalenterit. */
export function omatKalenterit(staffId: string) {
  return sql<{ id: string; name: string }[]>`
    select id, name from tk.calendars where staff_id = ${staffId} order by name
  `;
}
