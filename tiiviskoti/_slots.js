/* =========================================================
   Näytettävien aikojen karsinta.

   MIKSI TÄMÄ ON OLEMASSA: `/api/public/availability` palauttaa KAIKKIEN
   alueen asentajien vapaat ajat yhtenä listana, ja jokaisen kalenterin
   alkuajat asetellaan sen OMAN työvuoron alusta `slot_minutes`-välein.
   Kaksi eri aikaan alkavaa vuoroa tuottaa siksi pareja kuten 10.00 ja
   10.30: ne eivät ole asiakkaalle kaksi vaihtoehtoa vaan sama hetki, ja
   ruudukko näyttää rikkinäiseltä. Samasta syystä päivässä saattoi olla
   seitsemän nappia, joista suurin osa oli tuollaisia lähes kaksoiskappaleita.

   Kaksi sääntöä: peräkkäisten aikojen välissä on oltava vähintään
   MIN_GAP_MIN minuuttia, ja päivässä näytetään enintään MAX_SLOTS aikaa.

   TÄMÄ ON VAIN ESITYSTÄ VARTEN. Jokainen jäljelle jäävä aika on oikea
   slotti oikeasta kalenterista, ja varaus lähtee sen omalla
   `startsAt`/`calendarId`-parillaan — karsinta ei siis voi tuottaa
   varausta aikaan jota ei ole olemassa. Se voi vain jättää olemassa
   olevia aikoja näyttämättä, mikä on tarkoitus: vähemmän ja selvempiä
   vaihtoehtoja. Jos asiakas tarvitsee jonkin muun ajan, hän soittaa.
   ========================================================= */

/** Enintään näin monta aikaa yhtä päivää kohti. */
export const MAX_SLOTS = 5;

/** Peräkkäisten näytettävien aikojen vähimmäisväli minuutteina. */
const MIN_GAP_MIN = 90;

/**
 * @param {{time:string, startsAt:string, calendarId:string}[]} slots yhden
 *        päivän ajat, mielivaltaisessa järjestyksessä
 * @returns {typeof slots} sama lista karsittuna ja aikajärjestyksessä
 */
export function thinSlots(slots) {
  if (!slots || slots.length <= 1) return slots ? slots.slice() : [];

  const sorted = slots.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  /* 1) Liian lähekkäiset pois. Aikaisin aika säilyy aina, koska se on se
        jonka asiakas useimmiten haluaa — karsinta etenee siitä eteenpäin. */
  const spaced = [];
  for (const s of sorted) {
    const prev = spaced[spaced.length - 1];
    if (!prev || new Date(s.startsAt) - new Date(prev.startsAt) >= MIN_GAP_MIN * 60000) {
      spaced.push(s);
    }
  }
  if (spaced.length <= MAX_SLOTS) return spaced;

  /* 2) Vielä liikaa → harvennetaan tasavälein. Ensimmäinen ja viimeinen
        otetaan aina mukaan, jotta päivän koko haarukka näkyy eikä asiakas
        luule ettei iltapäivää ole tarjolla. */
  const out = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const pick = spaced[Math.round((i * (spaced.length - 1)) / (MAX_SLOTS - 1))];
    if (out[out.length - 1] !== pick) out.push(pick);
  }
  return out;
}

/* HUOM: kartoituskäynnit (`_kartoitus.js`) EIVÄT käytä tätä tarkoituksella.
   Siellä on yksi kalenteri eikä siis lainkaan kahden vuoron tuottamia
   lähes kaksoiskappaleita, ja taloyhtiön yhteyshenkilö sovittaa käynnin
   isännöitsijän aikatauluun — hänelle laaja valikoima on hyöty, ei haitta. */
