import { describe, expect, it } from 'vitest';
import { answerRows, parseAnswers } from '../src/lib/survey-schema';

describe('kohdetietokyselyn vastaukset', () => {
  it('säilyttää kelvolliset vastaukset', () => {
    expect(parseAnswers({
      ikkuna_puitteet: '3', ikkuna_tiivistetaan: '1-2', ikkuna_ura: 'kylla',
      ovi_ura: 'en_tieda', ongelmat: ['veto', 'huurtuminen'], lisatiedot: '  koira pihalla ',
    })).toEqual({
      ikkuna_puitteet: '3', ikkuna_tiivistetaan: '1-2', ikkuna_ura: 'kylla',
      ovi_ura: 'en_tieda', ongelmat: ['veto', 'huurtuminen'], lisatiedot: 'koira pihalla',
    });
  });

  it('pudottaa kelvottoman kentän mutta pitää muut', () => {
    expect(parseAnswers({ ikkuna_puitteet: '7', ikkuna_ura: 'ei', ongelmat: ['veto', 'hakkerointi'] }))
      .toEqual({ ikkuna_ura: 'ei', ongelmat: ['veto'] });
    expect(parseAnswers({ ongelmat: 'veto', ovi_puitteet: '2' })).toEqual({ ovi_puitteet: '2' });
  });

  it('ei koskaan ota kuvapolkuja selaimelta', () => {
    expect(parseAnswers({ photos: { ikkuna_ulko: 'job/x/y.jpg' }, saleet: 'kylla' })).toEqual({ saleet: 'kylla' });
  });

  it('kestää roskasyötteen', () => {
    expect(parseAnswers(null)).toEqual({});
    expect(parseAnswers('x')).toEqual({});
    expect(parseAnswers({ lisatiedot: 'a'.repeat(5000), saleet: 'ei' })).toEqual({ saleet: 'ei' });
  });

  it('näyttää vastaukset luettavina', () => {
    expect(answerRows({ ikkuna_tiivistetaan: '1-2-3', ongelmat: ['veto'] })).toEqual([
      { label: 'Tiivistettävät puitteet', value: 'Kaikki kolme (1, 2 ja ulko 3) — LISÄTYÖ +20 €/ikkuna' },
      { label: 'Ongelmat', value: 'Vetoa' },
    ]);
  });
});
