/* Latausnäkymä koko suojatulle alueelle.

   Ilman tätä sivulta toiselle siirtyminen ei näytä MITÄÄN ennen kuin
   palvelin vastaa: linkkiä painanut käyttäjä luulee ettei nappi reagoinut.
   Next.js käyttää tätä välittömästi navigoinnin alkaessa, joten palaute on
   heti — riippumatta siitä kuinka kauan kyselyt kestävät.

   Muoto matkii sisältöä (otsikko + kortteja), jottei näkymä hyppää kun
   oikea sisältö saapuu. */

function Bar({ w, h = 'h-4' }: { w: string; h?: string }) {
  return <div className={`${h} ${w} animate-pulse rounded bg-line-soft`} />;
}

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Ladataan…</span>

      <div className="space-y-2">
        <Bar w="w-56" h="h-7" />
        <Bar w="w-72" h="h-4" />
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-(--radius-card) border border-line bg-ink-800 p-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <Bar w="w-28" h="h-5" />
              <Bar w="w-24" h="h-5" />
            </div>
            <Bar w="w-2/3" />
            <Bar w="w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
