import Link from 'next/link';
import { DeleteButton } from '@/components/delete-button';
import { deleteOffer } from './actions';
import { requireManager } from '@/lib/session';
import { listOffers, type OfferRow } from '@/lib/data';
import { Button, Card, CardHeader, Empty, PageHead } from '@/components/ui';
import { OFFER_STATUS, OfferStatusChip } from './ui';

export const dynamic = 'force-dynamic';

const eur = (cents: number) =>
  (cents / 100).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
const fmt = (d: Date) => new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(d);

/* Aikasarake: joko linkki kalenteriin laitettuun työhön tai nappi joka vie
   varaamaan. Hylätty tarjous ei saa nappia — kauppaa ei tullut, eikä sen
   aikatauluttaminen vahingossa ole mikään palvelus. */
function BookingCell({ offer }: { offer: OfferRow }) {
  if (offer.job_id) {
    return (
      <Link href={`/tyot/${offer.job_id}`} className="whitespace-nowrap font-semibold text-accent hover:underline">
        {offer.job_starts_at ? fmt(new Date(offer.job_starts_at)) : offer.job_number}
      </Link>
    );
  }
  if (offer.status === 'declined') return <span className="text-faint">—</span>;
  return (
    <Link
      href={`/tyot/uusi?tarjous=${offer.id}`}
      className="inline-flex whitespace-nowrap rounded-md border border-line bg-ink-800 px-2.5 py-1 text-xs font-semibold text-text hover:border-accent/50 hover:text-accent"
    >
      Laita aika
    </Link>
  );
}

/* Rahaluku tarjouslistan päälle.

   MIKSI OMA KOMPONENTTI EIKÄ ETUSIVUN `Metric`: se on etusivun paikallinen
   funktio eikä jaettu, ja sen kopioiminen tänne on halvempi kuin kolmannen
   sijainnin luominen jaettuun ui.tsx:ään yhtä sivua varten. */
function Money({ label, value, sub, tone = 'plain' }: {
  label: string; value: string; sub?: string; tone?: 'plain' | 'accent';
}) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-2 text-[32px] leading-none font-extrabold tabular ${
        tone === 'accent' ? 'text-accent' : 'text-text'
      }`}>
        {value}
      </p>
      {sub && <p className="mt-2 text-xs text-faint">{sub}</p>}
    </Card>
  );
}

/* Yksi taulukko, kaksi käyttöä. Kuluttaja- ja taloyhtiötarjoukset pidetään
   erillään koska ne luetaan eri silmin: kuluttajalla riittää nimi, mutta
   taloyhtiöllä oleellinen on kenelle tarjous meni — isännöitsijä vaihtuu,
   taloyhtiö ei. */
function OfferTable({ rows, talo }: { rows: OfferRow[]; talo: boolean }) {
  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-faint">
          <th className="px-4 py-2 font-medium">Numero</th>
          <th className="px-4 py-2 font-medium">Lähetetty</th>
          <th className="px-4 py-2 font-medium">{talo ? 'Taloyhtiö' : 'Asiakas'}</th>
          <th className="px-4 py-2 font-medium">{talo ? 'Yhteyshenkilö' : 'Sähköposti'}</th>
          <th className="px-4 py-2 font-medium text-right">Summa</th>
          <th className="px-4 py-2 font-medium">Tila</th>
          <th className="px-4 py-2 font-medium">Aika</th>
          <th className="px-4 py-2 font-medium" />
        </tr>
      </thead>
      <tbody className="divide-y divide-line-soft">
        {rows.map((o) => (
          <tr key={o.id} className="hover:bg-ink-700">
            <td className="px-4 py-2.5">
              <Link href={`/tarjoukset/${o.id}`} className="font-semibold text-accent hover:underline">{o.offer_number}</Link>
            </td>
            <td className="px-4 py-2.5 text-muted tabular">{o.sent_at ? fmt(o.sent_at) : (o.error ? 'virhe' : '—')}</td>
            <td className="px-4 py-2.5">{o.customer_name}</td>
            <td className="px-4 py-2.5 text-muted">
              {talo && o.contact_name ? (
                <span>{o.contact_name}<span className="block text-xs text-faint">{o.email}</span></span>
              ) : (
                <a href={`mailto:${o.email}`} className="hover:text-text">{o.email}</a>
              )}
            </td>
            <td className="px-4 py-2.5 text-right tabular font-semibold">{eur(o.total_cents)}</td>
            <td className="px-4 py-2.5">
              <OfferStatusChip status={o.error ? 'error' : o.status} label={o.error ? 'Lähetys epäonnistui' : OFFER_STATUS[o.status]} />
            </td>
            <td className="px-4 py-2.5"><BookingCell offer={o} /></td>
            <td className="px-4 py-2.5 text-right">
              {/* Testitarjouksia kertyy väistämättä, ja ilman poistoa ne jäävät
                  listaan sekoittamaan oikeat tarjoukset. */}
              <DeleteButton id={o.id} action={deleteOffer} nimi={o.offer_number} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function OffersPage() {
  await requireManager();
  const offers = await listOffers();
  const asiakkaat = offers.filter((o) => o.kind !== 'taloyhtio');
  const taloyhtiot = offers.filter((o) => o.kind === 'taloyhtio');

  const sum = (rows: OfferRow[]) => rows.reduce((s, o) => s + o.total_cents, 0);

  /* Kaksi lukua joita tarjouksista oikeasti katsotaan: paljonko on jo
     myyty ja paljonko on vielä auki.

     `draft` EI ole odottavaa rahaa — luonnosta ei ole lähetetty, joten
     kukaan ei odota vastausta. Samasta syystä lähetysvirheen saanut rivi
     ei ole auki vaan rikki: asiakas ei ole koskaan nähnyt sitä. Sama
     tulkinta kuin taulukon tilamerkissä, jossa `error` ohittaa statuksen. */
  const hyvaksytyt = offers.filter((o) => o.status === 'accepted' && !o.error);
  /* Auki oleva raha = lähetetyt JA luonnokset.

     Luonnos ei ole lähetetty eikä kukaan odota vastausta siihen, joten
     tarkkaan ottaen se ei ole "odottava". Josua halusi sen silti mukaan
     (1.9.2026): hänelle nämä ovat samaa asiaa — tehtyä tarjoustyötä josta
     ei ole vielä tullut rahaa. Erittely jää alariville, jotta ero näkyy
     eikä luonnos huku lähetettyjen sekaan. */
  const lahetetyt = offers.filter((o) => o.status === 'sent' && !o.error);
  const luonnokset = offers.filter((o) => o.status === 'draft');
  const odottaa = [...lahetetyt, ...luonnokset];
  const jakauma = (rows: OfferRow[]) => {
    const talo = rows.filter((o) => o.kind === 'taloyhtio').length;
    return `${rows.length} kpl · ${rows.length - talo} kuluttaja, ${talo} taloyhtiö`;
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="Tarjoukset"
        sub="Sähköpostilla lähetetyt tarjoukset. Kuluttajat ja taloyhtiöt omissa listoissaan."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/tarjoukset/uusi"><Button>Uusi asiakastarjous</Button></Link>
            <Link href="/tarjoukset/uusi/taloyhtio"><Button variant="outline">Uusi taloyhtiötarjous</Button></Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Money
          label="Hyväksytyt tarjoukset"
          value={eur(sum(hyvaksytyt))}
          sub={jakauma(hyvaksytyt)}
          tone="accent"
        />
        <Money
          label="Odottaa vastausta"
          value={eur(sum(odottaa))}
          sub={`${eur(sum(lahetetyt))} lähetetty · ${eur(sum(luonnokset))} yhä luonnoksena`}
        />
      </div>

      <Card className="overflow-x-auto">
        <CardHeader
          title="Asiakkaat"
          action={<span className="text-xs text-faint">{asiakkaat.length} kpl · {eur(sum(asiakkaat))}</span>}
        />
        {asiakkaat.length === 0
          ? <Empty>Ei asiakastarjouksia vielä.</Empty>
          : <OfferTable rows={asiakkaat} talo={false} />}
      </Card>

      <Card className="overflow-x-auto">
        <CardHeader
          title="Taloyhtiöt"
          action={<span className="text-xs text-faint">{taloyhtiot.length} kpl · {eur(sum(taloyhtiot))}</span>}
        />
        {taloyhtiot.length === 0
          ? <Empty>Ei taloyhtiötarjouksia vielä. Tee ensimmäinen “Uusi taloyhtiötarjous” -napista.</Empty>
          : <OfferTable rows={taloyhtiot} talo />}
      </Card>
    </div>
  );
}
