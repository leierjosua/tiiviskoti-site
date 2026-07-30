/* Julkinen rajapinta on tarkoitettu vain tiiviskoti.fi:n käyttöön.
   Sallitaan lisäksi paikallinen esikatselupalvelin, jotta sivun voi
   testata kytkettynä ennen julkaisua. */

const ALLOWED = new Set([
  'https://tiiviskoti.fi',
  'https://www.tiiviskoti.fi',
  'http://localhost:8799',
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
}

export function json(body: unknown, init: { status?: number; origin?: string | null } = {}) {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: corsHeaders(init.origin ?? null),
  });
}

export function preflight(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}
