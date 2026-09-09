import { describe, expect, it } from 'vitest';
import { computePricing } from '../src/lib/pricing';

/* =========================================================
   Uuden työn laskuri.

   Laskuri on toinen paikka joka koskee rahaa: sen summa menee työn
   hinnaksi, `tk.job_lines`-riveiksi ja asiakkaan varausvahvistukseen.
   Jos se eroaa tarjouslaskurista, sama keikka maksaa eri verran sen
   mukaan kumman kautta se kirjattiin.

   Nämä testit lukitsevat rajatapaukset — minimiveloituksen ja ikkunan
   määräportaan — koska juuri ne katoavat huomaamatta hinnaston
   muuttuessa. Katalogihinnat itse tarkistaa `scripts/tarkista-hinnasto`.
   ========================================================= */

describe('työn laskuri', () => {
  it('nostaa yhden oven keikan minimiveloitukseen', () => {
    const p = computePricing({ ulko: 1 });
    expect(p.total).toBe(149);
    // Erotus on OMANA rivinään eikä piilotettuna oven hintaan: kuitissa
    // on näyttävä mistä 99 €:n ovi muuttui 149 €:ksi.
    expect(p.lines.map((l) => l.sum)).toEqual([99, 50]);
  });

  it('ei lisää minimiä kun keikka ylittää sen itsestään', () => {
    const p = computePricing({ ulko: 2 });
    expect(p.total).toBe(198);
    expect(p.lines).toHaveLength(1);
  });

  it('käyttää ikkunan määräporrasta', () => {
    expect(computePricing({ ikkuna: 5 }).total).toBe(425);      // 85 €/kpl
    expect(computePricing({ ikkuna: 32 }).total).toBe(2400);    // 75 €/kpl
  });

  it('laskee ison taloyhtiökeikan samoin kuin tarjouslaskuri', () => {
    const p = computePricing({ ikkuna: 32, ulko: 18 });
    expect(p.total).toBe(4182);
    expect(p.count).toBe(50);
  });

  it('ottaa lisät mukaan minimiä laskettaessa', () => {
    const p = computePricing({ ikkuna: 1 }, { sauma: true });
    expect(p.total).toBe(149);
    // 90 + 19 = 109, joten minimin erotus on 40 eikä 59.
    expect(p.lines.at(-1)?.sum).toBe(40);
  });

  it('hyväksyy vapaat rivit ilman katalogivalintoja', () => {
    const p = computePricing({}, {}, { custom: [{ name: 'Erikoistyö', qty: 2, unit: 75 }] });
    expect(p.total).toBe(150);
    expect(p.count).toBe(0);
  });

  /* Laskuri lähettää palvelimelle vain valinnat, ja palvelin laskee hinnan
     uudestaan. Tämä varmistaa että se muoto kelpaa sellaisenaan — jos
     kenttien nimet erkanevat, hinta putoaisi hiljaa nollaan. */
  it('laskee laskurin lähettämästä muodosta', () => {
    const lahetetty = JSON.stringify({
      counts: { ikkuna: 3, extra_kahva: 2 },
      extras: { helat: true },
      custom: [{ name: 'Lukon sarjoitus', qty: 1, unit: 40 }],
    });
    const v = JSON.parse(lahetetty);
    const p = computePricing(v.counts, v.extras, { custom: v.custom });
    expect(p.total).toBeGreaterThan(0);
    expect(p.lines.some((l) => l.name === 'Lukon sarjoitus')).toBe(true);
    expect(p.lines.some((l) => l.name.startsWith('Kahvan vaihto'))).toBe(true);
  });

  it('sietää tyhjät valinnat ilman rivejä', () => {
    const p = computePricing({}, {}, {});
    expect(p.lines).toHaveLength(0);
    expect(p.total).toBe(0);
  });
});
