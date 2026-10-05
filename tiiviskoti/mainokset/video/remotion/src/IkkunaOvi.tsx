import React from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { C, FONT } from './brand';
import { Grain, MaskLine, Roll, Vignette } from './ui';

/* Ikkuna + ovi -mainos (Josua 5.10.2026). Ensin ikkunan tiivistys, sitten ovi.

   VAIHDOT: Josua sanoi ensimmäisestä versiosta "transitiot on aivan liian
   nopeita". Korjaus EI ole lyhyempi häivytys vaan vähemmän ja pidempiä
   otoksia: 8 otosta ~19 sekunnissa, jokainen 2–4,5 s. Klipit on hidastettu
   ETUKÄTEEN ffmpegin minterpolatella (public/ikkuna-ovi/*.mp4, ks.
   build-ikkuna-ovi.sh) — Remotionin playbackRate monistaisi ruutuja ja
   nykisi. Jokaisessa otoksessa hidas kameran ajo sisään, jolloin pitkäkin
   otos elää.

   Lähteet: Drive IKKUNA/CLIPS ja OVI/CLIPS. Hylätyt klipit ja syyt ks.
   build-ikkuna-ovi.py. */

export const FPS = 25;
const X = 20;      // sulautus saman luvun sisällä (0,8 s)
const XL = 30;     // sulautus ikkunasta oveen (1,2 s)

type Shot = { src: string; len: number; pos45: string; zoomFrom?: number; zoomTo?: number; x?: number };

/* len = esihidastetun klipin pituus ruutuina. pos45 = mistä kohtaa 9:16-kuva
   rajataan 4:5:ksi (työ ei saa jäädä rajauksen ulkopuolelle). */
const SHOTS: Array<Shot & { chapterBreak?: boolean }> = [
  { src: 'ik10', len: 56, pos45: '50% 45%' },               // tiiviste alakarmin uraan, makro
  { src: 'ik09', len: 47, pos45: '50% 30%' },               // tiiviste pystyuraan
  { src: 'ik07', len: 62, pos45: '50% 60%' },               // saumaus karmia pitkin
  { src: 'ik13', len: 89, pos45: '50% 40%', zoomFrom: 1.0, zoomTo: 1.05 }, // ikkuna suljetaan, laaja
  { src: 'ov02', len: 79, pos45: '50% 45%', chapterBreak: true }, // oven tiiviste karmiin
  { src: 'ov11', len: 84, pos45: '50% 15%' },               // yläkarmi
  { src: 'ov13', len: 113, pos45: '50% 40%' },              // saranan säätö kuusiokoloavaimella
  { src: 'ov15', len: 96, pos45: '50% 45%', zoomFrom: 1.02, zoomTo: 1.08 }, // ovi suljetaan
];

const STARTS: number[] = [];
SHOTS.forEach((s, i) => {
  if (i === 0) { STARTS.push(0); return; }
  const prev = SHOTS[i - 1];
  STARTS.push(STARTS[i - 1] + prev.len - (s.chapterBreak ? XL : X));
});
export const IKKUNA_OVI_FRAMES = STARTS[STARTS.length - 1] + SHOTS[SHOTS.length - 1].len;
const DOOR_AT = STARTS[SHOTS.findIndex((s) => s.chapterBreak)];
const END_AT = STARTS[SHOTS.length - 1] + 8;

/* ---------- Kuva ---------- */

const ShotLayer: React.FC<{ s: Shot & { chapterBreak?: boolean }; start: number; isFirst: boolean; r45: boolean }> =
  ({ s, start, isFirst, r45 }) => {
    const frame = useCurrentFrame();
    const local = frame - start;
    const fadeLen = s.chapterBreak ? XL : X;
    /* Sisääntulo: pehmeä S-käyrä, ei lineaarinen — lineaarinen sulautus
       näyttää "harmaalta" keskeltä. */
    const op = isFirst ? 1 : interpolate(local, [0, fadeLen], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic),
    });
    const z = interpolate(local, [0, s.len], [s.zoomFrom ?? 1.0, s.zoomTo ?? 1.07], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    return (
      <Sequence from={start} durationInFrames={s.len}>
        <AbsoluteFill style={{ opacity: op, overflow: 'hidden' }}>
          <OffthreadVideo
            src={staticFile(`ikkuna-ovi/${s.src}.mp4`)}
            muted
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              objectPosition: r45 ? s.pos45 : '50% 50%',
              transform: `scale(${z})`,
              /* Kevyt grade: hieman kontrastia ja lämpöä. Materiaali on jo
                 hyvin valotettua, joten tämä on viimeistely eikä korjaus. */
              filter: 'contrast(1.06) saturate(1.06) brightness(1.01)',
            }}
          />
        </AbsoluteFill>
      </Sequence>
    );
  };

/* ---------- Teksti ---------- */

const useInOut = (from: number, to: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame: frame - from, fps, config: { damping: 200 }, durationInFrames: 22 });
  const outS = to < 0 ? 0 : spring({ frame: frame - to, fps, config: { damping: 200 }, durationInFrames: 18 });
  return { visible: frame >= from - 1 && (to < 0 || frame <= to + 20), op: inS * (1 - outS), y: (1 - inS) * 26 - outS * 22 };
};

const Eyebrow: React.FC<{ at: number; n: string; label: string }> = ({ at, n, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: 24 });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26, opacity: s }}>
      <span style={{ fontSize: 30, fontWeight: 800, color: C.mint, letterSpacing: '0.04em' }}>{n}</span>
      <span style={{ height: 3, width: interpolate(s, [0, 1], [0, 64]), background: C.mint, borderRadius: 2 }} />
      <span style={{ fontSize: 30, fontWeight: 700, color: 'rgba(255,255,255,.9)', letterSpacing: '0.16em' }}>{label}</span>
    </div>
  );
};

/* Valintamerkki piirtyy viivana (stroke-dashoffset), ei ilmesty. */
const Check: React.FC<{ at: number; text: string }> = ({ at, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: 22 });
  const draw = spring({ frame: frame - at - 6, fps, config: { damping: 200 }, durationInFrames: 18 });
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 22, marginTop: 20,
      opacity: s, transform: `translateX(${(1 - s) * -24}px)`,
    }}>
      <svg width="46" height="46" viewBox="0 0 46 46" style={{ flex: 'none' }}>
        <circle cx="23" cy="23" r="23" fill={C.green} />
        <path d="M13 23.5l6.5 6.5L33 16.5" fill="none" stroke="#fff" strokeWidth="4.2"
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30" strokeDashoffset={30 * (1 - draw)} />
      </svg>
      <span style={{ fontSize: 42, fontWeight: 700, color: '#fff', letterSpacing: '-0.015em', textShadow: '0 3px 18px rgba(0,0,0,.55)' }}>{text}</span>
    </div>
  );
};

const Pill: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: 22 });
  return (
    <div style={{
      display: 'inline-block', marginTop: 30, opacity: s, transform: `translateY(${(1 - s) * 18}px)`,
      background: 'rgba(11,34,20,.66)', border: '2px solid rgba(255,255,255,.28)', borderRadius: 999,
      padding: '18px 34px', fontSize: 40, fontWeight: 700, color: '#fff', letterSpacing: '-0.015em',
      backdropFilter: 'blur(10px)',
    }}>{children}</div>
  );
};

const Price: React.FC<{ at: number; value: number; prefix?: string }> = ({ at, value, prefix }) => {
  const frame = useCurrentFrame();
  /* Luku rullaa nollasta hintaan 1,1 s:ssa ja hidastuu loppua kohti. */
  const p = interpolate(frame - at, [0, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const v = p * value;
  const speed = interpolate(frame - at, [0, 6, 22, 28], [0, 6, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <MaskLine at={at}>
      <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 18, color: C.mint }}>
        {prefix && <span style={{ fontSize: 124, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.02 }}>{prefix}</span>}
        <Roll v={v} fs={124} color={C.mint} digits={String(value).length} blur={speed} />
        <span style={{ fontSize: 124, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.02 }}>€</span>
      </span>
    </MaskLine>
  );
};

const H1: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => (
  <MaskLine at={at} style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.035em', color: '#fff' }}>
    {children}
  </MaskLine>
);

const Block: React.FC<{ from: number; to: number; bottom: number; children: React.ReactNode }> = ({ from, to, bottom, children }) => {
  const { visible, op, y } = useInOut(from, to);
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', left: 76, right: 76, bottom, opacity: op, transform: `translateY(${y}px)`,
      textShadow: '0 4px 28px rgba(0,0,0,.45)',
    }}>{children}</div>
  );
};

const Cta: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 120 }, durationInFrames: 30 });
  /* Kevyt "hengitys" kun painike on paikallaan — vetää katseen ilman vilkkumista. */
  const breathe = 1 + Math.max(0, Math.sin((frame - at - 30) / 9)) * 0.018 * (frame > at + 30 ? 1 : 0);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 18, marginTop: 40,
      background: '#fff', color: C.green, fontWeight: 800, fontSize: 44, letterSpacing: '-0.01em',
      padding: '28px 48px', borderRadius: 22, boxShadow: '0 24px 50px -18px rgba(0,0,0,.55)',
      opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 40}px) scale(${breathe})`, textShadow: 'none',
    }}>
      Pyydä tarjous
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h12M12 6l6 6-6 6" />
      </svg>
    </div>
  );
};

/* ---------- Kooste ---------- */

export const IkkunaOvi: React.FC<{ ratio: '916' | '45' }> = ({ ratio }) => {
  const r45 = ratio === '45';
  /* 9:16: Reelsin oma UI peittää alimmat ~420 px → teksti ylemmäs. */
  const bottom = r45 ? 190 : 560;
  const frame = useCurrentFrame();
  const endFade = interpolate(frame, [IKKUNA_OVI_FRAMES - 14, IKKUNA_OVI_FRAMES], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: FONT }}>
      <AbsoluteFill style={{ opacity: endFade }}>
        {SHOTS.map((s, i) => <ShotLayer key={s.src} s={s} start={STARTS[i]} isFirst={i === 0} r45={r45} />)}
      </AbsoluteFill>

      {/* Varjostin alas, jotta valkoinen teksti lukee vaalealla karmilla. */}
      <AbsoluteFill style={{
        background: `linear-gradient(180deg, rgba(8,24,15,0) ${r45 ? 30 : 38}%, rgba(8,24,15,.30) ${r45 ? 50 : 55}%, rgba(8,24,15,.74) 100%)`,
      }} />
      <Vignette strength={0.32} />
      <Grain opacity={0.04} />

      {/* 1. Ikkunat */}
      <Block from={6} to={DOOR_AT - 4} bottom={bottom}>
        <Eyebrow at={6} n="01" label="IKKUNAT" />
        <H1 at={10}>Ikkunan tiivistys</H1>
        <Price at={18} value={75} prefix="alk." />
        <Pill at={52}>Uusi ikkuna maksaisi 1&nbsp;200&nbsp;€</Pill>
        <Check at={80} text="Säätö ja öljyäminen kuuluvat hintaan" />
      </Block>

      {/* 2. Ovet */}
      <Block from={DOOR_AT + 14} to={END_AT - 10} bottom={bottom}>
        <Eyebrow at={DOOR_AT + 14} n="02" label="OVET" />
        <H1 at={DOOR_AT + 18}>Ulko-oven tiivistys</H1>
        <Price at={DOOR_AT + 26} value={99} />
        <Check at={DOOR_AT + 62} text="Tiivisteiden vaihto" />
        <Check at={DOOR_AT + 80} text="Lukkojen ja saranoiden öljyäminen" />
        <Check at={DOOR_AT + 98} text="Oven säätö" />
      </Block>

      {/* 3. Loppu: yksi ajatus + CTA, pysyy loppuun asti. */}
      <Block from={END_AT + 6} to={-1} bottom={bottom}>
        <Img src={staticFile('ikkuna-ovi/logo.png')} style={{ width: 300, marginBottom: 34, opacity: 0.95 }} />
        <H1 at={END_AT + 8}>Ovet ja ikkunat</H1>
        <MaskLine at={END_AT + 14} style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.035em', color: C.mint }}>
          samalla käynnillä.
        </MaskLine>
        <Cta at={END_AT + 30} />
      </Block>

      <Audio
        src={staticFile('ikkuna-ovi/musa.m4a')}
        volume={(f) => 0.55 * interpolate(f, [0, 8, IKKUNA_OVI_FRAMES - 25, IKKUNA_OVI_FRAMES], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
    </AbsoluteFill>
  );
};
