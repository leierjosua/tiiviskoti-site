import { Suspense } from 'react';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty, ErrorNote } from '@/components/ui';
import { LeadStatus } from './ui';
import { DeleteButton } from '@/components/delete-button';
import { deleteLead } from '../alueet/actions';
import { importMetaLeads } from '@/lib/meta-leads';

export const dynamic = 'force-dynamic';

type Lead = {
  id: string; full_name: string; email: string | null; phone: string | null;
  postal_code: string | null; city: string | null; message: string | null;
  status: 'new' | 'contacted' | 'no_answer' | 'converted' | 'rejected'; created_at: Date;
};

export default async function LeadsPage() {
  await requireManager();

  const leads = await sql<Lead[]>`
    select id, full_name, email, phone, postal_code, city, message, status, created_at
      from tk.leads order by created_at desc limit 300
  `;

  // Kysyntä alueittain: mihin kannattaisi laajentua.
  const demand = await sql<{ prefix: string; n: number }[]>`
    select left(postal_code, 2) as prefix, count(*)::int as n
      from tk.leads where postal_code is not null
     group by 1 order by n desc, 1 limit 8
  `;

  const fmt = (d: Date) => new Intl.DateTimeFormat('fi-FI', {
    timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight text-text">Liidit</h1>
        <p className="text-sm text-muted">
          Yhteydenottopyynnöt palvelualueiden ulkopuolelta — kysyntä alueille joilla ei vielä toimita.
        </p>
      </header>

      {/* Metan haku EI enää blokkaa sivua. Se striimataan omana palanaan,
          joten liidilista piirtyy heti ja hakutulos ilmestyy kun se valmistuu. */}
      <Suspense fallback={null}>
        <MetanHaku />
      </Suspense>

      {demand.length > 0 && (
        <Card className="overflow-x-auto">
          <CardHeader title="Kysyntä postinumeroalueittain" />
          <div className="flex flex-wrap gap-2 p-4">
            {demand.map((d) => (
              <span key={d.prefix}
                    className="rounded border border-line px-2.5 py-1.5 text-sm tabular">
                <b className="text-accent">{d.prefix}xxx</b>
                <span className="ml-2 text-muted">{d.n} pyyntö{d.n > 1 ? 'ä' : ''}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <CardHeader title="Yhteydenottopyynnöt" />
        {leads.length === 0 ? (
          <Empty>Ei liidejä.</Empty>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-4 py-2 font-medium">Saapui</th>
                <th className="px-4 py-2 font-medium">Nimi</th>
                <th className="px-4 py-2 font-medium">Puhelin</th>
                <th className="px-4 py-2 font-medium">Sähköposti</th>
                <th className="px-4 py-2 font-medium">Postinro</th>
                <th className="px-4 py-2 font-medium">Tila</th>
                <th className="px-4 py-2 font-medium" />
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-ink-700">
                  <td className="px-4 py-2.5 text-muted tabular">{fmt(lead.created_at)}</td>
                  <td className="px-4 py-2.5">{lead.full_name}</td>
                  <td className="px-4 py-2.5 tabular">
                    {lead.phone
                      ? <a href={`tel:${lead.phone}`} className="text-accent hover:underline">{lead.phone}</a>
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {lead.email
                      ? <a href={`mailto:${lead.email}`} className="hover:text-text">{lead.email}</a>
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 tabular">{lead.postal_code ?? '—'}</td>
                  <td className="px-4 py-2.5"><LeadStatus id={lead.id} status={lead.status} /></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {/* Ilman tätä linkkiä sovittu käynti jäi kirjaamatta: tiedot
                        olisi pitänyt näpytellä uudestaan Uusi työ -lomakkeelle.
                        Nyt liidi siirtyy kalenteriin yhdellä klikkauksella ja
                        merkitään samalla asiakkaaksi. */}
                    <Link
                      href={{
                        pathname: '/tyot/uusi',
                        query: {
                          liidi: lead.id,
                          nimi: lead.full_name,
                          ...(lead.email ? { email: lead.email } : {}),
                          ...(lead.phone ? { puhelin: lead.phone } : {}),
                          ...(lead.postal_code ? { postinumero: lead.postal_code } : {}),
                          ...(lead.message ? { muistiinpano: lead.message } : {}),
                        },
                      }}
                      className="rounded border border-line px-2.5 py-1 text-xs text-accent hover:bg-ink-700"
                    >
                      Luo työ
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DeleteButton id={lead.id} action={deleteLead} nimi={lead.full_name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* Metan liidien haku — omana striimattuna palanaan.

   MIKSI EI ENÄÄ SUORAAN RENDERÖINNISSÄ: `importMetaLeads()` alkaa
   Graphin `/me/accounts`-kutsulla, joka mitattiin 21.9.2026 **2,1
   sekunniksi**. Se ajettiin ennen liidilistaa, joten koko sivu odotti
   Metaa joka avauksella — se oli adminin selvästi hitain yksittäinen
   kohta.

   Alkuperäinen perustelu ("Vercelin Hobby sallii vain päivittäisen
   ajon") on vanhentunut: haku ajetaan pg_cronilla 5 min välein, mikä
   näkyy siinä että Meta-liidejä saapuu kantaan ympäri vuorokauden
   (04:20, 01:10, 21:50) ilman että kukaan avaa tätä sivua.

   Haku tehdään silti sivua avattaessa, koska virheen näkyminen on
   arvokasta: hiljainen vika jäi kerran huomaamatta kolmeksi päiväksi.
   Ero on vain se, ettei liidilista enää odota sitä. Tässä haussa
   löytyneet uudet liidit näkyvät listassa seuraavalla latauksella,
   joten se sanotaan ääneen. */
async function MetanHaku() {
  let virhe: string | null = null;
  let uusia = 0;
  try {
    const tulos = await importMetaLeads();
    if (tulos.error) virhe = tulos.error;
    else uusia = tulos.imported;
  } catch (e) {
    virhe = e instanceof Error ? e.message : String(e);
  }
  if (virhe) {
    console.error('liidit: Metan liidien haku epäonnistui', virhe);
    return (
      <ErrorNote>
        Metan liidien haku ei onnistunut: {virhe}. Alla olevat liidit ovat kannasta —
        Metassa voi olla uudempia, jotka eivät ole tulleet perille.
      </ErrorNote>
    );
  }
  if (uusia > 0) {
    return (
      <ErrorNote>
        Metasta haettiin {uusia} uutta liidiä. Päivitä sivu, niin ne tulevat listaan.
      </ErrorNote>
    );
  }
  return null;
}
