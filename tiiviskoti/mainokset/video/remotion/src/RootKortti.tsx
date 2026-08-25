import React from 'react';
import { Composition } from 'remotion';
import { Kortti, totalFrames, KorttiProps } from './Kortti';
import { Lampotila, LAMPO_FRAMES } from './Lampotila';
import { Saasto, SAASTO_FRAMES } from './Saasto';
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


/* Loput kortit videoina 25.8. Jokaisen askeleet vastaavat sen OMAA lupausta —
   ei sama varausputki kaikkiin, koska "Näin löydät vetokohdat" ei jatku
   luontevasti postinumerokenttään. Tekstit ovat sivuston UKK:sta ja
   build-alueet.mjs:n "Näin työ etenee" -korteista, ei keksittyjä. */

const VETO: KorttiProps = {
  chip: 'Vetääkö kotona?',
  l1: 'Näin löydät', l2: 'vetokohdat', l3: 'kodistasi',
  lead: 'Neljä vaihetta samalla käynnillä',
  steps: [
    { tag: 'Käynnillä 1/4', title: 'Lämpökamerakuvaus', sub: 'Näet mistä kohdista lämpö karkaa' },
    { tag: 'Käynnillä 2/4', title: 'Karmit ja kynnykset', sub: 'Yleisimmät vuotokohdat käydään läpi' },
    { tag: 'Käynnillä 3/4', title: 'Tiivisteiden vaihto', sub: 'Vanhat pois, pinnat puhtaaksi, uudet tilalle' },
    { tag: 'Käynnillä 4/4', title: 'Oven käynnin säätö', sub: 'Ovi painuu tasaisesti tiivisteitä vasten' },
  ],
  cardTitle: 'Mitä käynnillä tehdään',
  ctaLine1: 'Varaa aika', ctaLine2: 'verkossa',
  ctaNote: 'Lämpökamerakuvaus sisältyy · pienin käynti 149 €',
};

const HINTA: KorttiProps = {
  chip: 'Paljonko tiivistys maksaa?',
  l1: 'Näin näet', l2: 'kiinteän hinnan', l3: 'ennen varausta',
  lead: 'Ei arviolaskuria eikä tarjouspyyntöä',
  steps: [
    { tag: 'Laskurissa 1/4', title: 'Valitse ovet ja ikkunat', sub: 'Ikkuna 95 €, ulko-ovi 119 €' },
    { tag: 'Laskurissa 2/4', title: 'Hinta päivittyy heti', sub: 'Sama summa myös laskussa' },
    { tag: 'Laskurissa 3/4', title: 'Kotitalousvähennys näkyy', sub: '−40 % työn osuudesta valmiiksi laskettuna' },
    { tag: 'Laskurissa 4/4', title: 'Varaa aika samasta näkymästä', sub: 'Kalenteri aukeaa hinnan vierestä' },
  ],
  cardTitle: 'Hintalaskuri',
  ctaLine1: 'Katso hinta', ctaLine2: 'heti',
  ctaNote: 'Ikkuna 95 € · ulko-ovi 119 € · pienin käynti 149 €',
};

const SAASTO: KorttiProps = {
  chip: 'Nousiko lämmityslasku?',
  l1: 'Näin veto', l2: 'loppuu', l3: 'yhdellä käynnillä',
  lead: 'Ovet ja ikkunat samalla kertaa',
  steps: [
    { tag: 'Päivä 1/4', title: 'Asentaja tulee sovittuna aikana', sub: 'Yksi käynti, ei useaa reissua' },
    { tag: 'Päivä 2/4', title: 'Vuotokohdat näkyviin', sub: 'Lämpökamera ennen työn aloitusta' },
    { tag: 'Päivä 3/4', title: 'Tiivisteet vaihdetaan', sub: 'Ulko-oveen myös kynnyskumi' },
    { tag: 'Päivä 4/4', title: 'Jäljet siivotaan', sub: 'Koti on käyttövalmis lähtiessämme' },
  ],
  cardTitle: 'Näin käynti etenee',
  ctaLine1: 'Varaa aika', ctaLine2: 'verkossa',
  ctaNote: 'Ikkuna 95 € · ulko-ovi 119 € · pienin käynti 149 €',
};

const TALOYHTIO_KARTOITUS: KorttiProps = {
  chip: 'Taloyhtiön hallitukselle',
  l1: 'Näin kartoitus', l2: 'etenee', l3: 'taloyhtiössä',
  lead: 'Neljä vaihetta — kartoitus 0 €',
  steps: [
    { tag: 'Vaihe 1/4', title: 'Varaatte ajan verkosta', sub: 'Kartoituskäynti alle minuutissa' },
    { tag: 'Vaihe 2/4', title: 'Kartoitus veloituksetta', sub: 'Mittaamme vetokohdat, käymme ovet läpi' },
    { tag: 'Vaihe 3/4', title: 'Kiinteä hinta kirjallisena', sub: 'Hinta ennen työn aloitusta' },
    { tag: 'Vaihe 4/4', title: 'Asennus sovittuna päivänä', sub: 'Yksi yhteyshenkilö koko ajan' },
  ],
  cardTitle: 'Kartoituksesta asennukseen',
  ctaLine1: 'Varaa kartoitus', ctaLine2: 'verkossa',
  ctaNote: 'Kartoituskäynti 0 € · ei sitoumuksia',
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
    <Composition
      id="kortti-veto" component={Kortti}
      durationInFrames={totalFrames(VETO.steps.length)}
      fps={FPS} width={W} height={H} defaultProps={VETO}
    />
    <Composition
      id="kortti-hinta" component={Kortti}
      durationInFrames={totalFrames(HINTA.steps.length)}
      fps={FPS} width={W} height={H} defaultProps={HINTA}
    />
    <Composition
      id="kortti-saasto" component={Kortti}
      durationInFrames={totalFrames(SAASTO.steps.length)}
      fps={FPS} width={W} height={H} defaultProps={SAASTO}
    />
    <Composition
      id="kortti-taloyhtio-kartoitus" component={Kortti}
      durationInFrames={totalFrames(TALOYHTIO_KARTOITUS.steps.length)}
      fps={FPS} width={W} height={H} defaultProps={TALOYHTIO_KARTOITUS}
    />
    <Composition
      id="kortti-lampotila" component={Lampotila}
      durationInFrames={LAMPO_FRAMES}
      fps={FPS} width={W} height={H}
    />
    <Composition
      id="kortti-saasto-arvio" component={Saasto}
      durationInFrames={SAASTO_FRAMES}
      fps={FPS} width={W} height={H}
    />
  </>
);
