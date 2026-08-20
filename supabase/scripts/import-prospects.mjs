/**
 * import-prospects.mjs — lataa isännöinti-liidit CSV:stä outreach_prospect-tauluun.
 *
 * CSV-otsikot: Company,City,Type,Phone,Address,Website,Google_rating,Notes
 * Aja:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/scripts/import-prospects.mjs <csv-path>
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const csvPath = process.argv[2];
if (!url || !key || !csvPath) { console.error("Tarvitaan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ja csv-polku"); process.exit(1); }
const sb = createClient(url, key);

// Minimaalinen CSV-parseri (tukee lainausmerkkejä)
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const raw = readFileSync(csvPath, "utf8");
const rows = parseCsv(raw).filter(r => r.length > 1 && r[0].trim());
const header = rows.shift().map(h => h.trim());
const idx = (name) => header.indexOf(name);

let ok = 0, skip = 0;
for (const r of rows) {
  const company = r[idx("Company")]?.trim();
  if (!company) { skip++; continue; }
  const ratingRaw = r[idx("Google_rating")]?.trim();
  const rec = {
    company_name: company,
    city: r[idx("City")]?.trim() || null,
    phone: r[idx("Phone")]?.trim() || null,
    address: r[idx("Address")]?.trim() || null,
    website: r[idx("Website")]?.trim() || null,
    google_rating: ratingRaw && !isNaN(parseFloat(ratingRaw)) ? parseFloat(ratingRaw) : null,
    notes: r[idx("Notes")]?.trim() || null,
    segment: "isannointi",
    source: "scrape",
    status: "new",
  };
  // Upsert company_name+city (ei sähköpostia vielä → ei uq-emailia)
  const { data: existing } = await sb.from("outreach_prospect")
    .select("id").eq("company_name", rec.company_name).eq("city", rec.city ?? "").maybeSingle();
  if (existing) { skip++; continue; }
  const { error } = await sb.from("outreach_prospect").insert(rec);
  if (error) { console.warn("skip", company, error.message); skip++; }
  else ok++;
}
console.log(`Tuotu ${ok} prospektia, ohitettu ${skip}.`);
