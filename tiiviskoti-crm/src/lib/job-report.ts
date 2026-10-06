import 'server-only';
import { sql } from './db';
import type { StepAnswers, WorkReport } from './work-report';

/* =========================================================
   Työraportin luku kannasta (tk.job_reports, db/033).

   Taulu voi puuttua, jos migraatio on ajamatta. Silloin luku palauttaa
   `tableMissing: true` eikä kaada työn sivua — sama periaate kuin
   kuvissa (db/028). Tallennus taas palauttaa selkeän virheen
   (viimeistely/actions.ts), koska raportti on pakollinen.
   ========================================================= */

export type JobReportRow = {
  job_id: string;
  work_date: string;
  installers: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  unit: string | null;
  started_at: string;
  finished_at: string;
  travel_hours: string | null;
  windows: number;
  balcony_doors: number;
  other_doors: number;
  steps: StepAnswers;
  sealant_m: string | null;
  silicone_pcs: number | null;
  acrylic_pcs: number | null;
  notes: string | null;
  customer_ack_name: string;
  created_by_name: string | null;
  updated_at: Date;
};

export function isMissingTable(e: unknown): boolean {
  return (e as { code?: string })?.code === '42P01';
}

export async function getJobReport(
  jobId: string,
): Promise<{ report: JobReportRow | null; tableMissing: boolean }> {
  try {
    const [row] = await sql<JobReportRow[]>`
      select r.job_id, to_char(r.work_date, 'YYYY-MM-DD') as work_date, r.installers,
             r.customer_name, r.customer_phone, r.address, r.unit,
             to_char(r.started_at, 'HH24:MI') as started_at,
             to_char(r.finished_at, 'HH24:MI') as finished_at,
             r.travel_hours::text as travel_hours,
             r.windows, r.balcony_doors, r.other_doors, r.steps,
             r.sealant_m::text as sealant_m, r.silicone_pcs, r.acrylic_pcs,
             r.notes, r.customer_ack_name, s.full_name as created_by_name, r.updated_at
        from tk.job_reports r
        left join tk.staff s on s.id = coalesce(r.updated_by, r.created_by)
       where r.job_id = ${jobId}
    `;
    return { report: row ?? null, tableMissing: false };
  } catch (e) {
    if (isMissingTable(e)) return { report: null, tableMissing: true };
    throw e;
  }
}

/** '1.50' → '1,5'. Kannan numeric tekstinä näytettäväksi. */
export function fiNumber(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return String(n).replace('.', ',');
}

/** Kannan rivi velhon lomakkeen muotoon ("Viimeistele uudelleen" -esitäyttö). */
export function reportToForm(r: JobReportRow): WorkReport {
  return {
    workDate: r.work_date,
    installers: r.installers,
    customerName: r.customer_name ?? '',
    customerPhone: r.customer_phone ?? '',
    address: r.address ?? '',
    unit: r.unit ?? '',
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    travelHours: fiNumber(r.travel_hours),
    windows: r.windows,
    balconyDoors: r.balcony_doors,
    otherDoors: r.other_doors,
    steps: r.steps ?? {},
    sealantM: fiNumber(r.sealant_m),
    siliconePcs: r.silicone_pcs === null ? '' : String(r.silicone_pcs),
    acrylicPcs: r.acrylic_pcs === null ? '' : String(r.acrylic_pcs),
    notes: r.notes ?? '',
    customerAckName: r.customer_ack_name,
  };
}
