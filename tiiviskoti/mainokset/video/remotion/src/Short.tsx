import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from 'remotion';
import { Hook } from './Hook';
import { Captions, Word } from './Captions';
import { Widget } from './Widget';
import words from './words.json';

const FIX: Record<string, string> = { 'Paljeliko': 'Paleliko' };

const clean = (w: string) => {
  const punct = (w.match(/[?.,!]+$/) || [''])[0];
  const core = w.replace(/[?.,!]+$/, '');
  return (FIX[core] || core) + punct;
};

export const Short: React.FC<{ index: number }> = ({ index }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const ws: Word[] = (words as any)[String(index)].map((x: any) => ({ ...x, w: clean(x.w) }));

  /* Koukku = ensimmäinen virke. Sen aikana ei alatekstitystä: sama lause
     kahdesti ruudulla on toistoa ja vie huomion koukulta. */
  const hookEndIdx = ws.findIndex((w) => /[?]$/.test(w.w));
  const hookWords = ws.slice(0, (hookEndIdx < 0 ? 2 : hookEndIdx) + 1);
  const hookEnd = hookWords[hookWords.length - 1].b;

  /* Rivit: 3 sanaa tai virkkeen loppu. */
  const rest = ws.slice(hookWords.length);
  const lines: Word[][] = [];
  let cur: Word[] = [];
  for (const w of rest) {
    cur.push(w);
    if (/[?.!]$/.test(w.w) || cur.length >= 3) { lines.push(cur); cur = []; }
  }
  if (cur.length) lines.push(cur);

  /* Widget alkaa CTA-lauseesta ("Varaa …") ja jää loppuun asti. */
  const ctaIdx = ws.findIndex((w) => /^varaa/i.test(w.w));
  const ctaT = ctaIdx >= 0 ? ws[ctaIdx].a : ws[ws.length - 1].b - 4;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo src={staticFile(`Video-${index}.mov`)} />
      <Widget startF={Math.round(ctaT * fps)} endF={durationInFrames} />
      <Hook words={hookWords.map((w) => w.w)} from={Math.round(hookWords[0].a * fps)} to={Math.round(hookEnd * fps)} />
      <Captions lines={lines} hideUntil={hookEnd + 0.05} />
    </AbsoluteFill>
  );
};
