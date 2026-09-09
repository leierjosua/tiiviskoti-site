import { describe, expect, it } from 'vitest';
import {
  computeMetrics, fixedCostFor, rangeWindow, sumSales,
  type DaySales,
} from '../src/lib/talous-laskenta';
import { DEFAULT_SETTINGS, type CostSettings } from '../src/lib/talous-shared';

/* =========================================================
   Talousnäkymän laskenta.

   Nämä luvut päätyvät siihen mitä yrityksestä uskotaan: kate, tulos ja
   kuukausisarja. Virhe niissä ei näy ruudulla mitenkään — se näyttää
   pelkästään toiselta luvulta. Siksi rajatapaukset on lukittu tänne:
   alvin erottaminen, kiinteän kulun jakaminen jaksolle, kesken olevan
   jakson vertailuikkuna ja nollamyynti.
   ========================================================= */

const settings = (yli: Partial<CostSettings> = {}): CostSettings =>
  ({ ...DEFAULT_SETTINGS, ...yli });

const tyhjatKulut = {
  tekija: 0, markkinointi: 0, laite: 0, komissio: 0, kiinteat: 0, provisio: 0,
};

describe('kulujen ja katteen laskenta', () => {
  it('erottaa alvin kuluttajahinnasta', () => {
    const m = computeMetrics({
      sales: { cents: 125_500, n: 1, avoinCents: 0, avoinN: 0 },
      expenses: { ...tyhjatKulut },
      metaCents: 0,
      fromKey: '2026-09-01', toKey: '2026-09-02',
      s: settings(),
    });
    // 1 255,00 € sis. alv 25,5 % → 1 000,00 € liikevaihtoa.
    expect(m.liikevaihtoCents).toBe(100_000);
    expect(m.myyntiCents).toBe(125_500);
    expect(m.keskiarvoCents).toBe(125_500);
  });

  it('laskee prosenttikulut liikevaihdosta, ei kuluttajahinnasta', () => {
    const m = computeMetrics({
      sales: { cents: 125_500, n: 1, avoinCents: 0, avoinN: 0 },
      expenses: { ...tyhjatKulut },
      metaCents: 0,
      fromKey: '2026-09-01', toKey: '2026-09-02',
      s: settings({ tekijaBp: 4000, komissioBp: 1000 }),
    });
    expect(m.tekijaCents).toBe(40_000);
    expect(m.komissioCents).toBe(10_000);
    // Kate = liikevaihto − tekijä − laite − komissio.
    expect(m.kateCents).toBe(50_000);
    expect(m.katePct).toBeCloseTo(50, 5);
  });

  it('lisää käsinkirjatun kulun säännön päälle samaan kategoriaan', () => {
    const m = computeMetrics({
      sales: { cents: 125_500, n: 1, avoinCents: 0, avoinN: 0 },
      expenses: { ...tyhjatKulut, tekija: 50_000, markkinointi: 20_000 },
      metaCents: 30_000,
      fromKey: '2026-09-01', toKey: '2026-09-02',
      s: settings({ tekijaBp: 4000 }),
    });
    expect(m.tekijaCents).toBe(90_000);          // 40 % + 500 €
    expect(m.markkinointiCents).toBe(50_000);    // Meta 300 € + käsin 200 €
  });

  it('jättää Meta-kulun pois kun automatiikka on suljettu', () => {
    const m = computeMetrics({
      sales: { cents: 0, n: 0, avoinCents: 0, avoinN: 0 },
      expenses: { ...tyhjatKulut, markkinointi: 20_000 },
      metaCents: 30_000,
      fromKey: '2026-09-01', toKey: '2026-09-02',
      s: settings({ metaAuto: false }),
    });
    expect(m.markkinointiCents).toBe(20_000);
  });

  it('vähentää markkinoinnin ja kiinteät vasta tuloksessa', () => {
    const m = computeMetrics({
      sales: { cents: 125_500, n: 1, avoinCents: 0, avoinN: 0 },
      expenses: { ...tyhjatKulut, markkinointi: 10_000 },
      metaCents: 0,
      fromKey: '2026-09-01', toKey: '2026-10-01',
      s: settings({ tekijaBp: 4000, kiinteatCentsMonth: 5_000 }),
    });
    expect(m.kateCents).toBe(60_000);            // markkinointi ei kavenna katetta
    expect(m.kulutCents).toBe(40_000 + 10_000 + 5_000);
    expect(m.tulosCents).toBe(100_000 - 55_000);
  });

  it('ei tuota NaN:ia nollamyynnistä', () => {
    const m = computeMetrics({
      sales: { cents: 0, n: 0, avoinCents: 0, avoinN: 0 },
      expenses: { ...tyhjatKulut },
      metaCents: 0,
      fromKey: '2026-09-01', toKey: '2026-09-02',
      s: settings({ tekijaBp: 4000 }),
    });
    expect(m.katePct).toBe(0);
    expect(m.keskiarvoCents).toBe(0);
    expect(m.tulosCents).toBe(0);
  });
});

describe('kiinteiden kulujen jakaminen jaksolle', () => {
  it('veloittaa täyden kuukauden koko kuukaudelta', () => {
    expect(fixedCostFor('2026-09-01', '2026-10-01', 300_000)).toBe(300_000);
  });

  it('jakaa kesken olevan kuukauden päivien suhteessa', () => {
    // 1.–8.9. = 8 päivää 30:stä.
    expect(fixedCostFor('2026-09-01', '2026-09-09', 300_000)).toBe(80_000);
  });

  it('laskee kuukausien yli oikein vaikka päivien määrä vaihtelee', () => {
    // Elokuu (31 pv) kokonaan + syyskuun 5 päivää (30 pv:stä).
    expect(fixedCostFor('2026-08-01', '2026-09-06', 300_000)).toBe(300_000 + 50_000);
  });

  it('on nolla kun kuukausikulua ei ole asetettu', () => {
    expect(fixedCostFor('2026-01-01', '2026-12-01', 0)).toBe(0);
  });
});

describe('jaksojen rajat', () => {
  // Keskiviikko 9.9.2026, Suomen aikaa.
  const nyt = new Date('2026-09-09T12:00:00Z');

  it('ottaa kuluvan kuukauden kokonaan, myös loppukuun myydyt keikat', () => {
    const r = rangeWindow('kk', nyt, null);
    // EI leikkausta tähän päivään: 20.9. kalenterissa oleva keikka on jo
    // myyty, ja juuri se puuttui kun jakso päättyi tähän päivään.
    expect([r.fromKey, r.toKey]).toEqual(['2026-09-01', '2026-10-01']);
    // Vertailu on edellinen kalenterikuukausi kokonaisuudessaan.
    expect([r.prevFromKey, r.prevToKey]).toEqual(['2026-08-01', '2026-09-01']);
  });

  it('aloittaa viikon maanantaista', () => {
    const r = rangeWindow('viikko', nyt, null);
    expect([r.fromKey, r.toKey]).toEqual(['2026-09-07', '2026-09-14']);
    expect([r.prevFromKey, r.prevToKey]).toEqual(['2026-08-31', '2026-09-07']);
  });

  it('ottaa edellisen kuukauden kokonaisuudessaan', () => {
    const r = rangeWindow('edelliskk', nyt, null);
    expect([r.fromKey, r.toKey]).toEqual(['2026-08-01', '2026-09-01']);
    expect([r.prevFromKey, r.prevToKey]).toEqual(['2026-07-01', '2026-08-01']);
  });

  it('laskee 12 kuukauden jakson kuukauden alusta', () => {
    const r = rangeWindow('12kk', nyt, null);
    expect([r.fromKey, r.toKey]).toEqual(['2025-10-01', '2026-10-01']);
    expect([r.prevFromKey, r.prevToKey]).toEqual(['2024-10-01', '2025-10-01']);
  });

  it('aloittaa koko historian ensimmäisen työn kuukaudesta eikä vertaa mihinkään', () => {
    const r = rangeWindow('kaikki', nyt, '2026-06-17');
    expect([r.fromKey, r.toKey]).toEqual(['2026-06-01', '2026-10-01']);
    expect(r.prevFromKey).toBeNull();
  });
});

describe('päivien summaaminen jaksolle', () => {
  it('ottaa alkupäivän mukaan ja jättää loppupäivän pois', () => {
    const days = new Map<string, DaySales>([
      ['2026-08-31', { cents: 100, n: 1, avoinCents: 0, avoinN: 0 }],
      ['2026-09-01', { cents: 200, n: 1, avoinCents: 0, avoinN: 0 }],
      ['2026-09-09', { cents: 400, n: 2, avoinCents: 400, avoinN: 2 }],
      ['2026-09-10', { cents: 800, n: 1, avoinCents: 800, avoinN: 1 }],
    ]);
    expect(sumSales(days, '2026-09-01', '2026-09-10'))
      .toEqual({ cents: 600, n: 3, avoinCents: 400, avoinN: 2 });
  });

  it('erittelee tekemättömän osuuden myynnistä', () => {
    const m = computeMetrics({
      // Kuukauden 8 keikkaa, joista 5 vielä tekemättä.
      sales: { cents: 800_000, n: 8, avoinCents: 500_000, avoinN: 5 },
      expenses: { ...tyhjatKulut },
      metaCents: 0,
      fromKey: '2026-09-01', toKey: '2026-10-01',
      s: settings(),
    });
    expect(m.myyntiCents).toBe(800_000);
    expect([m.avoinCents, m.avoinN]).toEqual([500_000, 5]);
  });
});
