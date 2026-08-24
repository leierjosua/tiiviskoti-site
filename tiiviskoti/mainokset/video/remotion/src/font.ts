import { loadFont } from '@remotion/fonts';
import { staticFile, delayRender, continueRender } from 'remotion';

/* Fontti on ladattava ennen ensimmäistä framea, muuten Remotion renderöi
   järjestelmäfontilla ja rivinvaihdot menevät eri kohtaan kuin esikatselussa. */
const handle = delayRender('Manrope');
loadFont({ family: 'Manrope', url: staticFile('Manrope-ExtraBold.ttf'), weight: '800' })
  .then(() => continueRender(handle))
  .catch(() => continueRender(handle));
