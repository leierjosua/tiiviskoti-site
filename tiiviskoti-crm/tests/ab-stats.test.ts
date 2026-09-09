import { describe, expect, it } from 'vitest';
import { daysRemaining, fisherExact, requiredSamplePerArm, verdict } from '../src/lib/ab-stats';

/* =========================================================
   A/B-testin tilastot.

   Tämän laskennan perusteella testejä lopetetaan ja sivustoa muutetaan.
   Väärä p-arvo ei näytä virheeltä — se näyttää tulokselta. Siksi tässä on
   lukittuna sekä oikea vastaus tunnetulle taulukolle että ne rajatapaukset
   joissa testi ei saa väittää mitään: nolla osumaa, identtiset versiot ja
   tyhjä haara.
   ========================================================= */

describe('Fisherin tarkka testi', () => {
  it('antaa oikean p-arvon taloyhtiötestin luvuille', () => {
    // A 12/235 eteni kalenteriin, B 4/247. Sama luku kuin R:n fisher.test.
    expect(fisherExact(12, 235 - 12, 4, 247 - 4)).toBeCloseTo(0.0412, 3);
  });

  it('ei näe eroa identtisissä versioissa', () => {
    expect(fisherExact(10, 90, 10, 90)).toBe(1);
  });

  it('ei väitä mitään kun kummallakaan ei ole osumia', () => {
    expect(fisherExact(0, 100, 0, 100)).toBe(1);
  });

  it('ei kaadu tyhjään haaraan', () => {
    expect(fisherExact(0, 0, 3, 97)).toBe(1);
  });

  it('tunnistaa suuren eron isolla otoksella', () => {
    expect(fisherExact(200, 800, 100, 900)).toBeLessThan(0.001);
  });

  it('ei pidä pientä eroa pienessä otoksessa merkitsevänä', () => {
    // 3/50 vs 2/50 — silmä näkee "50 % parempi", tilasto ei näe mitään.
    expect(fisherExact(3, 47, 2, 48)).toBeGreaterThan(0.5);
  });
});

describe('tarvittava otoskoko', () => {
  it('laskee otoksen jolla 13,7 % → 20,6 % ratkeaisi', () => {
    // Varauskortti → laskuri, +50 % suhteellinen nousu.
    const n = requiredSamplePerArm(0.137, 0.206);
    expect(n).toBeGreaterThan(400);
    expect(n).toBeLessThan(600);
  });

  it('vaatii sitä enemmän otosta mitä pienempi ero on', () => {
    expect(requiredSamplePerArm(0.137, 0.178)).toBeGreaterThan(requiredSamplePerArm(0.137, 0.206));
  });

  it('on ääretön kun eroa ei ole', () => {
    expect(requiredSamplePerArm(0.1, 0.1)).toBe(Infinity);
  });
});

describe('tuomio ja jäljellä oleva aika', () => {
  it('kertoo kumpi on edellä ja onko ero merkitsevä', () => {
    const v = verdict({ base: 235, hit: 12 }, { base: 247, hit: 4 });
    expect(v.leader).toBe('a');
    expect(v.significant).toBe(true);
    expect(v.rateA).toBeCloseTo(0.0511, 4);
    // B on selvästi huonompi → negatiivinen lift.
    expect(v.lift).toBeLessThan(-0.5);
  });

  it('ei julista voittajaa kun ero on sattuman rajoissa', () => {
    const v = verdict({ base: 50, hit: 3 }, { base: 50, hit: 2 });
    expect(v.significant).toBe(false);
    expect(v.needPerArm).toBeGreaterThan(v.smallestArm);
  });

  it('arvioi jäljellä olevat päivät nykyvauhdilla', () => {
    // 200 näyttöä/versio 10 päivässä = 20/pv; tarve 500 → 300 puuttuu → 15 pv.
    const v = { ...verdict({ base: 200, hit: 20 }, { base: 200, hit: 26 }), needPerArm: 500 };
    expect(daysRemaining(v, 10)).toBe(15);
  });

  it('palauttaa nollan kun otos jo riittää', () => {
    const v = { ...verdict({ base: 900, hit: 90 }, { base: 900, hit: 130 }), needPerArm: 500 };
    expect(daysRemaining(v, 10)).toBe(0);
  });
});
