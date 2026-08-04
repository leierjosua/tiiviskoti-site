# TiivisKoti — brändigrafiikat

Kaikki tiedostot on tehty sivuston omista väreistä ja fontista, joten ne
ovat samaa perhettä kuin tiiviskoti.fi.

| | |
|---|---|
| Vihreä | `#217A4E` |
| Tummin vihreä | `#183A28` |
| Syvä (taustat) | `#163A28` |
| Kirkas vihreä | `#2E9E63` |
| Vaalea tausta | `#F6F7F3` |
| Amber | `#E0A63A` |
| Fontti | **Manrope**, lihavuus 800 otsikoissa (ilmainen, Google Fonts) |

## Paitaan ja painotuotteisiin

**`logo-merkki-valkoinen.svg`** — tämä on paidan tiedosto.

Pelkkää geometriaa: ei tekstiä, ei fonttiriippuvuutta, läpinäkyvä tausta,
yksi väri. Skaalautuu rintataskusta selän täyteen. Neliö on ääriviiva eikä
täyttö, joten valkoista mustetta menee vähemmän ja kuvio pysyy kankaalla
kevyenä.

`logo-merkki-valkoinen-4000.png` on sama 4000 × 4000 px läpinäkyvänä, jos
painaja haluaa mieluummin kuvatiedoston.

**`logo-valkoinen.svg`** — logo nimellä. Huom: nimi on `<text>`-elementtinä,
joten pyydä painajaa muuntamaan teksti poluiksi ("convert text to outlines")
tai asentamaan Manrope. Jos et halua ottaa riskiä, käytä
`logo-valkoinen-4000.png`:tä, jossa fontti on jo piirretty kuvaksi.

**`logo-vihrea-4000.png`** — vaalealle pohjalle (laskut, tarjoukset, teipit).

## Facebook

| Tiedosto | Koko | Mihin |
|---|---|---|
| `fb-profiilikuva-1080.png` | 1080 × 1080 | Profiilikuva |
| `fb-kansikuva-1640x856.png` | 1640 × 856 | Kansikuva |
| `fb-julkaisu-hinta-1080.png` | 1080 × 1080 | Julkaisu: hinnasto |
| `fb-julkaisu-veto-1080.png` | 1080 × 1080 | Julkaisu: miksi tiivistää |

### Mainokset

Seitsemän mainosta, jokainen kahdessa koossa: `-1080.png` (neliö) ja
`-1080x1350.png` (4:5, pysty). **Käytä pystyversiota Facebookin syötteessä** —
se vie enemmän ruudun korkeutta kuin neliö.

| Tiedosto | Kulma | Kenelle |
|---|---|---|
| `fb-mainos-veto-*` | Kylmä veto ei kuulu kotiin | Kylmä yleisö |
| `fb-mainos-hinta-*` | 95 € / 119 €, hinta näkyy etukäteen | Harkintavaihe |
| `fb-mainos-saasto-*` | 10–15 % lämmityskuluista | "Miksi vaivautua" |
| `fb-mainos-taloyhtio-*` | Rappukäytävät kerralla kuntoon | Taloyhtiöiden hallitukset |
| `fb-mainos-vahennys-*` | 95 € → 68 € kotitalousvähennyksellä | Hintaherkät |
| `fb-mainos-syksy-*` | Ennen pakkasia | Kausikampanja, elo–marraskuu |
| `fb-mainos-varaus-*` | Ei tarjouspyyntöä, ei odottelua | Uudelleenkohdennus |

### Mainosgrafiikoiden muokkaus

Kolme `fb-mainos-*`-kuvaa syntyvät yhdestä lähteestä, joten tekstin voi
vaihtaa ilman kuvankäsittelyohjelmaa:

1. muokkaa `ads/fb-mainokset.html` (tekstit ovat suoraan HTML:ssä),
2. käynnistä dev-palvelin: `cd tiiviskoti && node _serve.mjs`,
3. renderöi repon juuresta: `node tiiviskoti/brand/ads/build-fb-mainokset.mjs`.

Kuvat tulevat sivuston omista työkuvista (`img/`, `print/`), eivät
kuvapankista — samat kuvat siis mainoksissa ja sivustolla.

**Profiilikuvassa on tarkoituksella vain merkki, ei nimeä.** Facebook rajaa
profiilikuvan ympyräksi ja näyttää sen syötteessä noin 32 px kokoisena — siinä
koossa teksti ei ole luettavissa, ja sivun nimi näkyy joka tapauksessa kuvan
vieressä. Tunnistettavuus tulee merkistä.

**Kansikuvassa sisältö on keskellä.** Facebook näyttää kansikuvan
työpöydällä kokonaan mutta rajaa puhelimessa reunoilta, joten teksti ja
yhteystiedot on pidetty turvallisella keskialueella.

## Jos teet lisää grafiikkaa

Julkaisugrafiikoissa toistuu sama rakenne, jotta ne näyttävät samalta
perheeltä: pieni vihreä yläotsikko versaalilla, iso lihava väite, lyhyt
selittävä teksti, ja alalaidassa merkki + `tiiviskoti.fi` + puhelinnumero.
Tumma ja vaalea versio vuorottelevat.
