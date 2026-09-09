import { requireManager } from '@/lib/session';
import { getAbResults, FUNNEL_STEPS } from '@/lib/ab';
import { todayKey } from '@/lib/time';
import { Card, CardHeader, Empty, PageHead } from '@/components/ui';
import { AnalyticsTabs } from '../tabs';
import { NewTestForm } from './ui';
import { TestCard } from './cards';

export const dynamic = 'force-dynamic';

/* =========================================================
   A/B-testit.

   Sivu vastaa kahteen kysymykseen: mikä on käynnissä ja mitä aiemmista
   opittiin. Jälkimmäinen on se puoli joka yleensä katoaa — päättynyt testi
   elää vain siinä että joku muistaa sen, ja vuoden päästä sama asia
   testataan uudelleen.

   TULOS EI OLE PELKKÄ PROSENTTI. Kaksi lukua ilman p-arvoa saa aina
   näyttämään siltä että toinen voittaa, koska kaksi lukua on harvoin
   täsmälleen sama. Siksi jokainen kortti kertoo myös onko ero sattuman
   rajoissa ja paljonko otosta vielä puuttuu.
   ========================================================= */

export default async function AbTestsPage() {
  await requireManager();
  const tests = await getAbResults();

  const running = tests?.filter((t) => t.ended_on === null) ?? [];
  const ended = tests?.filter((t) => t.ended_on !== null) ?? [];

  return (
    <div className="space-y-6">
      <PageHead
        title="Analytiikka · A/B-testit"
        sub="Mikä on käynnissä, mitä aiemmista opittiin ja milloin tulos riittää päätökseen."
      />

      <AnalyticsTabs current="/analytiikka/ab" />

      {tests === null && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <b>Testirekisteriä ei ole vielä luotu.</b>
          <span className="mt-1 block text-warn/85">
            Aja <code className="rounded bg-warn/10 px-1.5 py-0.5 text-xs">db/031_ab_tests.sql</code>{' '}
            Supabasen SQL-editorissa postgres-roolilla.
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-[13px] font-extrabold tracking-widest text-muted uppercase">
              Käynnissä {running.length > 0 && `(${running.length})`}
            </h2>
            {running.length === 0 ? (
              <Card>
                <Empty>
                  Ei käynnissä olevaa testiä. Yksi kerrallaan on oikea määrä — kaksi
                  päällekkäistä testiä samalla liikenteellä sekoittaa molempien tuloksen.
                </Empty>
              </Card>
            ) : (
              running.map((t) => <TestCard key={t.id} t={t} />)
            )}
          </section>

          {ended.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-[13px] font-extrabold tracking-widest text-muted uppercase">
                Päättyneet ({ended.length})
              </h2>
              {ended.map((t) => <TestCard key={t.id} t={t} />)}
            </section>
          )}
        </div>

        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader title="Uusi testi" />
            <NewTestForm today={todayKey()} steps={FUNNEL_STEPS} />
          </Card>

          <Card className="h-fit">
            <CardHeader title="Näin luvut luetaan" />
            <div className="space-y-3 p-4 text-sm leading-relaxed text-muted">
              <p>
                <b className="text-text">p-arvo</b> kertoo, kuinka todennäköisesti näin suuri ero
                syntyisi pelkästä sattumasta jos versioiden välillä ei olisi mitään eroa. Alle
                0,05 = ei enää uskottavaa sattumaa.
              </p>
              <p>
                <b className="text-text">Mittayksikkö on sivulataus</b>, ei ihminen: versio
                arvotaan joka latauksella eikä selaimeen tallenneta tunnistetta. Sama kävijä voi
                nähdä eri version eri kerroilla, mikä kaventaa mitattua eroa — todellinen ero on
                siis vähintään sen kokoinen kuin tässä näkyy.
              </p>
              <p>
                <b className="text-text">Älä lopeta kun luku näyttää hyvältä.</b> Jos katsot joka
                päivä ja päätät silloin kun ero on suurimmillaan, löydät nousun aina — myös kun
                sitä ei ole. Päätä vasta kun otos riittää.
              </p>
              <p>
                Valitse mittariksi askel jossa on volyymia. Varauksia tulee kymmenen kuussa, joten
                varaukseen perustuva testi kestäisi vuoden; suppilon alkupään askel ratkeaa
                viikoissa.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
