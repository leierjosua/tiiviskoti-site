import Link from 'next/link';
import { requireManager } from '@/lib/session';
import { getCostSettings, listExpenses } from '@/lib/talous';
import { categoryLabel } from '@/lib/talous-shared';
import { todayKey, formatDateKey } from '@/lib/time';
import { Card, CardHeader, Empty, PageHead } from '@/components/ui';
import { DeleteButton } from '@/components/delete-button';
import { AddExpenseForm, CostSettingsForm } from './ui';
import { deleteExpense } from './actions';

export const dynamic = 'force-dynamic';

const eur = (cents: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(cents / 100);

/* Kulujen kaksi mekanismia ovat samalla sivulla tarkoituksella: sääntö ja
   kirjaus ratkaisevat saman asian eri tavalla, ja valinta niiden välillä
   on helpompi kun molemmat näkyvät kerralla. */
export default async function KuluasetuksetPage() {
  await requireManager();

  const [{ settings, migrated }, expenses] = await Promise.all([
    getCostSettings(),
    listExpenses(100),
  ]);

  return (
    <div className="space-y-6">
      <PageHead
        title="Kuluasetukset"
        sub="Mistä talousnäkymän kulut, kate ja tulos lasketaan."
        action={
          <Link
            href="/analytiikka/talous"
            className="rounded-lg border border-line bg-ink-800 px-3.5 py-2 text-sm font-semibold text-text transition-colors hover:bg-ink-700"
          >
            ← Talous
          </Link>
        }
      />

      {!migrated && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <b>Kulutauluja ei ole vielä luotu.</b>
          <span className="mt-1 block text-warn/85">
            Aja <code className="rounded bg-warn/10 px-1.5 py-0.5 text-xs">db/030_talous.sql</code>{' '}
            Supabasen SQL-editorissa postgres-roolilla. Tämän sivun lomakkeet eivät tallenna
            ennen sitä.
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Myynnistä johdettavat kulut" />
            <CostSettingsForm settings={settings} />
          </Card>

          <Card>
            <CardHeader
              title="Kulukirjaukset"
              action={
                <span className="text-xs text-faint">
                  {expenses === null ? '' : `${expenses.length} viimeisintä`}
                </span>
              }
            />
            {expenses === null || expenses.length === 0 ? (
              <Empty>
                Ei kulukirjauksia. Kirjaa tähän ne menot jotka eivät seuraa myyntiä —
                tarvikelasku, työkalu, Google Ads, kirjanpito.
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-faint">
                      <th className="py-2.5 pl-4 font-semibold">Päivä</th>
                      <th className="py-2.5 font-semibold">Kategoria</th>
                      <th className="py-2.5 font-semibold">Selite</th>
                      <th className="py-2.5 text-right font-semibold">Summa</th>
                      <th className="py-2.5 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id} className="border-b border-line-soft last:border-0">
                        <td className="py-2.5 pl-4 whitespace-nowrap tabular text-text">
                          {formatDateKey(e.spent_on)}
                        </td>
                        <td className="py-2.5 text-muted">{categoryLabel(e.category)}</td>
                        <td className="py-2.5 text-muted">
                          {e.note || '—'}
                          {e.created_by_name && (
                            <span className="block text-xs text-faint">{e.created_by_name}</span>
                          )}
                        </td>
                        <td className={`py-2.5 text-right font-semibold tabular ${
                          e.amount_cents < 0 ? 'text-accent' : 'text-text'
                        }`}>
                          {eur(e.amount_cents)}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <DeleteButton
                            id={e.id}
                            action={deleteExpense}
                            nimi={`${categoryLabel(e.category)} ${eur(e.amount_cents)}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader title="Uusi kulukirjaus" />
            <AddExpenseForm today={todayKey()} />
          </Card>

          <Card className="h-fit">
            <CardHeader title="Näin luvut lasketaan" />
            <div className="space-y-3 p-4 text-sm leading-relaxed text-muted">
              <p>
                <b className="text-text">Liikevaihto</b> = kokonaismyynti ÷ (1 + alv).
                Kaikki prosentit lasketaan liikevaihdosta, ei kuluttajahinnasta.
              </p>
              <p>
                <b className="text-text">Kate</b> = liikevaihto − tekijäkulut − laitekustannukset −
                myyntikomissiot. Ne syntyvät keikan tekemisestä.
              </p>
              <p>
                <b className="text-text">Tulos</b> = kate − markkinointi − markkinointiprovisio −
                kiinteät kulut. Ne juoksevat myös ilman keikkaa.
              </p>
              <p>
                Sääntö ja kirjaus lasketaan yhteen: jos tekijäkulu on 40 % ja kirjaat lisäksi
                500 € bonuksen, jakson tekijäkulu on molemmat.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
