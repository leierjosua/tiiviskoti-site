import React from 'react';
import { Composition } from 'remotion';
import { Kortti, totalFrames, KorttiProps } from './Kortti';
import { W, H } from './brand';

/* OMA juuri korttivideoille. Root.tsx tuo Short.tsx:n, joka importtaa
   generoidun `words.json`in — sitä ei ole repossa, ja puuttuva tiedosto
   kaataisi koko bundlen. Talking-head-putkeen ei siis kosketa lainkaan:
   nämä renderöidään omalla entry pointilla.

     npx remotion render src/index-kortti.ts kortti-koti out/kortti-koti.mp4
*/

const FPS = 25;

/* Vaiheet ovat sivuston OMAT — data-title ja data-tag suoraan index.html:stä,
   ei keksittyjä. Kuluttajapolku on 4 vaihetta, taloyhtiöpolku 3. */
const KOTI: KorttiProps = {
  chip: 'Vetääkö kotona?',
  l1: 'Näin varaat', l2: 'tiivistyksen', l3: 'verkossa',
  lead: 'Neljä vaihetta — alle minuutissa',
  steps: [
    { tag: 'Vaihe 1/4', title: 'Missä kohde on?', sub: 'Postinumero kertoo heti, palvelemmeko alueellasi' },
    { tag: 'Vaihe 2/4', title: 'Laske hinta heti', sub: 'Valitse ovet ja ikkunat — kiinteä hinta päivittyy' },
    { tag: 'Vaihe 3/4', title: 'Valitse vapaa aika', sub: 'Kalenterista, ilman soittokierrosta' },
    { tag: 'Vaihe 4/4', title: 'Täytä yhteystiedot', sub: 'Vahvistus sähköpostiin saman tien' },
  ],
  cardTitle: 'Varaa aika verkossa',
  ctaLine1: 'Varaa aika', ctaLine2: 'verkossa',
  ctaNote: 'Ikkuna 95 € · ulko-ovi 119 € · pienin käynti 149 €',
};

const TALOYHTIO: KorttiProps = {
  chip: 'Asutko taloyhtiössä?',
  l1: 'Näin saat', l2: 'tiivistykset', l3: 'taloyhtiöön',
  lead: 'Kolme vaihetta — kartoitus 0 €',
  steps: [
    { tag: 'Vaihe 1/3', title: 'Taloyhtiön tiedot', sub: 'Kerro kohde ja yhteyshenkilö' },
    { tag: 'Vaihe 2/3', title: 'Valitkaa sopiva aika', sub: 'Kartoituskäynti verkosta, ei sitoumuksia' },
    { tag: 'Vaihe 3/3', title: 'Kartoituskäynti vahvistettu', sub: 'Kiinteä tarjous käynnin jälkeen' },
  ],
  cardTitle: 'Varaa kartoitus verkossa',
  ctaLine1: 'Varaa kartoitus', ctaLine2: 'verkossa',
  ctaNote: 'Kartoituskäynti 0 € · yksi yhteyshenkilö',
};

export const KorttiRoot: React.FC = () => (
  <>
    <Composition
      id="kortti-koti"
      component={Kortti}
      durationInFrames={totalFrames(KOTI.steps.length)}
      fps={FPS} width={W} height={H}
      defaultProps={KOTI}
    />
    <Composition
      id="kortti-taloyhtio"
      component={Kortti}
      durationInFrames={totalFrames(TALOYHTIO.steps.length)}
      fps={FPS} width={W} height={H}
      defaultProps={TALOYHTIO}
    />
  </>
);
