import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PDFDocument } from 'pdf-lib';
import {
  WORK_STEPS, STEP_KEYS, missingSteps, answeredCount, reportProblems, unitsFromLines,
  type WorkReport, type StepAnswers,
} from '../src/lib/work-report';
import { TyoraporttiStep } from '../src/app/(app)/tyot/[id]/viimeistely/tyoraportti';
import { generateJobReportPdf } from '../src/lib/job-report-pdf';

/* =========================================================
   Työraportti: pakollisuus on koko ominaisuuden ydin. Nämä testit
   lukitsevat sen että YKSIKIN merkitsemätön työvaihe estää viimeistelyn,
   koska sama funktio (`reportProblems`) vartioi sekä velhon nappia että
   server actionia.
   ========================================================= */

const allDone: StepAnswers = Object.fromEntries(STEP_KEYS.map((k) => [k, 'done']));

const base = (p: Partial<WorkReport> = {}): WorkReport => ({
  workDate: '2026-10-06', installers: 'Eelis Laulumaa', customerName: 'Asunto Oy Testi',
  customerPhone: '0401234567', address: 'Testitie 1, 00100 Helsinki', unit: 'B 12',
  startedAt: '08:00', finishedAt: '11:30', travelHours: '1,5',
  windows: 6, balconyDoors: 1, otherDoors: 1, steps: allDone,
  sealantM: '42,5', siliconePcs: '2', acrylicPcs: '1', notes: '', customerAckName: 'Matti Meikäläinen',
  ...p,
});

describe('työraportin tarkistus', () => {
  it('lomakkeella on täsmälleen paperin 11 työvaihetta', () => {
    expect(WORK_STEPS).toHaveLength(11);
    expect(WORK_STEPS[2].label).toBe('Urat mitattu ja profiili valittu (T101 / T104)');
    expect(WORK_STEPS[10].label).toBe('Asiakkaalle kerrottu kuivumisaika (n. 30 min)');
  });

  it('kelpaa kun kaikki on merkitty', () => {
    expect(reportProblems(base())).toEqual([]);
  });

  it('"Ei tarpeen" kelpaa vastaukseksi', () => {
    const steps = { ...allDone, gaps_acrylic: 'na' as const, drying_told: 'na' as const };
    expect(reportProblems(base({ steps }))).toEqual([]);
  });

  it('yksikin puuttuva vaihe estää ja nimeää rivin', () => {
    const { hinges_oiled: _, ...steps } = allDone;
    const p = reportProblems(base({ steps }));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('Saranat puhdistettu, kiristetty ja öljytty');
    expect(missingSteps(steps).map((s) => s.key)).toEqual(['hinges_oiled']);
    expect(answeredCount(steps)).toBe(10);
  });

  it('tuntematon arvo ei ole vastaus', () => {
    const steps = { ...allDone, adjusted: 'yes' } as unknown as StepAnswers;
    expect(missingSteps(steps).map((s) => s.key)).toEqual(['adjusted']);
  });

  it('ajat ja asiakkaan kuittaus ovat pakollisia, muut eivät', () => {
    expect(reportProblems(base({ startedAt: '' })).join()).toContain('Aloitusaika');
    expect(reportProblems(base({ finishedAt: '' })).join()).toContain('Lopetusaika');
    expect(reportProblems(base({ startedAt: '12:00', finishedAt: '11:00' })).join()).toContain('jälkeen');
    expect(reportProblems(base({ customerAckName: '  ' })).join()).toContain('kuittaus');
    expect(reportProblems(base({ travelHours: '', sealantM: '', siliconePcs: '', acrylicPcs: '', unit: '' }))).toEqual([]);
  });

  it('hylkää kelvottomat numerot', () => {
    expect(reportProblems(base({ travelHours: 'paljon' }))).toHaveLength(1);
    expect(reportProblems(base({ siliconePcs: '1,5' }))).toHaveLength(1);
    expect(reportProblems(base({ windows: -1 }))).toHaveLength(1);
  });
});

describe('kohteiden esitäyttö työriveiltä', () => {
  it('erottelee ikkunat, parvekeovet ja muut ovet hinnaston nimistä', () => {
    expect(unitsFromLines([
      { name: 'Ikkuna', quantity: 6, unit_price_cents: 8500 },
      { name: 'Parvekeovi', quantity: 1, unit_price_cents: 9900 },
      { name: 'Ulko-ovi', quantity: 1, unit_price_cents: 9900 },
      { name: 'Liuku- tai pariovi', quantity: 1, unit_price_cents: 14900 },
      { name: 'Väli- / huoneovi', quantity: 2, unit_price_cents: 5900 },
      { name: 'Aukipitolaite / 2 per ikkuna', quantity: 3, unit_price_cents: 1900 },
      { name: 'Matkalisä', quantity: 1, unit_price_cents: 2000 },
    ])).toEqual({ windows: 6, balconyDoors: 1, otherDoors: 4 });
  });

  it('ilmainen kohde veloitetun rinnalla ei tuplaannu (työ 1046)', () => {
    expect(unitsFromLines([
      { name: 'Ulko-ovi', quantity: 1, unit_price_cents: 9900 },
      { name: 'Ilmainen ovi', quantity: 1, unit_price_cents: -9900 },
    ]).otherDoors).toBe(1);
    expect(unitsFromLines([{ name: 'Ilmainen ikkuna', quantity: 1, unit_price_cents: 0 }]).windows).toBe(1);
  });
});

describe('Työraportti-askeleen renderöinti', () => {
  const render = (steps: StepAnswers) => renderToStaticMarkup(createElement(TyoraporttiStep, {
    report: base({ steps }), onChange: () => {}, onBack: () => {}, onNext: () => {},
    tableMissing: false, scheduled: '08:00–12:00',
  }));

  it('näyttää 11 riviä kahdella napilla ja edistymisen', () => {
    const seven = Object.fromEntries(STEP_KEYS.slice(0, 7).map((k) => [k, 'done'])) as StepAnswers;
    const html = render(seven);
    expect(html.match(/role="radiogroup"/g)).toHaveLength(11);
    expect(html.match(/>Tehty</g)).toHaveLength(11);
    expect(html.match(/Ei tarpeen</g)).toHaveLength(11);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(7);
    expect(html).toContain('7/11 kohtaa merkitty');
    expect(html).toContain('<b class="text-text">7/11</b> kohtaa merkitty');
    // kesken: Jatka on himmennetty mutta EI disabled
    expect(html).toMatch(/data-ready="false"[^>]*opacity-45/);
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });

  it('valmiina Jatka ei ole himmennetty', () => {
    const html = render(allDone);
    expect(html).toContain('11/11');
    expect(html).toContain('data-ready="true"');
    expect(html).not.toMatch(/data-ready="true"[^>]*opacity-45/);
  });
});

describe('työraportin PDF', () => {
  it('syntyy yhdelle A4-sivulle myös ääkkösillä ja pitkällä huomiolla', async () => {
    const bytes = await generateJobReportPdf({
      jobNumber: '1099', workDate: '2026-10-06', installers: 'Eelis Laulumaa, Nestori Frilander',
      customerName: 'Asunto Oy Testi', customerPhone: '040 123 4567', address: 'Testitie 1, 00100 Helsinki',
      unit: 'B 12', startedAt: '08:00', finishedAt: '11:30', travelHours: '1,5',
      windows: 6, balconyDoors: 1, otherDoors: 1,
      steps: { ...allDone, gaps_acrylic: 'na' },
      sealantM: '42,5', siliconePcs: '2', acrylicPcs: '1',
      notes: 'Makuuhuoneen ikkunan karmi lahonnut – suositeltu korjausta. “Lainaus” 😀 '.repeat(8),
      customerAckName: 'Matti Meikäläinen', recordedBy: 'Eelis Laulumaa', recordedAt: new Date(),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
    if (process.env.TYORAPORTTI_PDF_OUT) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.TYORAPORTTI_PDF_OUT, bytes);
    }
  });
});
