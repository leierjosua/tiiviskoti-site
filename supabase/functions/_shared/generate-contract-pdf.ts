import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const LOGO_URL = "https://tiiviskoti.fi/img/logo-email.png";

const COMPANY = {
  name: "TiivisKoti",
  email: "info@tiiviskoti.fi",
  phone: "045 875 5996",
};

const BRAND_DARK = rgb(0.086, 0.227, 0.157);
const BRAND_LIME = /* vihreä, ei lime */ rgb(0.129, 0.478, 0.306);
const LIME_LIGHT = /* vaalea vihreä */ rgb(0.894, 0.941, 0.914);
const GRAY = rgb(0.533, 0.533, 0.533);
const LIGHT_GRAY = rgb(0.878, 0.878, 0.878);
const WHITE = rgb(1, 1, 1);
const DARK_LIME = /* tumma vihreä */ rgb(0.102, 0.388, 0.251);

const MONTH_NAMES = [
  "tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu",
  "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu",
];

const FREQUENCY_LABELS: Record<string, string> = {
  once_yearly: "Kerran vuodessa",
  twice_yearly: "Kaksi kertaa vuodessa",
  custom: "Mukautettu",
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;

// deno-lint-ignore no-explicit-any
export async function generateContractPdf(contract: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Fetch logo once
  const logoRes = await fetch(LOGO_URL);
  const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
  const logoImage = await doc.embedPng(logoBytes);

  const customer = contract.customers;
  const service = contract.services;
  const template = contract.contract_templates;
  const termsText = template?.terms_text || "";
  const regularPrice = template?.regular_price_cents || contract.contract_price_cents;
  const savings = regularPrice - contract.contract_price_cents;

  // ─── Helpers ───
  const formatCents = (cents: number): string => (cents / 100).toFixed(2).replace(".", ",");
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "-";
    const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  };

  function addPageDecorations(page: ReturnType<typeof doc.addPage>) {
    const { width, height } = page.getSize();
    // Top lime bar
    page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: BRAND_LIME });
    // Bottom lime bar
    page.drawRectangle({ x: 0, y: 0, width, height: 6, color: BRAND_LIME });
    // Footer
    const footerY = 30;
    page.drawLine({
      start: { x: MARGIN, y: footerY + 14 },
      end: { x: width - MARGIN, y: footerY + 14 },
      thickness: 1, color: BRAND_LIME,
    });
    const footerLine = `${COMPANY.name}  |  ${COMPANY.email}`;
    const fw = helvetica.widthOfTextAtSize(footerLine, 7);
    page.drawText(footerLine, { x: (width - fw) / 2, y: footerY, size: 7, font: helvetica, color: GRAY });
  }

  // Helper for wrapping text with a max width
  function wrapText(text: string, font: typeof helvetica, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split("\n");
    for (const para of paragraphs) {
      if (para.trim() === "") {
        lines.push("");
        continue;
      }
      const words = para.split(/\s+/);
      let currentLine = "";
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, size) > maxWidth) {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    return lines;
  }

  // ═══════════════════════════════════════════════
  // PAGE 1: Contract details
  // ═══════════════════════════════════════════════
  const page1 = doc.addPage([PAGE_W, PAGE_H]);
  addPageDecorations(page1);
  let y = PAGE_H - MARGIN;

  const drawText1 = (text: string, x: number, yPos: number, opts: { font?: typeof helvetica; size?: number; color?: typeof BRAND_DARK } = {}) => {
    page1.drawText(text, { x, y: yPos, size: opts.size || 10, font: opts.font || helvetica, color: opts.color || BRAND_DARK });
  };
  const rightAlign = (text: string, font: typeof helvetica, size: number, rightX: number) => rightX - font.widthOfTextAtSize(text, size);

  // Logo
  const logoScale = 130 / logoImage.width;
  const logoDims = { width: 130, height: logoImage.height * logoScale };
  page1.drawImage(logoImage, {
    x: MARGIN, y: y - logoDims.height + 10,
    width: logoDims.width, height: logoDims.height,
  });

  // Title
  const title = "VUOSISOPIMUS";
  drawText1(title, PAGE_W - MARGIN - helveticaBold.widthOfTextAtSize(title, 24), y - 16, {
    font: helveticaBold, size: 24,
  });

  y -= 55;

  // Contract number & dates — right side
  const metaLabelX = PAGE_W - MARGIN - 200;
  const metaValueX = PAGE_W - MARGIN;
  const metaRows = [
    ["Sopimusnumero:", `#${contract.contract_number}`],
    ["Alkaa:", formatDate(contract.start_date)],
    ["Päättyy:", formatDate(contract.end_date)],
    ["Luotu:", formatDate(contract.created_at)],
  ];
  for (const [label, value] of metaRows) {
    drawText1(label, metaLabelX, y, { size: 9, color: GRAY });
    drawText1(value, rightAlign(value, helveticaBold, 9, metaValueX), y, { font: helveticaBold, size: 9 });
    y -= 15;
  }

  y -= 4;

  // Auto-renew badge
  if (contract.auto_renew) {
    const badgeW = 200;
    const badgeH = 24;
    const badgeX = PAGE_W - MARGIN - badgeW;
    page1.drawRectangle({
      x: badgeX, y: y - badgeH + 6, width: badgeW, height: badgeH,
      color: LIME_LIGHT, borderColor: BRAND_LIME, borderWidth: 1,
    });
    const renewText = "AUTOMAATTINEN UUSINTA";
    drawText1(renewText, badgeX + (badgeW - helveticaBold.widthOfTextAtSize(renewText, 8)) / 2, y - badgeH + 14, {
      font: helveticaBold, size: 8, color: DARK_LIME,
    });
  }

  // ─── Customer info — left column ───
  const custStartY = y + 52;
  drawText1("TILAAJA", MARGIN, custStartY, { font: helveticaBold, size: 9, color: GRAY });

  const customerName = customer ? `${customer.first_name} ${customer.last_name}` : "-";
  drawText1(customerName, MARGIN, custStartY - 16, { font: helveticaBold, size: 11 });

  let cLineY = custStartY - 32;
  if (contract.service_address) {
    drawText1(contract.service_address, MARGIN, cLineY, { size: 10 });
    cLineY -= 14;
  }
  if (contract.service_postal_code) {
    drawText1(contract.service_postal_code, MARGIN, cLineY, { size: 10 });
    cLineY -= 14;
  }
  if (customer?.email) {
    drawText1(customer.email, MARGIN, cLineY, { size: 9, color: GRAY });
    cLineY -= 14;
  }
  if (customer?.phone) {
    drawText1(customer.phone, MARGIN, cLineY, { size: 9, color: GRAY });
  }

  y -= 80;
  page1.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: BRAND_LIME });
  y -= 30;

  // ─── Service details section ───
  drawText1("PALVELUN TIEDOT", MARGIN, y, { font: helveticaBold, size: 11 });
  y -= 20;

  // Info box
  const boxY = y;
  const boxH = 90;
  page1.drawRectangle({
    x: MARGIN, y: boxY - boxH + 10, width: PAGE_W - MARGIN * 2, height: boxH,
    color: rgb(0.976, 0.980, 0.988), // very light gray
    borderColor: LIGHT_GRAY, borderWidth: 0.5,
  });

  const infoCol1 = MARGIN + 16;
  const infoCol2 = 300;
  let iy = boxY - 4;

  drawText1("Palvelu", infoCol1, iy, { size: 8, color: GRAY });
  drawText1(service?.name || "-", infoCol1, iy - 12, { font: helveticaBold, size: 10 });

  drawText1("Tiheys", infoCol2, iy, { size: 8, color: GRAY });
  drawText1(FREQUENCY_LABELS[contract.frequency] || contract.frequency, infoCol2, iy - 12, { font: helveticaBold, size: 10 });

  iy -= 36;
  drawText1("Käyntikuukaudet", infoCol1, iy, { size: 8, color: GRAY });
  const monthsStr = (contract.visit_months || []).map((m: number) => MONTH_NAMES[m - 1]).join(", ");
  drawText1(monthsStr || "-", infoCol1, iy - 12, { font: helveticaBold, size: 10 });

  drawText1("Kohteen osoite", infoCol2, iy, { size: 8, color: GRAY });
  drawText1(`${contract.service_address}, ${contract.service_postal_code}`, infoCol2, iy - 12, { size: 10 });

  y = boxY - boxH - 10;

  // ─── Pricing section ───
  y -= 10;
  drawText1("HINNOITTELU", MARGIN, y, { font: helveticaBold, size: 11 });
  y -= 24;

  // Price comparison box
  const priceBoxW = PAGE_W - MARGIN * 2;
  const priceBoxH = 80;
  page1.drawRectangle({
    x: MARGIN, y: y - priceBoxH + 10, width: priceBoxW, height: priceBoxH,
    color: BRAND_DARK,
  });
  // Lime left accent
  page1.drawRectangle({
    x: MARGIN, y: y - priceBoxH + 10, width: 5, height: priceBoxH,
    color: BRAND_LIME,
  });

  const priceCenterY = y - priceBoxH / 2 + 10;

  // Contract price (large, lime)
  drawText1("Sopimushinta", MARGIN + 20, priceCenterY + 18, { size: 9, color: GRAY });
  const priceStr = formatCents(contract.contract_price_cents) + " \u20ac / vuosi";
  drawText1(priceStr, MARGIN + 20, priceCenterY - 4, { font: helveticaBold, size: 22, color: BRAND_LIME });

  // Regular price & savings — right side
  if (savings > 0) {
    const savingsPercent = Math.round((savings / regularPrice) * 100);
    const regStr = "Normaalihinta: " + formatCents(regularPrice) + " \u20ac";
    drawText1(regStr, rightAlign(regStr, helvetica, 10, PAGE_W - MARGIN - 16), priceCenterY + 18, {
      size: 10, color: GRAY,
    });
    const savingsStr = "Säästät " + formatCents(savings) + " \u20ac (" + savingsPercent + "%)";
    drawText1(savingsStr, rightAlign(savingsStr, helveticaBold, 12, PAGE_W - MARGIN - 16), priceCenterY - 2, {
      font: helveticaBold, size: 12, color: BRAND_LIME,
    });
  }

  y = y - priceBoxH - 6;

  // ALV note
  drawText1("Hinnat sisältävät ALV 25,5%. Maksu korttipäätteellä tai laskulla (14 pv netto).", MARGIN, y, { size: 8, color: GRAY });
  y -= 30;

  // ─── Contract benefits ───
  drawText1("SOPIMUKSEN EDUT", MARGIN, y, { font: helveticaBold, size: 11 });
  y -= 18;

  const benefits = [
    "Taattu palveluaika ennen muita asiakkaita",
    "Kiinteä alennettu sopimushinta",
    "Ei tarvitse muistaa varata — me otamme yhteyttä",
    "Uskollisuusalennus 2. vuodesta alkaen",
    "Mahdollisten vaurioiden raportointi jokaisella käynnillä",
  ];

  for (const benefit of benefits) {
    // Lime bullet
    page1.drawRectangle({
      x: MARGIN + 2, y: y - 1, width: 6, height: 6, color: BRAND_LIME,
    });
    drawText1(benefit, MARGIN + 16, y, { size: 9 });
    y -= 16;
  }

  // ═══════════════════════════════════════════════
  // PAGE 2: Terms & Conditions
  // ═══════════════════════════════════════════════
  if (termsText) {
    const termsLines = wrapText(termsText, helvetica, 8.5, PAGE_W - MARGIN * 2);
    let termsPage = doc.addPage([PAGE_W, PAGE_H]);
    addPageDecorations(termsPage);
    let ty = PAGE_H - MARGIN;

    // Title
    termsPage.drawText("SOPIMUSEHDOT", {
      x: MARGIN, y: ty - 10, size: 16, font: helveticaBold, color: BRAND_DARK,
    });
    ty -= 34;

    termsPage.drawLine({
      start: { x: MARGIN, y: ty }, end: { x: PAGE_W - MARGIN, y: ty },
      thickness: 1.5, color: BRAND_LIME,
    });
    ty -= 18;

    const bottomLimit = 56; // Above footer

    for (const line of termsLines) {
      if (ty < bottomLimit) {
        // New page
        termsPage = doc.addPage([PAGE_W, PAGE_H]);
        addPageDecorations(termsPage);
        ty = PAGE_H - MARGIN;
      }

      if (line === "") {
        ty -= 8;
        continue;
      }

      // Detect section headers (lines that start with a number and dot, e.g., "1. SOPIMUKSEN KOHDE")
      const isHeader = /^\d+\.\s+[A-ZÄÖÅ]/.test(line);
      // Detect main title line
      const isTitle = line.startsWith("VUOSISOPIMUKSEN EHDOT");

      if (isTitle) {
        termsPage.drawText(line, {
          x: MARGIN, y: ty, size: 10, font: helveticaBold, color: BRAND_DARK,
        });
        ty -= 16;
      } else if (isHeader) {
        ty -= 6; // Extra space before header
        // Lime accent dot before header
        termsPage.drawRectangle({
          x: MARGIN, y: ty + 1, width: 4, height: 4, color: BRAND_LIME,
        });
        termsPage.drawText(line, {
          x: MARGIN + 10, y: ty, size: 9, font: helveticaBold, color: BRAND_DARK,
        });
        ty -= 14;
      } else if (line.startsWith("- ")) {
        // Bullet point
        termsPage.drawRectangle({
          x: MARGIN + 8, y: ty + 2, width: 3, height: 3, color: GRAY,
        });
        termsPage.drawText(line.slice(2), {
          x: MARGIN + 16, y: ty, size: 8.5, font: helvetica, color: BRAND_DARK,
        });
        ty -= 12;
      } else {
        termsPage.drawText(line, {
          x: MARGIN, y: ty, size: 8.5, font: helvetica, color: BRAND_DARK,
        });
        ty -= 12;
      }
    }
  }

  // ═══════════════════════════════════════════════
  // PAGE 3: Signature
  // ═══════════════════════════════════════════════
  const sigPage = doc.addPage([PAGE_W, PAGE_H]);
  addPageDecorations(sigPage);
  let sy = PAGE_H - MARGIN;

  const drawSig = (text: string, x: number, yPos: number, opts: { font?: typeof helvetica; size?: number; color?: typeof BRAND_DARK } = {}) => {
    sigPage.drawText(text, { x, y: yPos, size: opts.size || 10, font: opts.font || helvetica, color: opts.color || BRAND_DARK });
  };

  // Title
  drawSig("ALLEKIRJOITUS", MARGIN, sy - 10, { font: helveticaBold, size: 16 });
  sy -= 34;
  sigPage.drawLine({
    start: { x: MARGIN, y: sy }, end: { x: PAGE_W - MARGIN, y: sy },
    thickness: 1.5, color: BRAND_LIME,
  });
  sy -= 30;

  // Contract reference
  drawSig(`Sopimus #${contract.contract_number}`, MARGIN, sy, { font: helveticaBold, size: 11 });
  sy -= 16;
  drawSig(`${template?.name || "Vuosisopimus"} — ${service?.name || "Palvelu"}`, MARGIN, sy, { size: 10, color: GRAY });
  sy -= 30;

  // Two columns: Customer (left) and Company (right)
  const colMid = PAGE_W / 2;

  // Customer signature
  drawSig("TILAAJA", MARGIN, sy, { font: helveticaBold, size: 9, color: GRAY });
  sy -= 20;

  drawSig(customerName, MARGIN, sy, { font: helveticaBold, size: 11 });
  sy -= 16;
  if (customer?.email) {
    drawSig(customer.email, MARGIN, sy, { size: 9, color: GRAY });
    sy -= 14;
  }

  sy -= 10;

  // Signature image
  if (contract.signature_data) {
    try {
      // signature_data is a data:image/png;base64,... string
      const base64 = contract.signature_data.split(",")[1];
      if (base64) {
        const sigImageBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const sigImage = await doc.embedPng(sigImageBytes);
        const sigScale = Math.min(200 / sigImage.width, 80 / sigImage.height);
        const sigW = sigImage.width * sigScale;
        const sigH = sigImage.height * sigScale;

        // Signature box with border
        sigPage.drawRectangle({
          x: MARGIN, y: sy - sigH - 10, width: 240, height: sigH + 20,
          color: WHITE, borderColor: LIGHT_GRAY, borderWidth: 0.5,
        });
        sigPage.drawImage(sigImage, {
          x: MARGIN + 20, y: sy - sigH, width: sigW, height: sigH,
        });

        sy -= sigH + 30;
      }
    } catch {
      // If signature embedding fails, skip it
      sy -= 20;
    }
  } else {
    // Empty signature line
    sigPage.drawLine({
      start: { x: MARGIN, y: sy }, end: { x: MARGIN + 240, y: sy },
      thickness: 0.5, color: BRAND_DARK,
    });
    drawSig("Allekirjoitus", MARGIN, sy - 12, { size: 8, color: GRAY });
    sy -= 30;
  }

  // Signed by name
  if (contract.signed_by_name) {
    drawSig(contract.signed_by_name, MARGIN, sy, { font: helveticaBold, size: 10 });
    sy -= 14;
  }

  // Signature date
  if (contract.signed_at) {
    const signedDate = new Date(contract.signed_at);
    const dateStr = `${signedDate.getDate()}.${signedDate.getMonth() + 1}.${signedDate.getFullYear()} klo ${String(signedDate.getHours()).padStart(2, "0")}:${String(signedDate.getMinutes()).padStart(2, "0")}`;
    drawSig(dateStr, MARGIN, sy, { size: 9, color: GRAY });
    sy -= 14;
  }

  // Signature method
  const methodLabels: Record<string, string> = {
    on_site: "Allekirjoitettu sähköisesti paikan päällä",
    remote_link: "Allekirjoitettu sähköisesti etälinkillä",
    admin: "Merkitty adminin toimesta",
  };
  if (contract.signature_method) {
    drawSig(methodLabels[contract.signature_method] || "", MARGIN, sy, { size: 8, color: GRAY });
    sy -= 30;
  }

  // Company signature section — right column
  const compSigY = sy + 30 + (contract.signature_data ? 120 : 80);
  drawSig("PALVELUNTARJOAJA", colMid + 20, compSigY, { font: helveticaBold, size: 9, color: GRAY });
  drawSig("TiivisKoti", colMid + 20, compSigY - 20, { font: helveticaBold, size: 11 });
  drawSig(`Puh: ${COMPANY.phone}`, colMid + 20, compSigY - 50, { size: 9, color: GRAY });
  drawSig(COMPANY.email, colMid + 20, compSigY - 64, { size: 9, color: GRAY });

  // Electronic signature notice at bottom of page
  const noticeY = 80;
  sigPage.drawRectangle({
    x: MARGIN, y: noticeY - 8, width: PAGE_W - MARGIN * 2, height: 36,
    color: LIME_LIGHT, borderColor: BRAND_LIME, borderWidth: 0.5,
  });
  const noticeTxt = "Tämä sopimus on allekirjoitettu sähköisesti ja on juridisesti sitova.";
  const noticeW = helvetica.widthOfTextAtSize(noticeTxt, 8.5);
  drawSig(noticeTxt, (PAGE_W - noticeW) / 2, noticeY + 8, { size: 8.5, color: DARK_LIME });
  const noticeTxt2 = "Molemmat osapuolet saavat kopion sopimuksesta sähköpostitse.";
  const notice2W = helvetica.widthOfTextAtSize(noticeTxt2, 8);
  drawSig(noticeTxt2, (PAGE_W - notice2W) / 2, noticeY - 2, { size: 8, color: GRAY });

  return await doc.save();
}
