# TiivisKoti — 10 premium-etusivukonseptia (brief)

Tavoite: "miljoonan euron" näköinen, **clean** etusivu tiiviskoti.fi:lle. Jokainen konsepti on
yksi itsenäinen HTML-tiedosto (`v01-*.html` … `v10-*.html`) tässä kansiossa. Kuvat ja videot
`assets/`-kansiosta suhteellisella polulla (`assets/hero-entrance.webp`). Ei build-työkaluja,
ei npm-riippuvuuksia sivulla. Ulkoiset vain: Google Fonts (Manrope). Kaikki CSS/JS inline.

## Mitä AaltoAir tekee (tutkittu 6.10.2026, aaltoair.fi lähdekoodista)
- Next.js + Tailwind v4, fontti **Outfit**. **EI animaatiokirjastoja** (ei Framer Motion, GSAP,
  Lenis, AOS). Kaikki on CSS-transitioita + pieni IntersectionObserver.
- **Yksi easing kaikkialla:** `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out), kesto 0,7–0,8 s.
- **Porrastus (stagger):** heron elementit tulevat 0,2 / 0,35 / 0,55 / 0,75 / 0,9 / 1,05 / 1,2 s
  viiveillä, `opacity 0 → 1` + `translateY(20–30px) → 0`.
- **Lasipilleri heron yläpuolella:** `bg white/8%`, `backdrop-blur`, `border white/10%`,
  pyöreä — 5 keltaista tähteä (#FBBF24) · "5.0" · ohut pystyviiva · "620+ arvostelua".
- **Hero:** iso valokuva + kaksi kerrosta: tasainen brändisävy ~28 % + **radiaalinen gradientti**
  keskelle (tekstin taakse tummempi, reunat kevyemmät) + alareunaan liukuma.
  Keskitetty otsikko 2 riviä ("Sopiva lämpö. / Puhdas ilma."), alla 2 nappia ja 3 lasikorttia
  numeroilla (4000+ / Kiinteä / <1 min).
- **Aaltomuotoinen SVG-jakaja** heron ja seuraavan osion välissä.
- Keyframet: `ar-glint` (valoviiru pyyhkäisee CTA-napin yli), `ar-attention` (pehmeä pulssirengas),
  `border-rotate` (@property --border-angle → pyörivä conic-gradient-reunus kortissa),
  `drag-hint` (karuselli vihjaa vedettävyyttä), `slide-up`, `fade-in`. `prefers-reduced-motion` huomioitu.
- Rakenne: hero → palvelukortit (kuva + hintamerkki kulmassa) → "Varaa aika verkosta" palvelulista
  → "Miksi me" kuva + teksti → tumma tilastopalkki (5.0 / Kiinteä / 40 % / 5000+) → tuotteet →
  Google-arvostelukaruselli (avatar, tähdet, "Lue lisää") → aaltojakaja → tumma CTA + footer.
- Paljon valkoista tilaa, vähän värejä (sininen + valkoinen + vaalea #F4F7FB), pyöreät 16–24 px kulmat,
  pehmeät varjot.

## TiivisKodin brändi (pakollinen — älä keksi uusia värejä)
```
--bg:#F6F7F3; --alt:#ECF0E9; --card:#FFFFFF;
--ink:#183A28; --text:#4A544D; --mute:#7B857D;
--green:#217A4E; --green-d:#1A6340; --green-l:#2E9E63; --green-soft:#E4F0E9; --mint:#8FD3AC;
--deep:#163A28; --deep2:#1E4A34; --line:#E4E8E0; --star:#FBBF24
```
Fontti **Manrope** (400/500/600/700/800). Logo: `assets/logo-vihrea.svg`, `assets/logo-valkoinen.svg`
(tai tekstimerkki "Tiivis**Koti**" jossa Koti vihreällä).

## Faktat (käytä VAIN näitä — älä keksi lukuja, lupauksia tai arvosteluja)
- Palvelu: ovien ja ikkunoiden tiivisteiden vaihto kiinteään hintaan. Uusimaa ja Riihimäki.
- **Ikkunan tiivistys 75–90 € / ikkuna** määrän mukaan (90 € 1–4 kpl, 85 € 5–9, 80 € 10–13, 75 € 14+).
  Ikkunan **säätö ja öljyäminen kuuluvat hintaan**. Karmi- ja puitetiivisteet.
- **Ulko-oven tiivistys 99 €**: tiivisteiden vaihto, lukkojen ja saranoiden öljyäminen, oven säätö.
- Liuku-/pariovi 149 €, väli-/huoneovi 89 €. **Pienin käynti 149 €** (sis. käynnin, matkat, lämpökamerakuvauksen).
- Lämpökamerakuvaus ennen työtä veloituksetta. Kotitalousvähennys −40 %.
- Ajanvaraus verkosta alle minuutissa, näet hinnan heti laskurista. Ei tarjouspyyntöjä.
- **Oma porukka, ei alihankintaa.** Työ yhdellä käynnillä.
- Taloyhtiöille maksuton kartoituskäynti + kirjallinen tarjous hallitukselle.
- **Google 5,0 ★ / 12 arvostelua.** Oikeita arvosteluja (saa lainata sanatarkasti):
  - Marjut S.: "Lopputulos vaikuttaa hyvältä. Ikkunoita on paljon ja tiivistys vei koko päivän kahdelta tekijältä. Pari juttua oli korjattava ja nekin hoituivat nopeasti ilman viivettä. Reippaita ja aikaansaavia tekijöitä."
  - Gunvor v. W.: "Thank you for professional and fast service. The reservation was easy to make online!"
  - Lilja S.: "Pojat tekivät työnsä ammattitaidolla 👍"
  - Edwin T.: "Tosi nopeaa ja laadukasta työtä. Sopiminen oli myös mainion mutkatonta. Vahva suositus."
- Ankkuri: uusi ikkuna maksaisi n. 1 200 €. Vetävä ovi tai ikkuna nostaa lämmityskuluja tyypillisesti 10–15 %
  (**ongelman kuvaus, ei lupaus säästöstä** — älä kirjoita "säästät 15 %").
- Puhelin 045 875 5996, info@tiiviskoti.fi. Varaus: `https://tiiviskoti.fi/varaa.html`.
- **Kiellettyä:** takuu myyntiargumenttina, keksityt tähtimäärät/asiakasmäärät ("1000+ asiakasta"),
  "säästät X %", parvekeovet erillisenä myyntikärkenä, kynnyskumin sisältyminen oven hintaan.

## Kuvat ja video (assets/)
hero-entrance.webp (asentajat puutalon edessä — paras hero), hero-kela.webp, ikkunat.webp (valkoinen
ikkuna harmaassa puutalossa), ulko-ovet.webp, taloyhtiot.webp, taloyhtio-hero.webp, miksi-tyo.webp,
miksi-paita.webp, meista-porukka.webp, tiimi-porukka.webp, tiimi-{akseli,daniel,eelis,josua,nestori}.webp
(muotokuvat), yhteys-josua.webp. Video: tyo-loop-16x9.mp4 (1280×720, mykkä, ~20 s työkuvaa:
tiivisteen painaminen uraan, saumaus, oven tiiviste) + tyo-loop-poster.jpg, tyo-loop-9x16.mp4 (pysty).
Videolle aina `muted autoplay loop playsinline` + poster.

## Laatuvaatimus ("miljoonan euron" = hillitty, ei krumeluuria)
- Clean: paljon tyhjää tilaa, 1 korostusväri, selkeä hierarkia, max 2 fonttipainoa per näkymä.
- Liike: AaltoAirin easing `cubic-bezier(0.16,1,0.3,1)`, 0,6–0,9 s, porrastettu sisääntulo,
  scroll-reveal IntersectionObserverilla. Hienovarainen — ei pomppimista. `@media (prefers-reduced-motion)` → ei liikettä.
- Toimii mobiilissa (390 px) ilman vaakavieritystä. Napit vähintään 44 px korkeita.
- Sivun osiot (vähintään): hero → palvelut + hinnat → miksi me / luottamus → arvostelut → CTA → kevyt footer.
  Varausnapit vievät `https://tiiviskoti.fi/varaa.html`. Ei tarvitse toimivaa laskuria, paitsi konsepteissa joissa se on idea.
- `<meta name="robots" content="noindex">`, `<title>TiivisKoti — vXX nimi</title>`.
- Suomi, sinuttelu, lyhyet lauseet. Sama äänensävy kuin nyt: "Kylmä veto ei kuulu kotiin." "Veto kuriin, lämpö kotiin."

## Varmistus (pakollinen ennen kuin sanot valmis)
Aja paikallinen palvelin `python3 -m http.server <portti>` tässä kansiossa (käytä sinulle annettua porttia).
Kuvakaappaukset Playwrightilla (kirjasto on asennettu kansiossa `~/projects/loppusiivous-main-new`:
kirjoita skripti sinne esim. `_shot-vXX.mjs`, `chromium.launch({channel:'chrome'})`, poista skripti lopuksi):
1. 1440×900 hero (odota 2 s että animaatiot valmiit), 2. 1440 leveä koko sivu (vieritä alas ensin, jotta reveal-animaatiot laukeavat),
3. 390×844 mobiili hero + koko sivu. Tallenna `shots/vXX-desk.jpg`, `shots/vXX-full.jpg`, `shots/vXX-mob.jpg`, `shots/vXX-mobfull.jpg` (JPEG laatu 70).
Katso jokainen kuva itse (Read-työkalu) ja korjaa: tekstin luettavuus kuvan päällä, ylivuoto, rikkinäiset kuvat,
tyhjät reveal-elementit (opacity 0 jääneet), vaakavieritys mobiilissa. Tarkista myös `pageerror`-virheet konsolista.
