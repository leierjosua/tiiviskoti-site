import { loadFont } from '@remotion/fonts';
import { staticFile, delayRender, continueRender } from 'remotion';

/* Fontti on ladattava ennen ensimmäistä framea, muuten Remotion renderöi
   järjestelmäfontilla ja rivinvaihdot menevät eri kohtaan kuin esikatselussa.
   Kolme leikkausta: 800 otsikoihin, 700 askelriveihin, 500 leipään. */
const WEIGHTS: Array<[string, string]> = [
  ['800', 'Manrope-ExtraBold.ttf'],
  ['700', 'Manrope-Bold.ttf'],
  ['500', 'Manrope-Medium.ttf'],
];

const handle = delayRender('Manrope');
Promise.all(
  WEIGHTS.map(([weight, file]) =>
    loadFont({ family: 'Manrope', url: staticFile(file), weight }),
  ),
)
  .then(() => continueRender(handle))
  .catch(() => continueRender(handle));
