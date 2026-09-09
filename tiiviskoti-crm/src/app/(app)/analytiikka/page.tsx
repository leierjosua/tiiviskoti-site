import { redirect } from 'next/navigation';

/* Valikon "Analytiikka" osoittaa tänne, jotta aktiivinen kohta pysyy
   korostettuna kummallakin välilehdellä. Talous ensin: se on se luku jota
   käydään katsomassa ilman erityistä syytä. */
export default function AnalytiikkaIndex() {
  redirect('/analytiikka/talous');
}
