import 'server-only';
import { sql } from '@/lib/db';
import { uploadConversions, type ClickKind, type PendingConversion } from '@/lib/google-ads';

/* =========================================================
   Lähettämättömien konversioiden vienti Google Adsiin.

   Sama toiminto sekä yöajolle (api/cron/ads-conversions) että /ads-sivun
   "Lähetä nyt" -napille. Yhteinen toteutus, koska säännöt siitä mikä on
   raportoitava kauppa eivät saa erota sen mukaan kumpi ne käynnistää.
   ========================================================= */

/** Yhdessä erässä lähetettävien konversioiden yläraja. Adsin oma raja on
 *  paljon korkeampi; tämä on suoja sille ettei ensimmäinen ajo yritä
 *  lähettää koko historiaa yhtenä pyyntönä. */
const BATCH_SIZE = 200;

/* Konversiota ei lähetetä heti varauksen synnyttyä.
   MIKSI: peruttua kauppaa ei raportoida (ks. 009_gclid.sql), ja peruutus
   tulee käytännössä pian varauksen jälkeen — väärä numero, tuplavaraus,
   katumus. Tunnin odotus antaa niiden ehtiä poistua ennen kuin luku
   lähtee Googlelle. Adsin oma takaraja on 90 vuorokautta klikistä, joten
   viive ei maksa mitään attribuutiossa. */
const GRACE_MINUTES = 60;

/* Google hylkää konversion jos klikistä on yli 90 vuorokautta. Sellaista
   ei kannata yrittää joka yö uudelleen: merkitään kerran syy näkyviin ja
   jätetään rauhaan. */
const MAX_CLICK_AGE_DAYS = 90;

export type SyncResult = {
  configured: boolean;
  /** Koko ajon kaatanut virhe (tunnukset, verkko, Adsin hylkäys). */
  error?: string;
  sent: number;
  failed: number;
  expired: number;
  /** Rivikohtaiset viat ihmiselle näytettäväksi. */
  errors: { jobNumber: string; error: string }[];
};

type PendingRow = {
  id: string;
  job_number: string;
  gclid: string;
  ads_click_kind: ClickKind;
  created_at: Date;
  price_cents: number;
};

export async function sendPendingConversions(): Promise<SyncResult> {
  /* Vanhentuneet pois ensin, jotta ne eivät vie tilaa erästä eivätkä
     palaa virhelistalle joka ajossa. */
  const expired = await sql<{ id: string }[]>`
    update tk.jobs
       set ads_upload_error = ${`Klikistä yli ${MAX_CLICK_AGE_DAYS} vrk — Ads ei ota enää vastaan`}
     where gclid is not null
       and ads_uploaded_at is null
       and status <> 'cancelled'
       and ads_upload_error is null
       and created_at < now() - ${`${MAX_CLICK_AGE_DAYS} days`}::interval
    returning id
  `;

  const rows = await sql<PendingRow[]>`
    select id, job_number, gclid, ads_click_kind, created_at, price_cents
      from tk.jobs
     where gclid is not null
       and ads_uploaded_at is null
       and status <> 'cancelled'
       and created_at < now() - ${`${GRACE_MINUTES} minutes`}::interval
       and created_at >= now() - ${`${MAX_CLICK_AGE_DAYS} days`}::interval
     order by created_at
     limit ${BATCH_SIZE}
  `;

  const pending: PendingConversion[] = rows.map((r) => ({
    jobId: r.id,
    jobNumber: r.job_number,
    clickId: r.gclid,
    clickKind: r.ads_click_kind,
    createdAt: r.created_at,
    priceCents: r.price_cents,
  }));

  const result = await uploadConversions(pending);
  if (result.error) {
    /* Koko erän kaatanut vika kirjataan niille riveille joita yritettiin,
       jotta syy näkyy adminissa työn kohdalla eikä vain ajon lokissa.
       Puuttuvaa asetusta ei kirjata: se on asennustila, joka näytetään
       omana varoituksenaan — ei jokaisen työn virheenä. */
    if (result.configured) {
      for (const r of rows) {
        await sql`
          update tk.jobs set ads_upload_error = ${result.error} where id = ${r.id}::uuid
        `;
      }
    }
    return {
      configured: result.configured,
      error: result.error,
      sent: 0,
      failed: rows.length,
      expired: expired.length,
      errors: [],
    };
  }

  const byId = new Map(rows.map((r) => [r.id, r.job_number]));
  const errors: SyncResult['errors'] = [];
  let sent = 0;

  /* Rivi kerrallaan tarkoituksella: mainosklikistä syntyviä varauksia on
     muutama päivässä, joten erillisistä kyselyistä ei tule kuormaa — ja
     yhden rivin epäonnistuminen ei saa jättää muita merkitsemättä. */
  for (const outcome of result.outcomes) {
    if (outcome.ok) {
      await sql`
        update tk.jobs
           set ads_uploaded_at = now(), ads_upload_error = null
         where id = ${outcome.jobId}::uuid
      `;
      sent++;
    } else {
      await sql`
        update tk.jobs
           set ads_upload_error = ${outcome.error}
         where id = ${outcome.jobId}::uuid
      `;
      errors.push({ jobNumber: byId.get(outcome.jobId) ?? '—', error: outcome.error });
    }
  }

  return {
    configured: result.configured,
    sent,
    failed: errors.length,
    expired: expired.length,
    errors,
  };
}
