import { json, preflight } from '../cors';
import { confirmPhoto, isToken, loadSurvey, preparePhoto, saveSurvey } from '@/lib/survey';
import { isPhotoSlot, parseAnswers } from '@/lib/survey-schema';

/* =========================================================
   Kohdetietokysely — JULKINEN rajapinta, selain kutsuu suoraan.

   tiiviskoti.fi/kohdetiedot.html puhuu tälle. Tunnisteena on vain linkin
   token (ks. lib/survey.ts); ilman sitä ei saa mitään.

   GET  ?t=…                         → kysely ja aiemmat vastaukset
   POST { t, action: 'save', answers, submit? }
   POST { t, action: 'photo', slot, contentType }  → allekirjoitettu latausosoite
   POST { t, action: 'photo-done', slot, path }    → kuva kirjataan työlle

   Kuva EI kulje tämän kautta (Vercelin runkoraja ~4,5 MB, puhelimen kuva
   on isompi) — selain lataa sen suoraan Storageen allekirjoituksella.
   ========================================================= */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const t = new URL(request.url).searchParams.get('t');
  if (!isToken(t)) return json({ error: 'not_found' }, { status: 404, origin });
  const survey = await loadSurvey(t);
  if (!survey) return json({ error: 'not_found' }, { status: 404, origin });
  return json({ ok: true, survey }, { origin });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400, origin });
  }
  const t = body.t;
  if (!isToken(t)) return json({ error: 'not_found' }, { status: 404, origin });

  try {
    if (body.action === 'save') {
      const res = await saveSurvey(t, parseAnswers(body.answers), body.submit === true);
      if (res !== 'ok') return json({ error: res }, { status: res === 'locked' ? 409 : 404, origin });
      return json({ ok: true }, { origin });
    }

    if (body.action === 'photo' || body.action === 'photo-done') {
      if (!isPhotoSlot(body.slot)) return json({ error: 'bad_slot' }, { status: 400, origin });

      if (body.action === 'photo') {
        const res = await preparePhoto(t, body.slot, String(body.contentType ?? ''));
        if ('error' in res) {
          const status = res.error === 'not_found' ? 404 : res.error === 'locked' ? 409 : res.error === 'bad_type' ? 400 : 503;
          return json(res, { status, origin });
        }
        return json({ ok: true, ...res }, { origin });
      }

      const res = await confirmPhoto(t, body.slot, String(body.path ?? ''));
      if (res !== 'ok') return json({ error: res }, { status: res === 'bad_path' ? 400 : res === 'locked' ? 409 : 404, origin });
      return json({ ok: true }, { origin });
    }

    return json({ error: 'bad_action' }, { status: 400, origin });
  } catch (e) {
    console.error('public/kohdetiedot:', e);
    return json({ error: 'server_error' }, { status: 500, origin });
  }
}
