/**
 * Process the email outbox queue.
 * Called by cron every 2 minutes to retry failed email sends.
 *
 * Modelled after process-automation-queue.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendViaGmail } from "../_shared/email-helpers.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireServiceRole } from "../_shared/auth.ts";
import { buildEmail, type EmailBuildResult } from "../_shared/email-builders.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BATCH_SIZE = 20;
const ACTION_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
    ),
  ]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authErr = requireServiceRole(req);
  if (authErr) return authErr;

  try {
    // Clean up dead letters older than 30 days
    const { error: cleanupErr } = await supabase.rpc("email_outbox_cleanup_dead_letters");
    if (cleanupErr) console.warn("Dead letter cleanup failed:", cleanupErr.message);

    const { data: items, error: fetchErr } = await supabase
      .from("email_outbox")
      .select("*")
      .eq("status", "pending")
      .lt("attempts", 10) // safety cap: skip rows with excessive attempts even if status is still pending
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;
    if (!items || items.length === 0) {
      return jsonRes({ message: "No pending items", processed: 0 });
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const item of items) {
      // Atomically claim this item: only update if still "pending" (prevents duplicates)
      const { data: claimed, error: procErr } = await supabase
        .from("email_outbox")
        .update({ status: "processing", attempts: item.attempts + 1 })
        .eq("id", item.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (procErr) {
        console.error(`Failed to mark outbox item ${item.id} as processing:`, procErr.message);
        continue;
      }
      if (!claimed) {
        // Another process already claimed this item — skip
        continue;
      }

      // Check do_not_contact for booking/contract emails (automated customer messages)
      if (item.type === "booking" || item.type === "contract") {
        try {
          const bookingId = item.payload?.booking_id;
          const contractId = item.payload?.contract_id;
          let customerId: string | null = null;

          if (bookingId) {
            const { data: b } = await supabase.from("bookings").select("customer_id").eq("id", bookingId).single();
            customerId = b?.customer_id || null;
          } else if (contractId) {
            const { data: c } = await supabase.from("contracts").select("customer_id").eq("id", contractId).single();
            customerId = c?.customer_id || null;
          }

          if (customerId) {
            const { data: cust } = await supabase.from("customers").select("do_not_contact").eq("id", customerId).single();
            if (cust?.do_not_contact) {
              // Skip sending — mark as dead_letter with reason
              await supabase.from("email_outbox").update({
                status: "dead_letter",
                last_error: "Skipped: customer has do_not_contact flag",
                processed_at: new Date().toISOString(),
              }).eq("id", item.id);
              console.info(`Outbox item ${item.id} skipped: customer do_not_contact`);
              processed++;
              continue;
            }
          }
        } catch (dncErr) {
          console.warn(`do_not_contact check failed for outbox ${item.id}:`, dncErr);
          // Continue sending — don't block on lookup failure
        }
      }

      try {
        // Build raw MIME if not present — uses email-builders to fetch data + render templates
        let rawEmail = item.raw_email;
        let senderEmail = item.sender_email;
        let threadId = item.thread_id || undefined;
        // deno-lint-ignore no-explicit-any
        let buildResult: EmailBuildResult | undefined;

        if (!rawEmail && item.payload) {
          try {
            const payloadWithSender = { ...(item.payload as Record<string, unknown>), sender_email: (item.payload as Record<string, unknown>).sender_email || item.sender_email };
            const result = await buildEmail(supabase, item.type, payloadWithSender);
            // buildEmail may return array (contact emails to multiple recipients) — take first for now
            const first = Array.isArray(result) ? result[0] : result;
            if (!first) {
              await handleFailure(item, "buildEmail returned empty result");
              failed++;
              processed++;
              continue;
            }
            rawEmail = first.raw;
            senderEmail = first.senderEmail || senderEmail;
            threadId = first.threadId || threadId;
            buildResult = first;

            // If contact email has multiple recipients, queue extra outbox rows for the rest
            if (Array.isArray(result) && result.length > 1) {
              for (let i = 1; i < result.length; i++) {
                await supabase.from("email_outbox").insert({
                  type: item.type,
                  payload: item.payload,
                  raw_email: result[i].raw,
                  sender_email: result[i].senderEmail,
                  status: "pending",
                  scheduled_at: new Date().toISOString(),
                  reference_type: item.reference_type,
                  reference_id: item.reference_id,
                });
              }
            }
          } catch (buildErr) {
            await handleFailure(item, `Email build failed: ${buildErr}`);
            failed++;
            processed++;
            continue;
          }
        }

        if (!rawEmail) {
          await handleFailure(item, "No raw_email and no payload to build from");
          failed++;
          processed++;
          continue;
        }

        // CS outbound safety kill switch for manual/sales emails sent via the
        // admin composer (useSendEmail → type=sales). Transactional types
        // (booking, contract, order, etc.) are NOT gated — they are automatic
        // customer messages and the kill switch would break e.g. booking
        // confirmations. The same env vars (CS_OUTBOUND_SAFETY +
        // CS_ALLOWED_RECIPIENTS) power the gate in cs-send-ticket-reply.
        if (item.type === "sales") {
          const safetyMode = (Deno.env.get("CS_OUTBOUND_SAFETY") ?? "live").toLowerCase();
          if (safetyMode === "dry_run") {
            console.log(
              `process-email-outbox [DRY_RUN]: sales outbox ${item.id} to ${JSON.stringify(
                (item.payload as Record<string, unknown>)?.to ?? []
              )} — Gmail send skipped`
            );
            await supabase.from("email_outbox").update({
              status: "sent",
              processed_at: new Date().toISOString(),
              last_error: "dry_run: CS_OUTBOUND_SAFETY=dry_run — Gmail call skipped",
            }).eq("id", item.id);
            processed++;
            continue;
          }
          if (safetyMode === "allowlist") {
            const allowed = (Deno.env.get("CS_ALLOWED_RECIPIENTS") ?? "")
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean);
            // deno-lint-ignore no-explicit-any
            const p = (item.payload as any) ?? {};
            const toList: string[] = Array.isArray(p.to) ? p.to : [];
            const ccList: string[] = Array.isArray(p.cc) ? p.cc : [];
            const bccList: string[] = Array.isArray(p.bcc) ? p.bcc : [];
            const allRecipients = [...toList, ...ccList, ...bccList]
              .map((s) => String(s).trim().toLowerCase())
              .filter(Boolean);
            const blocked = allRecipients.filter((r) => !allowed.includes(r));
            if (blocked.length > 0) {
              const msg = `CS_OUTBOUND_SAFETY=allowlist blocked ${blocked.length} recipient(s): ${blocked.join(", ")}`;
              console.warn(`process-email-outbox: sales outbox ${item.id} ${msg}`);
              await supabase.from("email_outbox").update({
                status: "dead_letter",
                last_error: msg,
                processed_at: new Date().toISOString(),
              }).eq("id", item.id);
              processed++;
              continue;
            }
          }
        }

        const result = await withTimeout(
          sendViaGmail(rawEmail, senderEmail, threadId),
          ACTION_TIMEOUT_MS,
        );

        if (result.ok) {
          // Mark sent
          const { error: sentErr } = await supabase
            .from("email_outbox")
            .update({
              status: "sent",
              gmail_message_id: result.messageId,
              gmail_thread_id: result.threadId,
              processed_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", item.id);
          if (sentErr) console.error(`Failed to mark outbox ${item.id} as sent:`, sentErr.message);

          // For sales and order emails, upsert to sales_emails
          if ((item.type === "sales" || item.type === "order") && result.messageId) {
            const p = item.payload;
            const { error: seErr } = await supabase.from("sales_emails").upsert({
              gmail_message_id: result.messageId,
              gmail_thread_id: result.threadId,
              opportunity_id: p.opportunity_id || null,
              synced_by_employee_id: p.employee_id || null,
              from_address: item.sender_email.toLowerCase(),
              from_name: p.sender_name || null,
              to_addresses: (p.to || []).map((t: string) => t.toLowerCase()),
              cc_addresses: (p.cc || []).map((c: string) => c.toLowerCase()),
              bcc_addresses: (p.bcc || []).map((b: string) => b.toLowerCase()),
              subject: p.subject,
              snippet: (p.body_html || "").replace(/<[^>]*>/g, "").substring(0, 200),
              body_html: p.body_html,
              body_text: (p.body_html || "").replace(/<[^>]*>/g, ""),
              date: item.created_at,
              is_inbound: false,
              is_read: true,
              labels: ["SENT"],
              has_attachments: !!p.attachments?.length,
              in_reply_to_message_id: p.in_reply_to || null,
            }, { onConflict: "gmail_message_id" });
            if (seErr) console.error(`sales_emails upsert failed for outbox ${item.id}:`, seErr.message);
          }

          succeeded++;
        } else {
          await handleFailure(item, result.error || "Gmail send returned not ok");
          failed++;
        }
      } catch (err) {
        await handleFailure(item, String(err));
        failed++;
      }

      processed++;
    }

    return jsonRes({ processed, succeeded, failed });
  } catch (err) {
    console.error("process-email-outbox error:", err);
    return jsonRes({ error: "Email processing failed" }, 500);
  }
});

async function handleFailure(
  item: { id: string; attempts: number; max_attempts: number },
  error: string,
) {
  const newAttempts = item.attempts + 1;
  if (newAttempts >= item.max_attempts) {
    await supabase
      .from("email_outbox")
      .update({
        status: "dead_letter",
        last_error: error,
        processed_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    console.error(`Outbox item ${item.id} moved to dead_letter: ${error}`);
  } else {
    // Exponential backoff: 2^attempts * 60 seconds
    const delaySec = Math.pow(2, newAttempts) * 60;
    const nextRun = new Date(Date.now() + delaySec * 1000).toISOString();
    await supabase
      .from("email_outbox")
      .update({
        status: "pending",
        last_error: error,
        scheduled_at: nextRun,
      })
      .eq("id", item.id);
    console.warn(`Outbox item ${item.id} retry scheduled at ${nextRun} (attempt ${newAttempts})`);
  }
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
// force redeploy 1774204910
