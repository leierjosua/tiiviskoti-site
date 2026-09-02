import { describe, expect, it } from 'vitest';
import { parseBookingStart, timeOf, dateKeyOf } from '../src/lib/time';

/* Vapaiden aikojen napissa lukee Suomen aika. Sen pitää olla myös se aika
   joka tallentuu — tästä meni kolme tuntia pieleen jokaisessa varauksessa. */
describe('parseBookingStart', () => {
  it('säilyttää ISO-hetken sellaisenaan (slot-lista)', () => {
    const d = parseBookingStart('2026-09-08T05:00:00.000Z');
    expect(d.toISOString()).toBe('2026-09-08T05:00:00.000Z');
    expect(timeOf(d)).toBe('08:00');          // sama kuin napissa
    expect(dateKeyOf(d)).toBe('2026-09-08');
  });

  it('tulkitsee vyöhykkeettömän arvon Suomen aikana (Siirrä aikaa)', () => {
    const d = parseBookingStart('2026-09-08T08:00');
    expect(d.toISOString()).toBe('2026-09-08T05:00:00.000Z');
    expect(timeOf(d)).toBe('08:00');
  });

  it('osaa talviajan', () => {
    expect(parseBookingStart('2026-01-15T09:00').toISOString()).toBe('2026-01-15T07:00:00.000Z');
    expect(timeOf(parseBookingStart('2026-01-15T07:00:00.000Z'))).toBe('09:00');
  });

  it('kelpuuttaa myös vyöhykesiirtymän', () => {
    expect(parseBookingStart('2026-09-08T08:00:00+03:00').toISOString()).toBe('2026-09-08T05:00:00.000Z');
  });

  it('palauttaa kelvottomasta arvosta NaN-päivän', () => {
    expect(Number.isNaN(parseBookingStart('roska').getTime())).toBe(true);
  });
});
