import React from 'react';
import {
  AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { C, FONT, SAFE_TOP } from './brand';
import { Grain, MaskLine, Vignette } from './ui';
import { Block, Check, Cta, H1, Price, Shot, ShotLayer } from './IkkunaOvi';

/* Neljä uutta kulmaa samalla kaavalla kuin TK58 (12.10.2026), joka on tilin
   paras mainos: oikeaa työkuvaa + yksi ajatus kerrallaan + "Pyydä tarjous".
   Vanhat mainokset kuluivat (CTR 1,54 → 1,04 % neljässä viikossa) koska
   kaikki neljä kertoivat saman "korjaa, älä uusi" -viestin — nämä vaihtavat
   KOUKUN, eivät kuvaa.

   Lupauskieli (ks. muisti tiiviskoti-lupauskieli): numero ongelman
   kuvauksena, ei säästölupauksena; lopetukset rajaavat kohteen.
   Palvelurivi näkyy koko ajan — Josua: mainoksista ei käy ilmi mitä myydään. */

const X = 20;

type AdShot = Shot & { chapterBreak?: boolean };
const layout = (shots: AdShot[]) => {
  const starts: number[] = [];
  shots.forEach((s, i) => starts.push(i === 0 ? 0 : starts[i - 1] + shots[i - 1].len - X));
  return { starts, total: starts[starts.length - 1] + shots[shots.length - 1].len };
};

/* ---------- Osat ---------- */

const ServiceBar: React.FC<{ r45: boolean }> = ({ r45 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 });
  return (
    <div style={{
      position: 'absolute', top: r45 ? 70 : SAFE_TOP + 10, left: 0, right: 0, display: 'flex', justifyContent: 'center',
      opacity: s,
    }}>
      <div style={{
        background: 'rgba(11,34,20,.62)', border: '2px solid rgba(255,255,255,.22)', borderRadius: 999,
        padding: '14px 30px', fontSize: 32, fontWeight: 700, color: '#fff', letterSpacing: '-0.005em',
        backdropFilter: 'blur(10px)',
      }}>
        <span style={{ color: C.mint }}>●</span>&nbsp; Ovien ja ikkunoiden tiivistys
      </div>
    </div>
  );
};

const Kicker: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: 24 });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24, opacity: s }}>
      <span style={{ height: 3, width: interpolate(s, [0, 1], [0, 56]), background: C.mint, borderRadius: 2 }} />
      <span style={{ fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,.92)', letterSpacing: '0.14em' }}>{children}</span>
    </div>
  );
};

/* Maski leikkasi j/p/y-kirjainten alaosat paljastuksen aikana ("jopa" näytti
   "iopa":lta, Josua 12.10.) → enemmän tilaa alas, negatiivinen marginaali
   pitää rivivälin ennallaan. */
const DESC: React.CSSProperties = { paddingBottom: '0.24em', marginBottom: '-0.12em' };
const H1m: React.FC<{ at: number; size?: number; children: React.ReactNode }> = ({ at, size = 96, children }) => (
  <MaskLine at={at} style={{ fontSize: size, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.035em', color: C.mint, ...DESC }}>
    {children}
  </MaskLine>
);
const H1s: React.FC<{ at: number; size?: number; children: React.ReactNode }> = ({ at, size = 96, children }) => (
  <MaskLine at={at} style={{ fontSize: size, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.035em', color: '#fff', ...DESC }}>
    {children}
  </MaskLine>
);

const Body: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: 22 });
  return (
    <div style={{
      marginTop: 28, fontSize: 42, fontWeight: 600, lineHeight: 1.25, color: 'rgba(255,255,255,.94)',
      letterSpacing: '-0.01em', opacity: s, transform: `translateY(${(1 - s) * 18}px)`,
    }}>{children}</div>
  );
};

const Stars: React.FC<{ at: number; size?: number }> = ({ at, size = 64 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const s = spring({ frame: frame - at - i * 4, fps, config: { damping: 12, stiffness: 160 }, durationInFrames: 22 });
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" style={{ transform: `scale(${s})`, opacity: Math.min(1, s * 1.5) }}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#F4B63F" />
          </svg>
        );
      })}
    </div>
  );
};

/* Ei nimiä (Josua 12.10.) — vain lähde. */
const Quote: React.FC<{ at: number; text: string }> = ({ at, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at - 14, fps, config: { damping: 200 }, durationInFrames: 22 });
  return (
    <>
      <MaskLine at={at} dur={30} style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.03em', color: '#fff', ...DESC }}>
        <span style={{ color: C.mint }}>”</span>{text}<span style={{ color: C.mint }}>”</span>
      </MaskLine>
      <div style={{ marginTop: 26, fontSize: 36, fontWeight: 700, color: 'rgba(255,255,255,.85)', opacity: s, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span>— Google-arvostelu</span>
      </div>
    </>
  );
};

/* Kehys: kuvat, varjostin, palvelurivi, musiikki ja häivytys loppuun. */
const Frame: React.FC<{
  shots: AdShot[]; ratio: '916' | '45'; music?: boolean; children: (bottom: number) => React.ReactNode;
}> = ({ shots, ratio, music = true, children }) => {
  const r45 = ratio === '45';
  const bottom = r45 ? 170 : 560;
  const frame = useCurrentFrame();
  const { starts, total } = layout(shots);
  const endFade = interpolate(frame, [total - 14, total], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: FONT }}>
      <AbsoluteFill style={{ opacity: endFade }}>
        {shots.map((s, i) => <ShotLayer key={s.src + i} s={s} start={starts[i]} isFirst={i === 0} r45={r45} />)}
      </AbsoluteFill>
      <AbsoluteFill style={{
        background: `linear-gradient(180deg, rgba(8,24,15,.38) 0%, rgba(8,24,15,0) ${r45 ? 16 : 22}%, rgba(8,24,15,0) ${r45 ? 30 : 36}%, rgba(8,24,15,.34) ${r45 ? 50 : 54}%, rgba(8,24,15,.80) 100%)`,
      }} />
      <Vignette strength={0.32} />
      <Grain opacity={0.04} />
      <ServiceBar r45={r45} />
      {children(bottom)}
      {music && (
        <Audio
          src={staticFile('ikkuna-ovi/musa.m4a')}
          volume={(f) => 0.55 * interpolate(f, [0, 8, total - 25, total], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      )}
    </AbsoluteFill>
  );
};

const End: React.FC<{ at: number; bottom: number; l1: string; l2: string }> = ({ at, bottom, l1, l2 }) => (
  <Block from={at} to={-1} bottom={bottom}>
    <Img src={staticFile('ikkuna-ovi/logo.png')} style={{ width: 300, marginBottom: 34, opacity: 0.95 }} />
    <H1s at={at + 2}>{l1}</H1s>
    <H1m at={at + 8}>{l2}</H1m>
    <Cta at={at + 24} />
  </Block>
);

/* ---------- 1. Lämmityskulut ---------- */

const LAMMITYS: AdShot[] = [
  { src: 'ik01', len: 58, pos45: '50% 40%' },                // asentaja vastavalossa ikkunalla
  { src: 'ik10', len: 56, pos45: '50% 45%' },                // tiiviste alakarmin uraan, makro
  { src: 'ik11s', len: 65, pos45: '50% 55%' },               // tiiviste nurkkaan
  { src: 'ov05', len: 93, pos45: '50% 20%' },                // oven yläkarmi
  { src: 'ov12', len: 68, pos45: '50% 45%' },                // tiiviste painetaan karmiin
  { src: 'ik13', len: 89, pos45: '50% 40%', zoomFrom: 1.0, zoomTo: 1.05 }, // ikkuna suljetaan
];
export const LAMMITYS_FRAMES = layout(LAMMITYS).total;

export const Lammitys: React.FC<{ ratio: '916' | '45' }> = ({ ratio }) => {
  /* Kohtausten rajat ruutuina (otosten alut 0,38,74,119,192,240; loppu 329). */
  const hookTo = 90, s2 = 106, s2To = 176, s3 = 186, end = 252;
  return (
    <Frame shots={LAMMITYS} ratio={ratio}>
      {(bottom) => (
        <>
          <Block from={2} to={hookTo} bottom={bottom}>
            <Kicker at={2}>LÄMMITYSKAUSI</Kicker>
            <H1s at={4} size={84}>Vetävä ikkuna tai ovi</H1s>
            <H1s at={9} size={84}>nostaa lämmityskuluja</H1s>
            <H1m at={14} size={124}>jopa 15 %</H1m>
          </Block>
          <Block from={s2} to={s2To} bottom={bottom}>
            <H1s at={s2 + 2}>Syy on usein</H1s>
            <H1m at={s2 + 8}>kulunut tiiviste.</H1m>
            <Body at={s2 + 26}>Ikkunat ja ovet jäävät paikoilleen — vain tiivisteet uusitaan ja käynti säädetään.</Body>
          </Block>
          <Block from={s3} to={end - 10} bottom={bottom}>
            <H1s at={s3 + 2}>Ikkunan tiivistys</H1s>
            <Price at={s3 + 8} value={75} prefix="alk." />
            <Check at={s3 + 30} text="Ulko-oven tiivistys 99 €" />
          </Block>
          <End at={end} bottom={bottom} l1="Pidä lämpö" l2="sisällä." />
        </>
      )}
    </Frame>
  );
};

/* ---------- 2. Huurtuminen ----------
   VAIN puitteiden välin huuru. Huuru sisälasin huoneen puolella johtuu
   huoneilman kosteudesta eikä tiivistys korjaa sitä (Josua 12.10.).
   Syy: sisäpuitteen vuotava tiiviste päästää lämpimän kostean sisäilman
   puitteiden väliin, jossa se tiivistyy kylmään ulkolasiin. "Usein", ei
   "aina" — ulkopuitteen tuuletus vaikuttaa myös. */

const HUURTUU: AdShot[] = [
  { src: 'ik12s', len: 61, pos45: '50% 40%' },               // sisäpuite avataan
  { src: 'ik06s', len: 75, pos45: '50% 45%' },               // ikkuna laajana
  { src: 'ik10s', len: 67, pos45: '50% 45%' },               // tiiviste uraan, makro
  { src: 'ik09s', len: 57, pos45: '50% 30%' },               // pystyura
  { src: 'ik11s', len: 65, pos45: '50% 55%' },               // nurkka
  { src: 'ik13', len: 89, pos45: '50% 40%', zoomFrom: 1.0, zoomTo: 1.05 },
];
export const HUURTUU_FRAMES = layout(HUURTUU).total;

export const Huurtuu: React.FC<{ ratio: '916' | '45' }> = ({ ratio }) => {
  /* Otosten alut 0,41,96,143,180,225; loppu 314. */
  const hookTo = 78, s2 = 94, s2To = 172, s3 = 184, end = 242;
  return (
    <Frame shots={HUURTUU} ratio={ratio}>
      {(bottom) => (
        <>
          <Block from={2} to={hookTo} bottom={bottom}>
            <H1s at={2} size={84}>Huurtuuko</H1s>
            <H1s at={7} size={84}>ikkunalasien väli</H1s>
            <H1m at={12} size={84}>aamuisin?</H1m>
          </Block>
          <Block from={s2} to={s2To} bottom={bottom}>
            <H1s at={s2 + 2} size={84}>Usein syy on</H1s>
            <H1m at={s2 + 8} size={84}>sisäpuitteen tiiviste.</H1m>
            <Body at={s2 + 26}>Kostea sisäilma pääsee puitteiden väliin ja tiivistyy kylmään lasiin.</Body>
          </Block>
          <Block from={s3} to={end - 10} bottom={bottom}>
            <H1s at={s3 + 2}>Ikkunan tiivistys</H1s>
            <Price at={s3 + 8} value={75} prefix="alk." />
            <Check at={s3 + 28} text="Säätö ja öljyäminen kuuluvat hintaan" />
          </Block>
          <End at={end} bottom={bottom} l1="Ikkunat tiiviiksi" l2="ennen pakkasia." />
        </>
      )}
    </Frame>
  );
};

/* ---------- 3. Google-arvostelu ----------
   Sitaatit sanatarkasti sivuston arvosteluosiosta (index.html, Googlesta). */

const ARVOSTELU: AdShot[] = [
  { src: 'ov01', len: 97, pos45: '50% 40%' },                // asentaja ovella
  { src: 'ov07', len: 58, pos45: '50% 30%' },                // karmin yläosa
  { src: 'ik10s', len: 67, pos45: '50% 45%' },
  { src: 'ov06', len: 76, pos45: '50% 45%' },                // ovi laajana kuistilta
  { src: 'ov12', len: 68, pos45: '50% 45%' },
  { src: 'ov15', len: 96, pos45: '50% 45%', zoomFrom: 1.02, zoomTo: 1.08 }, // ovi suljetaan
];
export const ARVOSTELU_FRAMES = layout(ARVOSTELU).total;

export const Arvostelu: React.FC<{ ratio: '916' | '45' }> = ({ ratio }) => {
  /* Otosten alut 0,77,115,162,218,266; loppu 362. */
  const q1 = 86, q2 = 186, end = 270;
  return (
    <Frame shots={ARVOSTELU} ratio={ratio}>
      {(bottom) => (
        <>
          <Block from={2} to={q1 - 12} bottom={bottom}>
            <Stars at={2} />
            <div style={{ height: 22 }} />
            <H1s at={8} size={84}>5 tähteä Googlessa</H1s>
            <H1m at={13} size={84}>ovien ja ikkunoiden</H1m>
            <H1m at={18} size={84}>tiivistyksestä.</H1m>
          </Block>
          <Block from={q1} to={q2 - 14} bottom={bottom}>
            <Quote at={q1 + 2} text="Tosi nopeaa ja laadukasta työtä. Sopiminen oli myös mainion mutkatonta." />
          </Block>
          <Block from={q2} to={end - 16} bottom={bottom}>
            <Quote at={q2 + 2} text="Reippaita ja aikaansaavia tekijöitä." />
          </Block>
          <End at={end} bottom={bottom} l1="Ikkuna alk. 75 €" l2="ulko-ovi 99 €" />
        </>
      )}
    </Frame>
  );
};

/* ---------- 4. Viheltävä ovi ----------
   Äänessä tuuli + vihellys (sfx-vihellys.py), joka katkeaa kun tiiviste on
   painettu karmiin. Musiikki alkaa vasta sen jälkeen — hiljaisuus on se iskun
   paikka, ei tehoste. */

const VIHELTAA: AdShot[] = [
  { src: 'ov09', len: 72, pos45: '50% 40%' },                // käsi oven reunalla
  { src: 'ik10s', len: 67, pos45: '50% 45%' },               // ikkunan tiiviste uraan
  { src: 'ov02', len: 79, pos45: '50% 45%' },                // oven tiiviste karmiin
  { src: 'ov12', len: 68, pos45: '50% 45%' },                // painetaan kiinni → vihellys loppuu
  { src: 'ov13', len: 113, pos45: '50% 40%' },               // saranan säätö (= "Oven säätö")
  { src: 'ov15', len: 96, pos45: '50% 45%', zoomFrom: 1.02, zoomTo: 1.08 },
];
export const VIHELTAA_FRAMES = layout(VIHELTAA).total;
export const VIHELTAA_HUSH = layout(VIHELTAA).starts[3] + 8;

export const Viheltaa: React.FC<{ ratio: '916' | '45' }> = ({ ratio }) => {
  const { total } = layout(VIHELTAA);
  /* Otosten alut 0,52,99,158,206,299; loppu 395. */
  const s2 = 62, s3 = VIHELTAA_HUSH + 6, end = 305;
  return (
    <Frame shots={VIHELTAA} ratio={ratio} music={false}>
      {(bottom) => (
        <>
          <Block from={2} to={s2} bottom={bottom}>
            <H1s at={2}>Viheltääkö</H1s>
            <H1s at={7}>ikkuna tai ovi</H1s>
            <H1m at={12}>tuulella?</H1m>
          </Block>
          <Block from={s2 + 16} to={VIHELTAA_HUSH - 6} bottom={bottom}>
            <H1s at={s2 + 18} size={84}>Vihellys tulee</H1s>
            <H1m at={s2 + 24} size={84}>tiivisteen raosta.</H1m>
            <Body at={s2 + 42}>Kulunut tiiviste ei enää sulje ikkunan tai oven ja karmin väliä.</Body>
          </Block>
          <Block from={s3} to={end - 10} bottom={bottom}>
            <H1s at={s3 + 2}>Ikkuna alk. 75 €</H1s>
            <H1m at={s3 + 8}>ulko-ovi 99 €</H1m>
            <Check at={s3 + 28} text="Tiivisteiden vaihto" />
            <Check at={s3 + 40} text="Säätö ja öljyäminen kuuluvat hintaan" />
          </Block>
          <End at={end} bottom={bottom} l1="Ikkunat ja ovet" l2="samalla käynnillä." />
          <Audio src={staticFile('ikkuna-ovi/vihellys.wav')} />
          <Audio
            src={staticFile('ikkuna-ovi/musa.m4a')}
            volume={(f) => 0.5 * interpolate(f, [VIHELTAA_HUSH + 10, VIHELTAA_HUSH + 30, total - 25, total], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
          />
        </>
      )}
    </Frame>
  );
};

/* ---------- 4b. Viheltävä — "Kuuletko tuon?" (TK63, 13.10.2026) ----------
   TK62:n A/B-pari: SAMAT otokset, tekstit 2. kohtauksesta alkaen ja loppu.
   Ainoa muuttuja on koukku: vihellys soi heti ruudusta 0 (vihellys-b.wav,
   sfx-vihellys.py --b) ja ruudulla on sykkivä ääniaalto, jotta koukku
   toimii myös äänettömänä syötteessä. Älä muuta muuta, muuten testi ei
   kerro koukusta mitään. */

const SoundWave: React.FC<{ at: number; until: number }> = ({ at, until }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: 14 });
  /* Aalto laantuu samalla kun vihellys katkeaa. */
  const live = interpolate(frame, [until - 10, until], [1, 0.15], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const H = [0.45, 0.8, 1, 0.7, 0.95, 0.55, 0.85, 0.4];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 30, opacity: s }}>
      <svg width={58} height={58} viewBox="0 0 24 24" fill="none" stroke={C.mint} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5z" fill={C.mint} />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 70 }}>
        {H.map((h, i) => {
          const wob = 0.55 + 0.45 * Math.abs(Math.sin(frame * 0.42 + i * 1.3));
          return <span key={i} style={{ width: 11, borderRadius: 6, background: C.mint, height: 70 * h * wob * live * s + 8 }} />;
        })}
      </div>
    </div>
  );
};

export const ViheltaaB: React.FC<{ ratio: '916' | '45' }> = ({ ratio }) => {
  const { total } = layout(VIHELTAA);
  const s2 = 62, s3 = VIHELTAA_HUSH + 6, end = 305;
  return (
    <Frame shots={VIHELTAA} ratio={ratio} music={false}>
      {(bottom) => (
        <>
          <Block from={0} to={s2} bottom={bottom}>
            <SoundWave at={0} until={VIHELTAA_HUSH} />
            <H1s at={2}>Kuuletko</H1s>
            <H1m at={7}>tuon?</H1m>
            <Body at={18}>Se on ikkunasi tai ovesi.</Body>
          </Block>
          <Block from={s2 + 16} to={VIHELTAA_HUSH - 6} bottom={bottom}>
            <H1s at={s2 + 18} size={84}>Vihellys tulee</H1s>
            <H1m at={s2 + 24} size={84}>tiivisteen raosta.</H1m>
            <Body at={s2 + 42}>Kulunut tiiviste ei enää sulje ikkunan tai oven ja karmin väliä.</Body>
          </Block>
          <Block from={s3} to={end - 10} bottom={bottom}>
            <H1s at={s3 + 2}>Ikkuna alk. 75 €</H1s>
            <H1m at={s3 + 8}>ulko-ovi 99 €</H1m>
            <Check at={s3 + 28} text="Tiivisteiden vaihto" />
            <Check at={s3 + 40} text="Säätö ja öljyäminen kuuluvat hintaan" />
          </Block>
          <End at={end} bottom={bottom} l1="Ikkunat ja ovet" l2="samalla käynnillä." />
          <Audio src={staticFile('ikkuna-ovi/vihellys-b.wav')} />
          <Audio
            src={staticFile('ikkuna-ovi/musa.m4a')}
            volume={(f) => 0.5 * interpolate(f, [VIHELTAA_HUSH + 10, VIHELTAA_HUSH + 30, total - 25, total], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
          />
        </>
      )}
    </Frame>
  );
};
