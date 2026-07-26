// Loppusiivous.fi — ajanvarauksen vastaanotto (Vercel Serverless)
// Väliaikainen: lähettää varauspyynnön sähköpostilla (Resend). Supabase-backend liitetään myöhemmin.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { name, phone, email, address, size, addons, date, time, message } = req.body || {};
  if (!name || !phone || !email) return res.status(400).json({ error: 'Pakolliset kentät puuttuvat.' });

  const TO = process.env.CONTACT_TO || 'info@loppusiivous.fi';
  const FROM = process.env.CONTACT_FROM || 'Loppusiivous.fi <varaus@loppusiivous.fi>';
  const KEY = process.env.RESEND_API_KEY;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0B3A66">
      <h2 style="margin:0 0 12px">Uusi ajanvaraus — Loppusiivous.fi</h2>
      <table style="border-collapse:collapse;font-size:15px">
        ${row('Nimi', name)}${row('Puhelin', phone)}${row('Sähköposti', email)}
        ${row('Kohde', size)}${row('Lisäpalvelut', addons)}
        ${row('Sijainti', address)}${row('Päivä', date)}${row('Aika', time)}
      </table>
      <p style="margin-top:14px;font-size:14px;color:#6E8198">${esc(message || '')}</p>
    </div>`;

  // TODO (Supabase): tallenna varaus 'bookings'-tauluun ja varaa slotti.
  if (!KEY) { console.log('[bookings] (dev, ei RESEND_API_KEY):', req.body); return res.status(200).json({ ok: true, dev: true }); }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: email, subject: `Ajanvaraus: ${name} — ${date || ''} ${time || ''}`, html }),
    });
    if (!r.ok) { console.error('[bookings] Resend:', await r.text()); return res.status(502).json({ error: 'Lähetys epäonnistui.' }); }
    return res.status(200).json({ ok: true });
  } catch (e) { console.error('[bookings]', e); return res.status(500).json({ error: 'Palvelinvirhe.' }); }
}

const row = (k, v) => `<tr><td style="padding:4px 14px 4px 0;color:#7C90A6">${k}</td><td><b>${esc(v || '–')}</b></td></tr>`;
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
