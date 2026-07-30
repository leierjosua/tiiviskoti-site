import { describe, expect, it } from 'vitest';
import { freeSlots, type CalendarException, type WeeklyHour } from '../src/lib/availability';
import { dateKeyOf, helsinkiDateTime, timeOf } from '../src/lib/time';

/* Kaikki testit antavat `now`:n itse, joten tulokset eivät riipu
   ajohetkestä. Kellonajat tarkistetaan Suomen aikana — se on se mitä
   asiakas näkee. */

const MON_FRI_8_16: WeeklyHour[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday, startTime: '08:00', endTime: '16:00',
}));

const settings = { slotMinutes: 30, leadTimeHours: 0, horizonDays: 60 };

function run(over: Partial<Parameters<typeof freeSlots>[0]> = {}) {
  return freeSlots({
    hours: MON_FRI_8_16,
    exceptions: [],
    busy: [],
    durationMinutes: 120,
    now: helsinkiDateTime('2026-08-03', '00:00'),      // maanantai
    until: helsinkiDateTime('2026-08-04', '00:00'),    // vain tämä päivä
    settings,
    ...over,
  });
}

const times = (slots: { start: Date }[]) => slots.map((s) => timeOf(s.start));

describe('freeSlots', () => {
  it('asettelee alkuajat työvuoron alusta niin että kesto mahtuu', () => {
    // 08:00–16:00, 2 h työ, 30 min välein → viimeinen alku 14:00.
    expect(times(run())).toEqual([
      '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00',
      '11:30', '12:00', '12:30', '13:00', '13:30', '14:00',
    ]);
  });

  it('ei tarjoa aikaa päivälle jolla ei ole työaikaa', () => {
    const saturday = freeSlots({
      hours: MON_FRI_8_16, exceptions: [], busy: [], durationMinutes: 120,
      now: helsinkiDateTime('2026-08-08', '00:00'),
      until: helsinkiDateTime('2026-08-09', '00:00'),
      settings,
    });
    expect(saturday).toHaveLength(0);
  });

  it('koko päivän poissaolo nollaa päivän', () => {
    const exceptions: CalendarException[] = [
      { date: '2026-08-03', kind: 'closed', startTime: null, endTime: null },
    ];
    expect(run({ exceptions })).toHaveLength(0);
  });

  it('osittainen poissaolo katkaisee päivän kahtia', () => {
    const exceptions: CalendarException[] = [
      { date: '2026-08-03', kind: 'closed', startTime: '10:00', endTime: '13:00' },
    ];
    // Jäljelle 08–10 (ei mahdu 2 h alkua muuta kuin 08:00) ja 13–16.
    expect(times(run({ exceptions }))).toEqual(['08:00', '13:00', '13:30', '14:00']);
  });

  it('ylimääräinen työaika lisää aikoja viikkoaikataulun ulkopuolelle', () => {
    const exceptions: CalendarException[] = [
      { date: '2026-08-08', kind: 'open', startTime: '09:00', endTime: '12:00' },
    ];
    const saturday = freeSlots({
      hours: MON_FRI_8_16, exceptions, busy: [], durationMinutes: 120,
      now: helsinkiDateTime('2026-08-08', '00:00'),
      until: helsinkiDateTime('2026-08-09', '00:00'),
      settings,
    });
    expect(times(saturday)).toEqual(['09:00', '09:30', '10:00']);
  });

  it('olemassa oleva työ varaa ajan', () => {
    const busy = [{
      start: helsinkiDateTime('2026-08-03', '10:00'),
      end: helsinkiDateTime('2026-08-03', '12:00'),
    }];
    // 08–10 on täsmälleen kahden tunnin mittainen, joten klo 8 alku säilyy.
    expect(times(run({ busy }))).toEqual(['08:00', '12:00', '12:30', '13:00', '13:30', '14:00']);
  });

  it('varoaika siirtää aikaisinta mahdollista alkua', () => {
    const slots = run({
      now: helsinkiDateTime('2026-08-03', '06:00'),
      settings: { ...settings, leadTimeHours: 5 },   // aikaisintaan klo 11
    });
    expect(times(slots)[0]).toBe('11:00');
  });

  it('ei tarjoa aikaa jos kesto ei mahdu vapaaseen väliin', () => {
    const busy = [{
      start: helsinkiDateTime('2026-08-03', '09:00'),
      end: helsinkiDateTime('2026-08-03', '15:00'),
    }];
    // Jäljelle 08–09 ja 15–16, kumpaankaan ei mahdu 2 h.
    expect(run({ busy })).toHaveLength(0);
  });

  it('horisontti rajaa vaikka kysyttäisiin pidemmälle', () => {
    const slots = freeSlots({
      hours: MON_FRI_8_16, exceptions: [], busy: [], durationMinutes: 120,
      now: helsinkiDateTime('2026-08-03', '00:00'),
      until: helsinkiDateTime('2026-12-31', '00:00'),
      settings: { ...settings, horizonDays: 2 },
    });
    const days = new Set(slots.map((s) => dateKeyOf(s.start)));
    expect([...days].sort()).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('kellonaika pysyy samana kesä- ja talviajassa', () => {
    const summer = freeSlots({
      hours: MON_FRI_8_16, exceptions: [], busy: [], durationMinutes: 60,
      now: helsinkiDateTime('2026-07-06', '00:00'),
      until: helsinkiDateTime('2026-07-07', '00:00'),
      settings,
    });
    const winter = freeSlots({
      hours: MON_FRI_8_16, exceptions: [], busy: [], durationMinutes: 60,
      now: helsinkiDateTime('2026-12-07', '00:00'),
      until: helsinkiDateTime('2026-12-08', '00:00'),
      settings,
    });

    expect(timeOf(summer[0].start)).toBe('08:00');
    expect(timeOf(winter[0].start)).toBe('08:00');
    // Sama seinäkellonaika on eri hetki: kesällä UTC+3, talvella UTC+2.
    expect(summer[0].start.toISOString()).toContain('T05:00');
    expect(winter[0].start.toISOString()).toContain('T06:00');
  });

  it('kesäajan siirtymäpäivä ei siirrä työvuoroa', () => {
    // 29.3.2026 kello siirtyy 03→04. Työvuoro alkaa silti klo 08.
    const slots = freeSlots({
      hours: [{ weekday: 7, startTime: '08:00', endTime: '16:00' }],
      exceptions: [], busy: [], durationMinutes: 60,
      now: helsinkiDateTime('2026-03-29', '00:00'),
      until: helsinkiDateTime('2026-03-30', '00:00'),
      settings,
    });
    expect(timeOf(slots[0].start)).toBe('08:00');
    expect(timeOf(slots[slots.length - 1].start)).toBe('15:00');
  });

  it('peräkkäiset työaikapalat yhdistyvät yhdeksi jaksoksi', () => {
    const hours: WeeklyHour[] = [
      { weekday: 1, startTime: '08:00', endTime: '12:00' },
      { weekday: 1, startTime: '12:00', endTime: '16:00' },
    ];
    // Jos jaksot eivät yhdistyisi, klo 11.00 alkavaa 2 h aikaa ei olisi.
    expect(times(run({ hours }))).toContain('11:00');
  });
});
