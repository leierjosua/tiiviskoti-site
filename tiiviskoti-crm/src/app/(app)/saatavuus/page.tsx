import Link from 'next/link';
import { requireManager } from '@/lib/session';
import { saatavuus, type SaatavuusPaiva } from '@/lib/saatavuus';
import { Card, Empty, PageHead } from '@/components/ui';
import { formatDateKey, isoWeekday, todayKey, weekdayShort } from '@/lib/time';

export const dynamic = 'force-dynamic';

/* =========================================================
   Kaikkien työntekijöiden ajat yhdessä ruudussa.

   MIHIN TÄTÄ TARVITAAN: kalenterissa näkyy mitä on sovittu, ei sitä
   mitä VOITAISIIN sopia. Ero on koko kapasiteettikysymys — syyskuussa
   varauksia oli 12 viikossa ja sen jälkeen 5, 5, 1, 0, eikä pudotus
   johtunut kysynnästä vaan siitä ettei päiviä ollut ilmoitettu. Sitä ei
   näe mistään ennen kuin se on liian myöhäistä. Tämä sivu näyttää sen
   yhdellä silmäyksellä.

   Alarivin "vapaita" on se luku joka kertoo paljonko töitä voi vielä
   ottaa: ilmoitettuja työpäiviä joilla ei ole vielä keikkaa.
   ========================================================= */

const VIIKKOJA = 6;

function Ruutu({ p }: { p: SaatavuusPaiva }) {
  const yhteinen = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold';
  if (p.tila === 'poissa') {
    return <div className={`${yhteinen} bg-danger/15 text-danger`} title={`${p.date} poissa${p.note ? ` — ${p.note}` : ''}`}>✕</div>;
  }
  if (p.tila === 'tyossa') {
    /* Varattu päivä on tummempi: vapaana oleva työpäivä on se jota
       etsitään, joten sen pitää erottua myös varatusta. */
    return p.toita > 0
      ? <div className={`${yhteinen} bg-accent/70 text-ink-900`} title={`${p.date} ${p.alku}–${p.loppu} · ${p.toita} keikkaa`}>{p.toita}</div>
      : <div className={`${yhteinen} border border-accent/60 bg-accent/10 text-accent`} title={`${p.date} ${p.alku}–${p.loppu} · vapaa`}>✓</div>;
  }
  return <div className={`${yhteinen} border border-dashed border-line text-faint`} title={`${p.date} ei ilmoitettu`}>·</div>;
}

export default async function SaatavuusPage() {
  await requireManager();
  const alku = todayKey();
  const tiedot = await saatavuus(null, VIIKKOJA * 7, alku);

  if (!tiedot.length) {
    return (
      <div className="space-y-6">
        <PageHead title="Saatavuus" />
        <Card><Empty>Ei kalentereita.</Empty></Card>
      </div>
    );
  }

  const paivat = tiedot[0].paivat.map((p) => p.date);

  /* Viikkokohtaiset summat: montako asentajapäivää on ilmoitettu ja
     montako niistä on vielä vapaana. */
  const viikkoAvain = (d: string) => {
    const i = paivat.indexOf(d);
    return Math.floor(i / 7);
  };
  const viikot = Array.from({ length: VIIKKOJA }, (_, v) => {
    const omat = paivat.filter((d) => viikkoAvain(d) === v);
    let tyossa = 0, vapaita = 0, poissa = 0;
    for (const kal of tiedot) {
      for (const p of kal.paivat) {
        if (viikkoAvain(p.date) !== v) continue;
        if (p.tila === 'tyossa') { tyossa++; if (p.toita === 0) vapaita++; }
        else if (p.tila === 'poissa') poissa++;
      }
    }
    return { v, alku: omat[0], loppu: omat[omat.length - 1], tyossa, vapaita, poissa };
  });

  const yhteensaVapaita = viikot.reduce((n, v) => n + v.vapaita, 0);
  const tyhjatViikot = viikot.filter((v) => v.tyossa === 0);

  return (
    <div className="space-y-6">
      <PageHead
        title="Saatavuus"
        sub={<span className="text-sm text-muted">
          Kuka voi tehdä töitä ja milloin — seuraavat {VIIKKOJA} viikkoa.{' '}
          <Link href="/kalenterit" className="text-accent hover:underline">Työajat →</Link>
        </span>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm font-semibold text-muted">Vapaita työpäiviä</p>
          <p className="mt-1.5 text-[28px] leading-none font-extrabold tabular text-accent">{yhteensaVapaita}</p>
          <p className="mt-1.5 text-xs text-faint">ilmoitettu, ei vielä keikkaa</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold text-muted">Asentajia</p>
          <p className="mt-1.5 text-[28px] leading-none font-extrabold tabular">{tiedot.length}</p>
          <p className="mt-1.5 text-xs text-faint">kalenteria käytössä</p>
        </Card>
        <Card className="col-span-2 p-4 lg:col-span-2">
          <p className="text-sm font-semibold text-muted">Viikot ilman yhtään ilmoitettua päivää</p>
          <p className={`mt-1.5 text-[28px] leading-none font-extrabold tabular
                         ${tyhjatViikot.length ? 'text-warn' : 'text-text'}`}>
            {tyhjatViikot.length}
          </p>
          <p className="mt-1.5 text-xs text-faint">
            {tyhjatViikot.length
              ? `alkaen ${formatDateKey(tyhjatViikot[0].alku)} — näille ei voi myydä mitään`
              : 'jokaiselle viikolle on tekijä'}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5 text-xs">
          <span className="font-bold text-text">Merkinnät</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded border border-accent/60 bg-accent/10" /> vapaa työpäivä
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded bg-accent/70" /> varattu (luku = keikkoja)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded bg-danger/15" /> poissa
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded border border-dashed border-line" /> ei ilmoitettu
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-ink-800 px-4 py-2 text-left text-xs
                               font-semibold uppercase tracking-wide text-faint">
                  Asentaja
                </th>
                {paivat.map((d) => {
                  const vkp = isoWeekday(d);
                  return (
                    <th key={d} className={`px-0.5 py-2 text-center text-[10px] font-semibold
                                            ${vkp >= 6 ? 'text-faint' : 'text-muted'}`}>
                      <div>{weekdayShort(vkp)}</div>
                      <div className="tabular font-normal text-faint">{d.slice(8)}.{d.slice(5, 7)}.</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tiedot.map((kal) => {
                const vapaita = kal.paivat.filter((p) => p.tila === 'tyossa' && p.toita === 0).length;
                return (
                  <tr key={kal.calendarId} className="border-t border-line-soft">
                    <td className="sticky left-0 z-10 bg-ink-900 px-4 py-2">
                      <Link href={`/kalenterit/${kal.calendarId}`}
                            className="text-sm font-semibold text-text hover:text-accent">
                        {kal.staffName}
                      </Link>
                      <p className="text-xs text-faint">
                        {vapaita} vapaata {vapaita === 1 ? 'päivä' : 'päivää'}
                      </p>
                    </td>
                    {kal.paivat.map((p) => (
                      <td key={p.date} className="px-0.5 py-1">
                        <Ruutu p={p} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-2.5">
          <p className="text-sm font-bold text-text">Viikoittain</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-ink-800 text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2 text-left font-semibold">Viikko</th>
                <th className="px-4 py-2 text-right font-semibold">Työpäiviä</th>
                <th className="px-4 py-2 text-right font-semibold">Vapaana</th>
                <th className="px-4 py-2 text-right font-semibold">Poissa</th>
              </tr>
            </thead>
            <tbody>
              {viikot.map((v) => (
                <tr key={v.v} className="border-t border-line-soft">
                  <td className="px-4 py-2 tabular">
                    {formatDateKey(v.alku)} – {formatDateKey(v.loppu)}
                  </td>
                  <td className="px-4 py-2 text-right tabular font-semibold">{v.tyossa}</td>
                  <td className={`px-4 py-2 text-right tabular font-bold
                                  ${v.vapaita === 0 ? 'text-warn' : 'text-accent'}`}>
                    {v.vapaita}
                  </td>
                  <td className="px-4 py-2 text-right tabular text-muted">{v.poissa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
