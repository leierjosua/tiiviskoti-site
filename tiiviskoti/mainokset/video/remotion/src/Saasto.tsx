import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing, random } from 'remotion';
import { C, W, H, SAFE_TOP, SAFE_BOTTOM, FONT } from './brand';
import { ServiceBar, Mark } from './Kortti';
import { MaskLine, Roll, Grain, Vignette } from './ui';
import './font';

/* Lämmityskulun arvio — sarjan kolmas video, sama kaava kuin lämpötilassa:
   menetys → tiiviste → palautuminen.

   ⚠ LUPAUSKIELI. Sivusto sanoo suoraan: "Emme lupaa tiettyä säästöä
   etukäteen, koska lopputulos riippuu talosta, lämmitystavasta ja siitä
   kuinka moni kohta vuotaa." Siksi tämä video EI lupaa säästöä. Se näyttää
   ONGELMAN koon sivuston omalla luvulla (vetävä ovi tai ikkuna nostaa
   lämmityskulua tyypillisesti 10–15 %) ja laskee siitä esimerkin, joka on
   ruudulla merkitty esimerkiksi ja arvioksi. Älä muuta tätä myyväksi
   säästölupaukseksi.

   Väriohje: sininen = se mikä karkaa. Vihreä = se mikä jää taloon. Sitä
   sääntöä ei rikota missään ruudussa. */

const FPS = 25;
export const SAASTO_FRAMES = 16 * FPS;      // 400

const PCT_LO = 10, PCT_HI = 15;
const EXAMPLE = 2000;                        // esimerkkilämmityskulu €/v
const LEAK = 300;                            // 15 % → ruudun esimerkkiluku

export const S = {
  intro: 8, pct: 30, pctNum: 40,
  example: 88, bar: 104,
  leakLabel: 132, leakNum: 142,
  note: 190,
  seal: 218,
  heal0: 226, heal1: 268,
  payoff: 282, brand: 328,
};

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/* Karkaava raha: pieniä sinisiä hiukkasia jotka nousevat palkista ylös. */
const Escaping: React.FC<{ n: number; intensity: number; barY: number }> = ({ n, intensity, barY }) => {
  const frame = useCurrentFrame();
  if (intensity <= 0.01) return null;
  return (
    <>
      {new Array(n).fill(0).map((_, i) => {
        const t = frame - S.leakLabel - i * 4;
        if (t < 0) return null;
        const cycle = 58;
        const p = (t % cycle) / cycle;
        const x = 150 + random(`ex${i}`) * (W - 300);
        const y = barY - interpolate(p, [0, 1], [0, 320], { easing: Easing.out(Easing.quad) });
        const o = interpolate(p, [0, 0.18, 0.7, 1], [0, 0.85, 0.5, 0]) * intensity;
        const r = 3 + random(`er${i}`) * 4;
        return <circle key={i} cx={x + Math.sin(frame / 30 + i) * 16} cy={y} r={r} fill="#9FD4F2" opacity={o} />;
      })}
    </>
  );
};

export const Saasto: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const push = interpolate(frame, [0, SAASTO_FRAMES], [1, 1.05], { easing: Easing.linear });
  const shakeT = frame - S.seal;
  const shake = shakeT >= 0 && shakeT < 26 ? Math.sin(shakeT * 1.5) * interpolate(shakeT, [0, 26], [9, 0]) : 0;
  const flash = shakeT >= 0 && shakeT < 16 ? interpolate(shakeT, [0, 3, 16], [0, 0.5, 0]) : 0;
  const ring = spring({ frame: frame - S.seal, fps, config: { damping: 200 }, durationInFrames: 30 });
  const sealed = frame >= S.seal;

  /* Prosenttiluku: 0 → 15, mutta ruudulla lukee "10–15 %". Rullaa vain ylempi. */
  const pctV = interpolate(frame, [S.pctNum, S.pctNum + 26], [0, PCT_HI], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const pctBlur = Math.abs(pctV - interpolate(frame - 1, [S.pctNum, S.pctNum + 26], [0, PCT_HI], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })) * 1.6;

  const leakV = interpolate(frame, [S.leakNum, S.leakNum + 34], [0, LEAK], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const prevLeak = interpolate(frame - 1, [S.leakNum, S.leakNum + 34], [0, LEAK], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const leakBlur = Math.abs(leakV - prevLeak) * 0.12;
  /* Tiivisteen jälkeen koko menetyslohko häipyy. EI laskuria nollaan:
     nollaan valuva euroluku lupaisi määrällisen säästön. */
  const leakO = interpolate(frame, [S.heal0, S.heal0 + 22], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const barS = spring({ frame: frame - S.bar, fps, config: { damping: 200 }, durationInFrames: 30 });
  /* Sinisen osuuden koko: kasvaa 15 %:iin, kutistuu nollaan tiivisteen jälkeen. */
  const share = (leakV / LEAK) * (PCT_HI / 100) * leakO;
  const intensity = sealed
    ? interpolate(frame, [S.seal, S.seal + 12], [1, 0], { extrapolateRight: 'clamp' })
    : interpolate(frame, [S.leakLabel, S.leakLabel + 40], [0.4, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const BAR_Y = 1128;
  const noteO = interpolate(frame, [S.note, S.note + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const payoff = spring({ frame: frame - S.payoff, fps, config: { damping: 200 }, durationInFrames: 28 });
  const brand = spring({ frame: frame - S.brand, fps, config: { damping: 200 }, durationInFrames: 26 });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#0A1A12', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${push}) translateX(${shake}px)`, transformOrigin: '50% 46%' }}>
        <AbsoluteFill style={{
          background: 'radial-gradient(ellipse 84% 52% at 50% 34%, #2C8256 0%, #1F6242 38%, #143C29 70%, #0A1A12 100%)',
        }} />
        {/* kylmä valo sieltä mistä raha karkaa */}
        <AbsoluteFill style={{
          opacity: intensity * 0.5,
          background: `radial-gradient(ellipse 66% 26% at 50% ${(BAR_Y - 150) / H * 100}%, rgba(140,200,240,.4) 0%, rgba(140,200,240,0) 70%)`,
        }} />

        <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
          <Escaping n={22} intensity={intensity} barY={BAR_Y} />
        </svg>

        {ring > 0.001 && ring < 1 && (
          <div style={{
            position: 'absolute', top: BAR_Y, left: '50%', width: 40, height: 40,
            marginLeft: -20, marginTop: -20, borderRadius: 999,
            border: '3px solid rgba(180,235,205,.7)',
            transform: `scale(${interpolate(ring, [0, 1], [1, 32])})`,
            opacity: interpolate(ring, [0, 0.15, 1], [0, 0.55, 0]),
          }} />
        )}

        {flash > 0 && (
          <AbsoluteFill style={{ background: '#DCF3E6', opacity: flash * 0.3, mixBlendMode: 'screen' }} />
        )}
        <Grain />
        <Vignette />
      </AbsoluteFill>

      <ServiceBar />

      {/* ---------- ylä: ongelma ja sen koko ---------- */}
      <div style={{
        position: 'absolute', top: SAFE_TOP + 112, left: 72, right: 72,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6,
      }}>
        <MaskLine at={S.intro} style={{
          fontSize: 34, fontWeight: 700, letterSpacing: '-0.01em', color: 'rgba(226,242,233,.82)', lineHeight: 1.25,
        }}>
          Vetävä ovi ja ikkuna nostavat<br />lämmityskulua tyypillisesti
        </MaskLine>

        <MaskLine at={S.pct} dur={30} style={{
          fontSize: 132, fontWeight: 800, color: '#fff', letterSpacing: '-0.045em',
          lineHeight: 1.06, marginTop: 8, textShadow: '0 10px 40px rgba(6,30,18,.5)',
        }}>
          {PCT_LO}–{PCT_HI} %
        </MaskLine>
      </div>

      {/* ---------- keski: esimerkkilasku ---------- */}
      <div style={{
        position: 'absolute', top: 820, left: 72, right: 72,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4,
      }}>
        <MaskLine at={S.example} style={{
          fontSize: 30, fontWeight: 700, letterSpacing: '0.02em', color: 'rgba(210,232,220,.72)',
        }}>
          Esimerkki: {EXAMPLE.toLocaleString('fi-FI')} € lämmityskulu vuodessa
        </MaskLine>

        <div style={{
          display: 'flex', alignItems: 'flex-start', marginTop: 4,
          opacity: interpolate(frame, [S.leakNum - 4, S.leakNum + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * leakO,
          textShadow: '0 10px 44px rgba(8,34,52,.55)',
        }}>
          <Roll v={leakV} fs={150} color="#BFE0F5" digits={3} blur={leakBlur} />
          <span style={{ fontSize: 150, fontWeight: 800, color: '#BFE0F5', letterSpacing: '-0.045em', lineHeight: 1.02 }}>&nbsp;€</span>
        </div>

        <MaskLine at={S.leakLabel} style={{
          fontSize: 31, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'rgba(191,224,245,.9)', marginTop: 2, opacity: leakO,
        }}>
          karkaa raoista vuodessa
        </MaskLine>
      </div>

      {/* ---------- palkki: sininen osuus = se mikä karkaa ---------- */}
      <div style={{
        position: 'absolute', top: BAR_Y, left: 96, right: 96, height: 34,
        borderRadius: 999, overflow: 'hidden',
        background: 'rgba(255,255,255,.14)',
        transform: `scaleX(${interpolate(barS, [0, 1], [0.1, 1])})`,
        opacity: barS,
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,.16), 0 16px 40px -14px rgba(0,0,0,.55)',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, #6FC698 0%, ${C.green} 100%)`,
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0, right: 0,
          width: `${share * 100 / 0.15 * 15}%`,
          background: 'linear-gradient(180deg, #A9DBF5 0%, #5FA8D0 100%)',
          boxShadow: '-8px 0 26px rgba(120,190,230,.5)',
        }} />
        {shakeT > 2 && shakeT < 40 && (
          <div style={{
            position: 'absolute', inset: 0, opacity: interpolate(shakeT, [2, 8, 40], [0, 0.8, 0]),
          }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, width: 220,
              left: `${interpolate(shakeT, [2, 40], [-25, 100])}%`,
              background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.9) 50%, rgba(255,255,255,0) 100%)',
              transform: 'skewX(-18deg)',
            }} />
          </div>
        )}
      </div>

      {/* ---------- ala: varaus, lupaus, tunnus ---------- */}
      <div style={{
        position: 'absolute', top: BAR_Y + 74, left: 72, right: 72, bottom: SAFE_BOTTOM,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'space-between', textAlign: 'center',
      }}>
        <div style={{
          fontSize: 23, fontWeight: 600, lineHeight: 1.4, color: 'rgba(214,232,222,.62)',
          opacity: noteO, maxWidth: 780,
        }}>
          Arvio. Emme lupaa tiettyä säästöä — lopputulos riippuu talosta,
          lämmitystavasta ja siitä kuinka moni kohta vuotaa.
        </div>

        <div style={{
          fontSize: 46, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.22, color: '#fff',
          opacity: payoff, transform: `translateY(${interpolate(payoff, [0, 1], [26, 0])}px)`,
        }}>
          Tiivistä ovet ja ikkunat —<br />
          <span style={{ color: C.mint }}>lämpökamera näyttää vuotokohdat.</span>
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
            tiiviskoti.fi · ikkuna 95 € · ulko-ovi 119 €
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
