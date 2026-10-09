import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty, PageHead, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit';
import { logOfferCall } from './actions';
import { CALL_RESULTS, type CallResult } from './results';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; offer_number: string; kind: string; customer_name: string;
  contact_name: string | null; email: string; phone: string | null;
  total_cents: number; status: 'sent' | 'expired'; days_left: number;
  valid_until: string; sent_at: Date; last_call_at: Date | null;
  last_call_result: CallResult | null; called_today: boolean;
  other_job: string | null;
};

const eur = (cents: number) => (cents / 100).toLocaleString('fi-FI', { maximumFractionDigits: 0 }) + ' €';
const fmtTime = (d: Date) => new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(d);
const fmtDay = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}.${Number(m)}.`; };

/* Puhelinnumero näyttöön ja soittolinkkiin.

   Lomakkeilta tulee vaihtelevaa dataa: +358408403163, 0408403163 ja joskus
   ilman alkunollaa (468121417). Puuttuva nolla lisätään — se on yleisin
   kirjoitusvirhe ja suomalainen numero alkaa aina nollalla — mutta
   numero merkitään tarkistettavaksi, samoin liian lyhyet. Väärään numeroon
   soittaminen on pienempi haitta kuin soittamatta jättäminen, mutta sen pitää
   näkyä ennen kuin painaa. */
function phoneInfo(raw: string): { display: string; href: string; check: string | null } {
  let d = raw.replace(/[^\d+]/g, '');
  let check: string | null = null;
  if (d.startsWith('+358')) d = '0' + d.slice(4);
  else if (d.startsWith('358') && d.length > 10) d = '0' + d.slice(3);
  else if (/^[1-9]\d{7,9}$/.test(d)) { d = '0' + d; check = 'alkunolla lisätty — tarkista'; }
  if (!check && d.startsWith('0') && d.length < 9) check = 'numero näyttää vajaalta';
  const display = d.startsWith('0') && d.length >= 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
  return { display, href: `tel:${d}`, check };
}

function daysLabel(r: Row): string {
  if (r.status === 'expired' || r.days_left < 0) {
    const ago = -r.days_left;
    return ago <= 1 ? 'Vanhentui eilen' : `Vanhentui ${ago} pv sitten`;
  }
  if (r.days_left === 0) return 'Vanhenee tänään';
  if (r.days_left === 1) return 'Vanhenee huomenna';
  return `${r.days_left} pv jäljellä`;
}

function OfferCallCard({ r }: { r: Row }) {
  const urgent = r.status === 'sent' && r.days_left <= 1;
  return (
    <div className={cx('flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center', r.called_today && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <b className="text-[16px] text-text">{r.customer_name}</b>
          <span className="tabular text-[16px] font-extrabold text-text">{eur(r.total_cents)}</span>
          <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold',
            urgent ? 'bg-danger/12 text-danger' : r.status === 'expired' ? 'bg-ink-700 text-muted' : 'bg-info/12 text-info')}>
            {daysLabel(r)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-faint">
          {r.contact_name && <>{r.contact_name} · </>}
          <Link href={`/tarjoukset/${r.id}`} className="font-semibold text-accent hover:underline">{r.offer_number}</Link>
          {' · lähetetty '}{fmtTime(r.sent_at).split(' ')[0]}
          {' · voimassa '}{fmtDay(r.valid_until)}
          {' · '}<a href={`mailto:${r.email}`} className="hover:text-text">{r.email}</a>
        </p>
        {r.other_job && (
          <p className="mt-1 text-xs text-info">Asiakkaalla on jo työ {r.other_job} — tarkista ennen soittoa, onko tämä lisätyötarjous.</p>
        )}
        {r.last_call_at && r.last_call_result && (
          <p className={cx('mt-1 text-xs font-semibold', r.last_call_result === 'thinking' ? 'text-accent' : 'text-warn')}>
            Soitettu {fmtTime(r.last_call_at)}: {CALL_RESULTS[r.last_call_result]}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {r.phone ? (() => {
          const p = phoneInfo(r.phone);
          return (
            <span className="inline-flex flex-col items-start gap-0.5">
              <a href={p.href}
                 className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink shadow-sm hover:bg-[#1A6340]">
                <span aria-hidden>📞</span> {p.display}
              </a>
              {p.check && <span className="text-[11px] font-semibold text-warn">{p.check} ({r.phone})</span>}
            </span>
          );
        })() : (
          <span className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Ei puhelinnumeroa</span>
        )}
        <Link href={`/tyot/uusi?tarjous=${r.id}`}
              className="rounded-lg border border-accent/50 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/10">
          Sovittu → laita aika
        </Link>
        {(Object.keys(CALL_RESULTS) as CallResult[]).map((res) => (
          <form key={res} action={logOfferCall}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="result" value={res} />
            <SubmitButton variant={res === 'declined' ? 'danger' : 'outline'} className="px-3 py-2 text-xs" pendingLabel="…">
              {res === 'no_answer' ? 'Ei vastannut' : res === 'thinking' ? 'Miettii' : 'Ei kiinnosta'}
            </SubmitButton>
          </form>
        ))}
      </div>
    </div>
  );
}

export default async function CallListPage() {
  await requireManager();

  /* Vain lähetetyt, joihin ei ole vielä varattu aikaa. Vanhentuneet viimeisen
     14 pv ajalta ovat mukana: tarjouksen voi uusia puhelimessa, ja juuri ne
     jäivät ennen kokonaan näkymättä kun yöajo siirsi ne Vanhentunut-tilaan.
     Puhelinnumero tarjoukselta, sen puuttuessa asiakkaalta tai liidiltä
     (Meta-liidillä on aina numero, käsin tehdyllä tarjouksella ei aina). */
  const rows = await sql<Row[]>`
    with today as (select (now() at time zone 'Europe/Helsinki')::date as d)
    select o.id, o.offer_number, o.kind, o.customer_name, o.contact_name, o.email,
           coalesce(nullif(trim(o.phone), ''), c.phone, l.phone) as phone,
           o.total_cents, o.status, o.sent_at, o.last_call_at, o.last_call_result,
           to_char(o.valid_until, 'YYYY-MM-DD') as valid_until,
           (o.valid_until::date - today.d)::int as days_left,
           coalesce((o.last_call_at at time zone 'Europe/Helsinki')::date = today.d, false) as called_today,
           oj.label as other_job
      from tk.offers o
      cross join today
      left join lateral (
        select cc.phone from tk.customers cc
         where lower(cc.email) = lower(o.email) and nullif(trim(cc.phone), '') is not null limit 1
      ) c on true
      left join lateral (
        select ll.phone from tk.leads ll
         where lower(ll.email) = lower(o.email) and nullif(trim(ll.phone), '') is not null
         order by ll.created_at desc limit 1
      ) l on true
      /* Asiakkaan muu työ, jota ei ole linkitetty tähän tarjoukseen. */
      left join lateral (
        select jj.job_number || ' (' || case jj.status when 'done' then 'tehty' else 'varattu' end || ')' as label,
               jj.created_at
          from tk.jobs jj join tk.customers cj on cj.id = jj.customer_id
         where lower(cj.email) = lower(o.email) and jj.status <> 'cancelled'
           and (jj.offer_id is null or jj.offer_id <> o.id)
         order by jj.created_at desc limit 1
      ) oj on true
     where o.error is null and o.sent_at is not null
       /* Työ syntyi tarjouksen jälkeen ilman linkkiä = kauppa tuli jo, ei soitettavaa. */
       and not (oj.created_at is not null and oj.created_at >= o.sent_at)
       and (o.status = 'sent' or (o.status = 'expired' and o.valid_until::date >= today.d - 14))
       and not exists (select 1 from tk.jobs j where j.offer_id = o.id and j.status <> 'cancelled')
     order by o.valid_until, o.total_cents desc
  `;

  const groups: { title: string; hint?: string; rows: Row[] }[] = [
    { title: 'Vanhenee tänään tai huomenna', rows: rows.filter((r) => r.status === 'sent' && r.days_left <= 1) },
    { title: '2–3 päivää', rows: rows.filter((r) => r.status === 'sent' && r.days_left >= 2 && r.days_left <= 3) },
    { title: '4–7 päivää', rows: rows.filter((r) => r.status === 'sent' && r.days_left >= 4 && r.days_left <= 7) },
    { title: 'Myöhemmin', rows: rows.filter((r) => r.status === 'sent' && r.days_left > 7) },
    {
      title: 'Vanhentuneet (14 pv)',
      hint: 'Tarjouksen voi uusia puhelimessa — sovi aika, niin tarjous hyväksytään samalla.',
      rows: rows.filter((r) => r.status === 'expired'),
    },
  ];

  const open = rows.filter((r) => r.status === 'sent');
  const soon = open.filter((r) => r.days_left <= 7);
  const notCalled = soon.filter((r) => !r.last_call_at).length;

  return (
    <div className="space-y-6">
      <PageHead
        title="Soittolista"
        sub={<>
          Avoimet tarjoukset vanhenemisjärjestyksessä. Viikon sisällä vanhenee <b>{soon.length}</b> tarjousta,
          yhteensä <b>{eur(soon.reduce((s, r) => s + r.total_cents, 0))}</b> — näistä {notCalled} soittamatta.
        </>}
        action={<Link href="/tarjoukset" className="text-sm text-muted hover:text-text">← Tarjoukset</Link>}
      />

      {rows.length === 0 && <Card><Empty>Ei avoimia tarjouksia. 🎉</Empty></Card>}

      {groups.filter((g) => g.rows.length > 0).map((g) => (
        <Card key={g.title}>
          <CardHeader
            title={g.title}
            action={<span className="text-xs text-faint">{g.rows.length} kpl · {eur(g.rows.reduce((s, r) => s + r.total_cents, 0))}</span>}
          />
          {g.hint && <p className="border-b border-line-soft px-4 py-2 text-xs text-faint">{g.hint}</p>}
          <div className="divide-y divide-line-soft">
            {g.rows.map((r) => <OfferCallCard key={r.id} r={r} />)}
          </div>
        </Card>
      ))}
    </div>
  );
}
