# Lasikiilto — ikkunanpesun verkkosivu

Korkealuokkainen, itsenäinen (single-file) verkkosivu ikkunanpesuyritykselle **Lasikiilto**
("glass shine"). Rakennettu Loppusiivous v7 -brändijärjestelmän pohjalta (yksi sävykulma
210°, Gabarito + Inter, sama väripaletti) — sininen sopii lasi-teemaan täydellisesti.

## Ydinominaisuus: ikkunalaskuri

Interaktiivinen laskuri, jossa asiakas valitsee **ikkunatyypit ja määrät** (+/- steppereillä):

| Tyyppi | Hinta/kpl |
|---|---|
| Vakioikkuna | 8 € |
| Parvekelasit | 11 € |
| Iso ikkuna | 14 € |
| Lasiseinä / -ovi | 18 € |
| Kattoikkunat | 16 € |
| Näyteikkuna | 15 € |

Hinta, ikkunamäärä, arvioitu kesto ja kotitalousvähennys (−40 %) päivittyvät reaaliajassa.
Lisäpalvelut (sälekaihtimet, karmit, hyönteisverkot, aurinkopaneelit…) kiinteällä lisähinnalla.
Minimiveloitus 65 €. Hinnat ja logiikka: ks. `TYPES` / `EXTRAS` `index.html`:n `<script>`-lohkossa.

## Korkean tason animaatiot (pelkkää CSS + hiukan JS)

- **Hero:** CSS-lasi-ikkuna, joka "pyyhkäistään" kirkkaaksi (lasta liikkuu, lika häviää maskilla),
  taustalla järvinäkymä, valuvat vesipisarat, kimallussweeppi, kelluvat tähdet ja takuu-badge.
- Reaaliaikaisesti animoituva hintasumma (number tween), stepper-pop, scroll-reveal,
  luottamus-marquee, hover-liikkeet, pyörivä takuuleima, lasin kimallukset laatuosiossa.
- Kunnioittaa `prefers-reduced-motion`.

## Esikatselu paikallisesti

`file://` on estetty selaimessa, joten tarjoile HTTP:n yli. Node (mukana repossa):

```bash
node ../../scripts/... # tai mikä tahansa staattinen palvelin tästä kansiosta
npx serve .            # tai:  python -m http.server 8123
```

Avaa sitten `http://localhost:8123/`.

## Vielä tehtävää ennen julkaisua

- [ ] Oikea puhelinnumero (nyt placeholder 045 875 5996, peritty Loppusiivous-brändistä)
- [ ] Vahvista `info@lasikiilto.fi`, domain, Y-tunnus footeriin
- [ ] Tarkka toimialue ja lopulliset kpl-hinnat
- [ ] (Valinnainen) varauslomake / -taustajärjestelmä, kuten Loppusiivous-sivun BookingCard
- [ ] (Valinnainen) Remotion-mainosvideo `scripts/video`-pipelinellä uudelleenbrändättynä
