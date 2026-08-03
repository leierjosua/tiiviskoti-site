import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty, PageHead } from '@/components/ui';
import { CodeRow, CreateCodeForm, DeleteCode } from './ui';

export const dynamic = 'force-dynamic';

export type CodeData = {
  id: string; code: string; description: string | null;
  kind: 'fixed' | 'percent';
  amount_cents: number; percent: number; min_total_cents: number;
  max_uses: number | null; max_uses_per_customer: number;
  starts_at: Date | null; expires_at: Date | null; active: boolean;
  uses: number; customers: number; total_given_cents: number;
};

type Redemption = {
  code_id: string; job_id: string; job_number: string;
  customer_name: string | null; amount_cents: number; created_at: Date;
};

export default async function DiscountCodesPage() {
  await requireManager();

  /* Käyttökerrat lasketaan riveistä eikä laskurikentästä, jotta admin ja
     todellisuus eivät voi eriytyä. `customers` on eri asia kuin `uses`:
     sama ihminen voi käyttää koodin useasti jos raja sen sallii, ja
     kampanjan kannalta kiinnostava luku on montako IHMISTÄ sen käytti. */
  const codes = await sql<CodeData[]>`
    select c.id, c.code, c.description, c.kind, c.amount_cents, c.percent,
           c.min_total_cents, c.max_uses, c.max_uses_per_customer,
           c.starts_at, c.expires_at, c.active,
           (select count(*)::int from tk.discount_redemptions r where r.code_id = c.id) as uses,
           (select count(distinct r.customer_id)::int from tk.discount_redemptions r
             where r.code_id = c.id) as customers,
           (select coalesce(sum(r.amount_cents), 0)::int from tk.discount_redemptions r
             where r.code_id = c.id) as total_given_cents
      from tk.discount_codes c
     order by c.active desc, c.created_at desc
  `;

  const redemptions = await sql<Redemption[]>`
    select r.code_id, r.job_id, j.job_number, cu.full_name as customer_name,
           r.amount_cents, r.created_at
      from tk.discount_redemptions r
      join tk.jobs j on j.id = r.job_id
      left join tk.customers cu on cu.id = r.customer_id
     order by r.created_at desc
  `;

  const byCode = new Map<string, Redemption[]>();
  for (const r of redemptions) {
    const list = byCode.get(r.code_id);
    if (list) list.push(r);
    else byCode.set(r.code_id, [r]);
  }

  const fmt = (d: Date) => new Intl.DateTimeFormat('fi-FI', {
    timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric',
  }).format(new Date(d));
  const eur = (cents: number) => (cents / 100).toLocaleString('fi-FI') + ' €';

  const totalGiven = codes.reduce((s, c) => s + c.total_given_cents, 0);

  return (
    <div className="space-y-6">
      <PageHead
        title="Alennuskoodit"
        sub="Kampanjakoodit, jotka asiakas kirjoittaa varauslomakkeelle. Vähennys lasketaan
             loppusummasta varauksen yhteydessä — koodi kuluu vasta silloin, ei esikatselussa."
      />

      {totalGiven > 0 && (
        <p className="text-sm text-muted">
          Annettu alennuksia yhteensä <b className="text-text">{eur(totalGiven)}</b>{' '}
          {redemptions.length} varauksessa.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_330px]">
        <Card>
          <CardHeader title="Koodit" />
          {codes.length === 0 ? (
            <Empty>Ei koodeja. Luo ensimmäinen oikealta.</Empty>
          ) : (
            <div>
              {codes.map((c) => {
                const used = byCode.get(c.id) ?? [];
                return (
                  <div key={c.id} className={c.active ? '' : 'opacity-60'}>
                    <CodeRow code={c} />

                    {/* Kampanjan tulos: montako ihmistä, milloin ja kuka.
                        Pienellä koodin alla, koska se on seurantaa eikä
                        muokattava kenttä. */}
                    <div className="px-4 pb-3">
                      {used.length === 0 ? (
                        <p className="text-xs text-faint">Ei vielä yhtään käyttöä.</p>
                      ) : (
                        <div className="text-xs text-faint">
                          <p className="font-semibold text-muted">
                            {used.length} käyttö{used.length === 1 ? '' : 'ä'}
                            {' · '}
                            {c.customers} eri asiakas{c.customers === 1 ? '' : 'ta'}
                            {' · '}
                            {eur(c.total_given_cents)} annettu
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {used.slice(0, 12).map((r) => (
                              <li key={r.job_id}>
                                {fmt(r.created_at)}
                                {' · '}
                                <span className="text-muted">{r.customer_name ?? 'poistettu asiakas'}</span>
                                {' · '}
                                <Link href={`/tyot/${r.job_id}`} className="underline underline-offset-2 hover:text-text">
                                  {r.job_number}
                                </Link>
                                {' · '}−{eur(r.amount_cents)}
                              </li>
                            ))}
                          </ul>
                          {used.length > 12 && (
                            <p className="mt-1">…ja {used.length - 12} muuta.</p>
                          )}
                        </div>
                      )}

                      <div className="mt-2 flex justify-end">
                        <DeleteCode id={c.id} code={c.code} hasUses={used.length > 0} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Uusi koodi" />
          <div className="p-4">
            <CreateCodeForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
