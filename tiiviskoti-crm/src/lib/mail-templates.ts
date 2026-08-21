import 'server-only';
import { dateKeyOf, isoWeekday, timeOf, weekdayName } from './time';

/* =========================================================
   Sähköpostipohjat.

   Ei ulkoisia kuvia: aiemmin vahvistusposteissa näkyi väärän brändin logo
   toisen Supabase-projektin storagesta, ja moni postiohjelma estää kuvat
   oletuksena. Brändi tehdään siksi taustaväreillä ja typografialla, jotka
   näkyvät aina.

   Taulukkopohjainen asettelu ja inline-tyylit, koska Outlook ei tue
   flexboxia, gridiä eikä <style>-lohkoa luotettavasti.
   ========================================================= */

const GREEN = '#215A43';
const GREEN_DARK = '#17402F';
const CREAM = '#F7F5F0';
const INK = '#1B2422';
const MUTED = '#5F6D68';
const PHONE = '045 875 5996';
const PHONE_HREF = '+358458755996';
const COMPANY = 'TiivisKoti';
const BUSINESS_ID = '3414418-4';
const COMPANY_ADDRESS = 'Järvipuistonkatu 5, 04400 Järvenpää';

export type MailLine = { name: string; qty: number; unit: number; sum: number; unitName?: string; note?: string };

export type ConfirmationData = {
  jobNumber: string;
  customerName: string;
  startsAt: Date;
  endsAt: Date;
  address: string;
  postalCode: string;
  city?: string | null;
  lines: MailLine[];
  totalCents: number;
  netCents: number;
  notes?: string | null;
};

const eur = (cents: number) =>
  (cents / 100).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';

function whenText(startsAt: Date, endsAt: Date): string {
  const key = dateKeyOf(startsAt);
  const [, m, d] = key.split('-').map(Number);
  return `${weekdayName(isoWeekday(key))} ${d}.${m}.${key.slice(0, 4)} klo ${timeOf(startsAt)}–${timeOf(endsAt)}`;
}

export function confirmationSubject(data: ConfirmationData): string {
  const key = dateKeyOf(data.startsAt);
  const [, m, d] = key.split('-').map(Number);
  return `Varausvahvistus ${data.jobNumber} — ${d}.${m}. klo ${timeOf(data.startsAt)}`;
}

export function confirmationHtml(data: ConfirmationData): string {
  const when = whenText(data.startsAt, data.endsAt);
  const place = [data.address, [data.postalCode, data.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');

  const rows = data.lines.map((l) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #E6E2DA;color:${INK};font-size:15px">
        ${l.qty > 1 ? `<strong>${l.qty}×</strong> ` : ''}${esc(l.name)}
        ${l.qty > 1 ? `<span style="color:${MUTED};font-size:13px"> &middot; ${eur(l.unit * 100)}/${esc(l.unitName || 'kpl')}</span>` : ''}
        ${l.note ? `<span style="color:${MUTED};font-size:13px"> ${esc(l.note)}</span>` : ''}
      </td>
      <td style="padding:9px 0;border-bottom:1px solid #E6E2DA;text-align:right;color:${INK};font-size:15px;font-weight:600;white-space:nowrap">
        ${eur(l.sum * 100)}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">

  <tr><td style="background:${GREEN};padding:26px 28px">
    <div style="color:#FFFFFF;font-size:21px;font-weight:700;letter-spacing:-.3px">TiivisKoti</div>
    <div style="color:#BFD8CC;font-size:14px;margin-top:3px">Ovien ja ikkunoiden tiivistys</div>
  </td></tr>

  <tr><td style="padding:28px 28px 8px">
    <div style="color:${MUTED};font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">Varaus vahvistettu</div>
    <h1 style="margin:8px 0 0;color:${INK};font-size:23px;font-weight:700;line-height:1.3">Kiitos varauksesta, ${esc(firstName(data.customerName))}!</h1>
    <p style="margin:12px 0 0;color:${MUTED};font-size:15px;line-height:1.6">
      Aika on varattu kalenteriimme. Tarkistamme työn laajuuden paikan päällä ennen aloitusta —
      jos jotain poikkeaa, sovimme siitä kanssasi etukäteen.
    </p>
  </td></tr>

  <tr><td style="padding:20px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:10px">
      <tr><td style="padding:16px 18px">
        <div style="color:${MUTED};font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">Aika</div>
        <div style="color:${INK};font-size:16px;font-weight:700;margin-top:2px">${esc(when)}</div>
        <div style="color:${MUTED};font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;margin-top:12px">Osoite</div>
        <div style="color:${INK};font-size:15px;margin-top:2px">${esc(place)}</div>
        <div style="color:${MUTED};font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;margin-top:12px">Varausnumero</div>
        <div style="color:${INK};font-size:15px;font-weight:600;margin-top:2px">${esc(data.jobNumber)}</div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:24px 28px 0">
    <div style="color:${INK};font-size:15px;font-weight:700;margin-bottom:6px">Tilatut työt</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
      <tr>
        <td style="padding:14px 0 0;color:${INK};font-size:17px;font-weight:700">Yhteensä</td>
        <td style="padding:14px 0 0;text-align:right;color:${GREEN};font-size:19px;font-weight:700;white-space:nowrap">${eur(data.totalCents)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:4px 0 0;color:${MUTED};font-size:13px">Sisältää ALV 25,5 %</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:18px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDF5F0;border-radius:10px">
      <tr><td style="padding:14px 18px;color:${GREEN_DARK};font-size:14px;line-height:1.6">
        <strong>Kotitalousvähennys.</strong> Tiivistys on kotitaloustyötä. Laskussa työn osuus on
        valmiiksi eriteltynä, joten voit vähentää siitä jopa 40 %. Vähennyksen jälkeen hinta on
        arviolta <strong>${eur(data.netCents)}</strong>.
      </td></tr>
    </table>
  </td></tr>

  ${data.notes ? `<tr><td style="padding:18px 28px 0">
    <div style="color:${MUTED};font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">Lisätietosi</div>
    <div style="color:${INK};font-size:14px;line-height:1.6;margin-top:4px">${esc(data.notes)}</div>
  </td></tr>` : ''}

  <tr><td style="padding:24px 28px 28px">
    <div style="border-top:1px solid #E6E2DA;padding-top:18px;color:${MUTED};font-size:14px;line-height:1.7">
      Tarvitsetko muutoksen aikaan tai haluatko peruuttaa? Soita
      <a href="tel:${PHONE_HREF}" style="color:${GREEN};font-weight:700;text-decoration:none">${PHONE}</a>
      tai vastaa tähän viestiin.
    </div>
  </td></tr>

  <tr><td style="background:${CREAM};padding:18px 28px;text-align:center;color:${MUTED};font-size:13px">
    TiivisKoti &middot; Uusimaa &middot;
    <a href="tel:${PHONE_HREF}" style="color:${GREEN};text-decoration:none">${PHONE}</a> &middot;
    <a href="mailto:info@tiiviskoti.fi" style="color:${GREEN};text-decoration:none">info@tiiviskoti.fi</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

export function confirmationText(data: ConfirmationData): string {
  const when = whenText(data.startsAt, data.endsAt);
  const place = [data.address, [data.postalCode, data.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const lines = data.lines.map((l) =>
    `  ${l.qty > 1 ? `${l.qty}× ` : ''}${l.name}${l.note ? ` ${l.note}` : ''}  ${eur(l.sum * 100)}`);

  return [
    'TIIVISKOTI — VARAUSVAHVISTUS',
    '',
    `Kiitos varauksesta, ${firstName(data.customerName)}!`,
    '',
    `Aika:          ${when}`,
    `Osoite:        ${place}`,
    `Varausnumero:  ${data.jobNumber}`,
    '',
    'Tilatut työt:',
    ...lines,
    '',
    `Yhteensä: ${eur(data.totalCents)} (sis. ALV 25,5 %)`,
    `Kotitalousvähennyksen jälkeen arviolta ${eur(data.netCents)}.`,
    '',
    data.notes ? `Lisätietosi: ${data.notes}\n` : '',
    'Tarkistamme työn laajuuden paikan päällä ennen aloitusta.',
    `Muutokset ja peruutukset: ${PHONE} tai info@tiiviskoti.fi`,
    '',
    'TiivisKoti · Uusimaa',
  ].filter((l) => l !== '').join('\n');
}

/* ---------- työmääräin asentajalle ----------
   Eri viesti kuin asiakkaan vahvistus: tätä luetaan puhelimesta autossa, joten
   osoite ja puhelinnumero ovat isolla ja klikattavina heti ylhäällä. Hinta on
   mukana, koska asentaja veloittaa asiakkaalta paikan päällä. */

export type WorkOrderData = ConfirmationData & {
  phone: string;
  email: string;
  staffName: string;
};

export function workOrderSubject(data: WorkOrderData): string {
  const key = dateKeyOf(data.startsAt);
  const [, m, d] = key.split('-').map(Number);
  return `Työmääräin ${data.jobNumber} — ${d}.${m}. klo ${timeOf(data.startsAt)} ${data.address}`;
}

export function workOrderHtml(data: WorkOrderData): string {
  const when = whenText(data.startsAt, data.endsAt);
  const place = [data.address, [data.postalCode, data.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
  const minutes = Math.round((data.endsAt.getTime() - data.startsAt.getTime()) / 60_000);

  const rows = data.lines.map((l) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #E6E2DA;color:${INK};font-size:15px">
        ${l.qty > 1 ? `<strong>${l.qty}×</strong> ` : ''}${esc(l.name)}${l.note ? ` <span style="color:${MUTED};font-size:13px">${esc(l.note)}</span>` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #E6E2DA;text-align:right;color:${INK};font-size:15px;white-space:nowrap">${eur(l.sum * 100)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:20px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">

  <tr><td style="background:${GREEN_DARK};padding:20px 24px">
    <div style="color:#BFD8CC;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Työmääräin</div>
    <div style="color:#FFFFFF;font-size:20px;font-weight:700;margin-top:4px">${esc(data.jobNumber)}</div>
    <div style="color:#BFD8CC;font-size:14px;margin-top:2px">${esc(when)} &middot; ${minutes} min</div>
  </td></tr>

  <tr><td style="padding:22px 24px 0">
    <div style="color:${MUTED};font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">Kohde</div>
    <div style="color:${INK};font-size:19px;font-weight:700;margin-top:4px;line-height:1.35">${esc(place)}</div>
    <div style="margin-top:10px">
      <a href="${mapUrl}" style="display:inline-block;background:${GREEN};color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:11px 18px;border-radius:8px">Avaa kartalla</a>
    </div>
  </td></tr>

  <tr><td style="padding:20px 24px 0">
    <div style="color:${MUTED};font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">Asiakas</div>
    <div style="color:${INK};font-size:17px;font-weight:600;margin-top:4px">${esc(data.customerName)}</div>
    <div style="margin-top:8px">
      <a href="tel:${esc(data.phone.replace(/\s/g, ''))}" style="display:inline-block;border:1px solid ${GREEN};color:${GREEN};font-size:15px;font-weight:700;text-decoration:none;padding:10px 16px;border-radius:8px">Soita ${esc(data.phone)}</a>
    </div>
    <div style="color:${MUTED};font-size:14px;margin-top:8px">${esc(data.email)}</div>
  </td></tr>

  <tr><td style="padding:22px 24px 0">
    <div style="color:${MUTED};font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">Tehtävä työ</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${rows}
      <tr>
        <td style="padding:12px 0 0;color:${INK};font-size:17px;font-weight:700">Veloitetaan</td>
        <td style="padding:12px 0 0;text-align:right;color:${GREEN};font-size:19px;font-weight:700;white-space:nowrap">${eur(data.totalCents)}</td>
      </tr>
      <tr><td colspan="2" style="padding:3px 0 0;color:${MUTED};font-size:13px">Sisältää ALV 25,5 % &middot; asiakkaalle luvattu kiinteä hinta</td></tr>
    </table>
  </td></tr>

  ${data.notes ? `<tr><td style="padding:20px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E8;border-radius:10px">
      <tr><td style="padding:13px 16px;color:#6B4F1D;font-size:14px;line-height:1.6">
        <strong>Asiakkaan lisätiedot:</strong><br>${esc(data.notes)}
      </td></tr>
    </table>
  </td></tr>` : ''}

  <tr><td style="padding:22px 24px 24px">
    <div style="border-top:1px solid #E6E2DA;padding-top:16px;color:${MUTED};font-size:13px;line-height:1.7">
      Työ on myös kalenterissasi. Jos laajuus poikkeaa tästä, sovi uusi hinta asiakkaan
      kanssa <strong>ennen</strong> työn aloitusta — asiakkaalle on luvattu yllä oleva kiinteä hinta.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

export function workOrderText(data: WorkOrderData): string {
  const when = whenText(data.startsAt, data.endsAt);
  const place = [data.address, [data.postalCode, data.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const minutes = Math.round((data.endsAt.getTime() - data.startsAt.getTime()) / 60_000);

  return [
    `TYÖMÄÄRÄIN ${data.jobNumber}`,
    '',
    `Aika:     ${when} (${minutes} min)`,
    `Kohde:    ${place}`,
    `Asiakas:  ${data.customerName}`,
    `Puhelin:  ${data.phone}`,
    `Email:    ${data.email}`,
    '',
    'Tehtävä työ:',
    ...data.lines.map((l) => `  ${l.qty > 1 ? `${l.qty}× ` : ''}${l.name}${l.note ? ` ${l.note}` : ''}  ${eur(l.sum * 100)}`),
    '',
    `Veloitetaan: ${eur(data.totalCents)} (sis. ALV 25,5 %)`,
    data.notes ? `\nAsiakkaan lisätiedot: ${data.notes}` : '',
    '',
    'Asiakkaalle on luvattu kiinteä hinta. Jos laajuus poikkeaa, sovi uusi hinta',
    'asiakkaan kanssa ENNEN työn aloitusta.',
  ].filter((l) => l !== '').join('\n');
}

/** Kalenteritapahtuman kuvaus asentajalle. */
export function calendarDescription(data: ConfirmationData & { phone: string; email: string }): string {
  return [
    `Varaus ${data.jobNumber}`,
    '',
    `Asiakas:  ${data.customerName}`,
    `Puhelin:  ${data.phone}`,
    `Sähköposti: ${data.email}`,
    `Osoite:   ${[data.address, data.postalCode, data.city].filter(Boolean).join(', ')}`,
    '',
    'Työt:',
    ...data.lines.map((l) => `  ${l.qty > 1 ? `${l.qty}× ` : ''}${l.name}  ${eur(l.sum * 100)}`),
    '',
    `Yhteensä: ${eur(data.totalCents)}`,
    data.notes ? `\nLisätiedot: ${data.notes}` : '',
  ].join('\n');
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || 'hei';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- Kuitti (maksettu työ) ---------- */

export type ReceiptEmailData = {
  jobNumber: string;
  customerName: string;
  lines: MailLine[];
  totalCents: number;
};

export function receiptEmailSubject(data: ReceiptEmailData): string {
  return `Kuitti ${data.jobNumber} — ${COMPANY}`;
}

export function receiptEmailHtml(data: ReceiptEmailData): string {
  const workCents = Math.round(data.totalCents * 0.9);
  const rows = data.lines.map((l) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #E6E2DA;color:${INK};font-size:15px">
        ${l.qty > 1 ? `<strong>${l.qty}×</strong> ` : ''}${esc(l.name)}
      </td>
      <td style="padding:9px 0;border-bottom:1px solid #E6E2DA;text-align:right;color:${INK};font-size:15px;font-weight:600;white-space:nowrap">
        ${eur(l.sum * 100)}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">

  <tr><td style="background:${GREEN};padding:26px 28px">
    <div style="color:#FFFFFF;font-size:21px;font-weight:700;letter-spacing:-.3px">${COMPANY}</div>
    <div style="color:#BFD8CC;font-size:14px;margin-top:3px">Ovien ja ikkunoiden tiivistys</div>
  </td></tr>

  <tr><td style="padding:28px 28px 8px">
    <div style="color:${MUTED};font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">Kuitti · Maksettu</div>
    <h1 style="margin:8px 0 0;color:${INK};font-size:23px;font-weight:700;line-height:1.3">Kiitos maksusta, ${esc(firstName(data.customerName))}!</h1>
    <p style="margin:12px 0 0;color:${MUTED};font-size:15px;line-height:1.6">
      Liitteenä kuitti työstä ${esc(data.jobNumber)}. Säilytä se — kuitissa on työn osuus
      valmiiksi eriteltynä kotitalousvähennystä varten.
    </p>
  </td></tr>

  <tr><td style="padding:24px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
      <tr>
        <td style="padding:14px 0 0;color:${MUTED};font-size:14px">Työn osuus (kotitalousvähennys)</td>
        <td style="padding:14px 0 0;text-align:right;color:${INK};font-size:14px;white-space:nowrap">${eur(workCents)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0 0;color:${INK};font-size:17px;font-weight:700">Yhteensä</td>
        <td style="padding:8px 0 0;text-align:right;color:${GREEN};font-size:19px;font-weight:700;white-space:nowrap">${eur(data.totalCents)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:4px 0 0;color:${MUTED};font-size:13px">Sisältää ALV 25,5 %</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:24px 28px 28px">
    <div style="border-top:1px solid #E6E2DA;padding-top:18px;color:${MUTED};font-size:14px;line-height:1.7">
      Kysyttävää kuitista? Soita
      <a href="tel:${PHONE_HREF}" style="color:${GREEN};font-weight:700;text-decoration:none">${PHONE}</a>
      tai vastaa tähän viestiin.
    </div>
  </td></tr>

  <tr><td style="background:${CREAM};padding:18px 28px;text-align:center;color:${MUTED};font-size:12px;line-height:1.6">
    <strong>${COMPANY}</strong> &middot; Y-tunnus ${BUSINESS_ID}<br>
    ${COMPANY_ADDRESS}<br>
    <a href="tel:${PHONE_HREF}" style="color:${GREEN};text-decoration:none">${PHONE}</a> &middot;
    <a href="mailto:info@tiiviskoti.fi" style="color:${GREEN};text-decoration:none">info@tiiviskoti.fi</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

export function receiptEmailText(data: ReceiptEmailData): string {
  return [
    `Kiitos maksusta, ${firstName(data.customerName)}!`,
    '',
    `Liitteenä kuitti työstä ${data.jobNumber}, yhteensä ${eur(data.totalCents)} (sis. ALV 25,5 %).`,
    'Kuitissa on työn osuus eriteltynä kotitalousvähennystä varten.',
    '',
    `${COMPANY} · Y-tunnus ${BUSINESS_ID}`,
    COMPANY_ADDRESS,
    `${PHONE} · info@tiiviskoti.fi`,
  ].join('\n');
}
