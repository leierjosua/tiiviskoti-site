'use client';

import { useOptimistic, useTransition } from 'react';
import { setLeadStatus } from '../alueet/actions';
import { Select } from '@/components/ui';

const LABELS: Record<string, string> = {
  new: 'Uusi',
  contacted: 'Yhteydessä',
  no_answer: 'Soita uudelleen',
  converted: 'Muuttui asiakkaaksi',
  rejected: 'Ei jatkoa',
};

/**
 * Tila vaihtuu heti valinnasta — erillinen tallennusnappi olisi turha
 * yhden kentän lomakkeessa.
 *
 * EI <form>-ELEMENTTIÄ, VAIKKA SE OLISI LUONTEVA. React nollaa lomakkeen
 * kun sen `action` on ajettu loppuun, ja nollaus palauttaa valikkoon sen
 * arvon jonka palvelin renderöi ENNEN tallennusta. Tallennus meni kantaan
 * asti, mutta valikko loksahti sekunnissa takaisin vanhaan — ruudulla se
 * näytti täsmälleen siltä ettei valinta mene läpi. Uudelleenrenderöinti
 * ei korjannut sitä: kun palvelimen uusi arvo ja komponentin oma tila ovat
 * jo samat, React ei piirrä mitään uusiksi eikä siis koske selaimen
 * nollaamaan valikkoon. Serveritoimintoa kutsutaan siksi suoraan.
 *
 * `useOptimistic` näyttää valitun arvon heti ja palaa palvelimen arvoon
 * kun siirtymä päättyy. Onnistuneessa tallennuksessa palvelimen arvo on
 * silloin jo uusi, epäonnistuneessa vanha — kumpikaan ei jää ruudulle
 * valehtelemaan. Tavallinen useState ei tähän riitä: epäonnistunut
 * tallennus ei muuta `status`-proppia, joten mikään ei laukaisisi paluuta.
 *
 * LEVEYS TULEE INLINE-TYYLISTÄ. `Select` asettaa `w-full`, eikä sitä voi
 * kumota className-luokalla, koska `cx` vain ketjuttaa merkkijonot eikä
 * osaa poistaa aiempaa leveyttä — molemmat päätyvät samaan kerrokseen ja
 * `w-full` voittaa. Valikko oli siksi 66 px leveä ja jokainen tila näkyi
 * kolmen kirjaimen tynkänä: "Uus", "Mui", "Soi", "Ei j". Tilaa ei voinut
 * lukea, vain arvata.
 */
export function LeadStatus({ id, status }: { id: string; status: string }) {
  const [näkyvä, asetaNäkyvä] = useOptimistic(status);
  const [pending, startTransition] = useTransition();

  return (
    <Select
      name="status"
      aria-label="Liidin tila"
      aria-busy={pending}
      value={näkyvä}
      style={{ width: 'auto' }}
      onChange={(e) => {
        const valittu = e.currentTarget.value;
        startTransition(async () => {
          asetaNäkyvä(valittu);
          const data = new FormData();
          data.set('id', id);
          data.set('status', valittu);
          await setLeadStatus(data);
        });
      }}
      className={`py-1 text-xs transition-opacity ${pending ? 'opacity-50' : ''}`}
    >
      {Object.entries(LABELS).map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </Select>
  );
}
