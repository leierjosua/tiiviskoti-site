/* =========================================================
   TiivisKoti — toiminta-aluesivujen sisältö.

   YKSI TIEDOSTO PER KUNTA OLISI HELPOMPI YLLÄPITÄÄ, MUTTA
   VAARALLISEMPI: Google kohtelee lähes identtisiä paikkakuntasivuja
   sisääntulosivuina (doorway pages) ja voi pudottaa ne kaikki kerralla.
   Siksi jokaisella kunnalla on tässä OMA `intro`, OMA `lead`, OMAT
   kaupunginosat ja OMAT kysymykset — templaatti hoitaa vain kehyksen
   (navi, hinnat, footer), ei myyntitekstiä.

   Jos lisäät kunnan: kirjoita sille aito, kuntakohtainen teksti. Älä
   kopioi naapurikunnan tekstiä ja vaihda nimeä — se on juuri se kuvio
   josta rangaistaan.

   PALVELUALUE = UUDENMAAN 00xxx–09xxx -KUNNAT + RIIHIMÄKI (11xxx).
   Postinumeron alku ei siis yksin ratkaise, eikä palvelualue ole sama asia
   kuin Uusimaa. Ulkopuolelle jäävät Länsi-Uudenmaan 10xxx-kunnat Hanko,
   Inkoo ja Raasepori — niille tehtiin sivut kertaalleen 2026-08-09 ja ne
   poistettiin heti kun asia tarkistettiin. Riihimäki taas EI ole Uuttamaata
   vaan Kanta-Hämettä, mutta se palvellaan ilman matkalisää.

   ÄLÄ SIIS KIRJOITA SIVUSTOLLE "N kuntaa Uudellamaalla". Se oli totta 23
   kunnan aikaan, mutta Riihimäen myötä väite on väärä. Oikea muoto on
   "Uudellamaalla ja Riihimäellä".

   TARKISTA ENNEN KUIN LISÄÄT KUNNAN. Totuuden lähde on CRM:n `tk.areas`,
   ei tämä tiedosto. Voit varmistaa yhdellä käskyllä ilman CRM-tunnuksia —
   sama julkinen rajapinta jota sivuston laskuri kutsuu selaimesta:

     curl -s "https://tiiviskoti-crm.vercel.app/api/public/availability?postal=10900&days=70&minutes=30"
     -> {"served":false,...}   = ei palvella, älä tee sivua
     -> {"served":true,"area":{"name":"Uusimaa","travelFeeCents":0},...}

   Jos sivu lupaa kunnan jota `tk.areas` ei tunne, asiakas löytää sivun
   Googlesta, valitsee ajan ja saa varauksen torjutuksi 409:llä — pahin
   mahdollinen tapa menettää valmis liidi.
   ========================================================= */

export const SITE = 'https://tiiviskoti.fi';

/* `ine` = inessiivi ("Helsingissä"), `gen` = genetiivi ("Helsingin").
   Suomen taivutus ei ole johdettavissa ohjelmallisesti riittävän
   luotettavasti (Vantaalla on adessiivi, ei inessiivi), joten muodot
   kirjoitetaan käsin. */
export const ALUEET = [
  {
    slug: 'helsinki',
    name: 'Helsinki',
    ine: 'Helsingissä',
    gen: 'Helsingin',
    lead: 'Kantakaupungin vanhat puuikkunat ja lähiöiden 70-luvun parvekeovet — molemmat tiivistyvät samalla käynnillä.',
    intro: 'Helsingin rakennuskanta on Uudenmaan kirjavin, ja se näkyy suoraan työssä. Kantakaupungissa on runsaasti 1900–1940-luvun kerrostaloja, joissa on yhä alkuperäiset kaksipuitteiset puuikkunat. Ne tiivistyvät erinomaisesti, mutta vaativat rauhallista kättä: puitteet ovat vanhoja ja helat alkuperäisiä, eikä niitä kannata väkisin vääntää. Esikaupungeissa painottuvat 1950–70-luvun kerros- ja rivitalot, joissa vika on tyypillisesti alkuperäisessä parvekeoven tiivisteessä ja kynnyskumissa.',
    kulma: 'Merellinen sijainti näkyy etelä- ja länsijulkisivuilla: niillä tuulikuorma on selvästi kovempi, ja tiivisteet litistyvät nopeammin kuin talon suojanpuolella. Käytännössä sama asunto voi olla täysin tiivis pohjoiseen ja vetää etelään.',
    osat: ['Kallio', 'Töölö', 'Punavuori', 'Kruununhaka', 'Munkkiniemi', 'Lauttasaari', 'Käpylä', 'Herttoniemi', 'Vuosaari', 'Oulunkylä', 'Pakila', 'Malmi', 'Kannelmäki', 'Pasila'],
    faq: [
      ['Entä pysäköinti kantakaupungissa?', 'Se on meidän ongelmamme, ei sinun. Hoidamme pysäköinnin itse emmekä veloita siitä erikseen — hinta on sama kuin muuallakin Helsingissä.'],
      ['Saanko vaihtaa kerrostaloasunnon ikkunatiivisteet itse päättäen?', 'Asunnon sisäpuolinen tiivistys ja puitteen tiivisteet kuuluvat yleensä osakkaan vastuulle, mutta ikkunoiden ulkopuoli ja julkisivu ovat taloyhtiön. Käytännössä tavallinen tiivisteiden vaihto onnistuu ilman yhtiön päätöstä. Jos olet epävarma, kysy isännöitsijältä — tai pyydä meidät kartoittamaan koko taloyhtiö kerralla.'],
    ],
  },
  {
    slug: 'espoo',
    name: 'Espoo',
    ine: 'Espoossa',
    gen: 'Espoon',
    lead: 'Espoon yleisin vetokohta ei ole ikkuna vaan terassin liukuovi.',
    intro: 'Espoossa painottuvat 1970–1990-luvun rivi- ja omakotitalot, ja lähes jokaisessa niistä on iso terassin liuku- tai pariovi. Se on talon suurin yksittäinen vuotokohta. Kisko kerää hiekkaa, harjatiiviste kuluu litteäksi ja ovi alkaa vetää selvästi ennen kuin se näyttää rikkinäiseltä — moni luulee vikaa lattialämmityksen puutteeksi. Tapiolan 1950–60-luvun kohteissa tilanne on toinen: siellä ikkunat ovat usein alkuperäisiä ja tiivistys tuo suurimman hyödyn.',
    kulma: 'Liukuoven huolto kannattaa tehdä samalla käynnillä muun tiivistyksen kanssa. Pelkkä tiivisteen vaihto ei riitä, jos kisko on täynnä hiekkaa: ovi hankaa, uusi tiiviste kuluu nopeasti ja ongelma palaa parissa vuodessa.',
    osat: ['Tapiola', 'Leppävaara', 'Matinkylä', 'Espoonlahti', 'Olari', 'Soukka', 'Nöykkiö', 'Kauklahti', 'Kalajärvi', 'Otaniemi', 'Suurpelto', 'Saunalahti'],
    faq: [
      ['Voiko terassin liukuoven tiivistää vai pitääkö se vaihtaa?', 'Lähes aina voi tiivistää. Vaihto tulee kyseeseen vasta jos karmi on lahonnut tai lasi on rikki. Kuluneet harjatiivisteet, hiekoittunut kisko ja väärin säädetty käynti selittävät valtaosan vedosta, ja ne kaikki korjataan yhdellä käynnillä.'],
      ['Meillä on rivitaloyhtiö — kuka tilaa?', 'Yksittäinen osakas voi tilata oman asuntonsa tiivistyksen. Jos koko rivistö tiivistetään kerralla, tilaajaksi kannattaa ottaa taloyhtiö: silloin hinta on sopimushinta eikä kappalehinta. Katso taloyhtiösivu.'],
    ],
  },
  {
    slug: 'vantaa',
    name: 'Vantaa',
    ine: 'Vantaalla',
    gen: 'Vantaan',
    lead: 'Lentomelualueella tiivistys tekee jotain jota harva odottaa: se hiljentää.',
    intro: 'Vantaan rakennuskanta on nuorempaa ja yhtenäisempää kuin Helsingin. Painopiste on 1970–1980-luvun lähiöissä ja rivitaloissa, joissa alkuperäiset kynnyskumit ja parvekeoven tiivisteet ovat käytännössä poikkeuksetta käyttöikänsä päässä — kumi on kovettunut, litistynyt eikä palaudu enää muotoonsa.',
    kulma: 'Lentokentän melualueella tiivistyksellä on sivuvaikutus jota ei aina osata odottaa. Sama tiiviste joka pitää vedon ulkona vaimentaa myös ääntä, koska ilmavuoto on se reitti jota melu käyttää. Emme lupaa äänieristystä — se on eri työ — mutta ero kuuluu useimmiten heti.',
    osat: ['Tikkurila', 'Myyrmäki', 'Korso', 'Koivukylä', 'Hakunila', 'Martinlaakso', 'Kivistö', 'Aviapolis', 'Pähkinärinne', 'Rekola', 'Länsimäki'],
    faq: [
      ['Auttaako tiivistys lentomeluun?', 'Osittain. Ilmavuoto on tehokkain reitti jota ääni käyttää, joten tiivistäminen vaimentaa erityisesti korkeita ääniä. Se ei korvaa äänieristysikkunaa, mutta on murto-osa sen hinnasta ja ero kuuluu yleensä välittömästi.'],
      ['Rivitalon kynnyskumi on painunut litteäksi — riittääkö pelkkä sen vaihto?', 'Usein riittää, ja se on hinnastomme edullisin työ. Jos kynnys on kuitenkin painunut tai ovi laahaa, pelkkä uusi kumi kuluu nopeasti loppuun. Katsomme käynnin säädön samalla.'],
    ],
  },
  {
    slug: 'kauniainen',
    name: 'Kauniainen',
    ine: 'Kauniaisissa',
    gen: 'Kauniaisten',
    lead: 'Vanhat huvilat ja alkuperäiset puuikkunat — työ jossa ei rikota mitään korvaamatonta.',
    intro: 'Kauniainen on pieni ja poikkeuksellisen yhtenäinen: paljon 1920–1940-luvun puuhuviloita väljillä tonteilla. Osa rakennuskannasta on suojeltua, ja ikkunat ovat usein alkuperäisiä kaksipuitteisia puuikkunoita, joissa on vanhat helat ja käsin tehdyt puiteliitokset. Juuri näissä tiivistäminen on paras vaihtoehto: ikkunanvaihto olisi sekä kallis että usein kaavallisesti mahdoton.',
    kulma: 'Vanhassa puuikkunassa työ on hitaampaa kuin uudessa, koska urat ovat epätasaisia eikä tiivistettä voi painaa väkisin paikalleen. Se ei näy hinnassa — hinta on sama kuin muualla — mutta se näkyy varatussa ajassa. Emme kiirehdi kohteessa jota ei saa rikki.',
    osat: ['Keskusta', 'Kasavuori', 'Sansinpelto', 'Grankulla'],
    faq: [
      ['Talo on suojeltu. Saako ikkunoita tiivistää?', 'Kyllä. Tiivisteiden vaihto on huoltotoimenpide, joka ei muuta ikkunan ulkonäköä eikä rakennetta, joten se ei vaadi lupaa. Juuri siksi se on suojelluissa kohteissa käytännössä ainoa keino päästä eroon vedosta.'],
      ['Betjänar ni på svenska?', 'Kyllä. Palvelemme sekä suomeksi että ruotsiksi — myös varauksen ja laskun voi hoitaa ruotsiksi.'],
    ],
  },
  {
    slug: 'kirkkonummi',
    name: 'Kirkkonummi',
    ine: 'Kirkkonummella',
    gen: 'Kirkkonummen',
    lead: 'Merituuli painaa julkisivua eri tavalla — rannikolla tiiviste kuluu nopeammin.',
    intro: 'Kirkkonummi on merellinen ja tuulinen, ja se näkyy tiivisteissä. Rannikon ja saariston kohteissa julkisivuun kohdistuu selvästi kovempi tuulikuorma kuin sisämaassa: tiivisteet kovettuvat ja litistyvät nopeammin, ja veto tuntuu jo ennen kuin tiiviste näyttää kuluneelta. Rakennuskanta on omakotitalovaltaista, ja mukana on runsaasti vapaa-ajan asuntoja.',
    kulma: 'Tuulisella tontilla kannattaa tiivistää koko talo kerralla eikä vain sitä huonetta jossa veto tuntuu. Kun yksi vuotokohta tukitaan, paine siirtyy seuraavaan — ja veto tuntuu sitten siellä. Koko kehän tiivistäminen on ainoa tapa saada se loppumaan lopullisesti.',
    osat: ['Kirkkonummen keskusta', 'Masala', 'Kantvik', 'Veikkola', 'Sundsberg', 'Upinniemi', 'Evitskog', 'Kylmälä', 'Jorvas', 'Sarvvik', 'Luoma'],
    faq: [
      ['Teettekö myös vapaa-ajan asuntoihin?', 'Kyllä. Vapaa-ajan asunnossa tiivistys on usein kannattavin yksittäinen lämmityskulua pienentävä toimenpide, koska rakennus on tyypillisesti kevytrakenteinen ja lämpö karkaa juuri vuotokohdista.'],
      ['Saako mökin tiivistyksestä kotitalousvähennyksen?', 'Saa, jos vapaa-ajan asunto on omassa käytössäsi. Vähennys koskee myös vapaa-ajan asuntoa — ei kuitenkaan sijoitus- tai vuokrakäytössä olevaa kohdetta. Erittelemme työn osuuden laskuun valmiiksi.'],
    ],
  },
  {
    slug: 'kerava',
    name: 'Kerava',
    ine: 'Keravalla',
    gen: 'Keravan',
    lead: 'Tiivis kaupunki, lyhyet välimatkat — usein joustavin aikataulu koko alueellamme.',
    intro: 'Kerava on pinta-alaltaan Uudenmaan pienimpiä mutta asukastiheydeltään suurimpia kaupunkeja — koko kaupungin ajaa läpi vartissa. Rakennuskannassa painottuvat 1970–1980-luvun rivi- ja kerrostalot sekä niitä ympäröivät pientaloalueet Ahjossa, Saviolla ja Sompiossa. Kerrostaloasunnossa työ kohdistuu käytännössä aina parvekeoveen: se on ainoa ulkovaippaan kuuluva ovi, ja sen alkuperäinen tiiviste on tuon ikäisissä taloissa poikkeuksetta kovettunut. Rivitaloissa painopiste siirtyy kynnykseen ja terassioveen.',
    kulma: 'Kerrostaloasukkaan kannattaa tietää vastuunjako ennen tilaamista: parvekeoven ja ikkunan sisäpuolen tiivisteet ovat yleensä osakkaan vastuulla, joten tavallinen tiivisteiden vaihto onnistuu ilman taloyhtiön päätöstä. Ulkopuoli ja julkisivu ovat yhtiön. Jos epäröit, kysy isännöitsijältä — tai ehdota koko taloyhtiön kartoitusta kerralla, jolloin hinta on sopimushinta eikä kappalehinta. Lyhyiden välimatkojen ansiosta Keravalle löytyy yleensä aikoja nopeammin kuin haja-asutusalueille.',
    osat: ['Keskusta', 'Ahjo', 'Savio', 'Kaleva', 'Sompio', 'Kilta', 'Jaakkola', 'Lapila'],
    faq: [
      ['Kuinka nopeasti pääsette käymään?', 'Vapaat ajat näkyvät suoraan varauskalenterista, kun syötät postinumerosi. Keravalla aikoja on tyypillisesti tarjolla nopeammin kuin kauempana, koska ajomatka on lyhyt.'],
      ['Voiko käynnin varata iltaan?', 'Kyllä. Palvelemme arkisin klo 8–20 ja viikonloppuisin 8–18.30, ja illat ovat varattavissa samaan kiinteään hintaan — iltalisää ei ole.'],
    ],
  },
  {
    slug: 'jarvenpaa',
    name: 'Järvenpää',
    ine: 'Järvenpäässä',
    gen: 'Järvenpään',
    lead: 'Omakotitalovaltainen kaupunki, jossa koko talo kannattaa tiivistää kerralla.',
    intro: 'Järvenpää on selvästi omakotitalovaltainen, ja se muuttaa hinnoittelun logiikkaa asiakkaan eduksi. Kun saman katon alla on paljon ikkunoita, ikkunahinta laskee portaittain — koko talon ikkunat kerralla maksaa vähemmän per ikkuna kuin muutama kerrallaan. Rakennuskanta painottuu 1970-luvulta 2000-luvulle, ja siinä haarukassa ikkunatiivisteet ovat tyypillisesti alkuperäisiä.',
    kulma: 'Tyypillinen järvenpääläinen omakotitalo on 10–20 ikkunan kokoluokkaa. Siinä haarukassa ikkunan yksikköhinta on 75–80 € eikä 90 €, eli koko talon tiivistäminen maksaa vähemmän kuin moni olettaa hinnaston ensimmäisen rivin perusteella.',
    osat: ['Keskusta', 'Loutti', 'Kinnari', 'Jamppa', 'Saunakallio', 'Haarajoki', 'Kyrölä', 'Pöytäalho', 'Peltola'],
    faq: [
      ['Kannattaako tiivistää koko talo vai vain vetävät huoneet?', 'Koko talo. Kun yksi vuotokohta tukitaan, paine siirtyy seuraavaan ja veto tuntuu sitten siellä. Lisäksi ikkunahinta laskee määrän mukaan, joten koko talo kerralla on myös edullisempi per ikkuna.'],
      ['Paljonko 15 ikkunan talo maksaa?', 'Viidentoista ikkunan portaassa yksikköhinta on 75 €, eli 15 × 75 € = 1 125 €. Kotitalousvähennys pienentää työn osuutta vielä 40 %. Tarkan summan näet laskurista, kun lisäät myös ovet.'],
    ],
  },
  {
    slug: 'tuusula',
    name: 'Tuusula',
    ine: 'Tuusulassa',
    gen: 'Tuusulan',
    lead: 'Hyrylästä Jokelaan ja Kellokoskelle — kolme taajamaa, yksi käynti kerrallaan.',
    intro: 'Tuusula on laaja ja hajanainen: Hyrylä, Jokela ja Kellokoski ovat käytännössä kolme erillistä taajamaa, ja niiden välissä on paljon haja-asutusta. Rakennuskanta vaihtelee Tuusulanjärven vanhoista huviloista 1980–2000-luvun omakotitaloihin, joten työ näyttää hyvin erilaiselta kunnan eri osissa.',
    kulma: 'Koska välimatkat ovat pitkiä, yksittäisen ikkunan takia ei kannata tilata käyntiä — minimiveloitus söisi hyödyn. Tiivistä koko talo samalla kertaa, niin matkan osuus jakautuu kaikille kohteille ja yksikköhinta putoaa.',
    osat: ['Hyrylä', 'Jokela', 'Kellokoski', 'Riihikallio', 'Rusutjärvi', 'Nahkela', 'Ruotsinkylä', 'Lahela', 'Jäniksenlinna', 'Nuppulinna'],
    faq: [
      ['Tuleeko haja-asutusalueelle matkalisä?', 'Mahdollinen matkalisä määräytyy postinumeron mukaan ja näkyy laskurissa ennen varauksen vahvistamista — sitä ei koskaan lisätä jälkikäteen laskuun. Syötä postinumerosi, niin näet oman hintasi.'],
      ['Onko Tuusulanjärven vanha huvila liian vanha tiivistettäväksi?', 'Ei ole. Vanha puuikkuna on usein juuri se kohde jossa tiivistys tuottaa suurimman eron, koska alkuperäistä tiivistettä ei välttämättä ole koskaan uusittu. Työ on hitaampaa mutta hinta sama.'],
    ],
  },
  {
    slug: 'nurmijarvi',
    name: 'Nurmijärvi',
    ine: 'Nurmijärvellä',
    gen: 'Nurmijärven',
    lead: 'Klaukkala, Rajamäki ja kirkonkylä — kolme taajamaa, sama kiinteä hinta.',
    intro: 'Nurmijärvi koostuu kolmesta selvästi erillisestä taajamasta: Klaukkalasta, Rajamäestä ja kirkonkylästä. Klaukkala on kasvanut nopeasti, joten siellä on paljon 1990–2010-luvun pientaloja. Niissä vika ei yleensä ole ikkunoissa vaan terassin liukuovessa ja ulko-oven kynnyksessä. Vanhemmassa kannassa taas ikkunatiivisteet ovat alkuperäisiä ja koko talo kannattaa käydä läpi.',
    kulma: 'Uudehko talo voi vetää yhtä lailla kuin vanha. 2000-luvun pientalossa syy on tyypillisesti väärin säädetty ovi tai painunut kynnyskumi — ei rakennusvirhe. Se on halvin mahdollinen korjaus ja tuntuu heti.',
    osat: ['Klaukkala', 'Rajamäki', 'Kirkonkylä', 'Röykkä', 'Perttula', 'Nukari', 'Lepsämä', 'Kiljava', 'Luhtajoki', 'Palojoki', 'Lapinkylä', 'Oitmäki'],
    faq: [
      ['Talo on vasta 15 vuotta vanha ja vetää silti. Miksi?', 'Kynnyskumi ja oven tiivisteet ovat kuluvia osia — ne kovettuvat ja litistyvät 10–15 vuodessa käytöstä riippumatta. Lisäksi ovi painuu ajan myötä saranoillaan, jolloin käyntiväli muuttuu. Molemmat korjataan säädöllä ja uudella tiivisteellä.'],
      ['Palveletteko myös Klaukkalan ulkopuolella?', 'Kyllä, koko Nurmijärvellä. Syötä postinumerosi varauksen yhteydessä, niin näet vapaat ajat ja mahdollisen matkalisän omalle osoitteellesi.'],
    ],
  },
  {
    slug: 'hyvinkaa',
    name: 'Hyvinkää',
    ine: 'Hyvinkäällä',
    gen: 'Hyvinkään',
    lead: 'Toiminta-alueemme pohjoisin kaupunki — omalla keskustallaan ja omalla rakennuskannallaan.',
    intro: 'Hyvinkää poikkeaa kehyskunnista siinä, että sillä on oma selkeä kaupunkikeskustansa eikä se ole pelkkä pääkaupunkiseudun nukkumalähiö. Rakennuskannassa on sekä 1960–1980-luvun kerros- ja rivitaloja että laajoja pientaloalueita. Vanhemmissa kerrostaloissa parvekeovet ovat usein yhä alkuperäisiä, ja niissä tiivistys tuo suurimman yksittäisen hyödyn.',
    kulma: 'Hyvinkää on toiminta-alueemme pohjoisin kunta, joten ajomatka on pisimpiä. Se ei muuta kohteiden hintoja — ikkuna on 75–90 € täälläkin — mutta tekee koko talon kerralla tiivistämisestä selvästi järkevämpää kuin yhden ikkunan käynnistä.',
    osat: ['Keskusta', 'Paavola', 'Hakala', 'Martti', 'Kaukas', 'Hyvinkäänkylä', 'Vehkoja', 'Palopuro', 'Kytäjä', 'Nummenkylä'],
    faq: [
      ['Onko Hyvinkäällä eri hinta kuin pääkaupunkiseudulla?', 'Kohteiden hinnat ovat samat: ikkuna 75–90 € määrän mukaan, ulko- ja parvekeovi 99 €. Etäisyys voi tuoda postinumerokohtaisen matkalisän, joka näkyy laskurissa ennen varauksen vahvistamista.'],
      ['Kuinka pitkä toimitusaika Hyvinkäälle on?', 'Vapaat ajat näet suoraan kalenterista postinumerolla. Pidemmän ajomatkan takia Hyvinkään käynnit sijoitetaan yleensä samaan päivään muiden pohjoisen alueen kohteiden kanssa, joten valikoima on hieman suppeampi kuin Keravalla.'],
    ],
  },
  {
    slug: 'riihimaki',
    name: 'Riihimäki',
    ine: 'Riihimäellä',
    gen: 'Riihimäen',
    /* Ainoa kunta jolla tämä on — muut ovat Uuttamaata, joka on templaatin
       oletus. Vaikuttaa vain rakenteiseen dataan. */
    maakunta: 'Kanta-Häme',
    lead: 'Pääradan risteysasema ja toiminta-alueemme ainoa hämäläinen kaupunki — sama kiinteä hinta, ei matkalisää.',
    intro: 'Riihimäki on syntynyt rautatien ympärille, ja se näkyy yhä rakennuskannassa. Aseman lähistöllä on 1900–1930-luvun puisia rautatieläistaloja, joissa on alkuperäiset kaksipuitteiset ikkunat — juuri sitä kantaa jossa tiivistys tuo suurimman hyödyn suhteessa hintaan. Toisessa ääripäässä on Peltosaari, 1970-luvun betonielementtilähiö, jonka kerrostaloissa parvekeovet ja niiden kynnyskumit ovat monessa asunnossa yhä tehtaan asentamat. Nämä kaksi kantaa vaativat eri otteen, mutta molemmat hoituvat samalla käynnillä.',
    kulma: 'Riihimäki on sisämaata, ja se erottaa sen rannikkokunnista. Helsingissä ja Sipoossa tiivisteitä kuluttaa ennen kaikkea mereltä tuleva tuulikuorma; täällä ratkaisee lämpötilaero. Pakkanen painuu talvella selvästi alemmas kuin rannikolla, jolloin kova tiivistynyt tiiviste ei enää jousta takaisin karmia vasten ja veto tuntuu heti lattianrajassa. Siksi riihimäkeläisessä talossa vetoisuus paljastuu tyypillisesti vasta ensimmäisillä oikeilla pakkasilla, ei syyskuun tuulilla.',
    osat: ['Keskusta', 'Peltosaari', 'Patastenmäki', 'Herajoki', 'Uramo', 'Hirsimäki', 'Juppala', 'Petsamo', 'Vahteristo', 'Kalmu', 'Arolampi'],
    faq: [
      ['Palveletteko Riihimäellä, vaikka se ei kuulu Uudellemaalle?', 'Kyllä. Riihimäki on Kanta-Hämettä, mutta se kuuluu toiminta-alueeseemme siinä missä Uudenmaan kunnatkin. Kohteiden hinnat ovat samat — ikkuna 75–90 € määrän mukaan, ulko- ja parvekeovi 99 € — eikä Riihimäelle tule matkalisää. Voit varmistaa asian itse syöttämällä postinumerosi laskuriin ennen varausta.'],
      ['Kannattaako 1970-luvun kerrostaloasunnossa tiivistää vain parvekeovi?', 'Usein kannattaa aloittaa siitä, koska parvekeovi on tuon ikäisessä asunnossa lähes poikkeuksetta vetoisin kohta: siinä on sekä pitkät karmitiivisteet että kynnyskumi, ja ovea käytetään päivittäin. Jos asunnossa on kuitenkin samalla julkisivulla useampi alkuperäinen ikkuna, ne kannattaa tiivistää samalla kertaa — käynti on jo maksettu, ja yksikköhinta putoaa selvästi.'],
    ],
  },
  {
    slug: 'sipoo',
    name: 'Sipoo',
    ine: 'Sipoossa',
    gen: 'Sipoon',
    lead: 'Nikkilä, Söderkulla ja rannikko — kaksikielinen palvelu, sama kiinteä hinta.',
    intro: 'Sipoo on kaksikielinen ja maantieteellisesti hajanainen. Nikkilä ja Söderkulla ovat pääasialliset taajamat, ja niiden välissä on laajaa haja-asutusta. Rakennuskannassa on paljon vanhoja puutaloja, joissa ikkunat ovat alkuperäisiä, sekä uudempia pientaloja rannikon suunnassa. Merellinen sijainti näkyy tiivisteiden kulumisnopeudessa samaan tapaan kuin Kirkkonummella.',
    kulma: 'Vanhassa sipoolaisessa puutalossa ikkunoita ei kannata vaihtaa vaan tiivistää. Alkuperäinen kaksipuitteinen puuikkuna on oikein tiivistettynä energiatehokkuudeltaan lähellä uutta — ja murto-osan hinnasta.',
    osat: ['Nikkilä', 'Söderkulla', 'Talma', 'Box', 'Kalkkiranta', 'Gumbostrand', 'Paippinen', 'Västerskog', 'Martinkylä'],
    faq: [
      ['Betjänar ni på svenska i Sibbo?', 'Kyllä. Palvelemme Sipoossa sekä suomeksi että ruotsiksi, ja myös lasku ja työn erittely kotitalousvähennystä varten saadaan ruotsiksi.'],
      ['Kannattaako vanhan puutalon ikkunat tiivistää vai vaihtaa?', 'Lähes aina tiivistää. Kunnossa oleva vanha puuikkuna kestää oikein huollettuna vuosikymmeniä lisää, ja tiivistys maksaa murto-osan vaihdosta. Vaihto tulee kyseeseen vasta jos puite on lahonnut.'],
    ],
  },
  {
    slug: 'vihti',
    name: 'Vihti',
    ine: 'Vihdissä',
    gen: 'Vihdin',
    lead: 'Nummelasta Hiidenveden rannoille — myös vapaa-ajan asunnot.',
    intro: 'Vihti on laaja ja maaseutumainen. Nummela on kasvava taajama, mutta suuri osa kunnasta on haja-asutusta ja vapaa-ajan asuntoja Hiidenveden ja Vihdinjärven ympärillä. Nummelan pientaloissa työ on tavanomaista ikkuna- ja ovitiivistystä; mökkikohteissa painopiste on ulko-ovessa ja kynnyksessä, joista lämpö karkaa nopeimmin.',
    kulma: 'Vapaa-ajan asunnossa tiivistys on usein kannattavin yksittäinen lämmityskulua pienentävä toimenpide, koska rakennus on kevytrakenteinen ja lämmitetään jaksoittain. Tiivis mökki lämpiää nopeammin — se tuntuu heti ensimmäisellä käynnillä talvella.',
    osat: ['Nummela', 'Kirkonkylä', 'Ojakkala', 'Otalampi', 'Vihtijärvi', 'Huhmari', 'Selki', 'Tervalampi'],
    faq: [
      ['Teettekö vapaa-ajan asuntoihin Hiidenveden rannalla?', 'Kyllä, koko Vihdin alueella. Syötä postinumero varauksen yhteydessä, niin näet vapaat ajat ja mahdollisen matkalisän kyseiselle osoitteelle.'],
      ['Mökki on kylmillään talvella. Kannattaako tiivistää?', 'Kannattaa, ja hyöty näkyy heti: tiivis rakennus lämpiää nopeammin ja pysyy lämpimänä pienemmällä teholla. Jaksoittain lämmitettävässä mökissä tämä on käytännössä merkittävämpi ero kuin jatkuvasti lämmitettävässä talossa.'],
    ],
  },

  /* ---------- Helsingin seudun loput kehyskunnat ---------- */
  {
    slug: 'mantsala',
    name: 'Mäntsälä',
    ine: 'Mäntsälässä',
    gen: 'Mäntsälän',
    lead: 'Kaksi rakennuskantaa samassa kunnassa: uudet työmatkalaisten talot ja vanhat maatilat.',
    intro: 'Mäntsälä kasvoi työmatkakunnaksi moottoritien ja oikoradan varrella, ja se näkyy rakennuskannassa poikkeuksellisen selvästi. Taajamissa on paljon 1990–2010-luvun pientaloja, joissa vika on lähes aina terassin liukuovessa tai ulko-oven kynnyksessä — ei ikkunoissa. Haja-asutusalueella taas on vanhoja maalaistaloja, joiden ikkunat ovat alkuperäisiä eikä tiivisteitä ole välttämättä uusittu koskaan.',
    kulma: 'Kannattaa tietää kumpaan ryhmään talosi kuuluu, koska työ on täysin eri: uudessa talossa käydään läpi ovet ja kynnykset puolessa tunnissa, vanhassa maalaistalossa koko ikkunakanta. Laskuri kertoo kummankin hinnan etukäteen.',
    osat: ['Kirkonkylä', 'Hyökännummi', 'Ohkola', 'Sälinkää', 'Sääksjärvi', 'Numminen', 'Levanto', 'Hirvihaara'],
    faq: [
      ['Talo on 2000-luvulta eikä siinä pitäisi vetää. Miksi vetää?', 'Kynnyskumi ja oven tiivisteet ovat kuluvia osia — ne kovettuvat 10–15 vuodessa riippumatta siitä kuinka hyvin talo on rakennettu. Lisäksi ovi painuu saranoillaan, jolloin käyntiväli muuttuu. Kumpikin korjataan säädöllä ja uudella tiivisteellä.'],
      ['Palveletteko myös haja-asutusalueella kirkonkylän ulkopuolella?', 'Kyllä, koko Mäntsälässä. Mahdollinen matkalisä määräytyy postinumeron mukaan ja näkyy laskurissa ennen varauksen vahvistamista.'],
    ],
  },
  {
    slug: 'pornainen',
    name: 'Pornainen',
    ine: 'Pornaisissa',
    gen: 'Pornaisten',
    lead: 'Uudenmaan pienimpiä kuntia — juuri siksi koko talo kannattaa tehdä kerralla.',
    intro: 'Pornainen on yksi Uudenmaan pienimmistä kunnista eikä sen läpi kulje rautatietä. Asutus on pientalo- ja maatilavaltaista, ja välimatkat naapurikuntiin ovat pidempiä kuin kartalta arvaisi. Rakennuskannassa on sekä vanhoja puutaloja että 1980–2000-luvun omakotitaloja.',
    kulma: 'Pienessä kunnassa yksittäisen ikkunan takia ei kannata tilata käyntiä, koska minimiveloitus söisi koko hyödyn. Kun koko talo tiivistetään samalla kertaa, matkan ja pystytyksen osuus jakautuu kaikille kohteille ja yksikköhinta putoaa selvästi.',
    osat: ['Kirkonkylä', 'Laukkoski', 'Halkia', 'Kirveskoski', 'Jokimäki'],
    faq: [
      ['Kannattaako meidän tilata yhdessä naapurin kanssa?', 'Kannattaa ehdottomasti. Kumpikin talous saa oman laskunsa ja oman kotitalousvähennyksensä, mutta käynti on sama — ja kun kohteita on enemmän, ikkunan yksikköhinta laskee portaittain.'],
      ['Onko Pornaisiin pidempi toimitusaika?', 'Vapaat ajat näkyvät kalenterista postinumerolla. Pienemmille paikkakunnille käynnit sijoitetaan yleensä samaan päivään lähialueen muiden kohteiden kanssa, joten valikoima on hieman suppeampi kuin pääkaupunkiseudulla.'],
    ],
  },

  /* ---------- Itä-Uusimaa ---------- */
  {
    slug: 'porvoo',
    name: 'Porvoo',
    ine: 'Porvoossa',
    gen: 'Porvoon',
    lead: 'Vanhan Porvoon suojellut puutalot — kohde jossa ikkunaa ei vaihdeta, se tiivistetään.',
    intro: 'Porvoo on kaksikielinen ja rakennuskannaltaan Uudenmaan poikkeuksellisimpia. Vanha Porvoo on suojeltua 1700–1800-luvun puutaloaluetta, jossa ikkunat ovat alkuperäisiä käsintehtyjä puuikkunoita — niitä ei saa eikä kannata vaihtaa. Sen ulkopuolella on tavanomaista 1970–2000-luvun lähiö- ja pientalokantaa Näsissä, Gammelbackassa ja Kevätkummussa.',
    kulma: 'Suojellussa puutalossa tiivistys on käytännössä ainoa keino päästä eroon vedosta, koska ikkunan vaihtaminen on kiellettyä tai luvanvaraista. Työ on hitaampaa kuin uudessa ikkunassa — urat ovat epätasaisia eikä tiivistettä voi painaa väkisin — mutta hinta on sama kuin muualla.',
    osat: ['Vanha Porvoo', 'Keskusta', 'Näsi', 'Gammelbacka', 'Kevätkumpu', 'Hamari', 'Tolkkinen', 'Epoo', 'Kerkkoo', 'Hinthaara'],
    faq: [
      ['Talo on Vanhassa Porvoossa ja suojeltu. Saako ikkunoita tiivistää?', 'Saa. Tiivisteiden vaihto on huoltotoimenpide, joka ei muuta ikkunan ulkonäköä eikä rakennetta, joten se ei vaadi lupaa. Ikkunan vaihtaminen sen sijaan vaatii, ja usein sitä ei myönnetä.'],
      ['Betjänar ni på svenska i Borgå?', 'Kyllä. Palvelemme Porvoossa sekä suomeksi että ruotsiksi, ja lasku sekä työn erittely kotitalousvähennystä varten saadaan kummallakin kielellä.'],
    ],
  },
  {
    slug: 'askola',
    name: 'Askola',
    ine: 'Askolassa',
    gen: 'Askolan',
    lead: 'Maaseutukunta Porvoon kyljessä — käynnit yhdistetään usein samaan päivään.',
    intro: 'Askola on pieni maaseutukunta Porvoonjoen varrella, tunnettu jokilaaksostaan ja kalliomuodostumistaan. Asutus keskittyy kirkonkylään ja Monninkylään, joista jälkimmäinen on kasvanut selvästi nopeammin. Rakennuskannassa painottuvat vanhat puutalot ja 1980–2000-luvun omakotitalot, ja niiden tyypilliset vuotokohdat ovat eri paikoissa: vanhassa talossa ikkunoiden alkuperäiset tiivisteet, uudemmassa terassin liukuovi ja ulko-oven kynnyskumi. Kartoituskäynnillä käydään läpi molemmat, koska kumpikin voi olla kunnossa ilman että sitä näkee päälle päin.',
    kulma: 'Askola on lähellä Porvoota, joten käynnit sijoitetaan usein samaan päivään porvoolaisten kohteiden kanssa. Se lyhentää toimitusaikaa verrattuna siihen mitä kunnan koosta voisi päätellä.',
    osat: ['Kirkonkylä', 'Monninkylä', 'Vahijärvi', 'Särkijärvi', 'Juornaankylä', 'Onkimaa'],
    faq: [
      ['Onko vanhassa maalaistalossa liikaa ikkunoita järkeväksi?', 'Päinvastoin — mitä enemmän ikkunoita, sitä halvemmaksi yksikköhinta tulee. Kymmenen ikkunan talossa hinta on 80 € per ikkuna eikä 90 €, ja neljästätoista ylöspäin 75 €.'],
      ['Tuleeko Askolaan matkalisä?', 'Mahdollinen matkalisä määräytyy postinumeron mukaan ja näkyy laskurissa ennen kuin vahvistat varauksen. Sitä ei koskaan lisätä jälkikäteen laskuun.'],
    ],
  },
  {
    slug: 'loviisa',
    name: 'Loviisa',
    ine: 'Loviisassa',
    gen: 'Loviisan',
    lead: 'Empire-ajan puukaupunki meren äärellä — vanhat ikkunat ja kova tuulikuorma yhdessä.',
    intro: 'Loviisa on kaksikielinen rannikkokaupunki, jonka keskustassa on säilynyt empire-ajan puutalokortteleita. Kuntaliitoksen myötä alueeseen kuuluvat myös Pernaja, Liljendal ja Ruotsinpyhtää, joten kunta on maantieteellisesti laaja ja pääosin haja-asutusta. Rakennuskannassa yhdistyy kaksi vaativaa piirrettä: vanhat alkuperäiset puuikkunat ja merellinen sijainti.',
    kulma: 'Yhdistelmä on tiivisteiden kannalta ankarin mahdollinen. Vanha puuikkuna vuotaa jo valmiiksi enemmän kuin uusi, ja merituuli painaa julkisivua kovemmin kuin sisämaassa — tiivisteet litistyvät ja kovettuvat nopeammin. Siksi Loviisassa ero tuntuu tiivistyksen jälkeen tavallista selvemmin.',
    osat: ['Keskusta', 'Valko', 'Pernaja', 'Liljendal', 'Ruotsinpyhtää', 'Isnäs', 'Tesjoki'],
    faq: [
      ['Betjänar ni på svenska i Lovisa?', 'Kyllä. Palvelemme Loviisassa sekä suomeksi että ruotsiksi — myös varauksen, laskun ja työn erittelyn saa ruotsiksi.'],
      ['Miksi meillä tiivisteet kuluvat nopeammin kuin sisämaassa?', 'Merituuli kohdistaa julkisivuun selvästi kovemman paineen kuin suojaisa sisämaan tontti. Tiiviste puristuu kokoon ja menettää palautumiskykynsä nopeammin. Käytämme silikonitiivisteitä, jotka kestävät pakkasta ja UV:ta vuosia — myös rannikon olosuhteissa.'],
    ],
  },
  {
    slug: 'lapinjarvi',
    name: 'Lapinjärvi',
    ine: 'Lapinjärvellä',
    gen: 'Lapinjärven',
    lead: 'Toiminta-alueemme itäisin kunta — kaksikielinen ja maaseutumainen.',
    intro: 'Lapinjärvi on toiminta-alueemme itäisin kunta, kaksikielinen ja maatalousvaltainen. Asutus keskittyy kirkonkylään ja Porlammille, ja niiden ympärillä on maatiloja ja laajaa haja-asutusta. Rakennuskannalle on tyypillistä, että talot ovat suuria: maatilan päärakennuksessa on usein 15–25 ikkunaa, mikä on moninkertaisesti enemmän kuin taajaman rivitaloasunnossa.',
    kulma: 'Juuri ikkunoiden määrä tekee Lapinjärvestä hinnoittelun kannalta poikkeuksellisen. Yksikköhinta laskee portaittain, joten kahdenkymmenen ikkunan päärakennuksessa ikkuna maksaa 75 € eikä 90 € — eli kuudenneksen vähemmän kuin muutaman ikkunan kohteessa. Iso vanha talo on siis suhteellisesti halvin mahdollinen tiivistyskohde, vaikka kokonaissumma onkin isompi.',
    osat: ['Kirkonkylä', 'Porlammi', 'Ingermanninkylä', 'Pukaro', 'Rutumi'],
    faq: [
      ['Ehditäänkö näin kauas?', 'Kyllä, Lapinjärvi kuuluu toiminta-alueeseemme. Käynnit sijoitetaan samaan päivään muiden itäisen Uudenmaan kohteiden kanssa, joten vapaita aikoja on harvemmin kuin lähempänä — näet ne kalenterista postinumerolla.'],
      ['Betjänar ni på svenska i Lappträsk?', 'Kyllä, palvelemme sekä suomeksi että ruotsiksi.'],
    ],
  },
  {
    slug: 'myrskyla',
    name: 'Myrskylä',
    ine: 'Myrskylässä',
    gen: 'Myrskylän',
    lead: 'Pieni sisämaan maaseutukunta — yksi käynti, koko talo.',
    intro: 'Myrskylä on väkiluvultaan Uudenmaan pienimpiä kuntia ja sijaitsee sisämaassa, poissa rannikon tuulilta. Asutus on keskittynyt kirkonkylään, ja sen ympärillä on maatiloja ja haja-asutusta. Rakennuskannassa painottuvat vanhat puutalot ja maatilarakennukset.',
    kulma: 'Sisämaan sijainti tarkoittaa, että tuulikuorma on pienempi kuin rannikolla — mutta se ei poista vetoa, se vain siirtää syyn kokonaan tiivisteen kuntoon. Jos vanhassa talossa vetää sisämaassa, kyse on lähes varmasti kovettuneesta tai puuttuvasta tiivisteestä eikä sääolosuhteista.',
    osat: ['Kirkonkylä', 'Kankkila', 'Sulkava', 'Hallila'],
    faq: [
      ['Kunta on pieni — käyttekö täällä oikeasti?', 'Käymme. Myrskylä kuuluu toiminta-alueeseemme, ja käynnit yhdistetään lähialueen muihin kohteisiin. Tarkista vapaat ajat syöttämällä postinumerosi laskuriin.'],
      ['Kannattaako maatilan päärakennus tiivistää kerralla?', 'Kannattaa. Vanhassa päärakennuksessa on tyypillisesti 10–20 ikkunaa, jolloin yksikköhinta on 75–80 € eikä 90 €. Koko talo kerralla on siis sekä halvempi per ikkuna että ainoa tapa saada veto oikeasti loppumaan.'],
    ],
  },
  {
    slug: 'pukkila',
    name: 'Pukkila',
    ine: 'Pukkilassa',
    gen: 'Pukkilan',
    lead: 'Maatalousvaltainen pikkukunta Porvoonjoen varrella.',
    intro: 'Pukkila on pieni maatalousvaltainen kunta Porvoonjoen yläjuoksulla, ja jokilaakso on määrittänyt sen asutuksen: talot ovat rivissä jokivarren kylissä, ei tiiviinä taajamana. Rakennuskanta on iäkästä ja pientalovaltaista — vanhoja puu- ja hirsitaloja, maatilojen päärakennuksia ja jonkin verran uudempaa omakotiasutusta kirkonkylän tuntumassa. Hirsitalossa karmit ovat eläneet vuosikymmenten aikana, joten tiiviste sovitetaan kohta kohdalta eikä vakiomitalla.',
    kulma: 'Maatilan päärakennuksessa ikkunoita on usein enemmän kuin omistaja tulee ajatelleeksi, ja juuri se tekee tiivistyksestä edullista. Kahdenkymmenen ikkunan kohteessa yksikköhinta on 75 € — kuudenneksen vähemmän kuin muutaman ikkunan kohteessa.',
    osat: ['Kirkonkylä', 'Kanteleenkylä', 'Savijoki', 'Torppi', 'Naarkoski'],
    faq: [
      ['Onko vanha hirsitalo hankala tiivistää?', 'Ei ole, mutta se on hitaampaa: urat ovat epätasaisia ja karmit eläneet, joten tiiviste sovitetaan kohta kohdalta. Se näkyy varatussa ajassa, ei hinnassa.'],
      ['Voiko käynnin varata samalle päivälle naapurin kanssa?', 'Voi, ja se kannattaa. Kumpikin saa oman laskunsa ja oman kotitalousvähennyksensä, mutta käynti on sama.'],
    ],
  },

  /* ---------- Länsi-Uusimaa ---------- */
  {
    slug: 'lohja',
    name: 'Lohja',
    ine: 'Lohjalla',
    gen: 'Lohjan',
    lead: 'Kaupunki ja järvi samassa kunnassa — kodit ja vapaa-ajan asunnot.',
    intro: 'Lohja on Länsi-Uudenmaan suurin kaupunki ja kuntaliitosten myötä maantieteellisesti laaja: mukana ovat myös Karjalohja, Sammatti ja Nummi-Pusula. Keskustassa ja Virkkalassa on tavanomaista 1960–2000-luvun kerros-, rivi- ja pientalokantaa, mutta Lohjanjärven ja Hiidenveden rannoilla on runsaasti vapaa-ajan asuntoja.',
    kulma: 'Kaupunkikohteessa ja mökissä työ painottuu eri tavalla. Rivi- ja omakotitalossa käydään läpi ikkunat ja terassiovi; vapaa-ajan asunnossa tärkeimmät ovat ulko-ovi ja kynnys, koska kevytrakenteisessa mökissä lämpö karkaa ensin niistä.',
    osat: ['Keskusta', 'Virkkala', 'Routio', 'Ojamo', 'Karjalohja', 'Sammatti', 'Saukkola', 'Pusula', 'Nummi', 'Mäntynummi'],
    faq: [
      ['Teettekö vapaa-ajan asuntoihin Lohjanjärven rannalla?', 'Kyllä, koko Lohjan alueella. Mökissä tiivistys on usein kannattavin yksittäinen lämmityskulua pienentävä toimenpide, koska rakennus on kevytrakenteinen ja lämmitetään jaksoittain.'],
      ['Saako vapaa-ajan asunnon tiivistyksestä kotitalousvähennyksen?', 'Saa, jos asunto on omassa käytössäsi. Vähennystä ei saa sijoitus- tai vuokrakäytössä olevasta kohteesta. Erittelemme työn osuuden laskuun valmiiksi OmaVeroa varten.'],
    ],
  },
  {
    slug: 'karkkila',
    name: 'Karkkila',
    ine: 'Karkkilassa',
    gen: 'Karkkilan',
    lead: 'Ruukkikaupungin 1950–70-luvun asuinkanta, jossa ikkunat ovat usein alkuperäisiä.',
    intro: 'Karkkila on pieni teollisuuskaupunki, joka kasvoi Högforsin ruukin ympärille. Se näkyy rakennuskannassa: keskustassa ja sen liepeillä on poikkeuksellisen paljon 1950–1970-luvun asuintaloja, jotka rakennettiin tehtaan työntekijöille. Niissä ikkunat ovat usein alkuperäisiä kaksipuitteisia puuikkunoita, joiden tiivisteitä ei ole välttämättä uusittu kertaakaan.',
    kulma: 'Juuri tuon ikäluokan taloissa tiivistys tuottaa suurimman eron suhteessa hintaan. Ikkuna on rakenteeltaan hyvä ja kunnostuskelpoinen, mutta alkuperäinen tiiviste on kovettunut umpeen — sen vaihtaminen on halvin mahdollinen lämmitysremontti.',
    osat: ['Keskusta', 'Haukkamäki', 'Tuorila', 'Ahmoo', 'Vattola', 'Nyhkälä'],
    faq: [
      ['Kannattaako 60-luvun ikkuna tiivistää vai vaihtaa?', 'Lähes aina tiivistää. Sen ajan puuikkuna on tehty kestävästä puusta ja on rakenteeltaan usein parempi kuin moni oletta — vika on tiivisteessä, ei ikkunassa. Vaihto tulee kyseeseen vasta jos puite on lahonnut.'],
      ['Paljonko koko talon tiivistys maksaa?', 'Riippuu ikkunamäärästä: 10–13 ikkunan talossa yksikköhinta on 80 €, eli esimerkiksi 12 ikkunaa on 960 €, ja neljästätoista ylöspäin 75 €. Ovet lasketaan päälle. Näet tarkan summan laskurista.'],
    ],
  },
  {
    slug: 'siuntio',
    name: 'Siuntio',
    ine: 'Siuntiossa',
    gen: 'Siuntion',
    lead: 'Kaksikielinen maaseutukunta Kirkkonummen ja Lohjan välissä.',
    intro: 'Siuntio on pieni kaksikielinen kunta, jossa asutus jakautuu kirkonkylän, rautatieaseman seudun ja laajan haja-asutusalueen kesken. Rantaradan ansiosta aseman ympäristöön on rakennettu työmatkalaisten omakotitaloja 1980-luvulta eteenpäin, kun taas kirkonkylässä ja maaseudulla kanta on selvästi vanhempaa. Meri on lähellä, mutta suurin osa asutuksesta on suojaisassa sisämaassa, joten tuulikuorma jää pienemmäksi kuin naapurikunnissa Inkoossa ja Kirkkonummella.',
    kulma: 'Siuntio on lähellä Kirkkonummea, joten käynnit sijoitetaan usein samaan päivään. Se lyhentää odotusaikaa verrattuna siihen mitä kunnan koosta voisi päätellä — kannattaa katsoa kalenterista ennen kuin oletat että joudut jonottamaan.',
    osat: ['Kirkonkylä', 'Siuntion asema', 'Störsvik', 'Sunnanvik', 'Lappers', 'Pikkala'],
    faq: [
      ['Betjänar ni på svenska i Sjundeå?', 'Kyllä. Palvelemme sekä suomeksi että ruotsiksi, ja laskun sekä työn erittelyn saa kummallakin kielellä.'],
      ['Onko haja-asutusalueelle pidempi odotusaika?', 'Yleensä hieman, koska käynnit yhdistetään lähialueen muihin kohteisiin. Vapaat ajat näet suoraan kalenterista syöttämällä postinumerosi.'],
    ],
  },
];
