import type { WizardState, LineItem } from "./types";
import type { Employee } from "@/lib/types";
import { supabase, getFreshToken } from "@/lib/supabase";
import { formatEmailHtml } from "@/lib/email-styles";

/** Fetch email template from DB and substitute variables, with hardcoded fallback */
async function renderTemplate(
  slug: string,
  vars: Record<string, string>,
  fallback: { subject: string; bodyHtml: string },
): Promise<{ subject: string; bodyHtml: string }> {
  const { data: tpl } = await supabase
    .from("email_templates")
    .select("subject_template, body_template")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!tpl) return fallback;

  const sub = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");

  return { subject: sub(tpl.subject_template), bodyHtml: sub(tpl.body_template) };
}

interface SubmitOfferInput {
  state: WizardState;
  lineItems: LineItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  opportunityId: string;
  employee: Employee | null;
  createOffer: { mutateAsync: (data: Record<string, unknown>) => Promise<{ id: string; offer_number: string }> };
  createLineItem: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
  updateOffer: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
}

interface SubmitResult {
  offerId: string;
  offerNumber: string;
  bookingId?: string;
}

// ─── PDF rendering (fully server-side via Vercel Chromium) ──────────────────

const PDF_API_BASE = "https://loppusiivous-site-new.vercel.app/api";

/** Generate offer PDF server-side — takes offer_id, returns base64 */
async function generateOfferPdf(offerId: string): Promise<string | null> {
  try {
    const token = await getFreshToken();
    const resp = await fetch(`${PDF_API_BASE}/offer-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ offer_id: offerId }),
    });
    if (!resp.ok) throw new Error(`Offer PDF API ${resp.status}`);
    return arrayBufferToBase64(await resp.arrayBuffer());
  } catch (e) {
    console.error("Offer PDF generation failed:", e);
    return null;
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Main submit function ───────────────────────────────────────────────────

export async function submitOffer({
  state,
  lineItems,
  subtotalCents,
  discountCents,
  totalCents,
  opportunityId,
  employee,
  createOffer,
  createLineItem,
  updateOffer,
}: SubmitOfferInput): Promise<SubmitResult> {
  const { customer, deliveryMode, offerTitle, emailBody, validityDays } = state;
  const isSend = deliveryMode === "send";
  const isPendingConfirm = deliveryMode === "sign_pending_confirm";
  const createsBooking = deliveryMode === "sign_now" || isPendingConfirm;

  // 1. Create offer
  const offer = await createOffer.mutateAsync({
    opportunity_id: opportunityId,
    title: offerTitle || undefined,
    customer_name: `${customer.firstName} ${customer.lastName}`.trim() || undefined,
    customer_email: customer.email || undefined,
    customer_phone: customer.phone || undefined,
    customer_address: customer.address || undefined,
    customer_postcode: customer.postcode || undefined,
    customer_city: customer.city || undefined,
    validity_days: validityDays,
    ...(state.serviceCategoryId ? { service_category_id: state.serviceCategoryId } : {}),
    ...(employee ? { created_by_salesperson_id: employee.id } : {}),
  });

  // 1b. Persist install plan onto the opportunity (per-site, not per-offer)
  if (state.installPlan) {
    await supabase
      .from("sales_opportunities")
      .update({ install_plan: state.installPlan, updated_at: new Date().toISOString() })
      .eq("id", opportunityId);
  }

  // 2. Create line items
  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i];
    await createLineItem.mutateAsync({
      offer_id: offer.id,
      line_type: li.lineType,
      item_id: li.itemId ?? undefined,
      name: li.name,
      unit_price: li.unitPriceCents / 100,
      quantity: li.qty,
      sort_order: i,
      duration_minutes: li.durationMinutes ?? undefined,
      option_group: li.optionGroup ?? undefined,
      is_upsell: li.isUpsell ?? false,
      sales_commission_cents: li.salesCommissionCents ?? 0,
    });
  }

  // 3. Update totals and status
  const status = isSend ? "sent" : "accepted";
  await updateOffer.mutateAsync({
    id: offer.id,
    subtotal: subtotalCents / 100,
    discount: discountCents / 100,
    total: totalCents / 100,
    status,
    ...(isSend
      ? { sent_at: new Date().toISOString() }
      : {
          accepted_at: new Date().toISOString(),
          signed_at: new Date().toISOString(),
          // Persist signature so the server-rendered PDF can include it
          signature_data_url: state.signatureDataUrl ?? null,
          signer_name: state.signerName?.trim() || null,
        }),
  });

  // 4. Generate offer PDF (server-side Chromium — no DOM needed)
  const pdfFilename = `Tarjous ${offer.offer_number || ""} - ${`${customer.firstName} ${customer.lastName}`.trim() || "asiakas"}.pdf`;
  const offerPdfBase64 = await generateOfferPdf(offer.id);

  if (offerPdfBase64) {
    const pdfPath = `${opportunityId}/${crypto.randomUUID()}_tarjous.pdf`;
    const { error: upErr } = await supabase.storage
      .from("sales-opportunity-files")
      .upload(pdfPath, base64ToBytes(offerPdfBase64), { contentType: "application/pdf" });
    if (upErr) {
      throw new Error(`Tarjous-PDF:n tallennus epäonnistui: ${upErr.message}`);
    } else {
      await supabase.from("sales_opportunity_files").insert({
        opportunity_id: opportunityId,
        filename: pdfFilename,
        bucket: "sales-opportunity-files",
        path: pdfPath,
        file_type: "offer_pdf",
      });
      await supabase.from("sales_offers").update({ signed_pdf_path: pdfPath }).eq("id", offer.id);
    }
  }

  // 5. Generate install plan PDF from DOM element
  let installPlanBase64: string | null = null;
  const installPlanFilename = `Asennussuunnitelma - ${`${customer.firstName} ${customer.lastName}`.trim() || "asiakas"}.pdf`;
  const installPlanEl = document.getElementById("install-plan-preview");
  if (installPlanEl) {
    try {
      const { generatePdfFromElement } = await import("@/lib/chromiumPdf");
      installPlanBase64 = await generatePdfFromElement(installPlanEl);
      const planPath = `${opportunityId}/${crypto.randomUUID()}_asennussuunnitelma.pdf`;
      const { error: planUpErr } = await supabase.storage
        .from("sales-opportunity-files")
        .upload(planPath, base64ToBytes(installPlanBase64), { contentType: "application/pdf" });
      if (planUpErr) {
        console.error("Asennussuunnitelma-PDF:n tallennus epäonnistui:", planUpErr.message);
      } else {
        await supabase.from("sales_opportunity_files").insert({
          opportunity_id: opportunityId,
          filename: installPlanFilename,
          bucket: "sales-opportunity-files",
          path: planPath,
          file_type: "installation_plan_pdf",
        });
      }
    } catch (e) {
      console.error("Asennussuunnitelma-PDF:n generointi epäonnistui:", e);
    }
  }

  // 6. Fetch seller signature from DB (used in email body)
  let sellerSignatureHtml = "";
  if (employee) {
    const { data: sigRow } = await supabase
      .from("sales_email_signatures")
      .select("signature_html")
      .eq("employee_id", employee.id)
      .maybeSingle();
    sellerSignatureHtml = sigRow?.signature_html || "";
  }

  // 7. Send-path: token + email
  if (isSend && customer.email) {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

    const { error: tokenErr } = await supabase.from("sales_offer_tokens").insert({
      offer_id: offer.id,
      token,
      expires_at: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (tokenErr) {
      throw new Error(`Tarjouslinkin luonti epäonnistui: ${tokenErr.message}`);
    }

    {
      const offerLink = `https://lasikiilto.fi/tarjous/${token}`;
      const sellerName = employee ? `${employee.first_name} ${employee.last_name}`.trim() : "Lasikiilto";

      let emailSubject: string;
      let emailHtml: string;

      if (emailBody) {
        // User wrote custom body — use it with the link and validity appended
        const bodyHtml = emailBody.split("\n").map((line: string) => line ? `<p>${line}</p>` : "<p></p>").join("");
        emailSubject = offerTitle || "Tarjous ja varauslinkki";
        emailHtml = `
          ${bodyHtml}
          <p></p>
          <p><a href="${offerLink}" style="display:inline-block;background-color:#1e3a8a;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Katso tarjous ja varaa asennus</a></p>
          <p></p>
          <p style="font-size:13px;color:#6b7280;">Tarjous on voimassa ${validityDays} päivää.</p>
        `;
      } else {
        // No custom body — use DB template with fallback
        const defaultBody = `<p>Moikka ${customer.firstName},</p><p>Liitteenä tarjous ja asennussuunnitelma. Voit hyväksyä tarjouksen varaamalla ajan alta.</p><p></p><p><a href="${offerLink}" style="display:inline-block;background-color:#1e3a8a;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Katso tarjous ja varaa asennus</a></p><p></p><p style="font-size:13px;color:#6b7280;">Tarjous on voimassa ${validityDays} päivää.</p>`;
        const rendered = await renderTemplate("offer_sent", {
          customer_first_name: customer.firstName || "",
          customer_name: `${customer.firstName} ${customer.lastName}`.trim(),
          offer_link: offerLink,
          validity_days: String(validityDays),
          seller_name: sellerName,
        }, {
          subject: "Tarjous ja varauslinkki",
          bodyHtml: defaultBody,
        });
        emailSubject = offerTitle || rendered.subject;
        emailHtml = rendered.bodyHtml;
      }

      // Append seller signature from DB
      if (sellerSignatureHtml) {
        emailHtml += `<p></p>${sellerSignatureHtml}`;
      }

      emailHtml = formatEmailHtml(emailHtml);

      const sellerEmail = employee?.email || "info@lasikiilto.fi";
      const emailPayload: Record<string, unknown> = {
        to: [customer.email],
        subject: emailSubject,
        body_html: emailHtml,
        sender_name: sellerName,
        sender_email: sellerEmail,
      };

      const attachments: { filename: string; base64: string; mimeType: string }[] = [];
      if (offerPdfBase64) attachments.push({ filename: pdfFilename, base64: offerPdfBase64, mimeType: "application/pdf" });
      if (installPlanBase64) attachments.push({ filename: installPlanFilename, base64: installPlanBase64, mimeType: "application/pdf" });
      if (attachments.length > 0) emailPayload.attachments = attachments;

      try {
        const { error: outboxErr } = await supabase.from("email_outbox").insert({
          type: "sales",
          sender_email: sellerEmail,
          payload: emailPayload,
          status: "pending",
          scheduled_at: new Date().toISOString(),
          reference_type: "opportunity",
          reference_id: opportunityId,
        });
        if (outboxErr) {
          throw new Error(`Tarjoussähköpostin tallennus epäonnistui: ${outboxErr.message}`);
        }
      } catch (e) {
        console.error("Email outbox insert failed:", e);
        throw e;
      }
    }
  }

  // 7. Update opportunity
  const oppUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (isSend) oppUpdates.status = "tarjous_lahetetty";
  else oppUpdates.status = "voitettu";
  if (employee?.id) oppUpdates.assigned_salesperson_id = employee.id;
  if (customer.address) oppUpdates.address = customer.address;
  if (customer.postcode) oppUpdates.postcode = customer.postcode;
  if (customer.city) oppUpdates.city = customer.city;
  if (customer.phone) oppUpdates.phone = customer.phone;
  if (customer.email) oppUpdates.email = customer.email;
  const fullName = `${customer.firstName} ${customer.lastName}`.trim();
  if (fullName) oppUpdates.name = fullName;

  await supabase.from("sales_opportunities").update(oppUpdates).eq("id", opportunityId);

  // 8. Timeline event
  await supabase.from("sales_opportunity_events").insert({
    opportunity_id: opportunityId,
    salesperson_id: employee?.id || null,
    type: isSend ? "offer_sent" : "offer_accepted",
    payload: {
      offer_id: offer.id,
      offer_title: offerTitle || "Tarjous",
      total: totalCents / 100,
      delivery_mode: deliveryMode,
    },
  });

  // 9. Sign-path: create booking
  let bookingId: string | undefined;
  if (createsBooking && state.selectedDate && state.selectedTime && state.selectedEmployeeId && state.selectedCalendarId) {
    // Find primary service for booking
    const primaryServiceId = Object.entries(state.serviceQty).find(([, q]) => q > 0)?.[0];
    const primaryVariantId = primaryServiceId ? state.serviceVariantId[primaryServiceId] : null;

    // Build line items for booking (services + products + addons + custom).
    // The "service" line item is required by calculate_booking_commissions to attribute
    // the primary service commission to the installer, and by recalculate_booking_price
    // to include the service price in booking.price_cents.
    const mapLineType = (lt: string): "service" | "addon_service" | "product" | "custom" => {
      if (lt === "service") return "service";
      if (lt === "additional_service") return "addon_service";
      if (lt === "product") return "product";
      return "custom";
    };
    const bookingLineItems = lineItems
      .filter((li) =>
        li.lineType === "service" ||
        li.lineType === "product" ||
        li.lineType === "additional_service" ||
        li.lineType === "other_charge"
      )
      .map((li) => ({
        line_type: mapLineType(li.lineType),
        addon_service_id: li.lineType === "additional_service" ? li.itemId : undefined,
        product_id: li.lineType === "product" ? li.itemId : undefined,
        name: li.name,
        price_cents: li.unitPriceCents,
        quantity: li.qty,
        duration_minutes: li.durationMinutes || 0,
        material_cost_cents: li.lineType === "product" ? li.unitPriceCents : 0,
        cost_cents: li.lineType === "product" ? (li.costCents || 0) : undefined,
      }));

    const { data, error } = await supabase.functions.invoke("create-admin-booking", {
      body: {
        customer: {
          first_name: customer.firstName,
          last_name: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          address: customer.address || null,
          postal_code: customer.postcode || null,
          city: customer.city,
        },
        booking: {
          service_id: primaryServiceId || null,
          variant_id: primaryVariantId || null,
          employee_id: state.selectedEmployeeId,
          calendar_id: state.selectedCalendarId,
          price_cents: totalCents,
          booking_date: state.selectedDate,
          time_slot: state.selectedTime,
          postal_code: customer.postcode || null,
          address: customer.address || null,
          notes: null,
          inside_notes: state.insideNotes?.trim() || null,
          discount_code_id: null,
          discount_amount_cents: 0,
          lead_source: "sales_pipeline",
          opportunity_id: opportunityId,
          // Pending booking: blocks installer calendar like a normal booking,
          // but the customer hasn't yet confirmed (e.g. waiting for taloyhtiö).
          status: isPendingConfirm ? "pending" : "confirmed",
        },
        line_items: bookingLineItems.length > 0 ? bookingLineItems : undefined,
        // Suppress the standard customer "booking confirmed" email — we send a
        // separate "vahvista aika" email below. Installer notifications still fire.
        skip_customer_email: isPendingConfirm,
      },
    });

    if (error) throw error;
    bookingId = data?.bookingId;

    // Pending-path: issue a confirmation token so the customer can lock in the
    // appointment via the public site once they've got taloyhtiö approval.
    let confirmToken: string | null = null;
    if (isPendingConfirm && bookingId) {
      confirmToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const { error: tokenErr } = await supabase.from("booking_confirmation_tokens").insert({
        booking_id: bookingId,
        token: confirmToken,
      });
      if (tokenErr) throw new Error(`Vahvistustokenin luonti epäonnistui: ${tokenErr.message}`);
    }

    // Send customer email with signed offer + install plan PDFs
    if (customer.email) {
      const sellerName = employee ? `${employee.first_name} ${employee.last_name}`.trim() : "Lasikiilto";
      const bookingDateFi = new Date(state.selectedDate + "T00:00:00").toLocaleDateString("fi-FI", { timeZone: "Europe/Helsinki" });

      const rendered = isPendingConfirm && confirmToken
        ? (() => {
            const subject = state.pendingConfirmEmailSubject?.trim()
              || "Vahvista asennusaika kun olet saanut taloyhtiön luvan";
            const proseSrc = state.pendingConfirmEmailBody?.trim()
              || `Moikka ${customer.firstName},\n\nKiitos! Liitteenä allekirjoitettu tarjous ja asennussuunnitelma. Asennusaika on varattu sinulle.\n\nPaina alla olevaa "Vahvista asennusaika" -nappia, josta pääset vahvistamaan asennusajan taloyhtiöltä saadulla luvalla. Sen jälkeen saat varausvahvistuksen sähköpostiisi.\n\nMikäli lupaa ei ole saatu viimeistään viikkoa ennen sovittua asennuspäivää, ole yhteydessä niin sovitaan jatkosta.`;
            const proseHtml = proseSrc.split("\n").map((line) => line ? `<p>${line}</p>` : "<p></p>").join("");
            return {
              subject,
              bodyHtml: `${proseHtml}
<p><strong>Asennusaika: ${bookingDateFi} klo ${state.selectedTime}</strong></p>
<p></p>
<p><a href="https://lasikiilto.fi/vahvista-asennus/${confirmToken}" style="display:inline-block;background-color:#1e3a8a;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Vahvista asennusaika</a></p>`,
            };
          })()
        : await renderTemplate("offer_signed_booking", {
            customer_first_name: customer.firstName || "",
            customer_name: `${customer.firstName} ${customer.lastName}`.trim(),
            booking_date: bookingDateFi,
            booking_time: state.selectedTime || "",
            seller_name: sellerName,
          }, {
            subject: "Tarjous hyväksytty ja asennus varattu",
            bodyHtml: `<p>Moikka ${customer.firstName},</p><p>Kiitos! Tarjous on hyväksytty ja asennus varattu.</p><p><strong>Asennusaika:</strong> ${bookingDateFi} klo ${state.selectedTime}</p><p>Liitteenä allekirjoitettu tarjous ja asennussuunnitelma.</p>${sellerSignatureHtml ? `<p></p>${sellerSignatureHtml}` : ""}`,
          });
      let emailHtml = rendered.bodyHtml;
      // Append seller signature (if not already in template fallback)
      if (sellerSignatureHtml && !emailHtml.includes(sellerSignatureHtml)) {
        emailHtml += `<p></p>${sellerSignatureHtml}`;
      }

      const attachments: { filename: string; base64: string; mimeType: string }[] = [];
      if (offerPdfBase64) attachments.push({ filename: pdfFilename, base64: offerPdfBase64, mimeType: "application/pdf" });
      if (installPlanBase64) attachments.push({ filename: installPlanFilename, base64: installPlanBase64, mimeType: "application/pdf" });

      emailHtml = formatEmailHtml(emailHtml);

      const signSellerEmail = employee?.email || "info@lasikiilto.fi";
      try {
        const { error: outboxErr } = await supabase.from("email_outbox").insert({
          type: "sales",
          sender_email: signSellerEmail,
          payload: {
            to: [customer.email],
            subject: rendered.subject,
            body_html: emailHtml,
            sender_name: sellerName,
            sender_email: signSellerEmail,
            ...(attachments.length > 0 ? { attachments } : {}),
          },
          status: "pending",
          scheduled_at: new Date().toISOString(),
          reference_type: "opportunity",
          reference_id: opportunityId,
        });
        if (outboxErr) {
          throw new Error(`Vahvistussähköpostin tallennus epäonnistui: ${outboxErr.message}`);
        }
      } catch (e) {
        console.error("Email outbox insert failed (sign_now path):", e);
        throw e;
      }
    }
  }

  return { offerId: offer.id, offerNumber: offer.offer_number, bookingId };
}
