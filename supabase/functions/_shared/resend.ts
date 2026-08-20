/**
 * Resend-lähetysapuri KYLMÄLLE B2B-ulkoreachille.
 *
 * Erillään Gmail-transaktiosähköposteista (varaukset) — kylmäposti lähtee
 * mail.tiiviskoti.fi-alidomainista, jotta se ei vaaranna varaussähköpostien
 * toimitettavuutta. Vaatii secretin RESEND_API_KEY.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ResendSendOptions {
  from: string;            // "TiivisKoti <info@mail.tiiviskoti.fi>"
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}

export interface ResendSendResult {
  ok: boolean;
  id?: string;             // Resend message id (webhook-mätsäys)
  error?: string;
  status?: number;
}

export async function sendViaResend(opts: ResendSendOptions): Promise<ResendSendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY puuttuu (aseta Supabase-secretiksi)" };
  }

  const body: Record<string, unknown> = {
    from: opts.from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.replyTo) body.reply_to = opts.replyTo;
  if (opts.headers) body.headers = opts.headers;
  if (opts.tags) body.tags = opts.tags;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: data?.id, status: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Renderöi template: korvaa {{muuttujat}} ja lisää pakolliset linkit.
 * Tuntemattomat muuttujat siivotaan pois (ei jätetä "{{x}}" näkyviin).
 */
export function renderTemplate(
  html: string,
  vars: Record<string, string | null | undefined>,
): string {
  let out = html;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v ?? "");
  }
  // Siivoa jäljelle jääneet placeholderit
  out = out.replace(/\{\{[a-z0-9_]+\}\}/gi, "");
  return out;
}
