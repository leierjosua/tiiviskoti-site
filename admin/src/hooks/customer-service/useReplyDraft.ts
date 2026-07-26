import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// Autosaves CS reply drafts to cs_reply_drafts, keyed by (ticket_id, agent_id).
// Saves on a 2s debounce and clears on successful send.

const DEBOUNCE_MS = 2000;

export function useReplyDraft(
  ticketId: string | undefined,
  agentId: string | undefined
) {
  const [initialDraft, setInitialDraft] = useState<{
    body_html: string;
    cc_field: string;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing draft once per (ticket, agent)
  useEffect(() => {
    if (!ticketId || !agentId) return;
    let cancelled = false;
    setLoaded(false);
    (async () => {
      const { data } = await supabase
        .from("cs_reply_drafts")
        .select("body_html, cc_field")
        .eq("ticket_id", ticketId)
        .eq("agent_id", agentId)
        .maybeSingle();
      if (cancelled) return;
      setInitialDraft(
        data
          ? {
              body_html: data.body_html ?? "",
              cc_field: data.cc_field ?? "",
            }
          : null
      );
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, agentId]);

  // Debounced save
  const scheduleSave = useCallback(
    (bodyHtml: string, ccField: string) => {
      if (!ticketId || !agentId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (!bodyHtml.trim() && !ccField.trim()) {
          // Empty -> clear any existing draft
          await supabase
            .from("cs_reply_drafts")
            .delete()
            .eq("ticket_id", ticketId)
            .eq("agent_id", agentId);
          return;
        }
        await supabase.from("cs_reply_drafts").upsert(
          {
            ticket_id: ticketId,
            agent_id: agentId,
            body_html: bodyHtml,
            cc_field: ccField,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ticket_id,agent_id" }
        );
      }, DEBOUNCE_MS);
    },
    [ticketId, agentId]
  );

  const clearDraft = useCallback(async () => {
    if (!ticketId || !agentId) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await supabase
      .from("cs_reply_drafts")
      .delete()
      .eq("ticket_id", ticketId)
      .eq("agent_id", agentId);
  }, [ticketId, agentId]);

  // Flush any pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return { initialDraft, loaded, scheduleSave, clearDraft };
}
