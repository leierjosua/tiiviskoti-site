/* Artikkelien sisältö. Erillään build-alueet.mjs:stä samasta syystä kuin
   _alueet-data.mjs: teksti muuttuu usein, generaattorin logiikka harvoin.
 *
 * Hintaluvut EIVÄT ole tässä tiedostossa kovakoodattuina vaan tulevat
 * pricing.mjs:stä generaattorin kautta ({{IKKUNA}} yms.), jotta artikkeli ei
 * jää lupaamaan vanhoja hintoja hinnaston muuttuessa.
 *
 * Takuu ja vastuuvakuutus eivät esiinny myyntikärkinä — ks. tiiviskoti-
 * mainoskielto: niistä kerrotaan vain käyttöehdoissa ja UKK-vastauksessa. */

export const ARTIKKELIT = [
  {
    slug: 'vetava-ikkuna',
    titleSeo: 'Vetävä ikkuna: syyt ja mitä sille voi tehdä',
    title: 'Vetävä ikkuna: mistä veto johtuu ja mitä sille voi tehdä',
    desc: 'Vetävä ikkuna johtuu useimmiten kuluneesta tiivisteestä, ei rikkinäisestä ikkunasta. Näin tunnistat syyn ja tiedät milloin riittää tiivisteiden vaihto.',
    h1: 'Vetävä ikkuna: mistä veto johtuu ja mitä sille voi tehdä',
    lead: 'Kylmä ilmavirta ikkunan alta ei tarkoita, että ikkuna pitäisi vaihtaa. Useimmiten kyse on kuluneesta tiivisteestä, joka maksaa murto-osan ikkunaremontista.',
    julkaistu: '2026-08-27',
    kicker: 'Vedon syyt',
    osiot: [
      ['Miksi ikkunasta vetää', [
        'Ikkunan tiivisteet ovat kumia tai solumuovia, ja ne kovettuvat vuosien mittaan. Kun tiiviste menettää joustonsa, se ei enää täytä puitteen ja karmin väliin jäävää rakoa. Rako on usein vain millimetrejä, mutta se kiertää koko ikkunan ympäri — yhteispituutta kertyy helposti neljä tai viisi metriä yhtä ikkunaa kohden.',
        'Veto tuntuu voimakkaimmin pakkasilla, koska sisä- ja ulkoilman lämpötilaero on silloin suurin. Sama rako on olemassa kesälläkin, mutta sen läpi kulkeva ilma on lämmintä, eikä sitä huomaa.',
      ]],
      ['Kuusi tavallisinta syytä', [
        'Kovettunut tai litistynyt tiiviste. Ylivoimaisesti yleisin syy. Tiiviste näyttää paikallaan olevalta, mutta se ei enää palaudu, kun sitä painaa sormella.',
        'Irronnut tiiviste. Tiiviste on osittain irti urastaan, tyypillisesti yläkulmasta tai saranapuolelta.',
        'Väärän kokoinen tiiviste. Aiemmin asennettu tiiviste on liian ohut rakoon nähden, jolloin se ei purista kiinni.',
        'Puitteen laskeutuminen. Ikkuna ei enää sulkeudu tasaisesti, jolloin tiiviste puristuu toisesta reunasta ja jää toisesta löysälle.',
        'Heloituksen löystyminen. Salpa ei vedä puitetta riittävän tiukasti karmia vasten.',
        'Karmin ja seinän välinen vuoto. Harvinaisempi mutta mahdollinen: veto ei tulekaan ikkunasta vaan sen ympäriltä. Tämä ei korjaannu tiivisteitä vaihtamalla.',
      ]],
      ['Näin paikannat vuodon itse', [
        'Yksinkertaisin keino on kynttilä tai savupuikko. Sammuta ilmanvaihto hetkeksi, sulje ovi huoneeseen ja kuljeta liekkiä hitaasti ikkunan reunoja pitkin noin viiden sentin etäisyydellä. Liekin taipuminen näyttää vuotokohdan.',
        'Toinen keino on paperiliuska. Aseta paperi puitteen ja karmin väliin ja sulje ikkuna. Jos paperi liukuu ulos vetämättä, tiiviste ei purista siitä kohtaa.',
        'Lämpökamera näyttää saman asian nopeammin ja kattavammin. Me kuvaamme jokaisen kohteen lämpökameralla käynnin yhteydessä, jolloin vuotokohdat näkyvät ennen työn aloittamista eikä arvailulle jää sijaa.',
      ]],
      ['Milloin riittää tiivistys, milloin tarvitaan enemmän', [
        'Tiivisteiden vaihto riittää, kun ikkuna itsessään on ehjä ja sulkeutuu, lasi on kunnossa eikä puitteessa ole lahovaurioita. Tämä kattaa valtaosan vetävistä ikkunoista.',
        'Ikkunan vaihtoa kannattaa harkita, jos puite on lahonnut, lasien välissä on jatkuvaa kosteutta tai ikkuna on yksilasinen. Näissä tapauksissa tiivistys ei poista ongelman syytä.',
        'Ero hinnassa on suuri. Yhden ikkunan tiivisteiden vaihto maksaa meillä {{IKKUNA}} €, ja määrän kasvaessa hinta laskee. Ikkunan vaihto maksaa tyypillisesti satoja tai tuhansia euroja ikkunaa kohden.',
      ]],
      ["Mitä veto maksaa vuodessa", [
        "Yksittäisen vetävän ikkunan lämpöhukkaa on vaikea eritellä laskusta, mutta suuruusluokan voi hahmottaa. Tavallisessa omakotitalossa hallitsematon ilmavuoto on tyypillisesti 15–30 % lämmitysenergiasta, ja ikkunat ja ovet ovat siitä merkittävä osa.",
        "Jos talon lämmityslasku on 2 000 € vuodessa ja tiivistys pudottaa kulutusta arviolta 10–15 %, säästö on 200–300 € vuodessa. Kymmenen ikkunan tiivistys maksaa {{ESIM10}} €, josta kotitalousvähennyksen jälkeen jää vähemmän maksettavaa.",
        "Takaisinmaksuaika on siis tyypillisesti kahdesta kolmeen vuotta, ja tiivisteet kestävät sen jälkeen vielä toistakymmentä vuotta. Emme kuitenkaan lupaa tiettyä säästöä etukäteen, koska toteutuma riippuu rakennuksesta ja lämmitystavasta.",
      ]],
      ["Yleisimmät virheet vedon korjaamisessa", [
        "Tiivistenauha vanhan päälle. Uusi nauha vanhan päälle tekee raosta liian ahtaan, jolloin ikkuna ei enää sulkeudu kunnolla ja tiiviste litistyy pysyvästi. Vanha on aina poistettava ensin.",
        "Väärä profiili. Tiivisteitä on P-, D-, E- ja K-profiileja eri levyisiin rakoihin. Kaupan yleistiiviste sopii harvoin juuri siihen rakoon, joka omassa ikkunassa on.",
        "Ikkunan teippaaminen umpeen talveksi. Se estää myös lasien välisen tuuletuksen, jolloin kosteus tiivistyy lasien väliin ja puite alkaa vaurioitua.",
        "Vain vetokohdan korjaaminen. Ilma hakeutuu aina helpoimmalle reitille. Kun yksi kohta tukitaan, virtaus siirtyy seuraavaksi heikoimpaan kohtaan, ja veto tuntuu pian muualla.",
      ]],
    ],
    faq: [
      ['Voiko tiivisteet vaihtaa itse?', 'Voi, jos oikean tiivistetyypin osaa valita ja vanhan liiman saa pois puhtaasti. Yleisin virhe on liian ohut tiiviste, joka ei purista rakoa kiinni, tai uuden tiivisteen asentaminen vanhan päälle. Silloin ikkuna ei enää sulkeudu kunnolla.'],
      ['Kuinka kauan tiivisteiden vaihto kestää?', 'Yksi ikkuna vie noin 20 minuuttia. Tavallisen omakotitalon ikkunat hoituvat yleensä yhden käynnin aikana.'],
      ['Auttaako tiivistys myös ääneneristykseen?', 'Auttaa jonkin verran. Sama rako, josta ilma kulkee, päästää läpi myös ääntä. Vaikutus on selvin matalilla taajuuksilla, kuten liikenteen huminassa.'],
      ["Mistä tietää onko kyse ikkunasta vai korvausilmaventtiilistä?", "Korvausilmaventtiili on tarkoitettu tuomaan ilmaa, ja siitä tuleva viima tuntuu yleensä yhdestä pisteestä. Ikkunan vuoto tuntuu pitkänä viivana puitteen reunaa pitkin. Jos suljet venttiilin hetkeksi ja veto jatkuu samanlaisena, kyse on ikkunasta."],
    ],
    liittyy: ['ikkunan-tiivisteiden-vaihto', 'milloin-tiivisteet-vaihdetaan', 'paljonko-tiivistys-saastaa'],
  },

  {
    slug: 'ikkunan-tiivisteiden-vaihto',
    titleSeo: 'Ikkunan tiivisteiden vaihto: hinta ja kesto',
    title: 'Ikkunan tiivisteiden vaihto: hinta, kesto ja mitä työhön kuuluu',
    desc: 'Mitä ikkunan tiivisteiden vaihto maksaa, kauanko se kestää ja mitä työhön sisältyy. Kiinteät hinnat ja esimerkkilaskelmat koko talon ikkunoille.',
    h1: 'Ikkunan tiivisteiden vaihto: hinta, kesto ja mitä työhön kuuluu',
    lead: 'Tiivisteiden vaihto on pieni työ, jonka hinta on helppo laskea etukäteen. Tässä on hinnoittelun logiikka, työn kulku ja esimerkkejä koko talon ikkunoista.',
    julkaistu: '2026-08-27',
    kicker: 'Hinta ja kesto',
    osiot: [
      ['Mitä tiivisteiden vaihto maksaa', [
        'Meillä yksi ikkuna maksaa {{IKKUNA}} €, ja hinta laskee määrän mukaan: {{RAJA2}} ikkunasta ylöspäin {{IKKUNA5}} €, {{RAJA3}} ikkunasta {{IKKUNA10}} € ja {{RAJA4}} ikkunasta {{IKKUNA20}} € ikkunalta. Ulko- ja parvekeovi on {{OVI}} €, terassin liuku- tai pariovi {{TERASSI}} € ja väliovi {{VALIOVI}} €.',
        'Pienin veloitus käynniltä on {{MIN}} €. Se kattaa käynnin, matkat, kartoituksen ja lämpökamerakuvauksen. Käytännössä yhden ikkunan tilaaminen erikseen ei siis kannata — jos ikkunoita on useampi, hinta ikkunaa kohden putoaa nopeasti.',
        'Kaikki hinnat sisältävät arvonlisäveron 25,5 %, tiivisteet ja työn. Hinta ei ole arvio vaan se, mitä laskuun tulee.',
      ]],
      ['Esimerkkejä', [
        'Viisi ikkunaa: 5 × {{IKKUNA5}} € = {{ESIM5}} €. Tyypillinen rivitaloasunto tai omakotitalon yksi kerros.',
        'Kymmenen ikkunaa: 10 × {{IKKUNA10}} € = {{ESIM10}} €. Tavallinen omakotitalo kokonaisuudessaan.',
        'Ulko-ovi ja viisi ikkunaa samalla käynnillä: {{OVI}} € + 5 × {{IKKUNA5}} € = {{ESIMOVI}} €. Ulko- ja parvekeoven hinta on sama riippumatta siitä, montako kohdetta käynnillä on.',
        'Näiden päälle tulee vielä kotitalousvähennys, joka pienentää työn osuutta. Siitä kerrotaan tarkemmin omassa artikkelissaan.',
      ]],
      ['Mitä työhön sisältyy', [
        'Sisältö on sama jokaisessa kohteessa: aukkojen tarkastus ja oikean tiivistetyypin valinta, vanhojen tiivisteiden poisto ja kiinnityspintojen puhdistus, silikonimassan levitys tarvittaessa, uusien tiivisteiden asennus, ovien käynnin säätö ja saranoiden rasvaus, toimivuuden tarkastus työn jälkeen sekä työalueen suojaus ja siivous.',
        'Vanhat tiivisteet ja jätteet viedään pois. Käynnin päätteeksi jää kirjallinen raportti huollon vaiheista ja käytetyistä tuotteista.',
        'Tiivisteet ja tarvikkeet sisältyvät hintaan. Erillistä materiaalilaskua ei tule.',
      ]],
      ['Kauanko työ kestää', [
        'Yksi ikkuna vie noin 20 minuuttia ja yksi ovi noin 30 minuuttia. Kymmenen ikkunan talo on siis noin kolmen tunnin työ.',
        'Työ tehdään sisäkautta eikä se vaadi telineitä. Huonekaluja ei tarvitse siirtää muuta kuin ikkunan edestä.',
        'Asunnossa voi olla normaalisti työn aikana. Pölyä syntyy vähän, ja se imuroidaan pois lähtiessä.',
      ]],
      ["Miten hinta muodostuu", [
        "Hinta on aukkokohtainen, ei tuntiperusteinen. Se tarkoittaa, että hinta on tiedossa ennen työn alkua eikä se muutu, vaikka jokin aukko osoittautuisi hankalammaksi kuin näytti.",
        "Määräporrastus perustuu siihen, että suurin yksittäinen kustannus pienessä työssä on matka ja työpisteen pystytys. Kun asentaja on jo paikalla ja tarvikkeet purettu, seuraava ikkuna maksaa vähemmän. Siksi ikkunan hinta putoaa {{IKKUNA}} eurosta {{IKKUNA20}} euroon, kun määrä kasvaa.",
        "Pienin veloitus {{MIN}} € on käytännössä matkan ja kartoituksen hinta. Se ei ole lisämaksu vaan lattia: jos työn arvo ylittää sen, veloitus on työn mukainen.",
      ]],
      ["Milloin kannattaa tilata koko talo kerralla", [
        "Yksikköhinta laskee portaittain, joten koko talon tiivistäminen kerralla on selvästi halvempaa kuin huone kerrallaan. Kymmenen ikkunan kohteessa ikkuna maksaa {{IKKUNA10}} €, viiden ikkunan kohteessa {{IKKUNA5}} €.",
        "Toinen syy on tiivisteiden ikä. Saman talon tiivisteet on yleensä asennettu samaan aikaan, joten ne ovat samassa kunnossa. Se, ettei jostain ikkunasta vielä tunnu vetävän, tarkoittaa usein vain että sen takana on suojaisampi seinä.",
        "Kolmas syy on kalenteri. Yksi käynti on yksi häiriö. Kahdessa erässä tehtynä pienin veloitus tulee maksettavaksi kahdesti.",
      ]],
      ["Mitä tapahtuu käynnin aikana", [
        "Asentaja käy ensin aukot läpi ja kuvaa vuotokohdat lämpökameralla. Samalla tarkistetaan, riittääkö tiivistys vai onko kyse jostain muusta — jos ei riitä, se sanotaan paikan päällä eikä työtä tehdä turhaan.",
        "Vanhat tiivisteet irrotetaan ja kiinnityspinnat puhdistetaan. Tämä on työn hitain vaihe, ja se on myös se vaihe joka useimmiten jää tekemättä itse tehdyssä työssä.",
        "Uudet tiivisteet asennetaan ja ikkunan tai oven toiminta tarkistetaan. Ovista säädetään käynti ja rasvataan saranat. Lopuksi työalue siivotaan ja vanhat tiivisteet viedään pois.",
      ]],
    ],
    faq: [
      ['Pitääkö kotona olla paikalla?', 'Jonkun täytyy päästää asentaja sisään ja olla tavoitettavissa. Muuten voi tehdä omia töitään normaalisti.'],
      ['Mitä jos ikkunoita on enemmän kuin arvioin?', 'Määrän voi tarkistaa paikan päällä ennen työn aloittamista. Hinta lasketaan toteutuneen määrän mukaan samoilla kiinteillä yksikköhinnoilla.'],
      ['Tuleeko matkoista lisää?', 'Mahdollinen matkalisä määräytyy postinumeron mukaan ja näkyy laskurissa ennen varauksen vahvistamista. Sitä ei lisätä jälkikäteen laskuun.'],
      ["Voiko työn tilata vain osaan ikkunoista?", "Voi. Hinta lasketaan silloin sen mukaan, montako aukkoa tehdään — eli harvempi määrä tarkoittaa korkeampaa yksikköhintaa. Pienin veloitus {{MIN}} € koskee joka tapauksessa käyntiä."],
      ["Sopivatko tiivisteet vanhoihin ikkunoihin?", "Sopivat. Profiili valitaan raon mukaan, ei ikkunan iän mukaan. Vanhoissa puuikkunoissa rako on usein suurempi ja epätasaisempi, mikä on nimenomaan syy käyttää oikeaa profiilia yleistiivisteen sijaan."],
    ],
    liittyy: ['vetava-ikkuna', 'kotitalousvahennys-tiivistys', 'milloin-tiivisteet-vaihdetaan'],
  },

  {
    slug: 'kotitalousvahennys-tiivistys',
    title: 'Kotitalousvähennys tiivistystyöstä 2026',
    desc: 'Ovien ja ikkunoiden tiivistys on kotitaloustyötä, josta saa kotitalousvähennyksen. Näin vähennys lasketaan ja mitä laskussa pitää näkyä.',
    h1: 'Kotitalousvähennys tiivistystyöstä 2026',
    lead: 'Ovien ja ikkunoiden tiivistys on kotitaloustyötä. Vähennys pienentää työn osuutta tuntuvasti, mutta se pitää muistaa itse ilmoittaa.',
    julkaistu: '2026-08-27',
    kicker: 'Verotus',
    osiot: [
      ['Kuinka paljon vähennystä saa', [
        'Kotitalousvähennyksenä saa vähentää 40 % työn osuudesta. Vähennys koskee vain työtä, ei materiaaleja eikä matkoja.',
        'Enimmäismäärä on 2 250 € henkilöä kohden vuonna 2026. Pariskunta voi siis vähentää yhteensä 4 500 €, jos molemmat vaativat vähennystä omassa verotuksessaan.',
        'Vähennyksessä on omavastuu 100 € henkilöä kohden vuodessa. Se vähennetään ensimmäisestä vaadittavasta työstä, joten jos olet jo teettänyt muuta kotitaloustyötä samana vuonna, omavastuu on jo käytetty.',
      ]],
      ['Miten se lasketaan käytännössä', [
        'Laskusta erotellaan työn osuus. Siitä lasketaan 40 %, ja tuloksesta vähennetään vielä omavastuu, jos sitä ei ole käytetty.',
        'Esimerkki: kymmenen ikkunan tiivistys maksaa {{ESIM10}} €. Jos työn osuudeksi lasketaan 90 %, työtä on {{TYO10}} €. Siitä 40 % on {{VAH10}} €, ja omavastuun jälkeen vähennystä jää {{VAHNET10}} €.',
        'Laskurimme näyttää arvion vähennyksen jälkeisestä hinnasta jo ennen varausta. Arvio on tarkoituksella varovainen, joten toteutuva vähennys on usein hieman suurempi.',
      ]],
      ['Mitä laskussa pitää näkyä', [
        'Verohallinto edellyttää, että työn osuus on eritelty laskulla. Meidän laskuissamme se on valmiiksi eriteltynä, joten sitä ei tarvitse pyytää erikseen.',
        'Laskulta pitää löytyä myös yrityksen Y-tunnus ja tieto siitä, että yritys kuuluu ennakkoperintärekisteriin. Vähennystä ei saa, jos työn tekijä ei ole rekisterissä.',
        'Säilytä lasku. Verohallinto voi pyytää sen jälkikäteen, vaikka vähennystä ei tarvitse liittää ilmoitukseen.',
      ]],
      ['Näin ilmoitat vähennyksen', [
        'Vähennyksen voi ilmoittaa OmaVerossa heti työn maksamisen jälkeen, jolloin se näkyy verokortissa loppuvuoden aikana. Toinen vaihtoehto on ilmoittaa se veroilmoituksella keväällä.',
        'Ilmoitukseen tarvitaan työn tehneen yrityksen nimi ja Y-tunnus, työn tekopäivä sekä työn osuus laskusta.',
        'Vähennystä voi vaatia se, joka on työn maksanut. Jos lasku maksetaan puoliksi, molemmat voivat vaatia oman osuutensa.',
      ]],
      ["Yleisimmät virheet vähennyksen hakemisessa", [
        "Koko laskun ilmoittaminen työn osuutena. Vähennys koskee vain työtä. Jos ilmoitat koko summan, Verohallinto oikaisee sen ja vähennys pienenee.",
        "Omavastuun unohtaminen. 100 € vähennetään kerran vuodessa henkilöä kohden, ei kerran työtä kohden. Jos olet jo teettänyt siivousta tai remonttia samana vuonna, omavastuu on käytetty.",
        "Ilmoituksen tekemättä jättäminen. Vähennys ei tule automaattisesti, vaikka lasku olisi kuinka selkeä.",
        "Vähennyksen vaatiminen väärältä vuodelta. Ratkaiseva on maksupäivä, ei työn tekopäivä. Joulukuussa tehty ja tammikuussa maksettu työ kuuluu uudelle vuodelle.",
      ]],
      ["Miten vähennys kannattaa ajoittaa", [
        "Jos vuoden 2 250 euron katto on jo täynnä muista töistä, tiivistyksen voi ajoittaa seuraavan vuoden puolelle. Käytännössä tämä koskee vain isoja remontteja — tiivistystyön koko harvoin täyttää kattoa yksin.",
        "Pariskunnan kannattaa jakaa lasku, jos summa on suuri. Molemmat voivat vaatia oman osuutensa ja käyttää oman kattonsa, jolloin yhteenlaskettu vähennys voi olla kaksinkertainen.",
        "Omavastuu kannattaa \"käyttää\" pienimpään työhön. Jos teetät vuoden aikana useita kotitaloustöitä, omavastuu vähennetään joka tapauksessa kerran — sillä ei ole väliä mistä työstä.",
      ]],
    ],
    faq: [
      ['Saako vähennyksen myös vapaa-ajan asunnosta?', 'Saa. Kotitalousvähennys koskee omaa tai vanhempien käytössä olevaa asuntoa, myös vapaa-ajan asuntoa. Sijoitusasunnosta vähennystä ei saa.'],
      ['Entä jos asun taloyhtiössä?', 'Oman asunnon sisäpuolisista töistä saa vähennyksen normaalisti. Taloyhtiön yhteisissä tiloissa teetetty työ on taloyhtiön kulua, eikä siitä saa henkilökohtaista vähennystä.'],
      ['Onko vähennys automaattinen?', 'Ei. Se pitää itse ilmoittaa OmaVerossa tai veroilmoituksella. Emme voi tehdä ilmoitusta puolestasi.'],
      ["Voiko vähennyksen saada, jos maksan laskun osissa?", "Kyllä. Vähennys määräytyy sen mukaan, paljonko olet kalenterivuoden aikana maksanut. Osamaksut jakautuvat siis niille vuosille, joina ne on maksettu."],
      ["Riittääkö tilisiirto todisteeksi?", "Verohallinto voi pyytää sekä laskun että maksutositteen. Säilytä molemmat. Käteismaksusta ei saa vähennystä lainkaan."],
    ],
    liittyy: ['ikkunan-tiivisteiden-vaihto', 'paljonko-tiivistys-saastaa', 'vetava-ikkuna'],
  },

  {
    slug: 'paljonko-tiivistys-saastaa',
    titleSeo: 'Paljonko tiivistys säästää lämmityskuluissa?',
    title: 'Paljonko ovien ja ikkunoiden tiivistys säästää lämmityskuluissa?',
    desc: 'Tiivistys pienentää lämpöhukkaa arviolta 10–15 %. Näin arvio muodostuu, mihin se perustuu ja milloin säästö jää pienemmäksi.',
    h1: 'Paljonko ovien ja ikkunoiden tiivistys säästää lämmityskuluissa?',
    lead: 'Tiivistyksen säästövaikutus on todellinen mutta vaihteleva. Se riippuu siitä, kuinka moni kohta vuotaa ja miten taloa lämmitetään.',
    julkaistu: '2026-08-27',
    kicker: 'Säästö',
    osiot: [
      ['Mistä säästö syntyy', [
        'Vuotava ikkuna ja ovi päästävät lämmintä sisäilmaa ulos ja kylmää tilalle. Lämmitysjärjestelmä joutuu korvaamaan tämän hukan, ja se näkyy laskussa.',
        'Hallitsematon ilmavuoto on eri asia kuin ilmanvaihto. Ilmanvaihdon kuuluu tuoda korvausilmaa suunnitellusti korvausilmaventtiilien kautta. Ikkunan raosta tuleva ilma ei ole suunniteltua eikä se lämpene ennen huonetilaan tuloa.',
        'Tiivistys ei siis heikennä ilmanvaihtoa, jos korvausilmaventtiilit ovat kunnossa. Se ohjaa ilman kulkemaan sitä reittiä, jota varten se on tarkoitettu.',
      ]],
      ['Mihin 10–15 % perustuu', [
        'Käytämme arviota 10–15 % pudotuksesta lämmityskuluissa. Arvio koskee tavanomaista kohdetta, jossa vetävien ovien ja ikkunoiden tiivisteet uusitaan.',
        'Se on arvio, ei lupaus. Emme lupaa tiettyä säästöä etukäteen, koska toteutuma riippuu rakennuksesta, lämmitystavasta ja siitä, kuinka moni kohta oikeasti vuotaa.',
        'Jos talon ikkunat on tiivistetty hiljattain, säästö jää pieneksi. Jos tiivisteitä ei ole vaihdettu kahteenkymmeneen vuoteen, vaikutus on selvästi suurempi.',
      ]],
      ['Milloin säästö jää pienemmäksi', [
        'Kun päävuoto on muualla kuin ikkunoissa. Yläpohjan tai alapohjan vuodot ovat usein suurempia kuin ikkunoiden, eikä tiivistys korjaa niitä.',
        'Kun rakennus on jo tiivis. Uudehkossa talossa tiivisteet ovat kunnossa, eikä parannettavaa juuri ole.',
        'Kun lämmitysmuoto on halpa. Maalämpötalossa sama säästetty kilowattitunti maksaa vähemmän kuin suorasähkötalossa, joten euromääräinen hyöty on pienempi vaikka lämpöhukka pienenisi yhtä paljon.',
      ]],
      ['Miten säästön voi todeta', [
        'Vertaa lämmityksen kulutusta edelliseen vastaavaan jaksoon, älä euroja. Energian hinta heilahtelee, joten euroista ei näe muutosta luotettavasti.',
        'Käytä lämmitystarveluvulla korjattua kulutusta, jos se on saatavilla. Se ottaa huomioon sen, oliko talvi kylmä vai leuto.',
        'Lämpökamerakuva ennen ja jälkeen näyttää muutoksen konkreettisemmin kuin laskutiedot. Kuvaamme kohteen käynnin yhteydessä.',
      ]],
      ["Esimerkkilaskelma", [
        "Oletetaan omakotitalo, jonka lämmityskulut ovat 2 000 € vuodessa ja jonka ikkunoiden tiivisteitä ei ole vaihdettu viiteentoista vuoteen.",
        "Kymmenen ikkunan tiivistys maksaa {{ESIM10}} €. Työn osuudesta saa kotitalousvähennyksen, joka pienentää lopullista kustannusta noin {{VAHNET10}} eurolla omavastuun jälkeen.",
        "Jos lämmityskulut pienenevät arvioidut 10–15 %, säästö on 200–300 € vuodessa. Investointi maksaa itsensä takaisin karkeasti kahdessa vuodessa, ja tiivisteet kestävät 10–20 vuotta.",
        "Luvut ovat esimerkki, eivät lupaus. Jos tiivisteet on vaihdettu hiljattain tai päävuoto on yläpohjassa, säästö jää selvästi pienemmäksi.",
      ]],
      ["Mitä tiivistys ei korjaa", [
        "Yläpohjan ja alapohjan vuodot. Ne ovat usein suurempia kuin ikkunoiden, koska lämmin ilma nousee ja hakeutuu ulos katon rajasta.",
        "Kylmäsillat. Jos seinärakenteessa kulkee lämpöä johtava rakenne, se näkyy lämpökamerassa mutta ei korjaannu tiivistämällä.",
        "Riittämätön eristys. Ohut villakerros hukkaa lämpöä koko pinta-alaltaan, ei raosta.",
        "Ikkunan huono U-arvo. Yksilasinen ikkuna johtaa lämpöä lasin läpi. Tiivistys estää ilmavuodon mutta ei muuta lasin ominaisuuksia.",
        "Käymme nämä läpi kartoituksessa ja sanomme suoraan, jos tiivistys ei ole se mikä kohteessa kannattaa tehdä.",
      ]],
    ],
    faq: [
      ['Tukkiiko tiivistys ilmanvaihdon?', 'Ei, jos korvausilmaventtiilit ovat auki ja kunnossa. Tiivistys poistaa hallitsemattoman vuodon, ei suunniteltua ilmanvaihtoa. Tarkistamme venttiilit käynnin yhteydessä.'],
      ['Kannattaako tiivistys, jos aion vaihtaa ikkunat parin vuoden päästä?', 'Usein kannattaa. Tiivistys maksaa murto-osan ikkunaremontista ja vaikuttaa heti seuraavana talvena. Ikkunaremontin ajankohdan voi päättää erikseen.'],
      ['Näkyykö säästö heti?', 'Vaikutus alkaa heti, mutta se näkyy laskussa vasta seuraavan lämmityskauden aikana. Kesällä tehty tiivistys ehtii vaikuttaa koko talven.'],
      ["Vaikuttaako tiivistys sisäilman kosteuteen?", "Voi vaikuttaa. Kun hallitsematon vuoto loppuu, ilmanvaihdon merkitys kasvaa. Jos kosteus tuntuu nousevan, tarkista että korvausilmaventtiilit ovat auki ja poistoilmanvaihto toimii."],
      ["Kannattaako tiivistää kesällä?", "Kannattaa. Työ ehtii valmiiksi ennen lämmityskautta, ja kesällä aikoja on parhaiten tarjolla. Tiivistys vähentää myös kuuman ilman pääsyä sisään hellejaksoilla."],
    ],
    liittyy: ['vetava-ikkuna', 'kotitalousvahennys-tiivistys', 'taloyhtion-tiivistys'],
  },

  {
    slug: 'milloin-tiivisteet-vaihdetaan',
    title: 'Milloin tiivisteet pitää vaihtaa? Kuusi merkkiä',
    desc: 'Tiivisteet kestävät noin 10–20 vuotta. Näistä merkeistä tunnistat, että vaihdon aika on tullut — ja mitä voit testata itse minuutissa.',
    h1: 'Milloin tiivisteet pitää vaihtaa? Kuusi merkkiä',
    lead: 'Tiiviste ei mene rikki kerralla vaan kovettuu vähitellen. Siksi vetoa ei huomaa ennen kuin se on ollut olemassa jo vuosia.',
    julkaistu: '2026-08-27',
    kicker: 'Tunnistaminen',
    osiot: [
      ['Kuusi merkkiä', [
        'Tunnet vedon, kun istut ikkunan lähellä. Tavallisin ja luotettavin merkki.',
        'Tiiviste ei palaudu, kun sitä painaa. Terve tiiviste joustaa ja nousee takaisin. Kovettunut jää painaumaan.',
        'Tiivisteessä on halkeamia tai se on litistynyt puoleen alkuperäisestä paksuudestaan.',
        'Ikkunalauta on kylmä tai siinä on kosteutta pakkasilla.',
        'Ikkuna sulkeutuu liian kevyesti. Jos salpa kääntyy ilman vastusta, tiiviste ei purista.',
        'Ulkoa kuuluvat äänet ovat voimistuneet ilman, että ulkona on muuttunut mikään.',
      ]],
      ['Minuutin testi', [
        'Ota tavallinen A4-paperi. Aseta se puitteen ja karmin väliin ja sulje ikkuna.',
        'Vedä paperia. Jos se liukuu ulos ilman vastusta, tiiviste ei purista siitä kohtaa.',
        'Toista testi ikkunan neljällä sivulla. Yksittäinen löysä kohta riittää aiheuttamaan tuntuvan vedon, koska ilma hakeutuu aina helpoimmalle reitille.',
      ]],
      ['Kuinka kauan tiivisteet kestävät', [
        'Tavallinen käyttöikä on 10–20 vuotta. Vaihteluväli on suuri, koska kulumiseen vaikuttaa auringon ja pakkasen määrä sekä se, kuinka usein ikkunaa avataan.',
        'Eteläseinän ikkunat kuluvat nopeimmin. Auringon UV-säteily haurastuttaa tiivistemateriaalia, joten samassa talossa eri seinien tiivisteet voivat olla eri kunnossa.',
        'Ulko-ovi kuluu ikkunoita nopeammin, koska sitä käytetään päivittäin. Oven tiivisteet ja käynnin säätö kannattaa tarkistaa useammin kuin ikkunoiden.',
      ]],
      ['Mikä on hyvä hetki teettää työ', [
        'Loppukesä ja alkusyksy ovat paras aika. Työ ehtii valmistua ennen pakkasia, ja vaikutus näkyy koko lämmityskauden ajan.',
        'Talvella tiivistys onnistuu myös, ja veto tuntuu silloin selvimmin — vuotokohdat on helppo paikantaa.',
        'Kevät ja kesä ovat rauhallisinta aikaa, jolloin aikoja on parhaiten tarjolla.',
      ]],
      ["Mitä tiivistetyyppejä on", [
        "P-profiili on yleisin ikkunatiiviste. Se puristuu kokoon kapeassa raossa ja palautuu, kun ikkuna avataan.",
        "D-profiili on paksumpi ja sopii leveämpiin rakoihin, tyypillisesti vanhoihin puuikkunoihin joissa rako on epätasainen.",
        "E- ja K-profiilit ovat matalampia ja sopivat ahtaisiin urin, joissa paksumpi tiiviste estäisi ikkunaa sulkeutumasta.",
        "Kynnyskumi on oma tuoteryhmänsä: se kuluu mekaanisesti askelten alla eikä auringon takia, joten se vaihdetaan usein muita tiivisteitä useammin.",
        "Oikea profiili valitaan mittaamalla rako, ei arvaamalla. Väärä profiili on yleisin syy siihen, että itse tehty tiivistys ei auttanut.",
      ]],
      ["Mitä tapahtuu jos ei vaihda", [
        "Lämmityskulut jäävät korkeammiksi kuin niiden tarvitsisi olla, joka talvi uudestaan.",
        "Kylmä ilmavirta ikkunan pinnalla lisää kosteuden tiivistymistä ikkunalaudalle ja puitteen alareunaan. Pitkään jatkuessaan se voi johtaa maalipinnan hilseilyyn ja puun tummumiseen.",
        "Veto tuntuu asumismukavuudessa: ikkunan lähellä ei voi istua, ja huoneen lämpötila joudutaan pitämään korkeampana kuin muuten tarvitsisi.",
        "Tiiviste ei kuitenkaan aiheuta äkillistä vauriota. Vaihdon lykkääminen maksaa rahaa, mutta se ei riko rakennetta samalla tavalla kuin esimerkiksi vuotava katto.",
      ]],
    ],
    faq: [
      ['Pitääkö kaikki tiivisteet vaihtaa kerralla?', 'Ei ole pakko, mutta yleensä kannattaa. Pienin veloitus käynniltä on {{MIN}} €, joten yhden ikkunan tilaaminen erikseen tulee suhteessa kalliiksi. Lisäksi saman ikäiset tiivisteet ovat yleensä samassa kunnossa.'],
      ['Voiko tiivisteitä huoltaa niin että ne kestävät pidempään?', 'Silikonipohjainen hoitoaine pitää kumin joustavampana ja hidastaa kovettumista. Se ei palauta jo kovettunutta tiivistettä, mutta uusien kanssa siitä on hyötyä.'],
      ['Mistä tiedän, tarvitseeko ovi säätöä vai uudet tiivisteet?', 'Jos ovi hankaa tai ei sulkeudu tasaisesti, kyse on säädöstä. Jos ovi sulkeutuu hyvin mutta vetää, kyse on tiivisteistä. Usein tarvitaan molemmat, ja säätö sisältyy meillä työhön.'],
      ["Kuinka usein kynnyskumi pitää vaihtaa?", "Selvästi useammin kuin ikkunatiivisteet, tyypillisesti 5–10 vuoden välein. Se kuluu askelten alla. Pelkän kynnyskumin vaihto on erillinen ja edullinen työ."],
      ["Näkeekö tiivisteen kunnon ilman työkaluja?", "Näkee usein. Paina tiivistettä sormella: terve palautuu, kovettunut jää painaumaan. Halkeamat ja litistyminen kertovat myös selvästi."],
    ],
    liittyy: ['vetava-ikkuna', 'ikkunan-tiivisteiden-vaihto', 'paljonko-tiivistys-saastaa'],
  },

  {
    slug: 'taloyhtion-tiivistys',
    titleSeo: 'Taloyhtiön tiivistys: opas hallitukselle',
    title: 'Taloyhtiön ovien ja ikkunoiden tiivistys: mitä hallituksen kannattaa tietää',
    desc: 'Miten taloyhtiön tiivistysurakka etenee kartoituksesta raporttiin, mikä on yhtiön ja mikä osakkaan vastuulla, ja mitä hinnoittelussa kannattaa kysyä.',
    h1: 'Taloyhtiön ovien ja ikkunoiden tiivistys: mitä hallituksen kannattaa tietää',
    lead: 'Tiivistys on taloyhtiölle harvinaisen suoraviivainen hanke: se ei vaadi purkamista, asukkaat voivat asua normaalisti ja työ valmistuu päivissä, ei kuukausissa.',
    julkaistu: '2026-08-27',
    kicker: 'Taloyhtiöt',
    osiot: [
      ['Mikä kuuluu yhtiölle ja mikä osakkaalle', [
        'Ikkunoiden ulkopuoliset osat ja rakenteet ovat pääsääntöisesti yhtiön vastuulla, sisäpuoliset pinnat osakkaan. Tiivisteiden osalta vastuunjako vaihtelee yhtiöjärjestyksen ja vastuunjakotaulukon mukaan.',
        'Käytännössä yhteisten tilojen ovet, rappukäytävien ikkunat ja ulko-ovet ovat selkeästi yhtiön hanke. Huoneistojen ikkunat vaativat päätöksen siitä, teettääkö yhtiö ne kaikille kerralla vai jättääkö osakkaiden vastuulle.',
        'Kerralla koko yhtiölle teetettynä yksikköhinta on matalampi kuin osakkaiden erikseen tilaamana, koska sama käynti kattaa useita asuntoja.',
      ]],
      ['Miten urakka etenee', [
        'Kartoituskäynti. Käymme läpi kohteet, laskemme aukot ja kuvaamme vuotokohdat lämpökameralla. Käynti on maksuton eikä sido mihinkään.',
        'Kirjallinen tarjous. Hallitus saa kiinteän sopimushinnan, jossa aukkomäärät ja työn sisältö on eritelty. Summa ei muutu matkan varrella.',
        'Aikataulu ja tiedotus. Sovimme päivät ja toimitamme asukastiedotteen, jonka voi laittaa rappukäytävään sellaisenaan.',
        'Työ. Asunnot käydään läpi sovitussa järjestyksessä. Yhtä asuntoa kohden menee tyypillisesti alle tunti, ja asukas voi olla kotona normaalisti.',
        'Raportti. Hallitus saa dokumentin tehdystä työstä: mitä tehtiin, missä ja millä tuotteilla.',
      ]],
      ['Mitä tarjouksissa kannattaa vertailla', [
        'Onko hinta kiinteä vai arvio. Aukkokohtainen kiinteä hinta on vertailukelpoinen, tuntihinta ei.',
        'Sisältyvätkö tiivisteet ja tarvikkeet hintaan vai laskutetaanko ne erikseen.',
        'Kuuluuko ovien käynnin säätö työhön. Pelkkä tiivisteen vaihto ei auta, jos ovi ei sulkeudu tasaisesti.',
        'Kuka työn tekee. Alihankintaketju tarkoittaa, että vastuu hajaantuu ja aikataulu riippuu useammasta osapuolesta. Me teemme työt omalla porukalla.',
        'Mitä jälkeen jää. Kirjallinen raportti on hallitukselle tarpeen sekä kirjanpitoa että seuraavaa kuntoarviota varten.',
      ]],
      ['Häiriö asukkaille', [
        'Työ tehdään sisäkautta ilman telineitä. Pihalle ei tule työmaata eikä kulkureittejä suljeta.',
        'Pölyä syntyy vähän. Työalue suojataan ja siivotaan lähtiessä, ja vanhat tiivisteet viedään pois.',
        'Asukkaan ei tarvitse tyhjentää huoneita. Riittää, että ikkunan eteen pääsee.',
      ]],
      ["Miten hanke perustellaan yhtiökokouksessa", [
        "Tiivistys on kunnossapitoa, ei uudistusta. Se palauttaa rakenteen alkuperäiseen kuntoon eikä paranna tasoa, mikä yleensä helpottaa päätöksentekoa.",
        "Kustannus on pieni suhteessa muihin lämpötalouden hankkeisiin. Ikkunaremontti tai lämmitysjärjestelmän vaihto liikkuu kymmenissä tai sadoissa tuhansissa, tiivistys aukkokohtaisina yksikköhintoina murto-osassa siitä.",
        "Vaikutus alkaa heti seuraavana lämmityskautena, toisin kuin hankkeissa joiden takaisinmaksuaika on kymmeniä vuosia.",
        "Kartoituskäynnin lämpökamerakuvat ovat hyvä liite esityslistalle: ne näyttävät vuotokohdat konkreettisesti, eikä asiaa tarvitse perustella pelkillä arvioilla.",
      ]],
      ["Aikataulu ja asukasviestintä", [
        "Tavallinen kerrostalorappu etenee muutamassa päivässä. Yhtä asuntoa kohden menee tyypillisesti alle tunti.",
        "Asukkaille riittää tieto päivästä ja siitä, että asuntoon pitää päästä sisään. Toimitamme valmiin tiedotteen, jonka voi laittaa rappukäytävään sellaisenaan.",
        "Poissaolevien asuntojen kanssa toimitaan sovitusti: joko huoltoyhtiön avaimella tai jälkikäynnillä. Jälkikäynnit kannattaa sopia etukäteen, jotta niistä ei tule erillistä käyntiveloitusta.",
        "Käytännössä paras järjestys on yhteiset tilat ensin ja huoneistot sen jälkeen. Yhteiset tilat ovat yksiselitteisesti yhtiön vastuulla, joten työ pääsee alkamaan ilman osakaskohtaisia kysymyksiä.",
      ]],
    ],
    faq: [
      ['Tarvitaanko yhtiökokouksen päätös?', 'Riippuu summasta ja siitä, onko kyse kunnossapidosta vai uudistuksesta. Tavanomainen kunnossapito on yleensä hallituksen päätettävissä. Tarkista oman yhtiönne käytäntö isännöitsijältä.'],
      ['Voiko työn jakaa useammalle vuodelle?', 'Voi. Yleinen tapa on aloittaa yhteisistä tiloista ja rappukäytävistä, ja teettää huoneistot seuraavana vuonna.'],
      ['Miten hinta muodostuu taloyhtiössä?', 'Samoilla aukkokohtaisilla yksikköhinnoilla kuin omakotitaloissa, mutta määrä on suurempi, joten yksikköhinta laskee. Tarjous annetaan kiinteänä sopimushintana kartoituksen jälkeen.'],
      ["Saako taloyhtiö kotitalousvähennyksen?", "Ei. Kotitalousvähennys on henkilökohtainen. Taloyhtiön teettämä työ on yhtiön kulua. Osakas voi saada vähennyksen vain itse tilaamastaan ja maksamastaan työstä omassa huoneistossaan."],
      ["Voiko osakas teettää oman asuntonsa ikkunat erikseen?", "Voi, ja silloin hän saa myös kotitalousvähennyksen. Yksikköhinta on kuitenkin korkeampi kuin koko yhtiölle kerralla teetettynä, ja pienin veloitus {{MIN}} € koskee jokaista erillistä käyntiä."],
      ["Tarvitaanko urakkasopimus?", "Kirjallinen tarjous kiinteällä sopimushinnalla riittää tavanomaiseen tiivistysurakkaan. Se sisältää aukkomäärät, hinnan, aikataulun ja työn sisällön."],
    ],
    liittyy: ['paljonko-tiivistys-saastaa', 'milloin-tiivisteet-vaihdetaan', 'ikkunan-tiivisteiden-vaihto'],
  },
];
