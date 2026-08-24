import React from 'react';
import { Composition, staticFile } from 'remotion';
import { Short } from './Short';
import { W, H } from './brand';

const FPS = 25;
const DUR: Record<number, number> = { 1: 13.354667, 2: 14.272, 3: 15.786667 };

export const RemotionRoot: React.FC = () => (
  <>
    {[1, 2, 3].map((i) => (
      <Composition
        key={i}
        id={`shorts-${i}`}
        component={Short}
        durationInFrames={Math.floor(DUR[i] * FPS)}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ index: i }}
      />
    ))}
  </>
);
