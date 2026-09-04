# TiivisKoti — Brändiohjeisto

Ulko-ovien tiivistevaihdon erikoisliike. Brändin ydin: **lämmin, luotettava, säästävä** — "veto loppuu, lämpö jää kotiin".

## Nimi & sanamerkki
- **Sanamerkki:** `TiivisKoti` (yhteen kirjoitettu, kaksisävy)
- **Fontti:** **Gabarito** (Google Fonts), paino 800. Leipäteksti **Inter**.
- **Kaksisävy:** `Tiivis` tummanvihreä (ink), `Koti` kirkas vihreä.
- **Symboli/favicon:** vihreä squircle, jossa kerman­valkoinen ovi ja **amber-värinen tiivistelista** oven reunassa + pieni ovenkahva.

## Värit — tummanvihreä + lämmin beige
Yksi vihreä sävykulma (152°), kaksi voimakkuutta. Amber-hunaja on lämpöaksentti (sisälle jäävä lämpö) — käytetään grafiikassa ja CTA:ssa, ei tekstipohjana vaalealla.

| Nimi | HEX | Käyttö |
|---|---|---|
| **Tummanvihreä** | `#215A43` | TOIMINTA: napit, logo, hintapaneelit — luotettavuus, koti, säästö |
| Vihreä hover | `#184736` | Nappien hover |
| Ink (syvin) | `#123528` / `#1C3A2D` | Otsikot, "Tiivis", tummin teksti |
| Bright accent | `#3E8E6B` | Logon "Koti", grafiikka |
| Light accent | `#77C6A0` | Uusi tiiviste -visuaali, koristeet |
| **Amber / hunaja** | `#E0A44E` | LÄMPÖ: CTA-napit, hehku, tähdet — kodikkuus |
| Amber vaalea | `#F2C879` | Kohokohta-teksti tummalla, hero-korostus |
| **Kerma (paperi)** | `#FBF7EF` | Sivun päätausta — lämpö |
| Beige tint | `#F4ECDB` | Vuorottelevat osiot |
| Panel/sand | `#EFE4CD` | Kortit, ikonipohjat |
| Leipäteksti | `#4B5A50` | Body (n. 7:1 kermalla) |
| Muted | `#6E7A6F` | Aputeksti |
| Viivat | `#E7DCC6` / `#D8C6A4` | Reunaviivat |

**Sääntö:** vihreä = luotettavuus/koti/ympäristö/säästö. Beige/kerma = lämpö/kodikkuus. Amber = "lämpö joka jää sisälle" — vain aksentti.

## Sävy / äänensävy
Lämmin, rehellinen, käytännönläheinen. Korostetaan konkreettista hyötyä: veto loppuu heti, lämmityslasku pienenee, kiinteä hinta ilman yllätyksiä.

## Ydinviestit
- Veto loppuu, lämpö jää kotiin
- Kiinteä hinta heti — alk. 89 €/ulko-ovi, ei piilokuluja
- Jopa −15 % lämmityskuluihin, kotitalousvähennys −40 %
- Laadukkaat silikonitiivisteet + oven käynnin säätö
- Automaattinen ajanvaraus verkosta, koko Uusimaa

## Hinnoittelu (kiinteät hinnat, sis. tiivisteet + työ + oven säätö)
| Kohde | Hinta |
|---|---|
| Ulko-ovi (sivutiivisteet + kynnyskumi, säätö) | 89 € |
| Parvekeovi | 79 € |
| Terassi- / liukuovi | 109 € |
| Väli- / huoneovi | 49 € |
| Ikkuna | 39 € |
| Pelkkä kynnyskumi | 45 € |
| **Minimiveloitus** (sis. kotikäynnin) | 120 € |

Lisät: saranoiden & lukon säätö +25 €, postiluukun tiivistys +19 €, karmin tilkitseminen +35 €, lukkorungon huolto +29 €, tuuletusventtiilin huolto +22 €.

Kotitalousvähennys: −40 % työn osuudesta (netto ≈ 72 % hinnasta), max 2 250 € / henkilö (2026).

## Tiedostot
- `index.html` — koko landing page (hero-animaatio, hintalaskuri, energiansäästö, automaattinen kalenterivaraus, UKK). Itsenäinen, ei riippuvuuksia.
- `../scripts/video/src/TiivisKotiPost.tsx` — Remotion-mainos (1080×1350, 12 s). Renderöi: `cd scripts/video && npx remotion render src/index.ts TiivisKotiPost out/tiiviskoti-promo.mp4`
- `_serve.mjs` — kevyt paikallinen esikatselupalvelin (`node _serve.mjs` → http://localhost:8799).

## Avoimet (täytä ennen julkaisua)
- [ ] Vahvista puhelinnumero (nyt sisarbrändin `045 875 5996`)
- [ ] Sähköposti `info@tiiviskoti.fi`
- [ ] Y-tunnus / yritystiedot footeriin
- [ ] Domain `tiiviskoti.fi` → hosting + DNS
- [ ] Kytke kalenterivaraus oikeaan backendiin (nyt itsenäinen demo, slotit generoidaan selaimessa)
