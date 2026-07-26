import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------
   Ikkunanpesun varaus — Lasikiilto
   Itsenäinen endpoint: ei riipu Supabasesta, joten toimii heti dev-ympäristössä.
   - Validoi syötteen
   - Luo varausnumeron (LK-YYYYMMDD-XXXX)
   - Tallentaa varauksen paikalliseen lokiin (parasta yritystä)
   - Lähettää ilmoitussähköpostin, jos RESEND_API_KEY on asetettu (fire-and-forget)
   ------------------------------------------------------------------ */

export const runtime = "nodejs";

interface LineItem { label: string; sum: number; qty?: number }
interface BookingBody {
  name?: string; email?: string; phone?: string; address?: string; postal?: string;
  date?: string; notes?: string; items?: LineItem[]; priceTotal?: number; netEstimate?: number;
  windowCount?: number; pageUrl?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function makeReference(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `LK-${ymd}-${rnd}`;
}

async function persist(record: Record<string, unknown>) {
  try {
    const dir = path.join(process.cwd(), ".data");
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "window-bookings.jsonl"), JSON.stringify(record) + "\n", "utf8");
  } catch (e) {
    // Loki on lisäominaisuus — ei kaada varausta jos kirjoitus epäonnistuu
    console.error("Booking persist error:", e);
  }
}

async function notify(record: Record<string, unknown>) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.BOOKING_NOTIFY_EMAIL || "info@lasikiilto.fi";
  if (!key) return; // Sähköposti-integraatio valinnainen
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: process.env.BOOKING_FROM_EMAIL || "Lasikiilto <varaukset@lasikiilto.fi>",
        to,
        subject: `Uusi ikkunanpesuvaraus ${record.reference}`,
        text: JSON.stringify(record, null, 2),
      }),
    });
  } catch (e) {
    console.error("Booking notify error:", e);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookingBody;
    const { name, email, phone, address, postal, date, notes, items, priceTotal, netEstimate, windowCount, pageUrl } = body;

    if (!name || !email || !phone || !address) {
      return NextResponse.json({ error: "Täytä nimi, sähköposti, puhelin ja osoite." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Tarkista sähköpostiosoite." }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0 || !priceTotal || priceTotal <= 0) {
      return NextResponse.json({ error: "Valitse vähintään yksi ikkuna laskurista." }, { status: 400 });
    }

    const reference = makeReference();
    const record = {
      reference,
      createdAt: new Date().toISOString(),
      name, email, phone, address, postal: postal || null, preferredDate: date || null, notes: notes || null,
      items, priceTotal, netEstimate: netEstimate ?? null, windowCount: windowCount ?? null,
      pageUrl: pageUrl || null,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    };

    await persist(record);
    void notify(record); // fire-and-forget

    return NextResponse.json({ success: true, reference });
  } catch (err) {
    console.error("Window booking error:", err);
    return NextResponse.json({ error: "Varauksen käsittely epäonnistui. Yritä uudelleen." }, { status: 500 });
  }
}
