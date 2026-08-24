import Link from 'next/link';
import { requireManager } from '@/lib/session';
import { PageHead } from '@/components/ui';
import { OfferBuilder } from '../ui';

/* Taloyhtiötarjous. Sama laskuri kuin kuluttajalla — hinnasto ei muutu, ja
   ikkunan määräporras antaa alennuksen isosta erästä itsestään. Ero on
   asiakaskortissa (taloyhtiön nimi + yhteyshenkilö) ja siinä että vapaat
   rivit ovat täällä sääntö eivätkä poikkeus: rappukäytävät ja yhteistilat
   eivät taivu kappalehinnastoon. */
export default async function NewTaloyhtioOfferPage() {
  await requireManager();
  return (
    <div className="space-y-6">
      <PageHead
        title="Uusi taloyhtiötarjous"
        sub={<Link href="/tarjoukset" className="text-sm text-muted hover:text-text">← Tarjoukset</Link>}
      />
      <OfferBuilder kind="taloyhtio" />
    </div>
  );
}
