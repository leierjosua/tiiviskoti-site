# TiivisKoti — Meta-mainosten julkaisupaketti (5 mainosta)

Kuvat: `out/*.png` (2160×2700, 4:5). Lataa kukin uudeksi mainokseksi Ads Manageriin.
Ad-tili 205952163658187 · Sivu 556560117546812.

**Suositus:** älä POISTA vanhoja mainoksia — laita ne **Pause** (oppimishistoria ja
data säilyvät, voi palauttaa). Nosta uudet 5 samaan/uuteen ad setiin testiin.

Kaikki 4:5-kuvat toimivat Feedissä. Stories/Reels (9:16) tehdään erikseen jos halutaan.

---

## 1 · mainos-veto.png  — kipukärki (KilpiLasin ykkösformaatti)
- **Kohde (URL):** https://tiiviskoti.fi/varaa.html
- **CTA-nappi:** Varaa / Book now
- **Otsikko:** Kiinteä hinta · lämpökamera sisältyy
- **Ensisijainen teksti:**
  Vetääkö ulko-ovista tai ikkunoista? 🥶 Usein pieni tiivistys — ei kallis remontti —
  säästää eniten lämmityksessä. Kiinteä hinta heti, lämpökamerakuvaus sisältyy,
  2 vuoden takuu. Koko Uusimaa. 👉 Varaa aika: tiiviskoti.fi

## 2 · mainos-hinta.png — kiinteät hinnat (ero KilpiLasin laskuriin)
- **Kohde (URL):** https://tiiviskoti.fi/varaa.html
- **CTA-nappi:** Varaa / Book now
- **Otsikko:** Ikkuna alk. 65 € · ulko-ovi 119 €
- **Ensisijainen teksti:**
  Ovien ja ikkunoiden tiivistys kiinteään hintaan — ei arviolaskuria, näet summan heti.
  Ikkuna alk. 65 €, ulko-ovi 119 €, pienin käynti 149 € (sis. lämpökamerakuvauksen).
  Kotitalousvähennys −40 %. 👉 Katso hinnat: tiiviskoti.fi

## 3 · mainos-asentaja.png — ammattilainen / luottamus (UGC-tyyli)
- **Kohde (URL):** https://tiiviskoti.fi/varaa.html
- **CTA-nappi:** Varaa / Book now
- **Otsikko:** Ammattiasennus samana päivänä
- **Ensisijainen teksti:**
  Ammattiasennus samana päivänä. Ovien ja ikkunoiden tiivisteiden vaihto, oven käynnin
  säätö ja lämpökamerakuvaus — kiinteään hintaan, ei arvioita. 2 vuoden takuu,
  koko Uusimaa. 👉 Varaa aika: tiiviskoti.fi

## 4 · mainos-taloyhtio.png — taloyhtiöt (B2B, liidi)
- **Kohde (URL):** https://tiiviskoti.fi/taloyhtio.html
- **CTA-nappi:** Pyydä tarjous / Get quote
- **Otsikko:** Taloyhtiön ovet & ikkunat kuntoon
- **Ensisijainen teksti:**
  Taloyhtiön ovet ja ikkunat kuntoon — vähemmän vetoa ja lämpöhukkaa koko kiinteistössä.
  Kiinteä tarjous, yksi yhteyshenkilö, vastuuvakuutettu ammattityö.
  👉 Pyydä tarjous: tiiviskoti.fi

## 5 · mainos-lupaus.png — takuu / riskinpoisto
- **Kohde (URL):** https://tiiviskoti.fi/varaa.html
- **CTA-nappi:** Varaa / Book now
- **Otsikko:** 2 vuoden takuu — veto pois
- **Ensisijainen teksti:**
  Veto pois — tai tulemme uudestaan veloituksetta. Ovien ja ikkunoiden tiivistys kahden
  vuoden takuulla, kiinteä hinta ilman yllätyksiä. Koko Uusimaa.
  👉 Varaa aika: tiiviskoti.fi

---

## URL-parametrit (kampanjan mittaus)

Jokaiseen **uuteen** mainokseen kuuluu Ads Managerin *URL-parametrit*-kenttään
(tai `publish.mjs`:n `URL_TAGS`-vakio, joka tekee sen automaattisesti):

```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
```

Ilman tätä sivusto tunnistaa `fbclid`istä että kävijä tuli Metasta ja kirjaa
kampanjaksi `meta-ads`, mutta **ei mistä mainoksesta** — kaikki Meta-liikenne
menee yhteen kasaan adminin "Kävijät kampanjoittain" -raportissa.

**Älä lisää tätä käynnissä olevaan mainokseen.** `url_tags` on osa creativea,
eikä olemassa olevaa creativea voi muokata: sekä Ads Manager että API luovat
muutoksesta uuden creativen, mikä nollaa mainoksen oppimisvaiheen ja sotkee
käynnissä olevan split-testin. Lisää parametrit kun teet seuraavat mainokset.
