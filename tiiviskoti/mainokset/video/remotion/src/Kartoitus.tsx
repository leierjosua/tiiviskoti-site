import React from 'react';
import {
  AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { C, FONT } from './brand';
import { Grain, MaskLine, Vignette } from './ui';
import { Block, Check, Eyebrow, H1, Pill, Price, ShotLayer, type Shot } from './IkkunaOvi';

/* Kartoituskokeilu 10/2026 (kartoitus.html): Meta mainostaa ilmaista
   kotikartoitusta. Sama kuvamateriaali ja rytmi kuin TK58:ssa (paras
   video 30 pv), vain viesti vaihtuu. Kaksi versiota, jotka eroavat VAIN
   ensimmäisestä tekstilohkosta = puhdas koukkutesti:
     a = "Ilmainen kartoituskäynti" suoraan
     b = kysymys "Vetääkö ikkuna tai ovi?"
   Ei säästölupauksia (ks. lupauskieli) — käynti ja kiinteä hinta ovat lupaus. */

export const FPS = 25;
const X = 20;
const XL = 30;

const SHOTS: Array<Shot & { chapterBreak?: boolean }> = [
  { src: 'ik10', len: 56, pos45: '50% 45%' },
  { src: 'ik09', len: 47, pos45: '50% 30%' },
  { src: 'ik07', len: 62, pos45: '50% 60%' },
  { src: 'ik13', len: 89, pos45: '50% 40%', zoomFrom: 1.0, zoomTo: 1.05 },
  { src: 'ov02', len: 79, pos45: '50% 45%', chapterBreak: true },
  { src: 'ov11', len: 84, pos45: '50% 15%' },
  { src: 'ov13', len: 113, pos45: '50% 40%' },
  { src: 'ov15', len: 96, pos45: '50% 45%', zoomFrom: 1.02, zoomTo: 1.08 },
];

const STARTS: number[] = [];
SHOTS.forEach((s, i) => {
  if (i === 0) { STARTS.push(0); return; }
  STARTS.push(STARTS[i - 1] + SHOTS[i - 1].len - (s.chapterBreak ? XL : X));
});
export const KARTOITUS_FRAMES = STARTS[STARTS.length - 1] + SHOTS[SHOTS.length - 1].len;
const MID_AT = STARTS[SHOTS.findIndex((s) => s.chapterBreak)];
const END_AT = STARTS[SHOTS.length - 1] + 8;

/* IkkunaOvi.tsx:n Cta, mutta oma teksti: kokeilun CTA on varaus, ei tarjous. */
const Cta: React.FC<{ at: number; label: string }> = ({ at, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 120 }, durationInFrames: 30 });
  const breathe = 1 + Math.max(0, Math.sin((frame - at - 30) / 9)) * 0.018 * (frame > at + 30 ? 1 : 0);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 18, marginTop: 40,
      background: '#fff', color: C.green, fontWeight: 800, fontSize: 44, letterSpacing: '-0.01em',
      padding: '28px 48px', borderRadius: 22, boxShadow: '0 24px 50px -18px rgba(0,0,0,.55)',
      opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 40}px) scale(${breathe})`, textShadow: 'none',
    }}>
      {label}
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h12M12 6l6 6-6 6" />
      </svg>
    </div>
  );
};

const Mint: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => (
  <MaskLine at={at} style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.035em', color: C.mint }}>
    {children}
  </MaskLine>
);

export const Kartoitus: React.FC<{ ratio: '916' | '45'; variant: 'a' | 'b' }> = ({ ratio, variant }) => {
  const r45 = ratio === '45';
  const bottom = r45 ? 190 : 560;
  const frame = useCurrentFrame();
  const endFade = interpolate(frame, [KARTOITUS_FRAMES - 14, KARTOITUS_FRAMES], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: FONT }}>
      <AbsoluteFill style={{ opacity: endFade }}>
        {SHOTS.map((s, i) => <ShotLayer key={s.src} s={s} start={STARTS[i]} isFirst={i === 0} r45={r45} />)}
      </AbsoluteFill>

      <AbsoluteFill style={{
        background: `linear-gradient(180deg, rgba(8,24,15,0) ${r45 ? 30 : 38}%, rgba(8,24,15,.30) ${r45 ? 50 : 55}%, rgba(8,24,15,.74) 100%)`,
      }} />
      <Vignette strength={0.32} />
      <Grain opacity={0.04} />

      {/* 1. Koukku — ainoa ero versioiden välillä. Palvelusana näkyy heti. */}
      <Block from={6} to={MID_AT - 4} bottom={bottom}>
        {variant === 'a' ? (
          <>
            <Eyebrow at={6} n="0 €" label="KARTOITUSKÄYNTI" />
            <H1 at={10}>Ilmainen</H1>
            <Mint at={16}>kartoituskäynti.</Mint>
            <Pill at={46}>Ikkunoiden ja ovien tiivistys</Pill>
            <Check at={78} text="Asentaja katsoo ikkunat ja ovet" />
          </>
        ) : (
          <>
            <Eyebrow at={6} n="?" label="IKKUNAT JA OVET" />
            <H1 at={10}>Vetääkö ikkuna</H1>
            <Mint at={16}>tai ovi?</Mint>
            <Pill at={46}>Asentaja tulee katsomaan — 0 €</Pill>
            <Check at={78} text="Ikkunoiden ja ovien tiivistys" />
          </>
        )}
      </Block>

      {/* 2. Hinta: kiinteä hinta paikan päällä + hintataso, jottei käynti tunnu myyntikäynniltä. */}
      <Block from={MID_AT + 14} to={END_AT - 10} bottom={bottom}>
        <Eyebrow at={MID_AT + 14} n="02" label="HINTA PAIKAN PÄÄLLÄ" />
        <H1 at={MID_AT + 18}>Ikkunan tiivistys</H1>
        <Price at={MID_AT + 26} value={75} prefix="alk." />
        <Pill at={MID_AT + 60}>Ulko-ovi 99&nbsp;€</Pill>
        <Check at={MID_AT + 90} text="Näet summan ennen kuin päätät" />
        <Check at={MID_AT + 108} text="Ei sitoumusta" />
      </Block>

      {/* 3. Loppu: yksi ajatus + CTA. */}
      <Block from={END_AT + 6} to={-1} bottom={bottom}>
        <Img src={staticFile('ikkuna-ovi/logo.png')} style={{ width: 300, marginBottom: 34, opacity: 0.95 }} />
        <H1 at={END_AT + 8}>Varaa ilmainen</H1>
        <Mint at={END_AT + 14}>kartoituskäynti.</Mint>
        <Cta at={END_AT + 30} label="Varaa aika" />
      </Block>

      <Audio
        src={staticFile('ikkuna-ovi/musa.m4a')}
        volume={(f) => 0.55 * interpolate(f, [0, 8, KARTOITUS_FRAMES - 25, KARTOITUS_FRAMES], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
    </AbsoluteFill>
  );
};
