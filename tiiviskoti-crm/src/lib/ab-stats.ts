/* =========================================================
   A/B-testin tilastot.

   MIKSI FISHERIN TARKKA TESTI EIKÄ KHIIN NELIÖ: tämän sivuston testeissä
   osumia on kymmeniä, ei tuhansia (16 etenemistä koko taloyhtiötestissä).
   Normaaliapproksimaatio antaa pienillä luvuilla liian pieniä p-arvoja eli
   näyttää eroja jotka eivät ole eroja — ja juuri sen takia testi
   lopetettaisiin liian aikaisin väärän voittajan kanssa. Tarkka testi ei
   approksimoi mitään, ja tällä otoskoolla se on myös nopea laskea.

   Ei 'server-only': puhdas moduuli, testattu tests/ab-stats.test.ts:ssä.
   ========================================================= */

/* Kertoman logaritmi. Logaritmeina siksi, että 500!:n kokoiset luvut eivät
   mahdu liukulukuun — hypergeometrinen todennäköisyys on osamäärä
   valtavista kertomista, mutta logaritmien erotuksena se on tavallinen luku. */
const LOG_FACT: number[] = [0, 0];

function logFactorial(n: number): number {
  if (n < 0) return NaN;
  for (let i = LOG_FACT.length; i <= n; i++) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i);
  return LOG_FACT[n];
}

/** Yhden 2×2-taulukon todennäköisyyden logaritmi, kun reunasummat on kiinnitetty. */
function tableLogProb(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  return logFactorial(a + b) + logFactorial(c + d) + logFactorial(a + c) + logFactorial(b + d)
       - logFactorial(n) - logFactorial(a) - logFactorial(b) - logFactorial(c) - logFactorial(d);
}

/**
 * Fisherin tarkka testi, kaksisuuntainen p-arvo.
 *
 * Taulukko on [[a, b], [c, d]] = [[A osui, A ei osunut], [B osui, B ei osunut]].
 * Vastaus on todennäköisyys sille, että näin suuri tai suurempi ero syntyisi
 * pelkästä sattumasta silloin kun versioiden välillä ei ole mitään eroa.
 */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  if ([a, b, c, d].some((v) => v < 0 || !Number.isFinite(v))) return 1;
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const n = row1 + row2;
  // Tyhjä rivi tai sarake: vertailtavaa ei ole.
  if (row1 === 0 || row2 === 0 || col1 === 0 || col1 === n) return 1;

  const observed = tableLogProb(a, b, c, d);
  const lo = Math.max(0, col1 - row2);
  const hi = Math.min(row1, col1);
  let total = 0;
  for (let i = lo; i <= hi; i++) {
    const lp = tableLogProb(i, row1 - i, col1 - i, row2 - (col1 - i));
    // Pyöristysvara: yhtä todennäköinen taulukko kuuluu mukaan.
    if (lp <= observed + 1e-9) total += Math.exp(lp);
  }
  return Math.min(1, total);
}

const Z_ALPHA = 1.959964;  // kaksisuuntainen 95 %
const Z_BETA = 0.841621;   // 80 % voima

/**
 * Kuinka monta näyttöä per versio tarvitaan, jotta tämän kokoinen ero
 * erottuisi sattumasta (95 % luottamus, 80 % voima).
 *
 * Tämä on se luku joka kertoo kannattaako testiä ylipäänsä aloittaa: jos
 * vastaus on kymmeniätuhansia ja liikennettä on tuhat kuussa, testiä ei ole
 * olemassa — mittariksi on valittava suppilon aiempi askel jossa on volyymia.
 */
export function requiredSamplePerArm(p1: number, p2: number): number {
  const d = Math.abs(p1 - p2);
  if (!(d > 0)) return Infinity;
  const pbar = (p1 + p2) / 2;
  const n = ((Z_ALPHA * Math.sqrt(2 * pbar * (1 - pbar))
            + Z_BETA * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) / (d * d);
  return Math.ceil(n);
}

export type AbArm = { base: number; hit: number };

export type AbVerdict = {
  rateA: number;          // osuus 0–1
  rateB: number;
  /** B:n suhteellinen ero A:han. 0,25 = B on 25 % parempi. */
  lift: number | null;
  p: number;
  significant: boolean;   // p < 0,05
  /** Kumpi on edellä. null kun luvut ovat identtiset. */
  leader: 'a' | 'b' | null;
  /** Tarvittava otos per versio, jotta nykyisen kokoinen ero ratkeaisi. */
  needPerArm: number;
  /** Pienin otos jommallakummalla versiolla — sitä verrataan tarpeeseen. */
  smallestArm: number;
};

export function verdict(a: AbArm, b: AbArm): AbVerdict {
  const rateA = a.base > 0 ? a.hit / a.base : 0;
  const rateB = b.base > 0 ? b.hit / b.base : 0;
  const p = fisherExact(a.hit, a.base - a.hit, b.hit, b.base - b.hit);
  return {
    rateA,
    rateB,
    lift: rateA > 0 ? (rateB - rateA) / rateA : null,
    p,
    significant: p < 0.05,
    leader: rateA === rateB ? null : rateA > rateB ? 'a' : 'b',
    needPerArm: requiredSamplePerArm(rateA, rateB),
    smallestArm: Math.min(a.base, b.base),
  };
}

/**
 * Montako päivää testiä pitää vielä ajaa, jos vauhti jatkuu samana.
 * Null kun sitä ei voi arvioida (ei liikennettä tai ero on nolla).
 */
export function daysRemaining(v: AbVerdict, daysRun: number): number | null {
  if (!Number.isFinite(v.needPerArm) || daysRun <= 0 || v.smallestArm <= 0) return null;
  if (v.smallestArm >= v.needPerArm) return 0;
  const perDay = v.smallestArm / daysRun;
  return Math.ceil((v.needPerArm - v.smallestArm) / perDay);
}
