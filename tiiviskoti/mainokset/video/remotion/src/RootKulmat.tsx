import React from 'react';
import { Composition } from 'remotion';
import { FPS } from './IkkunaOvi';
import {
  Lammitys, LAMMITYS_FRAMES, Huurtuu, HUURTUU_FRAMES, Arvostelu, ARVOSTELU_FRAMES, Viheltaa, VIHELTAA_FRAMES, ViheltaaB,
} from './Kulmat';

/* Oma juuri kuten RootIkkunaOvi (Root.tsx importtaa words.jsonin jota ei ole).
   npx remotion render src/index-kulmat.ts lammitys-45 out/x.mp4 */
const ADS = [
  ['lammitys', Lammitys, LAMMITYS_FRAMES],
  ['huurtuu', Huurtuu, HUURTUU_FRAMES],
  ['arvostelu', Arvostelu, ARVOSTELU_FRAMES],
  ['viheltaa', Viheltaa, VIHELTAA_FRAMES],
  ['kuuletko', ViheltaaB, VIHELTAA_FRAMES],
] as const;

export const RootKulmat: React.FC = () => (
  <>
    {ADS.flatMap(([id, Comp, frames]) => [
      <Composition key={id + '45'} id={`${id}-45`} component={Comp} durationInFrames={frames}
        fps={FPS} width={1080} height={1350} defaultProps={{ ratio: '45' as const }} />,
      <Composition key={id + '916'} id={`${id}-916`} component={Comp} durationInFrames={frames}
        fps={FPS} width={1080} height={1920} defaultProps={{ ratio: '916' as const }} />,
    ])}
  </>
);
