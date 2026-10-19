import { Card, CardHeader } from '@/components/ui';
import { surveyForJob, surveyUrl } from '@/lib/survey';
import { answerRows } from '@/lib/survey-schema';
import { formatInstant } from '@/lib/time';

/* =========================================================
   Asiakkaan kohdetiedot (db/037) työn sivulla.

   Kuvat eivät näy tässä: ne ovat työn Kuvat-kortissa kuvatekstillä
   "Asiakas: …". Tässä vain vastaukset ja linkki, jonka voi lähettää
   asiakkaalle uudelleen jos se on hukassa.

   Ei kyselyä (vanha työ tai db/037 ajamatta) → ei korttia.
   ========================================================= */

export async function SurveyCard({ jobId }: { jobId: string }) {
  const s = await surveyForJob(jobId);
  if (!s) return null;
  const rows = answerRows(s.answers);
  const photoCount = Object.keys(s.answers.photos ?? {}).length;

  return (
    <Card className="h-fit">
      <CardHeader
        title="Asiakkaan kohdetiedot"
        action={
          <span className={`text-xs font-bold ${s.submittedAt ? 'text-accent' : 'text-warn'}`}>
            {s.submittedAt
              ? `Lähetetty ${formatInstant(s.submittedAt)}`
              : rows.length || photoCount ? 'Kesken' : 'Ei vielä täytetty'}
          </span>
        }
      />
      <div className="divide-y divide-line-soft">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-4 px-4 py-2 text-sm">
            <span className="w-40 shrink-0 text-faint">{r.label}</span>
            <span className="min-w-0 flex-1 whitespace-pre-line">{r.value}</span>
          </div>
        ))}
        <div className="px-4 py-2 text-sm text-muted">
          {photoCount ? `${photoCount} asiakkaan kuvaa Kuvat-kortissa.` : 'Asiakas ei ole lisännyt kuvia.'}{' '}
          <a href={surveyUrl(s.token)} target="_blank" rel="noreferrer" className="font-bold text-accent hover:underline">
            Kyselyn linkki
          </a>
        </div>
      </div>
    </Card>
  );
}
