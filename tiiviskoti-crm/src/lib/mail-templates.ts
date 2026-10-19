import 'server-only';
import { addDays, dateKeyOf, isoWeekday, timeOf, weekdayName, weekdayShort } from './time';

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
const PHONE = '045 7831 1972';
const PHONE_HREF = '+3584578311972';
const COMPANY = 'TiivisKoti';
const BUSINESS_ID = '3652671-7';
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
  /** Kohdetietokyselyn linkki (lib/survey.ts). Puuttuu jos db/037 ajamatta. */
  surveyUrl?: string | null;
};

const eur = (cents: number) =>
  (cents / 100).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';

function whenText(startsAt: Date, endsAt: Date): string {
  const key = dateKeyOf(startsAt);
  const [, m, d] = key.split('-').map(Number);
  return `${weekdayName(isoWeekday(key))} ${d}.${m}.${key.slice(0, 4)} klo ${timeOf(startsAt)}–${timeOf(endsAt)}`;
}

/* Kohdetiedot pyydetään viimeistään kaksi päivää ennen käyntiä, jotta
   asentaja ehtii hankkia oikean profiilin. Jos käynti on jo sitä
   lähempänä, pyydetään "mahdollisimman pian" eikä mennyttä päivää. */
function surveyDeadline(startsAt: Date): string {
  const key = addDays(dateKeyOf(startsAt), -2);
  if (key <= dateKeyOf(new Date())) return 'mahdollisimman pian';
  const [, m, d] = key.split('-').map(Number);
  return `viimeistään ${weekdayShort(isoWeekday(key))} ${d}.${m}.`;
}

/* Kuvaohje on sama postissa ja kyselysivulla (tiiviskoti/kohdetiedot.html). */
const SURVEY_STEPS = [
  ['Ikkuna sisältä', 'avaa ikkuna niin, että puitteet ja karmi näkyvät'],
  ['Lähikuva tiivisteestä', 'nykyinen tiiviste karmin tai puitteen reunassa'],
  ['Ikkuna ulkoa', 'koko ikkuna talon ulkopuolelta'],
] as const;

function surveyHtml(data: ConfirmationData): string {
  if (!data.surveyUrl) return '';
  const steps = SURVEY_STEPS.map(([h, t], i) => `
        <tr>
          <td valign="top" style="padding:6px 10px 6px 0;width:26px">
            <div style="width:24px;height:24px;border-radius:12px;background:${GREEN};color:#FFFFFF;font-size:13px;font-weight:700;line-height:24px;text-align:center">${i + 1}</div>
          </td>
          <td style="padding:6px 0;color:${INK};font-size:14px;line-height:1.5"><strong>${h}</strong> &ndash; <span style="color:${MUTED}">${t}</span></td>
        </tr>`).join('');
  return `
  <tr><td style="padding:22px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${GREEN};border-radius:12px">
      <tr><td style="padding:20px 20px 18px">
        <div style="color:${GREEN};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Tärkeää ennen käyntiä</div>
        <div style="color:${INK};font-size:18px;font-weight:700;margin-top:4px;line-height:1.35">Täytä kohdetiedot ja lähetä kolme kuvaa</div>
        <p style="margin:8px 0 12px;color:${MUTED};font-size:14px;line-height:1.6">
          Näin tiedämme etukäteen, mitä tiivisteprofiilia tarvitaan, ja sovimme kirjallisesti,
          mitkä puitteet tiivistetään. Täyttö vie noin kaksi minuuttia puhelimella.
          Ota kuvat yhdestä ikkunasta ja jos varaukseen kuuluu ovi, samat kuvat ovesta.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0">${steps}</table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr><td style="background:${GREEN};border-radius:10px">
          <a href="${esc(data.surveyUrl)}" style="display:inline-block;padding:13px 24px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none">Täytä kohdetiedot &rarr;</a>
        </td></tr></table>
        <p style="margin:12px 0 0;color:${MUTED};font-size:13px;line-height:1.6">
          Täytäthän tiedot <strong style="color:${INK}">${surveyDeadline(data.startsAt).replace(/\.$/, '')}</strong>.
          Tarvitsetko apua kuvien ottamisessa? Soita
          <a href="tel:${PHONE_HREF}" style="color:${GREEN};font-weight:700;text-decoration:none">${PHONE}</a>.
        </p>
      </td></tr>
    </table>
  </td></tr>
`;
}

export function confirmationSubject(data: ConfirmationData): string {
  const key = dateKeyOf(data.startsAt);
  const [, m, d] = key.split('-').map(Number);
  return `Varausvahvistus ${data.jobNumber} — ${d}.${m}. klo ${timeOf(data.startsAt)}`;
}

/* Muistiinpano EI mene asiakkaalle. `notes` on sisäinen kenttä johon
   kirjataan ovikoodeja ja muuta työn tekemiseen kuuluvaa — se kuuluu
   työmääräimeen, ei vahvistukseen. Aiemmin se kaikuutettiin asiakkaalle
   "Lisätietosi"-otsikolla, jolloin ovikoodi päätyi sähköpostiin.

   Myöskään laajuuden tarkistuksesta ei luvata mitään: vahvistus on
   kuitti varatusta ajasta, ei työn ehdoista. */
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
      Aika on varattu kalenteriimme.
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

${surveyHtml(data)}
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
    ...(data.surveyUrl ? [
      '',
      'TÄRKEÄÄ ENNEN KÄYNTIÄ: täytä kohdetiedot ja lähetä kolme kuvaa',
      `(${surveyDeadline(data.startsAt)}):`,
      ...SURVEY_STEPS.map(([h, t], i) => `  ${i + 1}. ${h} – ${t}`),
      `Kohdetiedot: ${data.surveyUrl}`,
      `Apua kuvien ottamiseen: ${PHONE}`,
    ] : []),
    '',
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

/* ---------- Tarjous (ennen työtä) ---------- */

export type OfferEmailData = {
  jobNumber: string;
  customerName: string;
  lines: MailLine[];
  totalCents: number;
  validDays: number;
  /** Vapaa sana: asiakkaalle kirjoitettu saateteksti. Sama teksti kuin PDF:ssä. */
  customerNote?: string | null;
  /** "Työhön sisältyy" -rivit. Sama lista kuin PDF:ssä; tyhjä jättää osion pois. */
  inclusions?: string[] | null;
  /** Muutettu ja uudelleen lähetetty tarjous (sama numero). Asiakkaalla on
      jo edellinen versio, joten viestin on sanottava selvästi että tämä
      korvaa sen — muuten hänellä on kaksi eri summaa samalla numerolla. */
  updated?: boolean;
  /** Sähköisen hyväksynnän linkki (db/038). Ilman sitä hyväksytään vastaamalla. */
  acceptUrl?: string | null;
};

export function offerEmailSubject(data: OfferEmailData): string {
  return `${data.updated ? 'Päivitetty tarjous' : 'Tarjous'} ${data.jobNumber} — ${COMPANY}`;
}

export function offerEmailHtml(data: OfferEmailData): string {
  const workCents = Math.round(data.totalCents * 0.9);
  const inclusions = (data.inclusions ?? []).filter((i) => i.trim());
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
    <div style="color:${MUTED};font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">${data.updated ? 'Päivitetty tarjous' : 'Tarjous'} · Voimassa ${data.validDays} pv</div>
    <h1 style="margin:8px 0 0;color:${INK};font-size:23px;font-weight:700;line-height:1.3">${data.updated ? 'Hei' : 'Kiitos yhteydenotosta'}, ${esc(firstName(data.customerName))}!</h1>
    <p style="margin:12px 0 0;color:${MUTED};font-size:15px;line-height:1.6">
      ${data.updated
        ? `Liitteenä päivitetty tarjous ${esc(data.jobNumber)}. Se korvaa aiemmin lähettämämme saman numeron tarjouksen.`
        : `Liitteenä tarjous ${esc(data.jobNumber)}.`}
      Hyväksy tarjous vastaamalla tähän viestiin
      tai soittamalla — sovitaan sopiva aika työlle.
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

  ${inclusions.length ? `<tr><td style="padding:22px 28px 0">
    <div style="border:1px solid #E6E2DA;border-radius:10px;padding:16px 18px">
      <div style="color:${GREEN};font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Työhön sisältyy</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">
        ${inclusions.map((i) => `
        <tr>
          <td width="16" valign="top" style="color:${GREEN};font-size:15px;line-height:1.6">&bull;</td>
          <td style="color:${INK};font-size:14px;line-height:1.6;padding-bottom:4px">${esc(i)}</td>
        </tr>`).join('')}
      </table>
    </div>
  </td></tr>` : ''}

  ${data.customerNote ? `<tr><td style="padding:22px 28px 0">
    <div style="background:${CREAM};border-radius:10px;padding:16px 18px;color:${INK};font-size:15px;line-height:1.7;white-space:pre-line">${esc(data.customerNote)}</div>
  </td></tr>` : ''}

  ${data.acceptUrl ? `<tr><td style="padding:24px 28px 0" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${GREEN};border-radius:10px">
      <a href="${esc(data.acceptUrl)}" style="display:inline-block;padding:15px 30px;color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none">Hyväksy tarjous &rarr;</a>
    </td></tr></table>
    <div style="color:${MUTED};font-size:13px;margin-top:10px">Hyväksyntä vie minuutin. Sovimme sen jälkeen asennusajan kanssasi.</div>
  </td></tr>` : ''}

  <tr><td style="padding:24px 28px 28px">
    <div style="border-top:1px solid #E6E2DA;padding-top:18px;color:${MUTED};font-size:14px;line-height:1.7">
      Kysyttävää tarjouksesta? Soita
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

export function offerEmailText(data: OfferEmailData): string {
  const inclusions = (data.inclusions ?? []).filter((i) => i.trim());
  return [
    `${data.updated ? 'Hei' : 'Kiitos yhteydenotosta'}, ${firstName(data.customerName)}!`,
    '',
    data.updated
      ? `Liitteenä päivitetty tarjous ${data.jobNumber}, yhteensä ${eur(data.totalCents)} (sis. ALV 25,5 %). Se korvaa aiemmin lähettämämme saman numeron tarjouksen.`
      : `Liitteenä tarjous ${data.jobNumber}, yhteensä ${eur(data.totalCents)} (sis. ALV 25,5 %).`,
    `Tarjous on voimassa ${data.validDays} päivää. Työn osuus on eritelty kotitalousvähennystä varten.`,
    ...(inclusions.length ? ['', 'Työhön sisältyy:', ...inclusions.map((i) => `- ${i}`)] : []),
    ...(data.customerNote ? ['', data.customerNote] : []),
    data.acceptUrl
      ? `Hyväksy tarjous: ${data.acceptUrl}`
      : 'Hyväksy tarjous vastaamalla tähän viestiin tai soittamalla.',
    '',
    `${COMPANY} · Y-tunnus ${BUSINESS_ID}`,
    COMPANY_ADDRESS,
    `${PHONE} · info@tiiviskoti.fi`,
  ].join('\n');
}

/* ---------- Taloyhtiön kartoituskäynti ----------

   Veloitukseton käynti, joten näissä viesteissä EI ole hintoja eikä rivejä —
   kartoituksesta ei synny laskua. Se on myös syy omiin pohjiin: varauksen
   vahvistuspohja lupaisi kiinteän hinnan ja kotitalousvähennyksen, joista
   kumpikaan ei päde taloyhtiön kartoitukseen.

   Viesti tekee kolme asiaa, joista jokainen on kartoituskäynnin oma riski:
     1. varmistaa kulun (rappukäytävät ja yhteistilat ovat lukossa),
     2. kertoo kuka on paikalla ja kauanko käynti kestää,
     3. tekee peruutuksesta helppoa — turha ajo maksaa meille, ei asiakkaalle.
   ---------------------------------------------------------------- */

export type KartoitusData = {
  /** 'koti' = kotitalouden käynti (kokeilu 10/2026): sinä-muoto, ei rappukäytäviä,
   *  hinta annetaan paikan päällä. Puuttuva = taloyhtiö. */
  kind?: 'taloyhtio' | 'koti';
  jobNumber: string;
  /** Taloyhtiön nimi, esim. "As Oy Esimerkki". */
  association: string;
  contactName: string;
  role?: string | null;
  phone: string;
  email: string;
  startsAt: Date;
  endsAt: Date;
  address: string;
  postalCode: string;
  city?: string | null;
  /** Lomakkeen arvio ovien ja ikkunoiden määrästä. */
  doors?: string | null;
  notes?: string | null;
};

export function kartoitusSubject(data: KartoitusData): string {
  const key = dateKeyOf(data.startsAt);
  const [, m, d] = key.split('-').map(Number);
  return `Kartoituskäynti vahvistettu ${data.jobNumber} — ${d}.${m}. klo ${timeOf(data.startsAt)}`;
}

export function kartoitusHtml(data: KartoitusData): string {
  const koti = data.kind === 'koti';
  const when = whenText(data.startsAt, data.endsAt);
  const place = [data.address, [data.postalCode, data.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const minutes = Math.round((data.endsAt.getTime() - data.startsAt.getTime()) / 60_000);

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
    <div style="color:${MUTED};font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">Kartoituskäynti sovittu</div>
    <h1 style="margin:8px 0 0;color:${INK};font-size:23px;font-weight:700;line-height:1.3">Kiitos, ${esc(firstName(data.contactName))} — aika on varattu</h1>
    <p style="margin:12px 0 0;color:${MUTED};font-size:15px;line-height:1.6">${koti
      ? `Asentajamme tulee katsomaan ikkunasi ja ovesi paikan päälle. Käynti on <strong style="color:${INK}">veloitukseton</strong>
      eikä sido sinua mihinkään — saat kiinteän hinnan jo käynnin aikana.`
      : `Tulemme katsomaan taloyhtiön <strong style="color:${INK}">${esc(data.association)}</strong> ovet ja ikkunat
      paikan päälle. Käynti on <strong style="color:${INK}">veloitukseton</strong> eikä sido teitä mihinkään —
      sen jälkeen saatte kirjallisen sopimushinnan hallituksen käsiteltäväksi.`}
    </p>
  </td></tr>

  <tr><td style="padding:20px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:10px">
      <tr><td style="padding:16px 18px">
        <div style="color:${MUTED};font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">Aika</div>
        <div style="color:${INK};font-size:16px;font-weight:700;margin-top:2px">${esc(when)}</div>
        <div style="color:${MUTED};font-size:13px;margin-top:2px">Käynti kestää noin ${minutes} minuuttia</div>
        <div style="color:${MUTED};font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;margin-top:12px">Kohde</div>
        <div style="color:${INK};font-size:15px;margin-top:2px">${esc(place)}</div>
        <div style="color:${MUTED};font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;margin-top:12px">Viitenumero</div>
        <div style="color:${INK};font-size:15px;font-weight:600;margin-top:2px">${esc(data.jobNumber)}</div>
      </td></tr>
    </table>
  </td></tr>

  ${koti ? '' : `<tr><td style="padding:18px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E8;border-radius:10px">
      <tr><td style="padding:14px 18px;color:#6B4F1D;font-size:14px;line-height:1.6">
        <strong>Yksi asia varmistettavaksi:</strong> tarvitsemme pääsyn rappukäytäviin ja yhteistiloihin.
        Varmistattehan, että joku on vastassa tai että ovet saadaan auki sovittuna aikana.
        Jos tämä ei onnistu, siirretään käyntiä mieluummin etukäteen.
      </td></tr>
    </table>
  </td></tr>`}

  <tr><td style="padding:22px 28px 0">
    <div style="color:${INK};font-size:15px;font-weight:700;margin-bottom:8px">Mitä käynnillä tapahtuu</div>
    <div style="color:${MUTED};font-size:14.5px;line-height:1.75">${koti
      ? `1. Asentaja katsoo ikkunat ja ovet sekä niiden tiivisteet.<br>
      2. Saat kiinteän hinnan paikan päällä — näet summan ennen kuin päätät.<br>
      3. Jos haluat tiivistyksen, sovitaan asennusaika saman tien.`
      : `1. Käymme läpi ulko-ovet, rappukäytävien ovet ja yhteistilojen ikkunat.<br>
      2. Mittaamme vetokohdat ja kirjaamme tiivistettävät kohteet.<br>
      3. Saatte kirjallisen kiinteän sopimushinnan ja raportin hallitukselle.`}
    </div>
  </td></tr>

  ${data.notes ? `<tr><td style="padding:18px 28px 0">
    <div style="color:${MUTED};font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">${koti ? 'Lisätietosi' : 'Lisätietonne'}</div>
    <div style="color:${INK};font-size:14px;line-height:1.6;margin-top:4px">${esc(data.notes)}</div>
  </td></tr>` : ''}

  <tr><td style="padding:24px 28px 28px">
    <div style="border-top:1px solid #E6E2DA;padding-top:18px;color:${MUTED};font-size:14px;line-height:1.7">
      Sopiiko aika sittenkään huonosti? Soita
      <a href="tel:${PHONE_HREF}" style="color:${GREEN};font-weight:700;text-decoration:none">${PHONE}</a>
      tai vastaa tähän viestiin — siirrämme käynnin mielellämme, kunhan tiedämme siitä etukäteen.
    </div>
  </td></tr>

  <tr><td style="background:${CREAM};padding:18px 28px;text-align:center;color:${MUTED};font-size:13px">
    ${COMPANY} &middot; Y-tunnus ${BUSINESS_ID} &middot; Uusimaa<br>
    <a href="tel:${PHONE_HREF}" style="color:${GREEN};text-decoration:none">${PHONE}</a> &middot;
    <a href="mailto:info@tiiviskoti.fi" style="color:${GREEN};text-decoration:none">info@tiiviskoti.fi</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

export function kartoitusText(data: KartoitusData): string {
  const when = whenText(data.startsAt, data.endsAt);
  const place = [data.address, [data.postalCode, data.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const minutes = Math.round((data.endsAt.getTime() - data.startsAt.getTime()) / 60_000);

  if (data.kind === 'koti') {
    return [
      'TIIVISKOTI — KARTOITUSKÄYNTI VAHVISTETTU',
      '',
      `Kiitos, ${firstName(data.contactName)} — aika on varattu.`,
      '',
      `Aika:        ${when} (noin ${minutes} min)`,
      `Kohde:       ${place}`,
      `Viitenumero: ${data.jobNumber}`,
      '',
      'Käynti on veloitukseton eikä sido sinua mihinkään.',
      '',
      'Käynnillä:',
      '  1. Asentaja katsoo ikkunat ja ovet sekä niiden tiivisteet.',
      '  2. Saat kiinteän hinnan paikan päällä — näet summan ennen kuin päätät.',
      '  3. Jos haluat tiivistyksen, sovitaan asennusaika saman tien.',
      '',
      data.notes ? `Lisätietosi: ${data.notes}\n` : '',
      `Muutokset ja peruutukset: ${PHONE} tai info@tiiviskoti.fi`,
      '',
      `${COMPANY} · Y-tunnus ${BUSINESS_ID} · Uusimaa`,
    ].filter((l) => l !== '').join('\n');
  }

  return [
    'TIIVISKOTI — KARTOITUSKÄYNTI VAHVISTETTU',
    '',
    `Kiitos, ${firstName(data.contactName)} — aika on varattu.`,
    '',
    `Taloyhtiö:   ${data.association}`,
    `Aika:        ${when} (noin ${minutes} min)`,
    `Kohde:       ${place}`,
    `Viitenumero: ${data.jobNumber}`,
    '',
    'Käynti on veloitukseton eikä sido teitä mihinkään.',
    '',
    'VARMISTATTEHAN PÄÄSYN rappukäytäviin ja yhteistiloihin — joku vastassa',
    'tai ovet auki sovittuna aikana. Jos se ei onnistu, siirretään käyntiä',
    'mieluummin etukäteen.',
    '',
    'Käynnillä:',
    '  1. Käymme läpi ulko-ovet, rappukäytävien ovet ja yhteistilojen ikkunat.',
    '  2. Mittaamme vetokohdat ja kirjaamme tiivistettävät kohteet.',
    '  3. Saatte kirjallisen kiinteän sopimushinnan ja raportin hallitukselle.',
    '',
    data.notes ? `Lisätietonne: ${data.notes}\n` : '',
    `Muutokset ja peruutukset: ${PHONE} tai info@tiiviskoti.fi`,
    '',
    `${COMPANY} · Y-tunnus ${BUSINESS_ID} · Uusimaa`,
  ].filter((l) => l !== '').join('\n');
}

export function kartoitusWorkOrderSubject(data: KartoitusData): string {
  const key = dateKeyOf(data.startsAt);
  const [, m, d] = key.split('-').map(Number);
  return `${data.kind === 'koti' ? 'KOTIKARTOITUS' : 'KARTOITUS'} ${data.jobNumber} — ${d}.${m}. klo ${timeOf(data.startsAt)} ${data.address}`;
}

export function kartoitusWorkOrderHtml(data: KartoitusData): string {
  const koti = data.kind === 'koti';
  const when = whenText(data.startsAt, data.endsAt);
  const place = [data.address, [data.postalCode, data.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
  const minutes = Math.round((data.endsAt.getTime() - data.startsAt.getTime()) / 60_000);

  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:20px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">

  <tr><td style="background:${GREEN_DARK};padding:20px 24px">
    <div style="color:#BFD8CC;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${koti ? 'Kotikartoitus' : 'Kartoituskäynti'} &middot; ei veloitusta</div>
    <div style="color:#FFFFFF;font-size:20px;font-weight:700;margin-top:4px">${esc(data.jobNumber)}</div>
    <div style="color:#BFD8CC;font-size:14px;margin-top:2px">${esc(when)} &middot; ${minutes} min</div>
  </td></tr>

  <tr><td style="padding:22px 24px 0">
    <div style="color:${MUTED};font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">${koti ? 'Asiakas' : 'Taloyhtiö'}</div>
    <div style="color:${INK};font-size:19px;font-weight:700;margin-top:4px;line-height:1.35">${esc(koti ? data.contactName : data.association)}</div>
    <div style="color:${MUTED};font-size:15px;margin-top:6px">${esc(place)}</div>
    <div style="margin-top:10px">
      <a href="${mapUrl}" style="display:inline-block;background:${GREEN};color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:11px 18px;border-radius:8px">Avaa kartalla</a>
    </div>
  </td></tr>

  <tr><td style="padding:20px 24px 0">
    <div style="color:${MUTED};font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">Yhteyshenkilö</div>
    <div style="color:${INK};font-size:17px;font-weight:600;margin-top:4px">
      ${esc(data.contactName)}${data.role ? `<span style="color:${MUTED};font-weight:400;font-size:14px"> &middot; ${esc(data.role)}</span>` : ''}
    </div>
    <div style="margin-top:8px">
      <a href="tel:${esc(data.phone.replace(/\s/g, ''))}" style="display:inline-block;border:1px solid ${GREEN};color:${GREEN};font-size:15px;font-weight:700;text-decoration:none;padding:10px 16px;border-radius:8px">Soita ${esc(data.phone)}</a>
    </div>
    <div style="color:${MUTED};font-size:14px;margin-top:8px">${esc(data.email)}</div>
  </td></tr>

  ${data.doors ? `<tr><td style="padding:20px 24px 0">
    <div style="color:${MUTED};font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">Ovien ja ikkunoiden määrä (asiakkaan arvio)</div>
    <div style="color:${INK};font-size:17px;font-weight:700;margin-top:4px">${esc(data.doors)}</div>
  </td></tr>` : ''}

  ${data.notes ? `<tr><td style="padding:20px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E8;border-radius:10px">
      <tr><td style="padding:13px 16px;color:#6B4F1D;font-size:14px;line-height:1.6">
        <strong>Asiakkaan lisätiedot:</strong><br>${esc(data.notes)}
      </td></tr>
    </table>
  </td></tr>` : ''}

  <tr><td style="padding:22px 24px 24px">
    <div style="border-top:1px solid #E6E2DA;padding-top:16px;color:${MUTED};font-size:13px;line-height:1.7">
      ${koti
        ? `Tämä on <strong>veloitukseton kotikartoitus</strong> — itse käynnistä ei laskuteta.
      Katso ikkunat ja ovet ja anna kiinteä hinta paikan päällä hintalaskurilla (admin &rarr; Työt &rarr; Uusi).
      Jos asiakas haluaa tiivistyksen, sovi asennusaika saman tien ja kirjaa työ CRM:ään.`
        : `Tämä on <strong>veloitukseton kartoitus</strong> — paikan päällä ei laskuteta mitään.
      Kirjaa tiivistettävät kohteet ja määrät, niin hinta lasketaan tarjoukseen jälkikäteen.
      Soita yhteyshenkilölle ennen lähtöä, jos rappukäytävien oviin tarvitaan avausta.`}
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

export function kartoitusWorkOrderText(data: KartoitusData): string {
  const when = whenText(data.startsAt, data.endsAt);
  const place = [data.address, [data.postalCode, data.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const minutes = Math.round((data.endsAt.getTime() - data.startsAt.getTime()) / 60_000);

  const koti = data.kind === 'koti';
  return [
    `${koti ? 'KOTIKARTOITUS' : 'KARTOITUSKÄYNTI'} ${data.jobNumber} — EI VELOITUSTA`,
    '',
    `Aika:        ${when} (${minutes} min)`,
    koti ? '' : `Taloyhtiö:   ${data.association}`,
    `Kohde:       ${place}`,
    `Yhteyshlö:   ${data.contactName}${data.role ? ` (${data.role})` : ''}`,
    `Puhelin:     ${data.phone}`,
    `Email:       ${data.email}`,
    data.doors ? `Ovia/ikkunoita (arvio): ${data.doors}` : '',
    '',
    data.notes ? `Asiakkaan lisätiedot: ${data.notes}\n` : '',
    ...(koti ? [
      'Veloitukseton kotikartoitus — itse käynnistä ei laskuteta.',
      'Anna kiinteä hinta paikan päällä hintalaskurilla (admin → Työt → Uusi).',
      'Jos asiakas haluaa tiivistyksen, sovi asennusaika ja kirjaa työ CRM:ään.',
    ] : [
      'Veloitukseton kartoitus — paikan päällä ei laskuteta mitään.',
      'Kirjaa tiivistettävät kohteet ja määrät, hinta lasketaan tarjoukseen jälkikäteen.',
      'Soita yhteyshenkilölle ennen lähtöä, jos rappukäytäviin tarvitaan avausta.',
    ]),
  ].filter((l) => l !== '').join('\n');
}

/** Kalenteritapahtuman kuvaus kartoituskäynnistä. */
export function kartoitusCalendarDescription(data: KartoitusData): string {
  return [
    `${data.kind === 'koti' ? 'Kotikartoitus' : 'Kartoituskäynti'} ${data.jobNumber} — VELOITUKSETON`,
    data.kind === 'koti' ? 'Anna kiinteä hinta paikan päällä.' : '',
    '',
    data.kind === 'koti' ? '' : `Taloyhtiö:  ${data.association}`,
    `Yhteyshlö:  ${data.contactName}${data.role ? ` (${data.role})` : ''}`,
    `Puhelin:    ${data.phone}`,
    `Sähköposti: ${data.email}`,
    `Osoite:     ${[data.address, data.postalCode, data.city].filter(Boolean).join(', ')}`,
    data.doors ? `Ovia/ikkunoita (arvio): ${data.doors}` : '',
    data.notes ? `\nLisätiedot: ${data.notes}` : '',
  ].filter((l) => l !== '').join('\n');
}

/* ---------- tarjouksen hyväksyntä ----------
   Kuittaus asiakkaalle sähköisestä hyväksynnästä ja ilmoitus toimistolle.
   Kuittaus on asiakkaan kopio siitä mitä hän hyväksyi: summa ja rivit. */

export type AcceptedData = {
  offerNumber: string;
  customerName: string;
  acceptedName: string;
  acceptedAt: Date;
  lines: MailLine[];
  totalCents: number;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

const fiDateTime = (d: Date) =>
  new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

export function acceptedCustomerSubject(d: AcceptedData): string {
  return `Tarjous ${d.offerNumber} hyväksytty — ${COMPANY}`;
}

export function acceptedCustomerHtml(d: AcceptedData): string {
  const rows = d.lines.map((l) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #E6E2DA;color:${INK};font-size:14px">${l.qty > 1 ? `<strong>${l.qty}×</strong> ` : ''}${esc(l.name)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #E6E2DA;text-align:right;color:${INK};font-size:14px;font-weight:600;white-space:nowrap">${eur(l.sum * 100)}</td>
    </tr>`).join('');
  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">
  <tr><td style="background:${GREEN};padding:26px 28px">
    <div style="color:#FFFFFF;font-size:21px;font-weight:700">TiivisKoti</div>
    <div style="color:#BFD8CC;font-size:14px;margin-top:3px">Ovien ja ikkunoiden tiivistys</div>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <div style="color:${MUTED};font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">Tarjous hyväksytty</div>
    <h1 style="margin:8px 0 0;color:${INK};font-size:23px;line-height:1.3">Kiitos, ${esc(firstName(d.customerName))}!</h1>
    <p style="margin:12px 0 0;color:${MUTED};font-size:15px;line-height:1.6">
      Hyväksyit tarjouksen <strong style="color:${INK}">${esc(d.offerNumber)}</strong> ${esc(fiDateTime(d.acceptedAt))}
      nimellä <strong style="color:${INK}">${esc(d.acceptedName)}</strong>. Otamme yhteyttä ja sovimme asennusajan.
    </p>
  </td></tr>
  <tr><td style="padding:20px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
      <tr><td style="padding:12px 0 0;color:${INK};font-size:16px;font-weight:700">Yhteensä</td>
          <td style="padding:12px 0 0;text-align:right;color:${GREEN};font-size:18px;font-weight:700">${eur(d.totalCents)}</td></tr>
      <tr><td colspan="2" style="padding:4px 0 0;color:${MUTED};font-size:13px">Sisältää ALV 25,5 %</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 28px 28px">
    <div style="border-top:1px solid #E6E2DA;padding-top:18px;color:${MUTED};font-size:14px;line-height:1.7">
      Kysyttävää? Soita <a href="tel:${PHONE_HREF}" style="color:${GREEN};font-weight:700;text-decoration:none">${PHONE}</a> tai vastaa tähän viestiin.
    </div>
  </td></tr>
  <tr><td style="background:${CREAM};padding:18px 28px;text-align:center;color:${MUTED};font-size:12px;line-height:1.6">
    <strong>${COMPANY}</strong> &middot; Y-tunnus ${BUSINESS_ID}<br>${COMPANY_ADDRESS}
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

export function acceptedCustomerText(d: AcceptedData): string {
  return [
    `Kiitos, ${firstName(d.customerName)}!`,
    '',
    `Hyväksyit tarjouksen ${d.offerNumber} ${fiDateTime(d.acceptedAt)} nimellä ${d.acceptedName}.`,
    'Otamme yhteyttä ja sovimme asennusajan.',
    '',
    ...d.lines.map((l) => `  ${l.qty > 1 ? `${l.qty}× ` : ''}${l.name}  ${eur(l.sum * 100)}`),
    `Yhteensä ${eur(d.totalCents)} (sis. ALV 25,5 %)`,
    '',
    `${COMPANY} · ${PHONE} · info@tiiviskoti.fi`,
  ].join('\n');
}

export function acceptedOfficeSubject(d: AcceptedData): string {
  return `✅ Tarjous ${d.offerNumber} hyväksytty — ${d.customerName} ${eur(d.totalCents)}`;
}

export function acceptedOfficeText(d: AcceptedData): string {
  return [
    `Asiakas hyväksyi tarjouksen ${d.offerNumber} sähköisesti ${fiDateTime(d.acceptedAt)}.`,
    `Hyväksyjän nimi: ${d.acceptedName}`,
    '',
    `Asiakas: ${d.customerName}`,
    d.address ? `Osoite: ${d.address}` : '',
    d.phone ? `Puhelin: ${d.phone}` : '',
    d.email ? `Sähköposti: ${d.email}` : '',
    `Summa: ${eur(d.totalCents)}`,
    '',
    'Seuraava askel: sovi asennusaika ja tee työ tarjoukselta CRM:ssä (Laita aika).',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
