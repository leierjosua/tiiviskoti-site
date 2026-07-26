# Loppusiivous.fi — Brändiohjeisto

Muuttosiivouksen erikoisliike. Brändin ydin: **raikas, puhdas, luotettava** — "clean vibe".

## Logo

- **Sanamerkki:** `Loppusiivous.fi`
- **Fontti:** **Gabarito** (Google Fonts), paino **700 (Bold)**. Vapaa lisenssi → käytettävissä webissä ja painossa.
- **Motiivi:** o-kirjaimet ovat **saippuakuplia** (rengas + lyhyt kiiltoheijastus ylävasemmalla). "vous":n o:sta karkaa kaksi pikkukuplaa. `.fi`:n piste on pikkukupla.
- **Kaksisävy:** `Loppu` syvä sininen, `siivous` kirkas sininen, `.fi` syvä.
- **Symboli/favicon:** yksittäinen kupla-o (= sama kuin sanamerkin o), skaalattu tiileen. Sininen squircle valkoisella kuplalla (favicon/app), navy-ympyrä (profiili).

### Tiedostot (`brand-assets/logos/`)
| Tiedosto | Käyttö |
|---|---|
| `loppusiivous-logo.png` | Sanamerkki, vaalea tausta (läpinäkyvä) |
| `loppusiivous-logo-white.png` | Sanamerkki, tumma tausta |
| `symbol.svg` | Pelkkä kupla-merkki (sininen) |
| `symbol-navy.svg` | Profiilikuva (navy ympyrä) |
| `favicon.svg` + `favicon-*.png` + `favicon.ico` | Favicon-setti 16–512 px |

> Sanamerkki renderöidään webissä HTML+SVG-komponenttina (Gabarito + inline-SVG kuplat). Lähde: `brand-assets/_render/wordmark.html`.

## Värit (päivitetty 7/2026 — yksi sininen kaikkialla)

Koko järjestelmä on johdettu yhdestä sävykulmasta (210°, "järvensininen"): sama sininen logossa, napeissa, linkeissä ja paneeleissa. Kaikki tekstiparit läpäisevät WCAG AA:n (≥4,5:1) — laskettu, ei arvattu.

| Nimi | HEX | Käyttö |
|---|---|---|
| **Pisara-kirkas** | `#2489F0` | IDENTITEETTI: logon KAIKKI grafiikka (pisara, kimallus, kuplat, "siivous", pyyhkäisy) — ei koskaan tekstipohjana |
| **Järvensininen** | `#0968C8` | TOIMINTA: napit, linkit, hintapaneelit, footer — kaikki interaktiivinen |
| Hover | `#0755A6` | Nappien hover-tila |
| Paneeligradientti | `#0968C8 → #0752A0` | Laskurin hintapaneeli, −40 %-paneeli |
| Footer-gradientti | `#0A5FB8 → #074A92` | Mega-footer |
| Vaalea koriste | `#4C8FE8` / `#7FB0F5` | Koristegradientit, footer-logon aksentti |
| Ink | `#0D3A6E` | Otsikot, "Loppu", tumma teksti |
| Tint | `#EDF4FF` / `#F7FAFF` | Vuorottelevat vaaleat osiot |
| Viivat | `#D9E6F8` / `#C2D6F0` | Reunaviivat |
| Leipäteksti | `#44607C` | Body (6,5:1 valkoisella) |
| Muted | `#59728C` | Aputeksti — vaalein sallittu tekstiharmaa (4,6:1 tintillä) |

**Sääntö:** yksi sävykulma (210°), kaksi voimakkuutta. Kirkas `#2489F0` on vain identiteettiä (logo & koristeet — grafiikkaa, ei tekstiä). Syvä `#0968C8` on ainoa toimintaväri (napit, linkit, tekstipohjat). Tummia tasavärisiä pintoja (navy) ei käytetä.

## Typografia
- **Otsikot & logo:** Gabarito (700–900)
- **Leipäteksti:** Inter (400–700)

## Sävy / äänensävy
Selkeä, rehellinen, asiantunteva mutta lähestyttävä. Korostetaan läpinäkyvyyttä (kiinteä 70 €/h, "mitä ei kuulu") ja lopputulosta ("jälki, joka kestää tarkastuksen").

## Ydinviestit
- Muuttosiivous, jonka jälki kestää tarkastuksen
- Selkeä tuntihinta 70 €/h, ei piilokuluja
- Joustava aikataulu, pääkaupunkiseutu
- Ammattilaiset ja välineet mukana

## Avoimet (täytä ennen julkaisua)
- [x] Oikea puhelinnumero: `045 875 5996`
- [ ] Vahvista sähköposti `info@loppusiivous.fi`
- [ ] Y-tunnus / yritystiedot footeriin
- [ ] Tarkka toimialue
- [ ] Domain `loppusiivous.fi` → Vercel + DNS
