import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { C, FONT } from './brand';

const STEPS = ['Valitse ovet ja ikkunat', 'Näet kiinteän hinnan heti', 'Valitse vapaa aika kalenterista'];

const Mark = () => (
  <svg viewBox="0 0 100 100" style={{ width: 44, height: 44, display: 'block' }}>
    <rect width="100" height="100" rx="22" fill={C.green} />
    <rect x="31" y="20" width="38" height="60" rx="3" fill="none" stroke="#F6F7F3" strokeWidth="5" />
    <rect x="35" y="20" width="4" height="60" fill="#F6F7F3" />
  </svg>
);

/* Piirtyvä valintamerkki: viiva "vedetään" strokeDashoffsetilla, ei ilmesty
   kertarysäyksellä. Tämä on se yksityiskohta joka erottaa animaation
   diaesityksestä. */
const Tick: React.FC<{ p: number }> = ({ p }) => (
  <svg viewBox="0 0 24 24" style={{ width: 24, height: 24 }} fill="none"
    stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
  </svg>
);

export const Widget: React.FC<{ startF: number; endF: number }> = ({ startF, endF }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < startF - 4) return null;

  const span = Math.max(1, endF - startF);
  const inS = spring({ frame: frame - startF, fps, config: { damping: 16, mass: 0.6 } });
  const outO = interpolate(frame, [endF - 2, endF + 6], [1, 1], { extrapolateRight: 'clamp' });

  /* Askelten ajoitus suhteessa widgetin kestoon: kolme askelta ensimmäisellä
     60 %:lla, loppu jää CTA:lle. */
  const stepAt = [0.02, 0.22, 0.42].map((f) => startF + f * span);
  const ctaAt = startF + 0.6 * span;

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 505,
      display: 'flex', justifyContent: 'center',
      opacity: interpolate(inS, [0, 1], [0, 1]) * outO,
      transform: `translateY(${interpolate(inS, [0, 1], [56, 0])}px) scale(${interpolate(inS, [0, 1], [0.94, 1])})`,
    }}>
      <div style={{
        width: 640, background: C.card, borderRadius: 28, padding: '22px 24px 20px',
        boxShadow: '0 28px 70px -22px rgba(8,28,18,.6)', fontFamily: FONT, fontWeight: 800,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, paddingBottom: 17, borderBottom: `2px solid ${C.line}` }}>
          <Mark />
          <div>
            <div style={{ fontSize: 26, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Varaa aika verkossa</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.mute, marginTop: 2 }}>Alle minuutissa · ei tarjouspyyntöä</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 17 }}>
          {STEPS.map((label, i) => {
            const s = spring({ frame: frame - stepAt[i], fps, config: { damping: 14, mass: 0.4 } });
            const nextOn = i < 2 ? spring({ frame: frame - stepAt[i + 1], fps, config: { damping: 14, mass: 0.4 } }) : 0;
            const done = i < 2 ? nextOn : spring({ frame: frame - ctaAt, fps, config: { damping: 14, mass: 0.4 } });
            const active = s - done;                    // aktiivinen = syttynyt muttei vielä kuitattu
            const bg = done > 0.5 ? C.softOn : active > 0.15 ? C.softOn : C.soft;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 15,
                padding: '11px 13px', borderRadius: 15,
                background: bg,
                border: `2px solid ${active > 0.15 && done < 0.5 ? C.greenL : 'transparent'}`,
                transform: `translateX(${interpolate(s, [0, 1], [-14, 0])}px)`,
                opacity: interpolate(s, [0, 1], [0.35, 1]),
              }}>
                <span style={{
                  width: 40, height: 40, flex: 'none', borderRadius: 12,
                  display: 'grid', placeItems: 'center', fontSize: 22,
                  background: done > 0.05 ? C.greenL : s > 0.3 ? C.green : '#DDE6DB',
                  color: s > 0.3 ? '#fff' : C.mute,
                }}>
                  {done > 0.05 ? <Tick p={Math.min(1, done)} /> : i + 1}
                </span>
                <span style={{ fontSize: 23, color: s > 0.3 ? C.ink : C.mute, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{label}</span>
              </div>
            );
          })}
        </div>

        {(() => {
          const s = spring({ frame: frame - ctaAt, fps, config: { damping: 16, mass: 0.5 } });
          if (s < 0.001) return null;
          return (
            <div style={{
              marginTop: 15, background: C.green, borderRadius: 15, padding: '15px 19px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
              transform: `translateY(${interpolate(s, [0, 1], [18, 0])}px)`,
              opacity: s, overflow: 'hidden',
            }}>
              <span style={{ fontSize: 27, color: '#fff' }}>tiiviskoti.fi</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.mint }}>Ikkuna 95 € · ulko-ovi 99 €</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
