import 'server-only';
import type { ISql } from 'postgres';
import { sql } from './db';

/* Kyselyn voi tehdä joko pooliyhteydellä (`Sql`) tai transaktiossa
   (`TransactionSql`). Ne eivät ole toisilleen sijoitettavissa, mutta
   molemmat toteuttavat `ISql`:n — ja vain sitä osaa tämä moduuli käyttää. */
type Db = ISql;

/* =========================================================
   Alennuskoodin tarkistus ja laskenta.

   Yksi lähde kahdelle kutsujalle: varauksen kirjaus (`api/public/booking`)
   ja sivuston esikatselu (`api/public/discount`). Ne EIVÄT saa laskea
   alennusta eri tavoin — muuten asiakkaalle näytetty ja veloitettu summa
   eroavat, mikä on tarkalleen se virhe jonka takia hinnoittelu keskitettiin
   `pricing.mjs`:ään alun perin.

   Varauspolku kutsuu tätä transaktion sisällä `forUpdate: true` -lipulla,
   jolloin koodirivi lukitaan. Ilman lukitusta kaksi yhtaikaista varausta
   voisi kumpikin lukea "1 käyttö jäljellä" ja käyttää viimeisen kerran.
   ========================================================= */

export type DiscountError =
  | 'unknown_code'   // koodia ei ole
  | 'inactive'       // poistettu käytöstä
  | 'not_started'    // kampanja alkaa vasta myöhemmin
  | 'expired'        // kampanja päättynyt
  | 'exhausted'      // koodin käyttökerrat täynnä
  | 'already_used'   // tämä asiakas on jo käyttänyt koodin
  | 'below_min';     // tilaus alle koodin alarajan

export type ResolvedDiscount = {
  id: string;
  code: string;
  description: string | null;
  /** Toteutunut vähennys tälle tilaukselle sentteinä. */
  amountCents: number;
};

export type DiscountResult =
  | { ok: true; discount: ResolvedDiscount }
  | { ok: false; error: DiscountError; minTotalCents?: number };

type CodeRow = {
  id: string;
  code: string;
  description: string | null;
  kind: 'fixed' | 'percent';
  amount_cents: number;
  percent: number;
  min_total_cents: number;
  max_uses: number | null;
  max_uses_per_customer: number;
  starts_at: Date | null;
  expires_at: Date | null;
  active: boolean;
};

/**
 * 'naapuri 20' → 'NAAPURI20'. Asiakas kirjoittaa koodin mainoksesta käsin,
 * joten pienet kirjaimet, välilyönnit ja väliviivat ovat sääntö eivätkä
 * poikkeus. Tyhjä tulos tarkoittaa ettei koodia annettu.
 */
export function normalizeCode(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
}

/** Koodin nimellisarvo tekstinä, esim. "−20 €" tai "−10 %". Adminia varten. */
export function discountLabel(c: Pick<CodeRow, 'kind' | 'amount_cents' | 'percent'>): string {
  return c.kind === 'percent'
    ? `−${c.percent} %`
    : `−${(c.amount_cents / 100).toLocaleString('fi-FI')} €`;
}

/** Vähennys annetulle summalle. Ei koskaan enempää kuin summa itse. */
function amountFor(c: CodeRow, subtotalCents: number): number {
  const raw = c.kind === 'percent'
    ? Math.round((subtotalCents * c.percent) / 100)
    : c.amount_cents;
  return Math.max(0, Math.min(raw, subtotalCents));
}

/**
 * Tarkistaa koodin ja laskee vähennyksen.
 *
 * @param code          asiakkaan kirjoittama koodi (normalisoidaan tässä)
 * @param subtotalCents veloitus ENNEN alennusta = työ + matkalisä
 * @param customerId    tunnettu asiakas (varauspolku, transaktion sisällä)
 * @param email         asiakkaan sähköposti (esikatselu, ennen kuin asiakasriviä on)
 * @param db            transaktio tai oletusyhteys
 * @param forUpdate     lukitse koodirivi — vain transaktiossa
 */
export async function resolveDiscount(opts: {
  code: string;
  subtotalCents: number;
  customerId?: string | null;
  email?: string | null;
  db?: Db;
  forUpdate?: boolean;
}): Promise<DiscountResult> {
  const db = opts.db ?? sql;
  const code = normalizeCode(opts.code);
  if (!code) return { ok: false, error: 'unknown_code' };

  const rows = opts.forUpdate
    ? await db<CodeRow[]>`select * from tk.discount_codes where code = ${code} for update`
    : await db<CodeRow[]>`select * from tk.discount_codes where code = ${code}`;
  const c = rows[0];
  if (!c) return { ok: false, error: 'unknown_code' };
  if (!c.active) return { ok: false, error: 'inactive' };

  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { ok: false, error: 'not_started' };
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return { ok: false, error: 'expired' };

  if (opts.subtotalCents < c.min_total_cents) {
    return { ok: false, error: 'below_min', minTotalCents: c.min_total_cents };
  }

  if (c.max_uses !== null) {
    const [used] = await db<{ n: number }[]>`
      select count(*)::int as n from tk.discount_redemptions where code_id = ${c.id}
    `;
    if ((used?.n ?? 0) >= c.max_uses) return { ok: false, error: 'exhausted' };
  }

  /* Asiakaskohtainen raja. Varauspolulla asiakas on jo olemassa (id tiedossa);
     esikatselussa ei välttämättä, joten silloin katsotaan sähköpostilla —
     varaus yhdistää saman sähköpostin samaan asiakasriviin, joten luvut
     vastaavat toisiaan. */
  const customerId = opts.customerId ?? null;
  const email = opts.email?.trim() || null;
  if (customerId || email) {
    const [mine] = await db<{ n: number }[]>`
      select count(*)::int as n
        from tk.discount_redemptions r
        join tk.customers cu on cu.id = r.customer_id
       where r.code_id = ${c.id}
         and (
           (${customerId}::uuid is not null and cu.id = ${customerId}::uuid)
           or (${email}::text is not null and lower(cu.email) = lower(${email}::text))
         )
    `;
    if ((mine?.n ?? 0) >= c.max_uses_per_customer) return { ok: false, error: 'already_used' };
  }

  return {
    ok: true,
    discount: {
      id: c.id,
      code: c.code,
      description: c.description,
      amountCents: amountFor(c, opts.subtotalCents),
    },
  };
}

/** Asiakkaalle näytettävä syy. Sama teksti sivustolla ja adminissa. */
export const DISCOUNT_ERROR_TEXT: Record<DiscountError, string> = {
  unknown_code: 'Koodia ei tunnisteta.',
  inactive: 'Koodi ei ole enää käytössä.',
  not_started: 'Koodi ei ole vielä voimassa.',
  expired: 'Koodin voimassaolo on päättynyt.',
  exhausted: 'Koodi on jo käytetty loppuun.',
  already_used: 'Koodi on jo käytetty tällä sähköpostilla.',
  below_min: 'Tilaus jää koodin alarajan alle.',
};
