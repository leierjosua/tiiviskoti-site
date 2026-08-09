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

Kymmenen mainosta, jokainen kahdessa koossa: `-1080.png` (neliö) ja
`-1080x1350.png` (4:5, pysty). **Käytä pystyversiota Facebookin syötteessä** —
se vie enemmän ruudun korkeutta kuin neliö.

| Tiedosto | Kulma | Kenelle |
|---|---|---|
| `fb-mainos-veto-*` | Kylmä veto ei kuulu kotiin | Kylmä yleisö |
| `fb-mainos-veto-edut-*` | Sama kuva + säästö ja kotitalousvähennys | Kylmä yleisö, A/B-pari veto-mainokselle |
| `fb-mainos-hinta-*` | 95 € / 119 €, hinta näkyy etukäteen | Harkintavaihe |
| `fb-mainos-saasto-*` | 10–15 % lämmityskuluista | "Miksi vaivautua" |
| `fb-mainos-taloyhtio-*` | Rappukäytävät kerralla kuntoon | Taloyhtiöiden hallitukset |
| `fb-mainos-vahennys-*` | 95 € → 68 € kotitalousvähennyksellä | Hintaherkät |
| `fb-mainos-syksy-*` | Ennen pakkasia | Kausikampanja, elo–marraskuu |
| `fb-mainos-varaus-*` | Ei tarjouspyyntöä, ei odottelua | Uudelleenkohdennus |
| `fb-mainos-talvi-*` | Tunsitko viime talvena vetoa ikkunoista? + säästö ja vähennys | Kylmä yleisö, kausikampanja |
| `fb-mainos-kokonaisuus-*` | Yksi käynti, ovi ja ikkunat kuntoon | Facebook-ryhmät; ne jotka luulevat palvelun olevan pelkkä tiivistevaihto |

**Kokonaisuusmainoksen otsikko on tarkoituksella neutraali.** Aiempi versio
kuului "Emme vaihda vain tiivisteitä", mutta kielto- ja me-muotoinen otsikko
lukeutuu Facebook-ryhmässä myyntipuheeksi, ei naapurin vinkiksi. Sama sisältö
kerrotaan nyt leipätekstissä ja siruissa.

Talvi- ja kokonaisuusmainoksessa on **oman työn valokuvat** (`img/tyo-tiivisteen-asennus.jpg`
ja `img/tyo-oven-karmi.jpg`), joissa näkyy TiivisKoti-lippis. Ne ovat toistaiseksi
vain mainoskäytössä, eivät sivustolla.

**Kokonaisuusmainoksen sirut listaavat vain hintaan kuuluvat asiat.** Helat,
käyntivälys, akryylisaumaus ja kahvan vaihto ovat käyttöehtojen mukaan
erikseen veloitettavia lisätöitä, joten ne mainitaan leipätekstissä sanalla
"lisätyönä" — siru antaisi niistä maksuttoman vaikutelman.

### Mainosgrafiikoiden muokkaus

Kaikki `fb-mainos-*`-kuvat syntyvät yhdestä lähteestä, joten tekstin voi
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

Tausta on brändivihreä (`#217A4E`) eikä tummin vihreä: 32 px koossa tummin
vihreä näyttää käytännössä mustalta eikä erotu muista profiilikuvista.
Merkki on n. 55 % leveydestä, jolloin ympyrärajaus ei koske siihen.

**Kansikuvassa sisältö on keskellä.** Facebook näyttää kansikuvan
työpöydällä kokonaan mutta rajaa puhelimessa reunoilta noin 75 %:iin, joten
teksti ja yhteystiedot on pidetty turvallisella keskialueella. Alalaita on
jätetty tyhjäksi, koska työpöydällä profiilikuva peittää vasemman alakulman.

Molemmat syntyvät tiedostosta `ads/fb-profiili.html`:

    cd tiiviskoti && node _serve.mjs          # dev-palvelin päälle
    node tiiviskoti/brand/ads/build-fb-profiili.mjs   # repon juuresta

## Jos teet lisää grafiikkaa

Julkaisugrafiikoissa toistuu sama rakenne, jotta ne näyttävät samalta
perheeltä: pieni vihreä yläotsikko versaalilla, iso lihava väite, lyhyt
selittävä teksti, ja alalaidassa merkki + `tiiviskoti.fi` + puhelinnumero.
Tumma ja vaalea versio vuorottelevat.
