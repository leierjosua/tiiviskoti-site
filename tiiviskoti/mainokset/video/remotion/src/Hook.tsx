import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { C, FONT, SAFE_TOP } from './brand';

/* KOUKKU — ensimmäinen virke yläkolmanneksessa.
   Sanat tulevat porrastetusti: jokainen sana saa oman jousensa, viive 2 framea.
   Viimeinen sana on korostettu laatikossa ja tulee hieman muita myöhemmin,
   jotta katse pysähtyy siihen. */
export const Hook: React.FC<{ words: string[]; from: number; to: number }> = ({ words, from, to }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from - 6 || frame > to + 10) return null;

  const out = interpolate(frame, [to, to + 9], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute', left: 90, right: 90, top: SAFE_TOP - 20,
      textAlign: 'center', fontFamily: FONT, fontWeight: 800,
      fontSize: 58, lineHeight: 1.24, letterSpacing: '-0.02em',
      opacity: out,
    }}>
      {words.map((w, i) => {
        const last = i === words.length - 1;
        const s = spring({ frame: frame - from - i * 2 + 5, fps, config: { damping: 15, mass: 0.5 } });
        const y = interpolate(s, [0, 1], [26, 0]);
        return (
          <span key={i} style={{
            display: 'inline-block', margin: '0 7px 8px',
            transform: `translateY(${y}px) scale(${interpolate(s, [0, 1], [0.9, 1])})`,
            opacity: s,
            /* Koukun kärkisana erottuu mintunvihreällä VÄRILLÄ, ei täytetyllä
               laatikolla. Reunus säilyy myös siinä, jotta se pysyy luettavana
               vaalealla taustalla. */
            color: last ? C.mint : '#fff',
            WebkitTextStroke: '8px ' + C.stroke,
            paintOrder: 'stroke fill',
            padding: 0,
            textShadow: '0 6px 22px rgba(0,0,0,.45)',
          } as React.CSSProperties}>{w}</span>
        );
      })}
    </div>
  );
};
