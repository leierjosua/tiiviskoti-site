import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';
import { C, W, H, SAFE_TOP, SAFE_BOTTOM, FONT } from './brand';
import { ServiceBar, Mark } from './Kortti';
import './font';

/* Lämpötilakontrasti — AaltoAirin toinen kaava (IG 15.7.2026, 619 katselua eli
   yli kolminkertaisesti heidän kartoitusvideoonsa nähden). Heillä: HELLE ULKONA
   +28° / VIILEÄ SISÄLLÄ 21°, lämpöpumppu välissä.

   Kaava istuu tiivistykseen jopa paremmin kuin heille: tiiviste ON se raja
   ulkoilman ja sisäilman välissä. Kesä on käännetty talveksi, koska tuote
   myydään pakkasta vastaan — ja koska kuvaushetki on elokuun loppu.

   Kertova käänne keskellä: ensin kylmä pääsee läpi asti (ongelma), sitten
   tiiviste napsahtaa paikalleen ja nuolet pysähtyvät siihen (ratkaisu). */

const FPS = 25;
export const LAMPO_FRAMES = 14 * FPS;   // 350

const OUT_T = -15;
const IN_T = 21;

const SEAL_Y = 880;          // raja: tiivisteen kohta
const SEAL_IN = 112;         // frame jolla tiiviste napsahtaa paikalleen

const Arrow: React.FC<{ x: number; delay: number; sealed: boolean }> = ({ x, delay, sealed }) => {
  const frame = useCurrentFrame();
  const t = frame - delay;
  if (t < 0) return null;
  const cycle = 34;
  const p = (t % cycle) / cycle;
  const from = 632;
  const to = sealed ? SEAL_Y - 74 : 1180;      // sinetöity → pysähtyy tiivisteeseen
  const y = interpolate(p, [0, 1], [from, to], { easing: Easing.in(Easing.ease) });
  /* Häivytys lopussa: sinetöitynä nuoli "litistyy" rajaan, muuten se jatkaa
     matkaansa lämpimälle puolelle ja haalistuu vasta siellä. */
  const o = interpolate(p, [0, 0.12, sealed ? 0.72 : 0.86, 1], [0, 0.95, 0.95, 0]);
  return (
    <g transform={`translate(${x} ${y})`} opacity={o}>
      <path d="M0 -34 L0 22" stroke="#BFE0F5" strokeWidth={9} strokeLinecap="round" />
      <path d="M-17 4 L0 24 L17 4" stroke="#BFE0F5" strokeWidth={9} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
};

export const Lampotila: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const coldIn = spring({ frame: frame - 6, fps, config: { damping: 18, mass: 0.7 } });
  const warmIn = spring({ frame: frame - 34, fps, config: { damping: 18, mass: 0.7 } });
  const sealS = spring({ frame: frame - SEAL_IN, fps, config: { damping: 11, mass: 0.5 } });
  const sealed = frame >= SEAL_IN;

  const outNum = Math.round(interpolate(frame, [10, 40], [0, OUT_T], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const inNum = Math.round(interpolate(frame, [38, 68], [0, IN_T], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

  const payoff = spring({ frame: frame - 168, fps, config: { damping: 18, mass: 0.7 } });
  const sign = spring({ frame: frame - 206, fps, config: { damping: 18, mass: 0.7 } });

  const label = (txt: string, color: string) => (
    <div style={{
      fontSize: 34, fontWeight: 800, letterSpacing: '0.17em', textTransform: 'uppercase', color,
    }}>{txt}</div>
  );
  const bigNum = (txt: string, color: string) => (
    <div style={{
      fontSize: 150, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color,
      fontVariantNumeric: 'tabular-nums',
    }}>{txt}</div>
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#0E2A1C' }}>
      {/* ---------- kylmä ulkopuoli ---------- */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: SEAL_Y,
        background: 'linear-gradient(180deg, #1B3B57 0%, #22506F 46%, #2A6285 100%)',
        clipPath: `inset(${interpolate(coldIn, [0, 1], [100, 0])}% 0 0 0)`,
      }} />
      {/* ---------- lämmin sisäpuoli ---------- */}
      <div style={{
        position: 'absolute', top: SEAL_Y, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, #2E8A5B 0%, #226B47 42%, #16412C 100%)',
        clipPath: `inset(0 0 ${interpolate(warmIn, [0, 1], [100, 0])}% 0)`,
      }} />
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 300px 80px rgba(6,20,13,.45)', pointerEvents: 'none' }} />

      <ServiceBar />

      {/* ---------- kylmän puolen luvut ---------- */}
      <div style={{
        position: 'absolute', top: SAFE_TOP + 120, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        opacity: coldIn, transform: `translateY(${interpolate(coldIn, [0, 1], [-26, 0])}px)`,
      }}>
        {label('Pakkasta ulkona', 'rgba(215,236,250,.86)')}
        {bigNum(`${outNum}°`, '#EAF6FF')}
      </div>

      {/* ---------- vetonuolet ---------- */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <Arrow x={318} delay={62} sealed={sealed} />
        <Arrow x={540} delay={74} sealed={sealed} />
        <Arrow x={762} delay={86} sealed={sealed} />
      </svg>

      {/* ---------- tiiviste: raja ---------- */}
      <div style={{
        position: 'absolute', top: SEAL_Y - 21, left: 96, right: 96, height: 42,
        borderRadius: 999,
        background: `linear-gradient(180deg, ${C.mint} 0%, #63BC8C 55%, #3E9A6C 100%)`,
        boxShadow: `0 0 0 ${interpolate(sealS, [0, 1], [0, 9])}px rgba(143,211,172,.16),
                    0 16px 44px -12px rgba(0,0,0,.55)`,
        transform: `scaleX(${interpolate(sealS, [0, 1], [0.12, 1])}) scaleY(${interpolate(sealS, [0, 1], [0.5, 1])})`,
        opacity: sealS,
      }} />
      {/* Teksti palkin SISÄLLÄ: erillisenä rivinä se näytti toiselta
          pikkuotsikolta heti "LÄMMIN SISÄLLÄ":n vieressä. Oma kerros, jottei
          palkin scaleX veny myös kirjaimiin. */}
      <div style={{
        position: 'absolute', top: SEAL_Y - 13, left: 0, right: 0, height: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 21, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: '#12301F',
        opacity: interpolate(sealS, [0.55, 1], [0, 1], { extrapolateLeft: 'clamp' }),
      }}>Uusi tiiviste</div>

      {/* ---------- lämmin puoli: yksi pylväs, jotta mikään ei mene päällekkäin
                     eikä valu Reelsin alapalkin alle ---------- */}
      <div style={{
        position: 'absolute', top: SEAL_Y + 96, left: 76, right: 76, bottom: SAFE_BOTTOM,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'space-between', textAlign: 'center',
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          opacity: warmIn, transform: `translateY(${interpolate(warmIn, [0, 1], [26, 0])}px)`,
        }}>
          {label('Lämmin sisällä', 'rgba(220,242,229,.86)')}
          {bigNum(`+${inNum}°`, '#FFFFFF')}
        </div>

        <div style={{
          fontSize: 46, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2, color: '#fff',
          opacity: payoff, transform: `translateY(${interpolate(payoff, [0, 1], [22, 0])}px)`,
        }}>
          Pidä lämpö sisällä —<br />
          <span style={{ color: C.mint }}>tiivistä ovet ja ikkunat.</span>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          opacity: sign, transform: `translateY(${interpolate(sign, [0, 1], [20, 0])}px)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Mark size={50} onDark />
            <span style={{ fontWeight: 800, fontSize: 38, letterSpacing: '-0.03em', color: '#fff' }}>TiivisKoti</span>
          </div>
          <span style={{ fontSize: 26, fontWeight: 700, color: 'rgba(255,255,255,.66)' }}>
            tiiviskoti.fi · ikkuna 95 € · ulko-ovi 119 €
          </span>
        </div>
      </div>

    </AbsoluteFill>
  );
};
