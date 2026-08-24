# Shorts-mainosten renderöinti (Remotion)

Tekee talking-head-videosta Metan Reels-mainoksen: karaoke-tekstitys, koukku
yläreunaan ja animoitu varausvaihe-widget. Muoto seuraa kilpailija AaltoAirin
mainoksia (todennettu Metan mainoskirjastosta 24.8.2026), värit ovat TiivisKodin.

## Ketju

1. **Ääni ulos**
   `ffmpeg -i Video-1.mov -vn -ac 1 -ar 16000 -c:a pcm_s16le audio/v1.wav`
2. **Puheentunnistus sanatasolla**
   `whisper-cli -m ggml-large-v3-turbo.bin -l fi -ml 1 -sow -ojf -of audio/v1 audio/v1.wav`
   `-ml 1 -sow` on pakollinen: ilman niitä saa vain lausetason ajat.
3. **Sanalista** — poimi `offsets` suoraan whisperin JSONista → `words-aligned.json`
4. **Äänitehosteet** — `python3 sfx.py` syntetisoi widgetin äänet (ei samplekirjastoja)
5. **Renderöinti** — `cd remotion && npx remotion render shorts-1 out/r1.mp4 --crf=18`
6. **Ääni: tasaus + tehosteet samalla kertaa**
   ```
   ffmpeg -i out/r1.mp4 -i sfx/v1.wav \
     -filter_complex "[0:a]loudnorm=I=-14:TP=-1.5:LRA=11[sp];\
                      [sp][1:a]amix=inputs=2:duration=first:normalize=0[a]" \
     -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k lopullinen.mp4
   ```
   `normalize=0` on pakollinen: ilman sitä amix puolittaa puheen äänenvoimakkuuden.

`remotion/public/` tarvitsee lähdevideot (`Video-1..3.mov`) ja fontin
(`Manrope-ExtraBold.ttf`). Niitä ei ole repossa koska ne ovat isoja.

## Miksi Remotion eikä aiempi HTML→PNG-putki

Ensimmäinen versio latoi valmiit PNG-tilat framejonoksi. Se toimi, mutta
jokainen muutos oli hyppy: widget vaihtoi tilaa kertarysäyksellä ja tekstitys
välähti. Remotionissa jokainen frame on oma renderöinti, joten `spring()`
antaa oikean liikkeen — kortti nousee, valintamerkki piirtyy viivana,
korostus skaalautuu. **Josua hylkäsi Remotionin 2026-08-18**, mutta se koski
generoitua animaatiota oikean kuvamateriaalin sijaan; tässä Remotion vain
piirtää overlayn oikean videon päälle, ja hän pyysi sitä itse 24.8.

## Ajastus — tämä meni pieleen kahdesti, lue ennen kuin koskette

**Ongelma ei ollut puheentunnistuksessa.** Mitattiin: whisperin mediaanivirhe
on −20 ms. Kokeiltiin myös DTW-kohdistusta (`-nfa -dtw large.v3.turbo`;
huom, DTW vaatii flash attentionin POIS) — se ei ollut parempi. Kokeiltiin
energiapohjaista napsautusta puheen alkuihin — se **huononsi** tulosta, koska
se siirsi sanoja jopa 210 ms epäluotettavan tunnistimen perusteella. Molemmat
hylättiin. Käytä whisperin omia `offsets`-aikoja sellaisenaan.

Vika oli esitystavassa. Neljä korjausta, kaikki `Captions.tsx`:ssä:

1. **Rivi ruudulle 260 ms etuajassa** ja sisääntulo valmis ennen ensimmäistä
   sanaa. Aiemmin rivi tuli vasta sanan alkaessa ja animoitui vielä puheen
   päälle — koko rivi tuntui myöhässä vaikka ajastus oli oikein.
2. **Korostuksen johto enintään 40 % sanan kestosta.** Kiinteä 90 ms ehti
   lyhyessä sanassa ("Me", 70 ms) jo seuraavaan sanaan.
3. **Korostus napsahtaa 50 ms:ssä, ei jousella.** Jousen huippu tuli äänen
   jälkeen, ja juuri se lukeutuu "off beatiksi".
4. **Rivinvalinta ottaa viimeisimmän osuvan rivin**, mutta uusi rivi ei saa
   ottaa ruutua ennen kuin edellisen rivin viimeinen sana on saanut 140 ms
   korostusta — eikä koskaan myöhemmin kuin oman ensimmäisen sanan alussa.
   Rajaa EI saa sitoa edellisen sanan loppuaikaan: whisperin loppuajat menevät
   seuraavan sanan alun päälle, jolloin rivin ensimmäinen sana jää korostamatta.

**Tarkistus on automatisoitavissa:** poimi frame jokaisen sanan alkuhetkellä ja
laske brändivihreiden pikselien määrä tekstitysalueelta. Tavoite on 63/63.
Tällä löytyi kaksi bugia jotka silmä ei erottanut yksittäisistä ruuduista.

## Selain

Remotion lataa oman Chrome Headless Shellinsä (`npx remotion browser ensure`).
**Älä pakota `setBrowserExecutable`illa järjestelmän Chromeen** — se ei saa
yhteyttä Remotionin localhost-bundleriin ja renderöinti kaatuu virheeseen
"Visited http://localhost:3001/index.html but got no response".

## Korostustyyli — älä palauta vihreitä laatikoita

Ensimmäisissä versioissa puhuttava sana oli täytetyssä brändivihreässä
laatikossa (sama kuin AaltoAirilla). **Josua poisti ne 24.8.: "ne on liikaa".**
Nyt aktiivinen sana erottuu kirkkaudella (muut 62 %) ja pienellä skaalalla,
ja koukun kärkisana on mintunvihreä VÄRI ilman laatikkoa.

Reunus (`WebkitTextStroke`) on nyt KAIKILLA sanoilla, myös aktiivisella.
Laatikkoversiossa aktiiviselta sanalta otettiin reunus pois, koska tausta
kantoi kontrastin — ilman laatikkoa se on pakko olla, muuten sana katoaa
vaaleaan taustaan juuri kun sen pitäisi erottua eniten.

## Äänitehosteet

`sfx.py` syntetisoi widgetin äänet numpylla: pyyhkäisy kun kortti nousee,
nouseva sävel joka askeleella ja matala tömäys hintapalkille. Valmiita
sampleja ei käytetä, joten lisenssistä ei tarvitse huolehtia. Huippu on
n. −18 dBFS eli tehosteet istuvat puheen alle, eivät sen päälle.

Kilpailijan mainosten musiikkiraitaa EI kopioida — se on heidän lisensoimansa.

## Turva-alueet

Reelsin oma käyttöliittymä syö ylhäältä n. 250 px ja alhaalta n. 400 px.
`brand.ts`:n `SAFE_TOP` / `SAFE_BOTTOM` pitävät tekstit näiden välissä.
Tekstitys on 46 px ja widget 640 px leveä — isommilla ne peittivät kasvot.

## Huom

Puheentunnistus kuuli "Paleliko" muodossa "Paljeliko"; korjaus on
`Short.tsx`:n `FIX`-taulukossa. Puhekieltä ("tarvii", "nytte") EI korjata
kirjakieleksi — se on käsikirjoituksissa tarkoituksellista.

Vaatimukset: `brew install ffmpeg whisper-cpp` + whisper-malli
`ggml-large-v3-turbo.bin` (n. 1,6 GB).
