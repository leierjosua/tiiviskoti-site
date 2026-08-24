import { sql } from '@/lib/db';
import { visitorHash } from '@/lib/visitor';
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

/* Onko tk.web_events.variant olemassa? Ei kysytä kannasta joka pyynnöllä:
   ensimmäinen epäonnistunut lisäys kääntää tämän falseksi, ja sen jälkeen
   mennään suoraan vanhaa polkua. Prosessin uudelleenkäynnistys (uusi deploy)
   yrittää taas — eli migraation ajamisen jälkeen versio alkaa tallentua
   viimeistään seuraavasta kylmästä käynnistyksestä. */
/* Valinnaiset sarakkeet: migraatio voi olla ajamatta (db/014 variant,
   db/019 fbc). Analytiikka ei saa katketa sitä odotellessa, joten puuttuva
   sarake vain merkitään muistiin eikä sitä yritetä uudelleen joka
   tapahtumalla. Liput nollautuvat deployssa. */
let variantColumnExists = true;
let fbcColumnExists = true;
const isUndefinedColumn = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703';

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
  /* A/B-testin versio. Muotorajaus tässä eikä vain kannassa, jottei
     roskasyöte pilaa raporttia silloinkaan kun sarake vielä puuttuu. */
  const rawVariant = clip(body.variant, 40);
  const variant = rawVariant && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(rawVariant) ? rawVariant : null;

  /* Metan klikkitunniste laskeutumisen osoiterivistä (`fb.1.<ms>.<fbclid>`).
     Sama muotorajaus kuin kannan web_events_fbc_format-rajoitteessa: arvo
     tulee julkisesta osoiterivistä, joten kelvoton pudotetaan tyhjäksi eikä
     pyyntöä hylätä — analytiikka ei saa kaatua rikkinäiseen mainoslinkkiin. */
  const rawFbc = clip(body.fbc, 300);
  const fbc = rawFbc && /^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,255}$/.test(rawFbc) ? rawFbc : null;

  /* Rivi kootaan sarakkeista jotka tiedetään olemassa oleviksi. Käsin
     kirjoitetut vaihtoehdot olisivat kahdella valinnaisella sarakkeella jo
     neljä lähes identtistä INSERTiä. */
  const buildRow = () => {
    const row: Record<string, unknown> = {
      visitor_hash: hash, event_type: type, path, ref_source: refSource,
      ref_host: refHost, device, browser, os,
      scroll_pct: scrollPct, cta, funnel_step: step, campaign,
    };
    if (variantColumnExists) row.variant = variant;
    if (fbcColumnExists) row.fbc = fbc;
    return row;
  };

  try {
    try {
      await sql`insert into tk.web_events ${sql(buildRow())}`;
    } catch (e) {
      if (!isUndefinedColumn(e)) throw e;
      /* Kumpi puuttui? Virheilmoitus nimeää sarakkeen. Merkitään se pois ja
         yritetään kerran uudelleen — muuten tapahtuma menetettäisiin. */
      const msg = String((e as { message?: string }).message ?? '');
      if (msg.includes('"fbc"')) fbcColumnExists = false;
      if (msg.includes('"variant"')) variantColumnExists = false;
      await sql`insert into tk.web_events ${sql(buildRow())}`;
    }
  } catch {
    /* Analytiikka ei saa koskaan kaataa mitään — virhe niellään. */
  }
  return new Response(null, { status: 204, headers });
}
