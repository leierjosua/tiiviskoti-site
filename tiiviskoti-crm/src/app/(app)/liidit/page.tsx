import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty, ErrorNote } from '@/components/ui';
import { LeadStatus } from './ui';
import { DeleteButton } from '@/components/delete-button';
import { deleteLead } from '../alueet/actions';

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

      <TuonninTila />

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

      <Card>
        <CardHeader title="Yhteydenottopyynnöt" />
        {leads.length === 0 ? (
          <Empty>Ei liidejä.</Empty>
        ) : (
          /* Lista eikä taulukko: 8 sarakkeen taulukko ei mahtunut edes
             läppärille (sivupalkki vie 272 px), vaan sitä piti vierittää
             sivuttain. Rivi rivittyy nyt kapealla ruudulla kahteen osaan:
             tiedot ylös, tila ja napit alle. */
          <ul className="divide-y divide-line-soft">
            {leads.map((lead) => (
              <li key={lead.id}
                  className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 hover:bg-ink-700">
                <div className="min-w-0 flex-1 basis-72">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{lead.full_name}</span>
                    <span className="text-xs tabular text-faint">
                      {fmt(lead.created_at)}{lead.postal_code ? ` · ${lead.postal_code}` : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 text-sm">
                    {lead.phone
                      ? <a href={`tel:${lead.phone}`} className="tabular text-accent hover:underline">{lead.phone}</a>
                      : <span className="text-muted">—</span>}
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} className="min-w-0 break-all text-muted hover:text-text">
                        {lead.email}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <LeadStatus id={lead.id} status={lead.status} />
                  {/* Tarjouslinkki vie laskurin alkuun yhteystiedot valmiiksi
                      täytettynä — hintoja se ei esitäytä, koska liidissä ei
                      ole yhtään hinnoiteltua riviä. */}
                  <Link prefetch={false}
                    href={{ pathname: '/tarjoukset/uusi', query: { liidi: lead.id } }}
                    className="rounded border border-line px-2.5 py-1 text-xs text-accent hover:bg-ink-700"
                  >
                    Tee tarjous
                  </Link>
                  {/* Ilman tätä linkkiä sovittu käynti jäi kirjaamatta: tiedot
                      olisi pitänyt näpytellä uudestaan Uusi työ -lomakkeelle.
                      Nyt liidi siirtyy kalenteriin yhdellä klikkauksella ja
                      merkitään samalla asiakkaaksi. */}
                  <Link prefetch={false}
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
                  <DeleteButton id={lead.id} action={deleteLead} nimi={lead.full_name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* Metan liidituonnin tila — luetaan kannasta, ei haeta Metasta.

   MIKSI SIVU EI ENÄÄ AJA TUONTIA: `importMetaLeads()` kesti mitattuna
   3,4–4,5 s (3.10.2026), ja Suspensesta huolimatta vastaus valmistui vasta
   tuonnin jälkeen — /liidit oli adminin hitain sivu. Tuonti ajetaan
   pg_cronilla 5 min välein, joten sivulla tehty haku ei tuonut uusia
   liidejä vaan ainoastaan odotusta.

   Virheen näkyminen säilyy: tuonti kirjaa jokaisen virheen ja onnistumisen
   (enintään puolen tunnin välein) tk.health_checks:iin. Ikäraja kertoo
   myös pysähtyneestä ajastimesta, joka ei kirjoita mitään. */
const TUONTI_VANHA_MS = 2 * 60 * 60_000;

async function TuonninTila() {
  const [viimeisin] = await sql<{ ok: boolean; detail: string | null; checked_at: Date }[]>`
    select ok, detail, checked_at from tk.health_checks
     where kind = 'meta_leads' order by checked_at desc limit 1
  `;
  if (!viimeisin) return null;
  if (!viimeisin.ok) {
    return (
      <ErrorNote>
        Metan liidien haku epäonnistui viimeksi: {viimeisin.detail ?? 'tuntematon virhe'}. Alla olevat
        liidit ovat kannasta — Metassa voi olla uudempia, jotka eivät ole tulleet perille.
      </ErrorNote>
    );
  }
  if (Date.now() - viimeisin.checked_at.getTime() > TUONTI_VANHA_MS) {
    return (
      <ErrorNote>
        Metan liidejä ei ole haettu yli kahteen tuntiin — ajastettu haku on ehkä pysähtynyt.
      </ErrorNote>
    );
  }
  return null;
}
