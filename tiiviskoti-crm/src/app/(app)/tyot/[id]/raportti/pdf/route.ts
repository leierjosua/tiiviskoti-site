import { ownsJob, requireStaff } from '@/lib/session';
import { getJob } from '@/lib/data';
import { fiNumber, getJobReport } from '@/lib/job-report';
import { generateJobReportPdf } from '@/lib/job-report-pdf';

/* =========================================================
   Työraportti PDF:nä — sama asettelu kuin paperilomake.

   Syntyy joka kerta tallennetusta rivistä (sama tapa kuin tarjous ja
   kuitti), joten vanha tiedosto ei voi jäädä elämään raportin muututtua.
   Oikeus kuten työn sivulla: toimisto kaikkiin, asentaja omiinsa —
   toisen asentajan työ on 404.
   ========================================================= */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('invalid id', { status: 400 });
  if (!(await ownsJob(staff, id))) return new Response('not found', { status: 404 });

  const job = await getJob(id);
  if (!job) return new Response('not found', { status: 404 });

  const { report, tableMissing } = await getJobReport(id);
  if (tableMissing) {
    return new Response('Työraporttien taulu puuttuu. Aja db/033_job_reports.sql.', { status: 503 });
  }
  if (!report) return new Response('Työlle ei ole työraporttia.', { status: 404 });

  const pdf = await generateJobReportPdf({
    jobNumber: job.job_number,
    workDate: report.work_date,
    installers: report.installers,
    customerName: report.customer_name,
    customerPhone: report.customer_phone,
    address: report.address,
    unit: report.unit,
    startedAt: report.started_at,
    finishedAt: report.finished_at,
    travelHours: fiNumber(report.travel_hours),
    windows: report.windows,
    balconyDoors: report.balcony_doors,
    otherDoors: report.other_doors,
    steps: report.steps,
    sealantM: fiNumber(report.sealant_m),
    siliconePcs: report.silicone_pcs === null ? '' : String(report.silicone_pcs),
    acrylicPcs: report.acrylic_pcs === null ? '' : String(report.acrylic_pcs),
    notes: report.notes,
    customerAckName: report.customer_ack_name,
    recordedBy: report.created_by_name,
    recordedAt: report.updated_at,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="tyoraportti-${job.job_number}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
