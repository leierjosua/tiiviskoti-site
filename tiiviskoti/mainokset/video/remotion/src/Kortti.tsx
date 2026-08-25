import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';
import { C, W, SAFE_TOP, SAFE_BOTTOM, FONT } from './brand';
import './font';

/* Korttivideo — AaltoAirin Reel-kaava (IG 15.7.2026) TiivisKodin väreillä.
   Ei kuvamateriaalia: pilleri-kysymys → kolmirivinen otsikko jossa keskirivi
   kantaa korostusvärin → sivuston OMAT varausvaiheet → CTA.

   Palvelurivi "Ovien & ikkunoiden tiivistys" on näkyvissä KOKO videon ajan.
   Josua huomautti kahdesti että stilleistä ei käynyt ilmi mitä myydään; kun
   katsoja voi tulla mukaan kesken toiston, sen ei saa olla vain alussa. */

export type Step = { tag: string; title: string; sub: string };
export type KorttiProps = {
  chip: string;
  l1: string; l2: string; l3: string;
  lead: string;
  steps: Step[];
  /* Taloyhtiö ei varaa työtä vaan maksuttoman kartoituskäynnin — otsikot
     ovat siksi propseja eivätkä kovakoodattuja. */
  cardTitle: string;
  ctaLine1: string;
  ctaLine2: string;
  ctaNote: string;
};

const SERVICE = 'Ovien & ikkunoiden tiivistys';

/* Ajastus framena, 25 fps. Vientiin lasketaan sama kaava Root.tsx:ssä. */
export const TITLE_F = 92;
export const STEP_F = 70;
export const TAIL_F = 34;
export const CTA_F = 104;
export const totalFrames = (n: number) => TITLE_F + n * STEP_F + TAIL_F + CTA_F;

const Mark: React.FC<{ size: number; onDark?: boolean }> = ({ size, onDark }) => (
  <svg viewBox="0 0 100 100" style={{ width: size, height: size, display: 'block', flex: 'none' }}>
    <rect width="100" height="100" rx="22" fill={onDark ? '#F6F7F3' : C.green} />
    <rect x="31" y="20" width="38" height="60" rx="3" fill="none"
      stroke={onDark ? C.green : '#F6F7F3'} strokeWidth="5" />
    <rect x="35" y="20" width="4" height="60" fill={onDark ? C.green : '#F6F7F3'} />
  </svg>
);

/* Valintamerkki vedetään viivana, ei ilmesty kertarysäyksellä — sama
   yksityiskohta kuin Widget.tsx:ssä, se erottaa animaation diaesityksestä. */
const Tick: React.FC<{ p: number; size: number }> = ({ p, size }) => (
  <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none"
    stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
  </svg>
);

const ServiceBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 4, fps, config: { damping: 18, mass: 0.6 } });
  return (
    <div style={{
      position: 'absolute', top: SAFE_TOP - 74, left: 0, right: 0,
      display: 'flex', justifyContent: 'center', zIndex: 5,
      opacity: s, transform: `translateY(${interpolate(s, [0, 1], [-18, 0])}px)`,
    }}>
      <span style={{
        fontFamily: FONT, fontWeight: 800, fontSize: 30, letterSpacing: '0.15em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,.94)',
        background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.24)',
        padding: '14px 32px', borderRadius: 999, whiteSpace: 'nowrap',
      }}>{SERVICE}</span>
    </div>
  );
};

export const Kortti: React.FC<KorttiProps> = ({ chip, l1, l2, l3, lead, steps, cardTitle, ctaLine1, ctaLine2, ctaNote }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const stepsStart = TITLE_F;
  const ctaStart = TITLE_F + steps.length * STEP_F + TAIL_F;

  /* Otsikkokortti väistyy ylös kun vaiheet alkavat. */
  const titleOut = interpolate(frame, [stepsStart - 20, stepsStart + 6], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.ease),
  });
  const chipS = spring({ frame: frame - 10, fps, config: { damping: 16, mass: 0.6 } });
  const t1 = spring({ frame: frame - 18, fps, config: { damping: 15, mass: 0.55 } });
  const t2 = spring({ frame: frame - 25, fps, config: { damping: 15, mass: 0.55 } });
  const t3 = spring({ frame: frame - 32, fps, config: { damping: 15, mass: 0.55 } });
  const leadS = spring({ frame: frame - 44, fps, config: { damping: 18, mass: 0.7 } });

  const cardS = spring({ frame: frame - stepsStart, fps, config: { damping: 17, mass: 0.7 } });
  const cardOut = interpolate(frame, [ctaStart - 14, ctaStart + 4], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.ease),
  });
  const ctaS = spring({ frame: frame - ctaStart, fps, config: { damping: 17, mass: 0.7 } });

  const line = (txt: string, s: number, accent?: boolean) => (
    <span style={{
      display: 'block', color: accent ? C.mint : '#fff',
      opacity: s, transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
    }}>{txt}</span>
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#12301F' }}>
      {/* Säteittäinen tausta: keskeltä vaaleampi, reunoilta syvä. */}
      <AbsoluteFill style={{
        background:
          'radial-gradient(ellipse 78% 46% at 50% 44%, #2E8A5B 0%, #226B47 34%, #17462E 66%, #12301F 100%)',
      }} />
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 320px 90px rgba(9,26,17,.55)' }} />

      <ServiceBar />

      {/* ---------- 1. otsikkokortti ---------- */}
      <AbsoluteFill style={{
        alignItems: 'center', justifyContent: 'center',
        paddingLeft: 76, paddingRight: 76, paddingTop: SAFE_TOP, paddingBottom: SAFE_BOTTOM,
        textAlign: 'center',
        opacity: 1 - titleOut,
        transform: `translateY(${interpolate(titleOut, [0, 1], [0, -70])}px)`,
      }}>
        <span style={{
          fontSize: 31, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,.9)', background: 'rgba(255,255,255,.15)',
          border: '1px solid rgba(255,255,255,.22)', padding: '15px 34px', borderRadius: 999,
          marginBottom: 40, opacity: chipS, transform: `scale(${interpolate(chipS, [0, 1], [0.9, 1])})`,
        }}>{chip}</span>

        <h1 style={{
          margin: 0, fontWeight: 800, fontSize: 112, lineHeight: 1.04,
          letterSpacing: '-0.035em', color: '#fff',
        }}>
          {line(l1, t1)}
          {line(l2, t2, true)}
          {line(l3, t3)}
        </h1>

        <p style={{
          margin: '38px 0 0', fontSize: 39, fontWeight: 700, lineHeight: 1.34,
          color: 'rgba(255,255,255,.62)', maxWidth: 820,
          opacity: leadS, transform: `translateY(${interpolate(leadS, [0, 1], [18, 0])}px)`,
        }}>{lead}</p>
      </AbsoluteFill>

      {/* ---------- 2. varausvaiheet ---------- */}
      <AbsoluteFill style={{
        alignItems: 'center', justifyContent: 'center',
        paddingTop: SAFE_TOP, paddingBottom: SAFE_BOTTOM,
        opacity: cardS * (1 - cardOut),
        transform: `translateY(${interpolate(cardS, [0, 1], [70, 0]) - cardOut * 60}px)`,
        pointerEvents: 'none',
      }}>
        <div style={{
          width: 760, background: C.card, borderRadius: 34, padding: '30px 32px 32px',
          boxShadow: '0 34px 90px -26px rgba(8,28,18,.66)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            paddingBottom: 22, borderBottom: `2px solid ${C.line}`,
          }}>
            <Mark size={54} />
            <div>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {cardTitle}
              </div>
              <div style={{ fontSize: 21, fontWeight: 700, color: C.mute, marginTop: 3 }}>
                tiiviskoti.fi · ei tarjouspyyntöä
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 22 }}>
            {steps.map((st, i) => {
              const at = stepsStart + i * STEP_F;
              const on = spring({ frame: frame - at, fps, config: { damping: 15, mass: 0.45 } });
              /* Vaihe kuitataan vasta kun seuraava syttyy — viimeinen jää
                 aktiiviseksi kunnes CTA alkaa. */
              const doneAt = i < steps.length - 1 ? at + STEP_F : ctaStart - TAIL_F + 10;
              const done = spring({ frame: frame - doneAt, fps, config: { damping: 15, mass: 0.45 } });
              const active = on - done;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 18,
                  padding: '15px 16px', borderRadius: 18,
                  background: on > 0.2 ? C.softOn : C.soft,
                  border: `2px solid ${active > 0.15 ? C.greenL : 'transparent'}`,
                  transform: `translateX(${interpolate(on, [0, 1], [-16, 0])}px)`,
                  opacity: interpolate(on, [0, 1], [0.32, 1]),
                }}>
                  <span style={{
                    width: 50, height: 50, flex: 'none', borderRadius: 15,
                    display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 800,
                    background: done > 0.05 ? C.greenL : on > 0.3 ? C.green : '#DDE6DB',
                    color: on > 0.3 ? '#fff' : C.mute,
                  }}>
                    {done > 0.05 ? <Tick p={Math.min(1, done)} size={28} /> : i + 1}
                  </span>
                  <span style={{ display: 'block' }}>
                    <span style={{
                      display: 'block', fontSize: 28, fontWeight: 800, lineHeight: 1.16,
                      letterSpacing: '-0.01em', color: on > 0.3 ? C.ink : C.mute,
                    }}>{st.title}</span>
                    <span style={{
                      display: 'block', fontSize: 20, fontWeight: 500, marginTop: 3,
                      color: C.mute, opacity: interpolate(on, [0.3, 1], [0, 1], { extrapolateLeft: 'clamp' }),
                    }}>{st.sub}</span>
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 18, fontWeight: 700, color: C.mute,
                    opacity: interpolate(on, [0.3, 1], [0, 0.85], { extrapolateLeft: 'clamp' }),
                    whiteSpace: 'nowrap',
                  }}>{st.tag}</span>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      {/* ---------- 3. lopetus ---------- */}
      <AbsoluteFill style={{
        alignItems: 'center', justifyContent: 'center',
        paddingLeft: 76, paddingRight: 76, paddingTop: SAFE_TOP, paddingBottom: SAFE_BOTTOM,
        textAlign: 'center',
        opacity: ctaS,
        transform: `translateY(${interpolate(ctaS, [0, 1], [50, 0])}px)`,
      }}>
        <Mark size={96} onDark />
        <h2 style={{
          margin: '30px 0 0', fontWeight: 800, fontSize: 96, lineHeight: 1.05,
          letterSpacing: '-0.035em', color: '#fff',
        }}>
          {ctaLine1}<br /><span style={{ color: C.mint }}>{ctaLine2}</span>
        </h2>
        <p style={{ margin: '26px 0 0', fontSize: 42, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
          tiiviskoti.fi
        </p>
        <p style={{ margin: '18px 0 0', fontSize: 33, fontWeight: 700, color: 'rgba(255,255,255,.66)' }}>
          {ctaNote}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
