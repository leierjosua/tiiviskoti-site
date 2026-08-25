import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill } from 'remotion';

/* Jaetut liikeosat. Nämä ovat ne kolme asiaa jotka erottavat kalliin
   näköisen jäljen halvasta, ja siksi ne ovat omassa tiedostossaan eivätkä
   kopioituna kumpaankin videoon. */

/* 1. Teksti paljastuu maskin takaa nousten — ei opacity-häivytys.
      Häivytys on oletusarvo jonka kaikki tekevät; maski näyttää siltä että
      rivi on painettu johonkin ja paljastetaan. */
export const MaskLine: React.FC<{
  at: number; dur?: number; children: React.ReactNode; style?: React.CSSProperties;
}> = ({ at, dur = 26, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: dur });
  return (
    <span style={{ display: 'block', overflow: 'hidden', paddingBottom: '0.12em', ...style }}>
      <span style={{
        display: 'block',
        transform: `translateY(${interpolate(s, [0, 1], [112, 0])}%)`,
        opacity: s < 0.015 ? 0 : 1,
      }}>{children}</span>
    </span>
  );
};

/* 2. Numerokiekko. Lista 0–9 KAHDESTI, jotta ykkösten ylivuoto (9 → 0) rullaa
      eteenpäin eikä kelaa taaksepäin. `blur` on liike-epäterävyys: nopeasti
      pyörivä numero ei ole terävä oikeassakaan kamerassa. */
const DIGITS = [0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9];
export const Roll: React.FC<{
  v: number; fs: number; color: string; digits?: number; blur?: number;
}> = ({ v, fs, color, digits = 2, blur = 0 }) => {
  const h = Math.round(fs * 1.02);
  const av = Math.abs(v);
  const cols: Array<{ pos: number; hidden: boolean }> = [];
  for (let d = digits - 1; d >= 0; d--) {
    const unit = Math.pow(10, d);
    const pos = d === digits - 1 ? Math.min(Math.floor(av / unit), 9) : (av / unit) % 10;
    /* Etunollat piilotetaan LEVEYS nollaamalla, ei opacityllä: opacity jättäisi
       aukon ja keskitetty luku näyttäisi olevan väärässä kohdassa. Näin luku
       kasvaa keskeltä ulos kun numeroita tulee lisää — eikä ruudulle jää
       lepäämään "000 €", joka näytti rikkinäiseltä. */
    cols.push({ pos, hidden: d > 0 && Math.floor(av) < unit });
  }
  return (
    <span style={{
      fontSize: fs, fontWeight: 800, letterSpacing: '-0.045em', color,
      fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'flex-start',
      filter: blur > 0.4 ? `blur(${Math.min(blur, 7)}px)` : undefined,
    }}>
      {cols.map((c, i) => (
        <span key={i} style={{
          display: 'inline-block', height: h, overflow: 'hidden', verticalAlign: 'top',
          width: c.hidden ? 0 : undefined,
        }}>
          <span style={{ display: 'block', transform: `translateY(${-c.pos * h}px)` }}>
            {DIGITS.map((d, k) => (
              <span key={k} style={{ display: 'block', height: h, lineHeight: `${h}px` }}>{d}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
};

/* 3. Liikkuva rae + vinjetti. Paikallaan oleva rae näyttää tekstuurilta,
      liikkuva näyttää filmiltä. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.055 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{
      opacity, mixBlendMode: 'overlay', pointerEvents: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundPosition: `${(frame * 13) % 160}px ${(frame * 7) % 160}px`,
    }} />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.5 }) => (
  <AbsoluteFill style={{
    boxShadow: `inset 0 0 340px 100px rgba(4,14,9,${strength})`, pointerEvents: 'none',
  }} />
);

/* 4. Kohtaus: sisään, pito, ULOS. Tämä puuttui ensimmäisistä versioista ja
      se oli koko sotkun syy — elementit vain kasautuivat ruudulle eivätkä
      poistuneet, ja lopussa katsottavaa oli kahdeksassa paikassa yhtä aikaa.
      Kohtaus vie yhden ajatuksen kerrallaan. */
export const Scene: React.FC<{
  from: number; to: number; children: React.ReactNode; style?: React.CSSProperties;
}> = ({ from, to, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from - 2 || frame > to + 14) return null;
  const inS = spring({ frame: frame - from, fps, config: { damping: 200 }, durationInFrames: 24 });
  const outS = spring({ frame: frame - to, fps, config: { damping: 200 }, durationInFrames: 16 });
  return (
    <div style={{
      ...style,
      opacity: inS * (1 - outS),
      transform: `translateY(${interpolate(inS, [0, 1], [34, 0]) - outS * 30}px)`,
    }}>{children}</div>
  );
};
