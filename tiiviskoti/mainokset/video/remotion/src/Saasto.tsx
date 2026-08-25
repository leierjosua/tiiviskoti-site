import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';
import { C, SAFE_TOP, SAFE_BOTTOM, FONT } from './brand';
import { ServiceBar, Mark } from './Kortti';
import { Roll, Grain, Vignette, Scene } from './ui';
import './font';

/* Lämmityskulun arvio — KOLME KOHTAUSTA, yksi ajatus kerrallaan.

   Ensimmäinen versio oli sotku: lopussa ruudulla oli yhtä aikaa palvelupilleri,
   kaksirivinen johdanto, 10–15 %, esimerkkirivi, 300 €, sen alaotsikko, palkki,
   kolmirivinen varaus, kaksirivinen lupaus, logo ja hintarivi. Yksitoista
   elementtiä. Vika ei ollut yhdessäkään niistä vaan siinä, ettei mikään
   POISTUNUT. Nyt kohtaus vaihtuu ja edellinen lähtee pois.

   Poistettu kokonaan: palkki, karkaavat hiukkaset, iskuvälähdys. Ne olivat
   koristeita joista ei jäänyt mitään käteen — ja isku kuuluu lämpötilavideoon,
   jossa sillä on kohde (tiiviste). Täällä ei ollut mitään mihin iskeä.

   ⚠ LUPAUSKIELI: video EI lupaa säästöä. Sivusto: "Emme lupaa tiettyä säästöä
   etukäteen, koska lopputulos riippuu talosta, lämmitystavasta ja siitä kuinka
   moni kohta vuotaa." Näytetään ONGELMAN koko sivuston omalla luvulla ja siitä
   yksi esimerkki, merkittynä esimerkiksi. Älä muuta myyväksi lupaukseksi. */

const FPS = 25;
export const SAASTO_FRAMES = 14 * FPS;      // 350

const PCT_LO = 10, PCT_HI = 15;
const EXAMPLE = 2000;
const LEAK = 300;

const A = { from: 10,  to: 96  };           // 0,4 – 3,8 s   ongelman koko
const B = { from: 112, to: 218 };           // 4,5 – 8,7 s   sama rahana
const Cc = { from: 236, to: 350 };          // 9,4 – 14 s    lupaus ja tunnus

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export const Saasto: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const push = interpolate(frame, [0, SAASTO_FRAMES], [1, 1.05], { easing: Easing.linear });

  const leakV = interpolate(frame, [B.from + 4, B.from + 46], [0, LEAK], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const prev = interpolate(frame - 1, [B.from + 4, B.from + 46], [0, LEAK], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const blur = Math.abs(leakV - prev) * 0.12;

  const brandS = spring({ frame: frame - (Cc.from + 34), fps, config: { damping: 200 }, durationInFrames: 26 });

  const stage: React.CSSProperties = {
    position: 'absolute', top: SAFE_TOP + 96, left: 72, right: 72, bottom: SAFE_BOTTOM,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center',
  };
  const big: React.CSSProperties = {
    fontSize: 168, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.02, color: '#fff',
    textShadow: '0 12px 44px rgba(6,30,18,.5)',
  };
  const under: React.CSSProperties = {
    marginTop: 26, fontSize: 37, fontWeight: 700, lineHeight: 1.34,
    color: 'rgba(226,242,233,.86)', maxWidth: 800,
  };

  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#0A1A12', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '50% 46%' }}>
        <AbsoluteFill style={{
          background: 'radial-gradient(ellipse 84% 54% at 50% 40%, #2C8256 0%, #1F6242 38%, #143C29 70%, #0A1A12 100%)',
        }} />
        <Grain />
        <Vignette />
      </AbsoluteFill>

      <ServiceBar />

      {/* ---------- A. ongelman koko ---------- */}
      <Scene from={A.from} to={A.to} style={stage}>
        <div style={big}>{PCT_LO}–{PCT_HI} %</div>
        <div style={under}>
          lämmityskulusta karkaa vetävistä<br />ovista ja ikkunoista
        </div>
      </Scene>

      {/* ---------- B. sama rahana ---------- */}
      <Scene from={B.from} to={B.to} style={stage}>
        <div style={{ display: 'flex', alignItems: 'flex-start', ...big }}>
          <Roll v={leakV} fs={168} color="#FFFFFF" digits={3} blur={blur} />
          <span>&nbsp;€</span>
        </div>
        <div style={under}>vuodessa, kun lämmityskulu on 2 000 €</div>
        <div style={{
          marginTop: 30, fontSize: 24, fontWeight: 600, lineHeight: 1.4,
          color: 'rgba(214,232,222,.6)', maxWidth: 760,
        }}>
          Esimerkki. Emme lupaa tiettyä säästöä — lopputulos riippuu talosta,
          lämmitystavasta ja vuotokohdista.
        </div>
      </Scene>

      {/* ---------- C. lupaus ja tunnus ---------- */}
      <Scene from={Cc.from} to={Cc.to + 40} style={stage}>
        <div style={{
          fontSize: 62, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.18, color: '#fff',
        }}>
          Tiivistä ovet<br />ja ikkunat.
        </div>
        <div style={{
          marginTop: 22, fontSize: 34, fontWeight: 700, color: C.mint,
        }}>
          Lämpökamera näyttää vuotokohdat.
        </div>

        <div style={{
          marginTop: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          opacity: brandS, transform: `translateY(${interpolate(brandS, [0, 1], [20, 0])}px)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Mark size={52} onDark />
            <span style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-0.03em', color: '#fff' }}>TiivisKoti</span>
          </div>
          <span style={{ fontSize: 30, fontWeight: 700, color: 'rgba(255,255,255,.7)' }}>tiiviskoti.fi</span>
        </div>
      </Scene>
    </AbsoluteFill>
  );
};
