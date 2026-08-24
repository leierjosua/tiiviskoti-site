import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { C, FONT, SAFE_BOTTOM } from './brand';

export type Word = { a: number; b: number; w: string };

/* Korostuksen johto: sana syttyy hieman ennen kuin se kuuluu. Myöhässä oleva
   tekstitys luetaan virheeksi, etuajassa oleva ei.

   Johtoa EI saa antaa kiinteänä. Lyhyt sana ("Me", ~70 ms) ehti kiinteällä
   90 ms:n johdolla jo seuraavaan sanaan, eli korostus oli sanan verran edellä.
   Siksi johto on korkeintaan 40 % sanan omasta kestosta. */
const LEAD_MAX = 0.09;
const leadFor = (w: Word) => Math.min(LEAD_MAX, (w.b - w.a) * 0.4);

/* Rivi ilmestyy tämän verran ennen ensimmäistä sanaansa. Aiemmin rivi tuli
   vasta sanan alkaessa, ja koska sisääntulo vielä animoitui, koko rivi tuntui
   myöhässä vaikka ajastus oli oikein. */
const LINE_LEAD = 0.26;

export const Captions: React.FC<{ lines: Word[][]; hideUntil: number }> = ({ lines, hideUntil }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < hideUntil) return null;

  /* Haetaan VIIMEISIN osuva rivi, ei ensimmäistä. Rivin häntä (0.22 s) ja
     seuraavan rivin johto (0.26 s) menevät päällekkäin, ja findIndex palautti
     silloin vanhan rivin: ruudulla oli rivi ilman korostusta samalla kun
     seuraavat sanat jo kuuluivat. Juuri tämä luki "off beatiksi". */
  /* Rivin näyttöhetki = sen johto, MUTTA aikaisintaan kun edellinen rivi on
     puhuttu loppuun. Ilman tätä rajausta seuraava rivi otti ruudun kesken
     edellisen rivin viimeistä sanaa, ja se sana jäi korostamatta — juuri
     tämä näkyi kuudessa sanassa automaattitarkistuksessa. */
  const startOf = (k: number) => {
    const own = lines[k][0].a - LINE_LEAD;
    /* Edellisen rivin viimeinen sana saa vähintään 140 ms korostusta ennen kuin
       uusi rivi ottaa ruudun. Rajaa EI saa sitoa edellisen sanan loppuaikaan:
       whisperin loppuajat menevät seuraavan sanan alun päälle, jolloin rivi
       viivästyisi ja rivin ENSIMMÄINEN sana jäisi korostamatta.
       Ylärajana on aina oman ensimmäisen sanan alku — rivi on ruudulla
       viimeistään silloin kun se aletaan puhua. */
    const prevMin = k > 0 ? lines[k - 1][lines[k - 1].length - 1].a + 0.14 : -Infinity;
    return Math.min(Math.max(own, prevMin), lines[k][0].a);
  };

  let li = -1;
  for (let k = lines.length - 1; k >= 0; k--) {
    if (t >= startOf(k) && t < lines[k][lines[k].length - 1].b + 0.22) { li = k; break; }
  }
  if (li < 0) return null;
  const line = lines[li];

  /* Sisääntulo on nopea ja tapahtuu KOKONAAN ennen ensimmäistä sanaa, jotta
     rivi on paikallaan siinä vaiheessa kun puhe alkaa. */
  const st = startOf(li);
  /* Kun rajaus painaa rivin alun kiinni ensimmäiseen sanaan, st + fade voi
     osua täsmälleen samaan hetkeen. interpolate vaatii aidosti kasvavan
     välin, joten pidetään vähintään yhden framen mittainen häivytys. */
  const fadeEnd = Math.max(st + 1 / fps, Math.min(st + 0.16, line[0].a));
  const inT = interpolate(t, [st, fadeEnd], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute', left: 80, right: 80, bottom: SAFE_BOTTOM - 60,
      textAlign: 'center', fontFamily: FONT, fontWeight: 800,
      fontSize: 46, lineHeight: 1.26, letterSpacing: '-0.015em',
      transform: `translateY(${interpolate(inT, [0, 1], [12, 0])}px)`,
      opacity: inT,
    }}>
      {line.map((w, i) => {
        const gapEnd = i + 1 < line.length ? Math.min(line[i + 1].a, w.b + 0.18) : w.b + 0.12;
        const end = Math.max(w.b, gapEnd);
        const lead = leadFor(w);
        const on = t >= w.a - lead && t < end;

        /* Korostus napsahtaa 50 ms:ssä eikä jousella. Jousen huippu tuli
           äänen JÄLKEEN, mikä on juuri se mikä luetaan "off beatiksi". */
        const pop = on
          ? interpolate(t, [w.a - lead, w.a - lead + 0.05, w.a - lead + 0.14], [0.96, 1.07, 1.03],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          : 1;

        /* Ei vihreitä korostuslaatikoita — Josua 24.8.: "ne on liikaa".
           Puhuttava sana erottuu kirkkaudella ja pienellä skaalalla, muut
           rivin sanat jäävät himmeämmiksi. Reunus on KAIKILLA sanoilla, myös
           aktiivisella: ilman sitä aktiivinen sana katoaisi vaaleaan taustaan
           juuri silloin kun sen pitäisi erottua eniten. */
        return (
          <span key={i} style={{
            display: 'inline-block', margin: '0 7px 6px',
            transform: `scale(${pop})`,
            color: '#fff',
            opacity: on ? 1 : 0.62,
            WebkitTextStroke: '7px ' + C.stroke,
            paintOrder: 'stroke fill',
            padding: '1px 0 7px',
            textShadow: on ? '0 4px 16px rgba(0,0,0,.55)' : '0 5px 18px rgba(0,0,0,.45)',
          } as React.CSSProperties}>{w.w}</span>
        );
      })}
    </div>
  );
};
