import { describe, expect, it } from 'vitest';
import { POSTINUMEROT, distanceKm, postalsWithin, postinumero } from '@/lib/postinumerot';

describe('postinumerot', () => {
  it('kattaa koko Suomen ja tunnetut pisteet ovat oikeissa paikoissa', () => {
    expect(POSTINUMEROT.length).toBeGreaterThan(2900);
    // Helsinki → Tampere linnuntie ~160 km.
    const d = distanceKm(postinumero('00100')!, postinumero('33100')!);
    expect(d).toBeGreaterThan(150);
    expect(d).toBeLessThan(170);
  });

  it('säde palauttaa keskipisteen ja lähimmät ensin', () => {
    const r = postalsWithin('05470', 23)!;
    expect(r.center.kunta).toBe('Hyvinkää');
    expect(r.within[0]!.code).toBe('05470');
    expect(r.within.every((p) => p.km <= 23)).toBe(true);
    // Hyvinkää, Järvenpää ja Kerava ovat 23 km:n sisällä, Helsingin keskusta ei.
    expect(r.included).toEqual(expect.arrayContaining(['05800', '04400', '04200']));
    expect(r.included).not.toContain('00100');
  });

  it('poissulku poistaa, keskipistettä ei voi sulkea ja säteen ulkopuolinen unohtuu', () => {
    const r = postalsWithin('05470', 23, ['04400', '05470', '00100'])!;
    expect(r.included).not.toContain('04400');
    expect(r.included).toContain('05470');
    expect(r.excluded).toEqual(['04400']);
  });

  it('tuntematon keskipiste tai nollasäde → null', () => {
    expect(postalsWithin('99998', 20)).toBeNull();
    expect(postalsWithin('05470', 0)).toBeNull();
  });
});
