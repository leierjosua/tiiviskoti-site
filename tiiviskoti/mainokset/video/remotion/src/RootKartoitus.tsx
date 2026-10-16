import React from 'react';
import { Composition } from 'remotion';
import { Kartoitus, KARTOITUS_FRAMES, FPS } from './Kartoitus';

/* Oma juuri, kuten RootIkkunaOvi. npx remotion render src/index-kartoitus.ts kartoitus-a-45 out/x.mp4 */
export const RootKartoitus: React.FC = () => (
  <>
    {(['a', 'b'] as const).map((v) => (
      <React.Fragment key={v}>
        <Composition id={`kartoitus-${v}-916`} component={Kartoitus} durationInFrames={KARTOITUS_FRAMES}
          fps={FPS} width={1080} height={1920} defaultProps={{ ratio: '916' as const, variant: v }} />
        <Composition id={`kartoitus-${v}-45`} component={Kartoitus} durationInFrames={KARTOITUS_FRAMES}
          fps={FPS} width={1080} height={1350} defaultProps={{ ratio: '45' as const, variant: v }} />
      </React.Fragment>
    ))}
  </>
);
