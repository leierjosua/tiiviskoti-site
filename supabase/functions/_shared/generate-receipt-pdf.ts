import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { workPortionCents as calcWorkPortionCents } from "./constants.ts";

const LOGO_URL = "https://tiiviskoti.fi/img/logo-email.png";

const COMPANY = {
  name: "TiivisKoti.fi",
  email: "info@tiiviskoti.fi",
  phone: "045 875 5996",
};

const VAT_RATE = 0.255; // 25.5%
const BRAND_DARK = rgb(0.086, 0.227, 0.157); // #163A28
const BRAND_LIME = /* vihreä, ei lime */ rgb(0.129, 0.478, 0.306); // #217A4E
const LIME_LIGHT = /* vaalea vihreä */ rgb(0.894, 0.941, 0.914); // light green bg
const GRAY = rgb(0.533, 0.533, 0.533); // #888
const LIGHT_GRAY = rgb(0.878, 0.878, 0.878); // #e0e0e0
const WHITE = rgb(1, 1, 1);

interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

// deno-lint-ignore no-explicit-any
export async function generateReceiptPdf(booking: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - margin;

  // ─── Top lime accent bar ───
  page.drawRectangle({
    x: 0,
    y: height - 6,
    width,
    height: 6,
    color: BRAND_LIME,
  });

  // ─── Helper functions ───
  const drawText = (
    text: string,
    x: number,
    yPos: number,
    opts: { font?: typeof helvetica; size?: number; color?: typeof BRAND_DARK } = {}
  ) => {
    const font = opts.font || helvetica;
    const size = opts.size || 10;
    const color = opts.color || BRAND_DARK;
    page.drawText(text, { x, y: yPos, size, font, color });
  };

  const drawLine = (x1: number, yPos: number, x2: number, color = LIGHT_GRAY) => {
    page.drawLine({ start: { x: x1, y: yPos }, end: { x: x2, y: yPos }, thickness: 0.5, color });
  };

  const rightAlign = (text: string, font: typeof helvetica, size: number, rightX: number) => {
    return rightX - font.widthOfTextAtSize(text, size);
  };

  const formatCents = (cents: number): string => {
    return (cents / 100).toFixed(2).replace(".", ",");
  };

  const customer = booking.customers;
  const service = booking.services;
  const employee = booking.employees;

  // ─── HEADER: Logo image ───
  const logoRes = await fetch(LOGO_URL);
  const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
  const logoImage = await doc.embedPng(logoBytes);
  const logoScale = 140 / logoImage.width;
  const logoDims = { width: 140, height: logoImage.height * logoScale };
  page.drawImage(logoImage, {
    x: margin,
    y: y - logoDims.height + 10,
    width: logoDims.width,
    height: logoDims.height,
  });

  // KUITTI title - right side
  drawText("KUITTI", width - margin - helveticaBold.widthOfTextAtSize("KUITTI", 28), y - 20, {
    font: helveticaBold,
    size: 28,
    color: BRAND_DARK,
  });

  y -= 60;

  // ─── Receipt meta info ───
  const metaLabelX = width - margin - 200;
  const metaValueX = width - margin;

  const metaRows = [
    ["Kuittinumero:", `#${booking.booking_number}`],
    ["Tilauspvm:", formatDateShort(booking.created_at)],
    ["Työn pvm:", formatDateShort(booking.booking_date)],
  ];

  for (const [label, value] of metaRows) {
    drawText(label, metaLabelX, y, { size: 9, color: GRAY });
    drawText(value, rightAlign(value, helveticaBold, 9, metaValueX), y, {
      font: helveticaBold,
      size: 9,
    });
    y -= 16;
  }

  y -= 8;

  // ─── PAID badge (lime branded) ───
  const badgeW = 200;
  const badgeH = 28;
  const badgeX = width - margin - badgeW;
  page.drawRectangle({
    x: badgeX,
    y: y - badgeH + 8,
    width: badgeW,
    height: badgeH,
    color: LIME_LIGHT,
    borderColor: BRAND_LIME,
    borderWidth: 1,
  });
  const paidText = "MAKSETTU KORTILLA";
  drawText(paidText, badgeX + (badgeW - helveticaBold.widthOfTextAtSize(paidText, 10)) / 2, y - badgeH + 18, {
    font: helveticaBold,
    size: 10,
    color: rgb(0.102, 0.388, 0.251), // dark lime
  });

  // ─── Customer info - left column ───
  const custY = y + 8;
  drawText("ASIAKAS", margin, custY, { font: helveticaBold, size: 9, color: GRAY });

  const customerName = `${customer.first_name} ${customer.last_name}`;
  drawText(customerName, margin, custY - 16, { font: helveticaBold, size: 11 });

  let custLineY = custY - 32;
  if (customer.address) {
    drawText(customer.address, margin, custLineY, { size: 10 });
    custLineY -= 14;
  }
  if (customer.postal_code) {
    const cityLine = `${customer.postal_code} ${postalCodeToCity(customer.postal_code)}`;
    drawText(cityLine, margin, custLineY, { size: 10 });
    custLineY -= 14;
  }
  if (customer.email) {
    drawText(customer.email, margin, custLineY, { size: 9, color: GRAY });
    custLineY -= 14;
  }
  if (customer.phone) {
    drawText(customer.phone, margin, custLineY, { size: 9, color: GRAY });
  }

  y -= 80;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: BRAND_LIME });
  y -= 24;

  // ─── Line items table ───
  // Table header
  const col1 = margin; // Nimike
  const col2 = 340; // Määrä
  const col3 = 400; // á hinta
  const col4 = width - margin; // Yhteensä (right-aligned)

  // Table header with lime accent
  page.drawRectangle({
    x: margin,
    y: y - 6,
    width: width - margin * 2,
    height: 20,
    color: LIME_LIGHT,
  });
  drawText("Nimike", col1 + 4, y, { font: helveticaBold, size: 9, color: BRAND_DARK });
  drawText("Määrä", col2, y, { font: helveticaBold, size: 9, color: BRAND_DARK });
  drawText("á hinta", col3, y, { font: helveticaBold, size: 9, color: BRAND_DARK });
  const yhteensaHeader = "Yhteensä";
  drawText(yhteensaHeader, rightAlign(yhteensaHeader, helveticaBold, 9, col4 - 4), y, {
    font: helveticaBold,
    size: 9,
    color: BRAND_DARK,
  });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: BRAND_LIME });
  y -= 16;

  // Build items
  const items: ReceiptItem[] = [];

  // Main service
  items.push({
    name: service?.name || "Palvelu",
    quantity: 1,
    unit_price_cents: service?.base_price_cents || booking.price_cents,
    total_cents: service?.base_price_cents || booking.price_cents,
  });

  // Extra items
  for (const extra of booking.extra_items || []) {
    items.push({
      name: extra.name,
      quantity: 1,
      unit_price_cents: extra.price_cents,
      total_cents: extra.price_cents,
    });
  }

  let subtotalCents = 0;

  for (const item of items) {
    drawText(item.name, col1, y, { size: 10 });
    drawText(String(item.quantity), col2 + 10, y, { size: 10 });

    const unitPrice = formatCents(item.unit_price_cents) + " \u20ac";
    drawText(unitPrice, col3, y, { size: 10 });

    const totalPrice = formatCents(item.total_cents) + " \u20ac";
    drawText(totalPrice, rightAlign(totalPrice, helvetica, 10, col4), y, { size: 10 });

    subtotalCents += item.total_cents;
    y -= 20;
  }

  // Discount row
  if (booking.discount_amount_cents > 0) {
    drawText("Alennus", col1, y, { size: 10, color: rgb(0.862, 0.149, 0.149) });
    const discountText = "-" + formatCents(booking.discount_amount_cents) + " \u20ac";
    drawText(discountText, rightAlign(discountText, helvetica, 10, col4), y, {
      size: 10,
      color: rgb(0.862, 0.149, 0.149),
    });
    subtotalCents -= booking.discount_amount_cents;
    y -= 20;
  }

  y -= 4;
  drawLine(margin, y, width - margin);
  y -= 20;

  // ─── Totals section ───
  const totalsLabelX = 360;
  const totalsValueX = col4;
  const totalIncVat = booking.price_cents;
  const totalExVat = Math.round(totalIncVat / (1 + VAT_RATE));
  const vatAmount = totalIncVat - totalExVat;

  // Työn osuus: kiinteä 90 % kokonaishinnasta (sis. ALV), kotitalousvähennystä varten
  const workPortionCents = calcWorkPortionCents(totalIncVat);

  // Totals rows
  const totalsRows = [
    { label: "Työn osuus:", value: formatCents(workPortionCents) + " \u20ac", bold: false },
    { label: "Veroton hinta:", value: formatCents(totalExVat) + " \u20ac", bold: false },
    { label: "ALV 25,5%:", value: formatCents(vatAmount) + " \u20ac", bold: false },
  ];

  for (const row of totalsRows) {
    drawText(row.label, totalsLabelX, y, { size: 10, color: GRAY });
    const font = row.bold ? helveticaBold : helvetica;
    drawText(row.value, rightAlign(row.value, font, 10, totalsValueX), y, { font, size: 10 });
    y -= 16;
  }

  y -= 4;
  page.drawLine({ start: { x: totalsLabelX - 10, y }, end: { x: width - margin, y }, thickness: 1.5, color: BRAND_LIME });
  y -= 24;

  // Grand total with lime background
  const grandTotalLabel = "YHTEENSÄ:";
  const grandTotalValue = formatCents(totalIncVat) + " \u20ac";
  const gtBoxX = totalsLabelX - 14;
  const gtBoxW = width - margin - gtBoxX + 4;
  page.drawRectangle({
    x: gtBoxX,
    y: y - 8,
    width: gtBoxW,
    height: 30,
    color: BRAND_DARK,
    borderColor: BRAND_DARK,
    borderWidth: 0,
  });
  // Small lime accent on left edge of grand total box
  page.drawRectangle({
    x: gtBoxX,
    y: y - 8,
    width: 4,
    height: 30,
    color: BRAND_LIME,
  });
  drawText(grandTotalLabel, totalsLabelX, y, { font: helveticaBold, size: 13, color: WHITE });
  drawText(grandTotalValue, rightAlign(grandTotalValue, helveticaBold, 13, totalsValueX), y, {
    font: helveticaBold,
    size: 13,
    color: BRAND_LIME,
  });

  // ─── FOOTER: Company info with lime accent ───
  const footerY = 60;
  page.drawLine({ start: { x: margin, y: footerY + 20 }, end: { x: width - margin, y: footerY + 20 }, thickness: 1.5, color: BRAND_LIME });

  const companyLine1 = `${COMPANY.name}  |  ${COMPANY.email}`;
  const companyLine2 = `Puh: ${COMPANY.phone}  |  www.tiiviskoti.fi`;

  const line1Width = helvetica.widthOfTextAtSize(companyLine1, 8);
  const line2Width = helvetica.widthOfTextAtSize(companyLine2, 8);

  drawText(companyLine1, (width - line1Width) / 2, footerY, { size: 8, color: GRAY });
  drawText(companyLine2, (width - line2Width) / 2, footerY - 12, { size: 8, color: GRAY });

  // Bottom lime bar (matching top)
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height: 6,
    color: BRAND_LIME,
  });

  return await doc.save();
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function postalCodeToCity(postalCode: string): string {
  const map: Record<string, string> = {
    "00": "Helsinki",
    "01": "Vantaa",
    "02": "Espoo",
    "03": "Vihti",
    "04": "Kerava",
    "05": "Hyvinkää",
    "06": "Porvoo",
    "07": "Loviisa",
    "08": "Lohja",
    "10": "Tuusula",
    "11": "Riihimäki",
    "12": "Hämeenlinna",
    "13": "Hämeenlinna",
    "14": "Lahti",
    "15": "Lahti",
    "20": "Turku",
    "33": "Tampere",
    "40": "Jyväskylä",
    "53": "Lappeenranta",
    "65": "Vaasa",
    "70": "Kuopio",
    "80": "Joensuu",
    "90": "Oulu",
  };
  const prefix = postalCode?.slice(0, 2) || "";
  return map[prefix] || "";
}
