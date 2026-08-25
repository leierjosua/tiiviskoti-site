/* =========================================================
   "Työhön sisältyy" — mitä jokaiseen tiivistykseen kuuluu.

   MIKSI OMA TIEDOSTO: sama lista renderöityy kolmeen paikkaan (lomakkeen
   oletukset, tarjous-PDF, tarjoussähköposti). Yhdessä paikassa se pysyy
   samana joka tarjouksessa — kolmessa se ehtii erkaantua ensimmäisen
   sanamuodon hionnan aikana.

   EI 'server-only': lomake on selainkomponentti ja lataa oletukset tästä.

   TÄRKEÄ RAJA HINNASTOON: listalla saa luvata vain sen mikä sisältyy
   perushintaan. `pricing.ts`:n lisätyöt ovat maksullisia — erityisesti
   "Helojen ja käyntivälyksen säätö" (15 €/ikkuna) ja "Karmin ja seinän
   välin akryylisaumaus" (19 €/aukko). Siksi säätörivi puhuu ovista
   (ovissa käynnin säätö kuuluu hintaan) ja silikonirivi kiinnityspinnan
   pohjustuksesta — ei karmisaumasta. Jos näitä sanamuotoja löysää, myyt
   lisätyöt ilmaiseksi jokaisessa tarjouksessa.

   TAKUU EIKÄ VASTUUVAKUUTUS OLE LISTALLA — tietoinen valinta (25.8.2026).
   Molemmat ovat olemassa ja lukevat sivuston FAQ:ssa, mutta lista kertoo
   mitä KÄYNNILLÄ TEHDÄÄN, ei mitä yritys on. Älä lisää niitä takaisin
   ilman että kysyt.

   Lista on tarjouskohtaisesti muokattavissa: rivejä voi poistaa, muokata
   ja lisätä lomakkeella, ja tallennettu lista tulee kannasta (db/022).
   Nämä ovat vain se mistä jokainen tarjous lähtee liikkeelle.
   ========================================================= */

export const DEFAULT_INCLUSIONS: string[] = [
  'Aukkojen tarkastus ja oikean tiivistetyypin valinta kohteen mukaan',
  'Vanhojen tiivisteiden poisto ja kiinnityspintojen puhdistus',
  'Silikonimassan levitys kiinnityspinnalle tarvittaessa',
  'Uusien tiivisteiden asennus — tiivisteet ja tarvikkeet sisältyvät hintaan',
  'Ovien käynnin säätö ja saranoiden rasvaus',
  'Ikkunoiden ja ovien toimivuuden tarkastus työn jälkeen',
  'Työalueen suojaus ja siivous — vanhat tiivisteet ja jätteet viedään pois',
  'Kirjallinen raportti huollon vaiheista ja käytetyistä tuotteista',
];

/** Enintään näin monta riviä. Sama raja lomakkeella, palvelimella ja kannassa. */
export const MAX_INCLUSIONS = 20;

/** Yhden rivin enimmäispituus. Rivi on luettelon kohta, ei kappale tekstiä. */
export const MAX_INCLUSION_LEN = 140;

/**
 * Siivoa rivilista tallennuskuntoon: tyhjät pois, pituudet rajaan,
 * enintään `MAX_INCLUSIONS` riviä.
 *
 * Tyhjä tulos palautuu tyhjänä listana eikä oletuksina: tyhjä lista on
 * käyttäjän päätös jättää osio pois tästä tarjouksesta, ja oletusten
 * palauttaminen tekisi siitä päätöksestä mahdottoman.
 */
export function cleanInclusions(rows: readonly string[]): string[] {
  return rows
    .map((r) => r.replace(/\s+/g, ' ').trim().slice(0, MAX_INCLUSION_LEN))
    .filter(Boolean)
    .slice(0, MAX_INCLUSIONS);
}
