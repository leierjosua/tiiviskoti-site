import { notFound, redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { getJob, jobLinks } from '@/lib/data';
import { getJobReport, reportToForm } from '@/lib/job-report';
import { unitsFromLines, type WorkReport } from '@/lib/work-report';
import { dateKeyOf, timeOf } from '@/lib/time';
import { ownsJob, requireStaff } from '@/lib/session';
import { linesFromDb, linesTotal } from '@/lib/completion';
import { ViimeistelyWizard } from './ui';

export const dynamic = 'force-dynamic';

export default async function ViimeistelyPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;

  const job = await getJob(id);
  if (!job) notFound();
  // Asentaja viimeistelee vain omansa — sama rajaus kuin työn sivulla.
  if (!(await ownsJob(staff, id))) notFound();

  /* Peruttua keikkaa ei viimeistellä. Se ei ole virhe vaan väärä ovi:
     ohjataan takaisin varaukseen, jossa tilan voi palauttaa. */
  if (job.status === 'cancelled') redirect(`/tyot/${id}`);

  const [rows, links, saved] = await Promise.all([
    sql<{ name: string; quantity: number; unit_price_cents: number }[]>`
      select name, quantity, unit_price_cents from tk.job_lines
       where job_id = ${id} order by sort_order
    `,
    jobLinks(id),
    getJobReport(id),
  ]);

  /* Työraportin esitäyttö. Uudelleenviimeistelyssä tallennettu raportti
     voittaa — muuten asentaja kirjoittaisi kaiken uudestaan. Uudelle
     raportille työn tiedot: päivä, tekijät (työpari mukaan), asiakas ja
     kohteiden määrät riveiltä. Ajat jätetään tyhjiksi tarkoituksella:
     varattu aika esitäytettynä kuittautuisi todelliseksi katsomatta. */
  const units = unitsFromLines(rows);
  const initialReport: WorkReport = saved.report
    ? reportToForm(saved.report)
    : {
        workDate: dateKeyOf(job.starts_at),
        installers: [job.staff_name, ...links.mates.map((m) => m.staff_name)]
          .filter((n, i, all) => all.indexOf(n) === i).join(', '),
        customerName: job.customer_name ?? '',
        customerPhone: job.customer_phone ?? '',
        address: [job.address, [job.postal_code, job.city].filter(Boolean).join(' ')]
          .filter(Boolean).join(', '),
        unit: '',
        startedAt: '',
        finishedAt: '',
        travelHours: '',
        windows: units.windows,
        balconyDoors: units.balconyDoors,
        otherDoors: units.otherDoors,
        steps: {},
        sealantM: '',
        siliconePcs: '',
        acrylicPcs: '',
        notes: '',
        customerAckName: '',
      };

  /* Hallinnasta luodulla työllä ei ole rivejä — hinta on pelkkä summa.
     Tehdään siitä yksi rivi, jotta velho ja kuitti näkevät saman asian
     eikä hinta katoa ensimmäisestä muokkauksesta. */
  const lines = rows.length > 0
    ? linesFromDb(rows)
    : linesFromDb([{ name: job.title || 'Palvelu', quantity: 1, unit_price_cents: job.price_cents }]);

  /* Rivit eivät aina summaudu työn hintaan. Oikeassa datassa ero syntyy
     esimerkiksi matkalisästä joka jäi tallentumatta riveille, tai siitä
     että hintaa on muokattu hallinnasta rivejä koskematta.

     Velho kirjoittaa hinnaksi rivien summan, joten erotus katoaisi
     hiljaa — 594 €:n keikasta tulisi 495 €:n keikka pelkästään siitä
     että se viimeisteltiin. Tasausrivi tekee erotuksesta näkyvän ja
     muokattavan, ja pitää Vakiokeikka-polun hinnan ennallaan. */
  const gap = job.price_cents - linesTotal(lines);
  if (gap !== 0) {
    lines.push({
      catalogId: null,
      name: gap > 0 ? 'Muu sovittu' : 'Sovittu hyvitys',
      quantity: 1,
      unitPriceCents: gap,
    });
  }

  return (
    <ViimeistelyWizard
      job={{
        id: job.id,
        jobNumber: job.job_number,
        title: job.title,
        startsAt: job.starts_at.toISOString(),
        address: job.address,
        postalCode: job.postal_code,
        city: job.city,
        customerName: job.customer_name,
        customerEmail: job.customer_email,
        customerPhone: job.customer_phone,
      }}
      initialLines={lines}
      initialReport={initialReport}
      reportTableMissing={saved.tableMissing}
      scheduled={`${timeOf(job.starts_at)}–${timeOf(job.ends_at)}`}
    />
  );
}
