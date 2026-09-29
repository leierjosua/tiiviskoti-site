import { requireStaff } from '@/lib/session';
import { omatKalenterit, saatavuus, oletusAjat, type SaatavuusPaiva } from '@/lib/saatavuus';
import { Card, Empty, PageHead } from '@/components/ui';
import { addDays, formatDateKey, isoWeekday, todayKey, weekdayName } from '@/lib/time';
import { merkitsePoissa, merkitseTyossa, merkitseViikko, poistaMerkinta } from './actions';

export const dynamic = 'force-dynamic';

/* =========================================================
   "Omat ajat" — asentaja ilmoittaa itse milloin voi tehdä töitä.

   MIKSI OMA SIVU EIKÄ /kalenterit: se sivu on toimiston työkalu.
   Siellä puhutaan viikkoaikatauluista, poikkeuksista, varoajoista ja
   palvelualueista, ja se on oikea kieli toimistolle. Asentajalle
   kysymys on yksi: teenkö tänä päivänä töitä vai en. Sivu kysyy vain
   sen, ja päivä kerrallaan.

   MIKSI PAINIKKEET EIKÄ LOMAKE: aiemmin päivän lisääminen vaati
   päivämäärän, tyypin, kellonajat ja "koko päivä" -ruudun. Se on neljä
   päätöstä yhdestä asiasta, ja jokainen niistä on tilaisuus tehdä rivi
   joka ei toimi. Tässä on kaksi painiketta ja kellonajat tulevat
   valmiina — niitä voi muuttaa jos haluaa, muttei tarvitse.

   KOLMAS TILA ON TARKOITUKSELLINEN. Päivä jota ei ole merkitty EI ole
   sama kuin vapaapäivä: se on päivä josta toimisto ei tiedä. Se
   piirretään harmaana ja katkoviivalla, eikä koskaan samalla värillä
   kuin poissaolo.
   ========================================================= */

const VIIKKOJA = 8;

function Pilleri({ p }: { p: SaatavuusPaiva }) {
  if (p.tila === 'tyossa') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/50
                       bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
        ✓ Töissä <span className="tabular font-semibold">{p.alku}–{p.loppu}</span>
        {p.lahde === 'viikko' && <span className="font-normal opacity-70">vakio</span>}
      </span>
    );
  }
  if (p.tila === 'poissa') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/50
                       bg-danger/10 px-2.5 py-1 text-xs font-bold text-danger">
        ✕ Poissa{p.note ? <span className="font-normal opacity-80">· {p.note}</span> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-line
                     px-2.5 py-1 text-xs font-semibold text-faint">
      Ei ilmoitettu
    </span>
  );
}

const nappi = 'rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors';

function PaivaRivi({ p, calendarId, oletus }: {
  p: SaatavuusPaiva; calendarId: string; oletus: { alku: string; loppu: string };
}) {
  const vkp = isoWeekday(p.date);
  const viikonloppu = vkp >= 6;

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3
                    ${viikonloppu ? 'bg-ink-800/40' : ''}`}>
      <div className="w-36 shrink-0">
        <p className={`text-sm font-semibold ${viikonloppu ? 'text-muted' : 'text-text'}`}>
          {weekdayName(vkp)}
        </p>
        <p className="text-xs text-faint tabular">{formatDateKey(p.date)}</p>
      </div>

      <div className="min-w-0 flex-1"><Pilleri p={p} /></div>

      {/* Varatut työt näkyvät, koska päivää ei pidä merkitä poissaoloksi
          jos sinne on jo sovittu keikka. */}
      {p.toita > 0 && (
        <span className="rounded-md bg-ink-700 px-2 py-1 text-xs font-semibold text-muted">
          {p.toita} {p.toita === 1 ? 'keikka' : 'keikkaa'}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-2">
        {p.tila !== 'tyossa' && (
          <form action={merkitseTyossa}>
            <input type="hidden" name="calendarId" value={calendarId} />
            <input type="hidden" name="date" value={p.date} />
            <input type="hidden" name="alku" value={oletus.alku} />
            <input type="hidden" name="loppu" value={oletus.loppu} />
            <button className={`${nappi} border-accent/50 text-accent hover:bg-accent/10`}>
              Voin tehdä töitä
            </button>
          </form>
        )}
        {p.tila !== 'poissa' && (
          <form action={merkitsePoissa}>
            <input type="hidden" name="calendarId" value={calendarId} />
            <input type="hidden" name="date" value={p.date} />
            <button className={`${nappi} border-line text-muted hover:border-danger/50 hover:text-danger`}>
              En voi
            </button>
          </form>
        )}
        {p.poikkeusId && (
          <form action={poistaMerkinta}>
            <input type="hidden" name="calendarId" value={calendarId} />
            <input type="hidden" name="date" value={p.date} />
            <button title="Poista merkintä"
                    className="rounded-lg px-2 py-1.5 text-xs text-faint hover:text-text">
              ✕
            </button>
          </form>
        )}
      </div>

      {/* Kellonaikojen muutos vain kun päivä on työpäivä ja merkintä on
          tämän sivun tekemä — vakioviikkoa ei muuteta päiväkohtaisesti. */}
      {p.tila === 'tyossa' && (
        <form action={merkitseTyossa}
              className="flex w-full items-center gap-2 pl-36 text-xs text-faint">
          <input type="hidden" name="calendarId" value={calendarId} />
          <input type="hidden" name="date" value={p.date} />
          <span>Muuta ajat</span>
          <input type="time" name="alku" defaultValue={p.alku ?? oletus.alku}
                 className="rounded-md border border-line bg-ink-800 px-2 py-1 tabular text-text" />
          <span>–</span>
          <input type="time" name="loppu" defaultValue={p.loppu ?? oletus.loppu}
                 className="rounded-md border border-line bg-ink-800 px-2 py-1 tabular text-text" />
          <button className="rounded-md border border-line px-2 py-1 font-semibold
                             text-muted hover:text-text">
            Tallenna
          </button>
        </form>
      )}
    </li>
  );
}

export default async function OmatAjatPage() {
  const staff = await requireStaff();
  const kalenterit = await omatKalenterit(staff.id);

  if (!kalenterit.length) {
    return (
      <div className="space-y-6">
        <PageHead title="Omat ajat" />
        <Card><Empty>Sinulle ei ole vielä kalenteria. Pyydä toimistoa luomaan se.</Empty></Card>
      </div>
    );
  }

  /* Useampi kalenteri on harvinaista mutta mahdollista (esim. asennus ja
     kartoitus). Sivu näyttää ne peräkkäin omina lohkoinaan, jottei
     tarvitse arvata kumpaan päivä meni. */
  const alku = todayKey();
  const [tiedot, oletukset] = await Promise.all([
    saatavuus(kalenterit.map((k) => k.id), VIIKKOJA * 7, alku),
    Promise.all(kalenterit.map(async (k) => [k.id, await oletusAjat(k.id)] as const)),
  ]);
  const oletusKartta = new Map(oletukset);

  const kaikkiPaivat = tiedot.flatMap((t) => t.paivat);
  const tyopaivia = kaikkiPaivat.filter((p) => p.tila === 'tyossa').length;
  const ilmoittamatta = kaikkiPaivat.filter(
    (p) => p.tila === 'ilmoittamatta' && isoWeekday(p.date) <= 5,
  ).length;

  return (
    <div className="space-y-6">
      <PageHead
        title="Omat ajat"
        sub={<span className="text-sm text-muted">
          Merkitse milloin voit tehdä töitä. Toimisto näkee muutoksen heti.
        </span>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm font-semibold text-muted">Työpäiviä merkitty</p>
          <p className="mt-1.5 text-[28px] leading-none font-extrabold tabular text-accent">{tyopaivia}</p>
          <p className="mt-1.5 text-xs text-faint">seuraavat {VIIKKOJA} viikkoa</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold text-muted">Arkipäiviä ilmoittamatta</p>
          <p className={`mt-1.5 text-[28px] leading-none font-extrabold tabular
                         ${ilmoittamatta > 0 ? 'text-warn' : 'text-text'}`}>{ilmoittamatta}</p>
          <p className="mt-1.5 text-xs text-faint">
            {ilmoittamatta > 0 ? 'näille ei voi varata keikkaa' : 'kaikki arkipäivät merkitty'}
          </p>
        </Card>
        <Card className="col-span-2 p-4 lg:col-span-1">
          <p className="text-sm font-semibold text-muted">Näin se toimii</p>
          <p className="mt-1.5 text-xs leading-relaxed text-faint">
            <b className="text-accent">Töissä</b> = sinulle voi varata keikan.{' '}
            <b className="text-danger">Poissa</b> = ei voi.{' '}
            <b className="text-text">Ei ilmoitettu</b> tarkoittaa samaa kuin poissa,
            mutta toimisto ei tiedä oletko vapaa — merkitse mieluummin.
          </p>
        </Card>
      </div>

      {tiedot.map((kal) => {
        const oletus = oletusKartta.get(kal.calendarId) ?? { alku: '08:00', loppu: '16:00' };
        /* Viikkoihin pilkkominen: maanantai aloittaa uuden lohkon. */
        const viikot: SaatavuusPaiva[][] = [];
        for (const p of kal.paivat) {
          if (!viikot.length || isoWeekday(p.date) === 1) viikot.push([]);
          viikot[viikot.length - 1].push(p);
        }

        return (
          <section key={kal.calendarId} className="space-y-4">
            {tiedot.length > 1 && (
              <h2 className="text-sm font-bold text-muted">{kal.calendarName}</h2>
            )}
            {viikot.map((viikko) => {
              const arki = viikko.filter((p) => isoWeekday(p.date) <= 5);
              const kaikkiArkiTyossa = arki.length > 0 && arki.every((p) => p.tila === 'tyossa');
              return (
                <Card key={viikko[0].date} className="overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                    <p className="text-sm font-bold text-text">
                      {formatDateKey(viikko[0].date)} – {formatDateKey(viikko[viikko.length - 1].date)}
                    </p>
                    {!kaikkiArkiTyossa && arki.length > 0 && (
                      <form action={merkitseViikko}>
                        <input type="hidden" name="calendarId" value={kal.calendarId} />
                        <input type="hidden" name="paivat" value={arki.map((p) => p.date).join(',')} />
                        <button className={`${nappi} border-accent/40 text-accent hover:bg-accent/10`}>
                          Koko arkiviikko töissä
                        </button>
                      </form>
                    )}
                  </div>
                  <ul className="divide-y divide-line-soft">
                    {viikko.map((p) => (
                      <PaivaRivi key={p.date} p={p} calendarId={kal.calendarId} oletus={oletus} />
                    ))}
                  </ul>
                </Card>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
