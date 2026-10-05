import React from 'react';
import { Composition } from 'remotion';
import { IkkunaOvi, IKKUNA_OVI_FRAMES, FPS } from './IkkunaOvi';

/* Oma juuri, kuten RootKortti: Root.tsx importtaa words.jsonin, jota ei ole
   repossa. npx remotion render src/index-ikkuna-ovi.ts ikkuna-ovi-916 out/x.mp4 */
export const RootIkkunaOvi: React.FC = () => (
  <>
    <Composition id="ikkuna-ovi-916" component={IkkunaOvi} durationInFrames={IKKUNA_OVI_FRAMES}
      fps={FPS} width={1080} height={1920} defaultProps={{ ratio: '916' as const }} />
    <Composition id="ikkuna-ovi-45" component={IkkunaOvi} durationInFrames={IKKUNA_OVI_FRAMES}
      fps={FPS} width={1080} height={1350} defaultProps={{ ratio: '45' as const }} />
  </>
);
