import { createHash } from 'node:crypto';
import { sql } from '@/lib/db';
import { corsHeaders, preflight } from '../cors';

/* =========================================================
   Evästeetön, anonyymi kävijäseuranta — vastaanotto.

   Selain lähettää tänne kevyitä beaconeja (_analytics.js). Kävijää EI
   tunnisteta pysyvästi: hash lasketaan IP:stä + selaimesta + päivästä +
   saltista, ja se vaihtuu päivittäin. Raakaa IP:tä ei koskaan tallenneta.
   Ks. db/011_web_analytics.sql ja tietosuoja.html luku 7.
   ========================================================= */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const OPTIONS = preflight;

/* Anonyymi kävijähash. Saltiksi BOOKING_SECRET (palvelinpuolen salaisuus),
   joten hashista ei voi palata IP:hen ilman sitä — eikä sittenkään, koska
   se vaihtuu joka päivä. */
function visitorHash(ip: string, ua: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date());
  const salt = process.env.BOOKING_SECRET ?? 'tk-analytics';
  return createHash('sha256').update(`${ip}|${ua}|${day}|${salt}`).digest('hex').slice(0, 32);
}

function parseUA(ua: string): { device: string; browser: string; os: string } {
  const u = ua.toLowerCase();
  const device = /ipad|tablet/.test(u) ? 'tablet'
    : /mobi|iphone|android.*mobile|phone/.test(u) ? 'mobile'
      : 'desktop';
  const os = /iphone|ipad|ipod/.test(u) ? 'iOS'
    : /android/.test(u) ? 'Android'
      : /windows/.test(u) ? 'Windows'
        : /mac os x|macintosh/.test(u) ? 'macOS'
          : /linux/.test(u) ? 'Linux'
            : 'Muu';
  const browser = /edg\//.test(u) ? 'Edge'
    : /opr\/|opera/.test(u) ? 'Opera'
      : /chrome|crios/.test(u) ? 'Chrome'
        : /firefox|fxios/.test(u) ? 'Firefox'
          : /safari/.test(u) ? 'Safari'
            : 'Muu';
  return { device, browser, os };
}

function classifyRef(host: string | null): string {
  if (!host) return 'direct';
  const h = host.toLowerCase();
  if (h.includes('google')) return 'google';
  if (h.includes('bing')) return 'bing';
  if (h.includes('facebook') || h === 'fb.com' || h.endsWith('.fb.com') || h.includes('lm.facebook')) return 'facebook';
  if (h.includes('instagram')) return 'instagram';
  if (h.includes('duckduckgo')) return 'duckduckgo';
  if (h.includes('tiiviskoti.fi')) return 'internal';
  return 'other';
}

const TYPES = new Set(['pageview', 'scroll', 'cta', 'funnel']);
const clip = (s: unknown, n: number) => (typeof s === 'string' && s ? s.slice(0, n) : null);

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get('origin'));

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return new Response(null, { status: 204, headers }); }

  const type = String(body.type ?? '');
  if (!TYPES.has(type)) return new Response(null, { status: 204, headers });

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'x';
  const ua = request.headers.get('user-agent') ?? '';
  const hash = visitorHash(ip, ua);
  const { device, browser, os } = parseUA(ua);

  // Viittaajasta talletetaan vain verkkotunnus, ei koko URLia.
  let refHost: string | null = null;
  const ref = clip(body.ref, 400);
  if (ref) { try { refHost = new URL(ref).hostname || null; } catch { /* ei kelvollinen URL */ } }
  const refSource = classifyRef(refHost);

  const path = clip(body.path, 300);
  const scrollPct = type === 'scroll' && typeof body.scroll === 'number'
    ? Math.max(0, Math.min(100, Math.round(body.scroll))) : null;
  const cta = type === 'cta' ? clip(body.cta, 60) : null;
  const step = type === 'funnel' ? clip(body.step, 40) : null;
  const campaign = clip(body.campaign, 60);

  try {
    await sql`
      insert into tk.web_events
        (visitor_hash, event_type, path, ref_source, ref_host, device, browser, os,
         scroll_pct, cta, funnel_step, campaign)
      values (${hash}, ${type}, ${path}, ${refSource}, ${refHost}, ${device}, ${browser}, ${os},
              ${scrollPct}, ${cta}, ${step}, ${campaign})
    `;
  } catch {
    /* Analytiikka ei saa koskaan kaataa mitään — virhe niellään. */
  }
  return new Response(null, { status: 204, headers });
}
