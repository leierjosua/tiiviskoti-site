// Loppusiivous.fi — tarjouspyyntölomakkeen käsittely (Vercel Serverless + Resend)
// Vaatii ympäristömuuttujan RESEND_API_KEY (Vercel → Project → Settings → Environment Variables)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, phone, email, address, size, date, addons, message } = req.body || {};

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Pakolliset kentät puuttuvat (nimi, puhelin, sähköposti).' });
  }

  const TO = process.env.CONTACT_TO || 'info@loppusiivous.fi';
  const FROM = process.env.CONTACT_FROM || 'Loppusiivous.fi <tarjouspyynto@loppusiivous.fi>';
  const KEY = process.env.RESEND_API_KEY;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0B3A66;">
      <h2 style="margin:0 0 12px;">Uusi tarjouspyyntö — Loppusiivous.fi</h2>
      <table style="border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:4px 12px 4px 0;color:#6E8198;">Nimi</td><td><b>${esc(name)}</b></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6E8198;">Puhelin</td><td>${esc(phone)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6E8198;">Sähköposti</td><td>${esc(email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6E8198;">Osoite</td><td>${esc(address)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6E8198;">Koko</td><td>${esc(size)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6E8198;">Ajankohta</td><td>${esc(date)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6E8198;">Lisäpalvelut</td><td>${esc(addons)}</td></tr>
      </table>
      <p style="margin-top:16px;font-size:15px;"><b>Lisätiedot:</b><br>${esc(message).replace(/\n/g,'<br>')}</p>
    </div>`;

  // Jos Resend-avainta ei ole asetettu, logataan ja palautetaan ok (kehitysvaihe)
  if (!KEY) {
    console.log('[contact] RESEND_API_KEY puuttuu — lomakedata:', { name, phone, email, address, size, date, addons, message });
    return res.status(200).json({ ok: true, dev: true });
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [TO], reply_to: email,
        subject: `Tarjouspyyntö: ${name}${address ? ' — ' + address : ''}`,
        html,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error('[contact] Resend error:', t);
      return res.status(502).json({ error: 'Sähköpostin lähetys epäonnistui.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[contact] error:', err);
    return res.status(500).json({ error: 'Palvelinvirhe.' });
  }
}

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
