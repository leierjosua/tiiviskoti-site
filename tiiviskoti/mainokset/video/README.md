# Videomainoksen tekstitasot

Lähdemateriaali: Driven kansio `1Kmlx6aWfuZfXZlHwvngT0QWcx8JNzJKy`, neljä
`.mov`-tiedostoa (teksti / ei tekstiä × 9:16 / 4:5), 41,64 s, 25 fps, 1080 px
leveitä. Tekstitasot ladotaan "ei tekstiä" -versioon.

## Ajoitus

Iskujen ajat on **mitattu**, ei arvattu: teksti- ja tekstitön versio erotettiin
kuva kuvalta (`|withtext − notext|`), ja erotus on täsmälleen tekstitaso.

| Isku | Sisään | Ulos | Sisältö |
|---|---|---|---|
| 1 | 4,75 s | 9,25 s | Ikkunan tiivistys alk. 75 € / ankkuri 1 200 € |
| 2 | 11,25 s | 15,75 s | Lasi ja karmi ehjät? → tiivisteet uusitaan |
| 3 | 18,75 s | 23,00 s | Lämmityskausi alkoi / pienin käynti 149 € |
| — | 37,75 s | loppuun | Lopputaulun hintarivin korjaus |

Kuvamateriaali loppuu ristihäivytykseen ~25 s kohdalla, minkä jälkeen tulee
vihreä lopputaulu.

## Lopputaulu on poltettu myös "ei tekstiä" -versioon

**Tämä on tärkein rajoite.** Vihreä loppuosa (25 s → loppu) on identtinen
molemmissa Driven versioissa: "Näin varaat tiivistyksen verkossa", varauskortin
animaatio ja lopputaulu ovat poltettuja. Niitä ei voi vaihtaa ilman alkuperäistä
projektitiedostoa.

Lopputaulun hintarivi oli `Ikkuna 95 € · ulko-ovi 119 € · pienin käynti 149 €`.
Kaksi kolmesta luvusta on väärin `tiiviskoti/pricing.mjs`:ää vasten (6.9.2026):

| Rivillä | Totuus (`pricing.mjs`) |
|---|---|
| Ikkuna 95 € | 90 / 85 / 80 / 75 € määrän mukaan → **alk. 75 €** |
| ulko-ovi 119 € | **99 €** (`TYPES.ulko`) |
| pienin käynti 149 € | 149 € ✔ (`MIN_PRICE`) |

`make-patch.py` poistaa rivin täyttämällä kaistan pystysuoralla
interpoloinnilla (tausta on loiva liuku, jonka alla on tyhjää) ja `build.sh`
latoo tilalle oikean rivin. Tausta on asettunut 37,7 s kohdalla ja poltettu
rivi ilmestyy 37,8 s, joten paikka voidaan kytkeä päälle ilman häivytystä.

**Jos lopputaulu joskus renderöidään uudelleen, korjaa hinnat lähteessä ja
poista tämä paikkaus.**

## Mitä alkuperäisestä tekstistä muutettiin ja miksi

- **Hierarkia kääntyi.** Alkuperäisessä "1200 €" oli ruudun suurin elementti.
  Ankkuri on perustelu, ei lupaus — ks. `_niukka.css`:n `.anchor`-kommentti.
  Nyt otsikkona on tarjous (75 €) ja ankkuri on alarivi.
- **"Kulusäästö jopa 15 %" poistettiin.** Väitettä ei ole missään elävässä
  mainoksessa eikä sille ole mittausta. Tilalla livemainoksen oma,
  tarkistettava lupaus siitä mitä pienin käynti sisältää.
- **Kirjoitusvirhe.** Alkuperäisessä luki "tiividsteiden vaihdosta".
- **Vihreä vaihtui.** Korostus oli kirkas neonvihreä; nyt brändin
  mintunvihreä `#A8E3C4`, sama kuin staattisissa mainoksissa.
- **Varjostin lisättiin.** Teksti kellui suoraan kuvan päällä ja lakin
  "TiivisKoti"-teksti näkyi sen läpi.

Teksti on Meta-mainosten TK37/TK38 otsikosta ja rungosta sanasta sanaan.

## Ajojärjestys

```sh
node tiiviskoti/mainokset/video/render-overlays.mjs          # HTML → läpinäkyvä PNG
python3 tiiviskoti/mainokset/video/make-patch.py A.mov B.mov # lopputaulun paikka
tiiviskoti/mainokset/video/build.sh <lähde> <kohde>          # poltto
```

`make-patch.py` lukee taustan lähdevideosta, joten se on ajettava aina kun
lähdemateriaali vaihtuu.

---

# Lyhytversiot (hintakulma)

`build-variations.py` tekee viisi pituutta × kaksi kuvasuhdetta. **Kaikki
ajavat samaa kulmaa** — "Ikkunan tiivistys alk. 75 € / uusi ikkuna maksaisi
1 200 €" — eli testattava muuttuja on pituus ja kuvavalinta, ei kärki.

| Versio | Kesto | Tekstit |
|---|---|---|
| `tk-hinta-08s` | 7,5 s | pelkkä hinta, näkyvissä koko ajan |
| `tk-hinta-10s` | 10,0 s | hinta → pienin käynti |
| `tk-hinta-12s` | 12,5 s | hinta → mekanismi → pienin käynti |
| `tk-hinta-15s` | 15,0 s | sama väljemmin |
| `tk-hinta-20s` | 19,9 s | + hinta toistuu lopussa |

Hintakortti on oma muotonsa (`_video.css`, `.block.hero`): otsikko 104 px ja
ankkuri omassa pillerissään, jotta 1 200 € on luettavissa myös vaalealla
ikkunapinnalla. Ankkuria ei yliviivata — yliviivaus lukisi "ennen 1 200 €,
nyt 75 €", ja ne ovat eri työ.

**Vihreä loppuosa on jätetty kokonaan pois** (Josua 18.9.). Mukana on vain
kuvamateriaali 0–24,3 s. Samalla poistui lopputaulun väärä hintarivi, joten
näihin ei tarvita `make-patch.py`:tä lainkaan. CTA tulee Metan omasta
lomakepainikkeesta (GET_QUOTE), joten loppuruutua ei tarvita.

Viimeinen teksti jätetään ruutuun loppuun asti ilman uloshäivytystä: hinta on
näkyvissä myös viimeisessä ruudussa.

Ääni on musiikkia (mitattu: vain 5 % 0,1 s ikkunoista alle 10 % huipusta →
ei puhetta), joten se otetaan yhtenäisenä lähteen alusta eikä leikata kuvan
mukana — sävelkulku ei katkeile vaikka kuva hyppii.
