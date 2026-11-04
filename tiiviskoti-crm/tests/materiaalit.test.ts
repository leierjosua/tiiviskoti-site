import { describe, expect, it } from 'vitest';
import { materialLabel, materialNeed } from '../src/lib/materiaalit';

describe('materiaaliarvio', () => {
  it('laskee metrit kertoimilla 7 m / ikkuna ja 8 m / ovi', () => {
    expect(materialNeed({ ikkunat: 8, ovet: 1 }).tiivisteMetrit).toBe(64);
  });

  it('tasaluku ei pyöristy seuraavaan patruunaan', () => {
    expect(materialNeed({ ikkunat: 10, ovet: 0 }).patruunat).toBe(1);
    expect(materialNeed({ ikkunat: 0, ovet: 8 }).patruunat).toBe(1);
    expect(materialNeed({ ikkunat: 30, ovet: 8 }).patruunat).toBe(4);
  });

  it('vajaa patruuna pyöristyy ylös, osuudet yhteen ennen pyöristystä', () => {
    expect(materialNeed({ ikkunat: 11, ovet: 0 }).patruunat).toBe(2);
    expect(materialNeed({ ikkunat: 1, ovet: 1 }).patruunat).toBe(1);
  });

  it('muotoilee tekstin ja jättää tyhjän keikan pois', () => {
    expect(materialLabel({ ikkunat: 1, ovet: 0 })).toBe('7 m tiivistettä · n. 1 patruuna massaa');
    expect(materialLabel({ ikkunat: 8, ovet: 3 })).toBe('80 m tiivistettä · n. 2 patruunaa massaa');
    expect(materialLabel({ ikkunat: 0, ovet: 0 })).toBeNull();
    expect(materialLabel(undefined)).toBeNull();
  });
});
