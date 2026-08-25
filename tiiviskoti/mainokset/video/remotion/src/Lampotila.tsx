import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing, random } from 'remotion';
import { C, W, H, SAFE_TOP, SAFE_BOTTOM, FONT } from './brand';
import { ServiceBar, Mark } from './Kortti';
import './font';

/* Lämpötilakontrasti — AaltoAirin toinen kaava (619 katselua vs. heidän
   kartoitusvideonsa 176). Ensimmäinen versio oli oikea idea mutta litteä:
   kaksi väripintaa ja kolme samanlaista nuolta. Tämä on sama tarina
   kunnolla ohjattuna.

   MIKÄ TEKEE KALLIIN VAIKUTELMAN — ja miksi kukin on täällä:
   1. Kamera ei seiso paikallaan. Koko kuva ajaa hitaasti sisään (1 → 1,055),
      jolloin still-kuvakin hengittää.
   2. Ilmakehä: lunta ulkona, lämpöpölyä sisällä, rae koko kuvan päällä.
      Puhdas gradientti näyttää PowerPointilta, kohina filmiltä.
   3. Luvut pyörivät rullana (numerokiekko), eivät vaihdu paikallaan.
   4. TARINALLINEN PANOS: lämpö KARKAA — sisälämpötila tippuu 21 → 19 kun
      veto pääsee läpi, ja nousee takaisin vasta kun tiiviste on paikallaan.
      Ilman panosta katsojalla ei ole syytä katsoa loppuun.
   5. Tiivisteen isku on oma huippukohtansa: välähdys, painerengas, kuvan
      tärähdys ja vetoviivojen kimpoaminen samalla framella.
   6. Kaikki kiihdytykset ovat bezier-käyriä, eivät lineaarisia. */

const FPS = 25;
export const LAMPO_FRAMES = 16 * FPS;      // 400

const OUT_T = 15;                          // näytetään muodossa −15
const IN_T = 21;
const IN_DROP = 19;                        // mihin sisälämpö valuu vedon aikana

const SEAL_Y = 880;
export const L = {
  coldLabel: 8, coldNum: 14,
  warmIn: 55, warmNum: 68,
  leakStart: 104, leakPeak: 150,
  drop0: 148, drop1: 196,
  seal: 205,
  recover0: 214, recover1: 252,
  payoff: 262, brand: 306,
};

const EASE = Easing.bezier(0.22, 1, 0.36, 1);        // pehmeä ulos, ei kumimainen

/* ---------- numerokiekko ---------- */
const DIGITS = [0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9];
const Roll: React.FC<{ v: number; fs: number; color: string }> = ({ v, fs, color }) => {
  const h = Math.round(fs * 1.02);
  const tens = Math.floor(Math.abs(v) / 10);
  const ones = Math.abs(v) % 10;
  const col = (pos: number) => (
    <span style={{ display: 'inline-block', height: h, overflow: 'hidden', verticalAlign: 'top' }}>
      <span style={{ display: 'block', transform: `translateY(${-pos * h}px)` }}>
        {DIGITS.map((d, i) => (
          <span key={i} style={{ display: 'block', height: h, lineHeight: `${h}px` }}>{d}</span>
        ))}
      </span>
    </span>
  );
  return (
    <span style={{
      fontSize: fs, fontWeight: 800, letterSpacing: '-0.045em', color,
      fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'flex-start',
    }}>
      {tens >= 1 || v >= 10 ? col(Math.min(tens, 9)) : null}
      {col(ones)}
      <span style={{ lineHeight: `${h}px` }}>°</span>
    </span>
  );
};

/* ---------- ilmakehä ---------- */
const Snow: React.FC<{ n: number }> = ({ n }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {new Array(n).fill(0).map((_, i) => {
        const x0 = random(`sx${i}`) * W;
        const size = 2 + random(`ss${i}`) * 5;
        const speed = 26 + random(`sp${i}`) * 52;
        const drift = (random(`sd${i}`) - 0.5) * 90;
        const life = (frame * speed / FPS + random(`so${i}`) * SEAL_Y) % SEAL_Y;
        const o = interpolate(life, [0, 60, SEAL_Y - 110, SEAL_Y], [0, 0.5, 0.5, 0]) * (0.35 + random(`sa${i}`) * 0.5);
        return (
          <circle key={i} cx={x0 + Math.sin((frame / 42) + i) * drift} cy={life}
            r={size} fill="#DCEEFB" opacity={o} />
        );
      })}
    </>
  );
};

const Motes: React.FC<{ n: number }> = ({ n }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {new Array(n).fill(0).map((_, i) => {
        const x0 = random(`mx${i}`) * W;
        const span = H - SEAL_Y;
        const life = span - ((frame * (9 + random(`mp${i}`) * 16) / FPS + random(`mo${i}`) * span) % span);
        const o = interpolate(life, [0, 70, span - 70, span], [0, 0.34, 0.34, 0]);
        return (
          <circle key={i} cx={x0 + Math.sin((frame / 55) + i * 2) * 26} cy={SEAL_Y + life}
            r={1.6 + random(`ms${i}`) * 3} fill="#CFF0DD" opacity={o} />
        );
      })}
    </>
  );
};

/* ---------- vetoviiva ---------- */
const Leak: React.FC<{ i: number; sealed: boolean; intensity: number }> = ({ i, sealed, intensity }) => {
  const frame = useCurrentFrame();
  const t = frame - L.leakStart - i * 7;
  if (t < 0 || intensity <= 0.01) return null;
  const cycle = 46 - intensity * 16;
  const p = ((t % cycle) / cycle);
  const x = 150 + (i % 6) * 156 + Math.sin(i * 2.1) * 26;
  const from = 470 + random(`ly${i}`) * 130;
  /* Sinetöimättä viiva jatkaa lämpimälle puolelle — juuri se on ongelma.
     Sinetöitynä se litistyy tiivisteeseen. */
  const to = sealed ? SEAL_Y - 34 : SEAL_Y + 250;
  const y = interpolate(p, [0, 1], [from, to], { easing: Easing.in(Easing.quad) });
  const len = interpolate(p, [0, 0.25, 0.8, 1], [10, 108, 92, 0]);
  const o = interpolate(p, [0, 0.16, 0.78, 1], [0, 0.9, 0.72, 0]) * intensity;
  const squash = sealed && y > SEAL_Y - 90 ? interpolate(y, [SEAL_Y - 90, SEAL_Y - 34], [1, 0.25]) : 1;
  return (
    <g opacity={o}>
      <rect x={x - 3} y={y - len} width={6} height={len * squash} rx={3} fill="url(#leakGrad)" />
    </g>
  );
};

export const Lampotila: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* 1. hidas sisäänajo koko videon läpi */
  const push = interpolate(frame, [0, LAMPO_FRAMES], [1, 1.055], { easing: Easing.linear });

  /* 6. iskun tärähdys — vaimeneva, ei jatkuvaa heiluntaa */
  const shakeT = frame - L.seal;
  const shake = shakeT >= 0 && shakeT < 26
    ? Math.sin(shakeT * 1.5) * interpolate(shakeT, [0, 26], [9, 0])
    : 0;

  const coldIn = spring({ frame: frame - 2, fps, config: { damping: 200 }, durationInFrames: 26 });
  const warmIn = spring({ frame: frame - L.warmIn, fps, config: { damping: 200 }, durationInFrames: 30 });
  const sealS = spring({ frame: frame - L.seal, fps, config: { damping: 9, mass: 0.42, stiffness: 190 } });
  const sealed = frame >= L.seal;

  const outNum = interpolate(frame, [L.coldNum, L.coldNum + 30], [0, OUT_T], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const inRise = interpolate(frame, [L.warmNum, L.warmNum + 32], [0, IN_T], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const inDrop = interpolate(frame, [L.drop0, L.drop1], [0, IN_T - IN_DROP], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.ease) });
  const inBack = interpolate(frame, [L.recover0, L.recover1], [0, IN_T - IN_DROP], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const inNum = inRise - inDrop + inBack;

  /* Vedon voimakkuus: kasvaa, romahtaa iskussa nollaan. */
  const intensity = sealed
    ? interpolate(frame, [L.seal, L.seal + 12], [1, 0], { extrapolateRight: 'clamp' })
    : interpolate(frame, [L.leakStart, L.leakPeak], [0.35, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  /* Sisäpuolen väri viilenee vedon aikana ja lämpenee takaisin. */
  const chill = Math.max(0, Math.min(1, (inDrop - inBack) / (IN_T - IN_DROP)));

  const flash = shakeT >= 0 && shakeT < 16 ? interpolate(shakeT, [0, 3, 16], [0, 0.5, 0]) : 0;
  /* Ruudunlaajuinen pesu pidetään juuri ja juuri aistittavana. */
  const wash = flash * 0.3;
  const ring = spring({ frame: frame - L.seal, fps, config: { damping: 200 }, durationInFrames: 30 });

  const payoff = spring({ frame: frame - L.payoff, fps, config: { damping: 200 }, durationInFrames: 28 });
  const brand = spring({ frame: frame - L.brand, fps, config: { damping: 200 }, durationInFrames: 26 });

  const label = (txt: string, color: string, s: number) => (
    <div style={{
      fontSize: 33, fontWeight: 800, letterSpacing: '0.19em', textTransform: 'uppercase', color,
      opacity: s, transform: `translateY(${interpolate(s, [0, 1], [14, 0])}px)`,
    }}>{txt}</div>
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#08150F', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${push}) translateX(${shake}px)`, transformOrigin: '50% 46%' }}>

        {/* ---------- kylmä ulkopuoli ---------- */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: SEAL_Y,
          background: 'linear-gradient(180deg, #12293E 0%, #1B4364 40%, #245879 74%, #2B6A8F 100%)',
          clipPath: `inset(${interpolate(coldIn, [0, 1], [100, 0])}% 0 0 0)`,
        }} />

        {/* ---------- lämmin sisäpuoli ---------- */}
        <div style={{
          position: 'absolute', top: SEAL_Y, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(180deg, #2E8A5B 0%, #226B47 44%, #16412C 100%)',
          clipPath: `inset(0 0 ${interpolate(warmIn, [0, 1], [100, 0])}% 0)`,
        }} />
        {/* sisäpuolen hehku hengittää; viilenee vedon aikana */}
        <div style={{
          position: 'absolute', top: SEAL_Y, left: 0, right: 0, bottom: 0,
          opacity: warmIn * (0.9 - chill * 0.55) * (0.86 + Math.sin(frame / 26) * 0.14),
          background: 'radial-gradient(ellipse 70% 46% at 50% 22%, rgba(143,211,172,.4) 0%, rgba(143,211,172,0) 72%)',
        }} />
        {/* kylmä sävy sisäpuolelle kun veto pääsee läpi */}
        <div style={{
          position: 'absolute', top: SEAL_Y, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(180deg, rgba(120,180,220,.34) 0%, rgba(120,180,220,0) 52%)',
          opacity: chill,
        }} />

        {/* ---------- hiukkaset & vetoviivat ---------- */}
        <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <linearGradient id="leakGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#BFE0F5" stopOpacity="0" />
              <stop offset="55%" stopColor="#CFEAFB" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#EAF6FF" stopOpacity="1" />
            </linearGradient>
            <clipPath id="coldClip"><rect x="0" y="0" width={W} height={SEAL_Y} /></clipPath>
            <clipPath id="warmClip"><rect x="0" y={SEAL_Y} width={W} height={H - SEAL_Y} /></clipPath>
          </defs>
          <g clipPath="url(#coldClip)" opacity={coldIn}><Snow n={22} /></g>
          {new Array(4).fill(0).map((_, i) => (
            <Leak key={i} i={i} sealed={sealed} intensity={intensity} />
          ))}
        </svg>

        {/* ---------- iskun painerengas ---------- */}
        {ring > 0.001 && ring < 1 && (
          <div style={{
            position: 'absolute', top: SEAL_Y, left: '50%',
            width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: 999,
            border: '3px solid rgba(180,235,205,.7)',
            transform: `scale(${interpolate(ring, [0, 1], [1, 34])})`,
            opacity: interpolate(ring, [0, 0.15, 1], [0, 0.55, 0]),
          }} />
        )}

        {/* ---------- tiiviste ---------- */}
        <div style={{
          position: 'absolute', top: SEAL_Y - 21, left: 96, right: 96, height: 42, borderRadius: 999,
          background: `linear-gradient(180deg, #C7F0DA 0%, ${C.mint} 38%, #59B383 78%, #358E62 100%)`,
          boxShadow: `0 0 ${28 + flash * 90}px ${flash * 26}px rgba(160,225,190,${0.30 + flash}),
                      0 18px 46px -12px rgba(0,0,0,.6),
                      inset 0 2px 0 rgba(255,255,255,.55)`,
          transform: `scaleX(${interpolate(sealS, [0, 1], [0.05, 1])}) scaleY(${interpolate(sealS, [0, 1], [0.35, 1])})`,
          opacity: Math.min(1, sealS * 2.4),
        }} />
        {/* valon pyyhkäisy palkin yli heti iskun jälkeen */}
        {shakeT > 2 && shakeT < 40 && (
          <div style={{
            position: 'absolute', top: SEAL_Y - 21, left: 96, right: 96, height: 42,
            borderRadius: 999, overflow: 'hidden', opacity: interpolate(shakeT, [2, 8, 40], [0, 0.85, 0]),
          }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, width: 260,
              left: `${interpolate(shakeT, [2, 40], [-30, 100])}%`,
              background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.85) 50%, rgba(255,255,255,0) 100%)',
              transform: 'skewX(-18deg)',
            }} />
          </div>
        )}

        {/* ---------- valkoinen välähdys ---------- */}
        {wash > 0 && (
          <AbsoluteFill style={{ background: '#DCF3E6', opacity: wash, mixBlendMode: 'screen' }} />
        )}

        {/* ---------- rae ---------- */}
        <AbsoluteFill style={{
          opacity: 0.055, mixBlendMode: 'overlay', pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundPosition: `${(frame * 13) % 160}px ${(frame * 7) % 160}px`,
        }} />
        <AbsoluteFill style={{ boxShadow: 'inset 0 0 340px 100px rgba(4,14,9,.5)', pointerEvents: 'none' }} />
      </AbsoluteFill>

      <ServiceBar />

      {/* ---------- kylmän puolen luvut ---------- */}
      <div style={{
        position: 'absolute', top: SAFE_TOP + 118, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        {label('Pakkasta ulkona', 'rgba(214,236,251,.88)', coldIn)}
        <div style={{
          opacity: interpolate(frame, [L.coldNum - 4, L.coldNum + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          display: 'flex', alignItems: 'flex-start',
          textShadow: '0 10px 40px rgba(4,18,30,.55)',
        }}>
          <span style={{ fontSize: 150, fontWeight: 800, color: '#EAF6FF', letterSpacing: '-0.045em', lineHeight: 1.02 }}>−</span>
          <Roll v={outNum} fs={150} color="#EAF6FF" />
        </div>
      </div>

      {/* ---------- lämmin puoli ---------- */}
      <div style={{
        position: 'absolute', top: SEAL_Y + 96, left: 76, right: 76, bottom: SAFE_BOTTOM,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'space-between', textAlign: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {label('Lämmin sisällä', 'rgba(222,244,231,.88)', warmIn)}
          <div style={{
            opacity: interpolate(frame, [L.warmNum - 4, L.warmNum + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            display: 'flex', alignItems: 'flex-start',
            textShadow: '0 10px 40px rgba(6,30,18,.5)',
            /* luku nykäisee kun lämpö karkaa ja kun se palaa */
            transform: `scale(${1 + Math.max(0,
              interpolate(frame, [L.drop0, L.drop0 + 8, L.drop1], [0, 0.035, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
              + interpolate(frame, [L.recover0, L.recover0 + 8, L.recover1], [0, 0.05, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))})`,
          }}>
            <span style={{ fontSize: 150, fontWeight: 800, color: '#fff', letterSpacing: '-0.045em', lineHeight: 1.02 }}>+</span>
            <Roll v={inNum} fs={150} color="#FFFFFF" />
          </div>
        </div>

        <div style={{
          fontSize: 46, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.22, color: '#fff',
          opacity: payoff, transform: `translateY(${interpolate(payoff, [0, 1], [26, 0])}px)`,
        }}>
          Pidä lämpö sisällä.<br />
          <span style={{ color: C.mint }}>Tiivistä ovet ja ikkunat.</span>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          opacity: brand, transform: `translateY(${interpolate(brand, [0, 1], [22, 0])}px)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Mark size={50} onDark />
            <span style={{ fontWeight: 800, fontSize: 38, letterSpacing: '-0.03em', color: '#fff' }}>TiivisKoti</span>
          </div>
          <span style={{ fontSize: 26, fontWeight: 700, color: 'rgba(255,255,255,.68)' }}>
            tiiviskoti.fi
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
