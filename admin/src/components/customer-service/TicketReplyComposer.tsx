import { useState, useEffect, useRef, useCallback } from "react";
import { Send, StickyNote, X, Undo2 } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useSendTicketReply } from "@/hooks/customer-service/useTicketReply";
import { useAddTicketNote } from "@/hooks/customer-service/useTicketNotes";
import { useAgentSignature } from "@/hooks/customer-service/useAgentSignature";
import { useReplyDraft } from "@/hooks/customer-service/useReplyDraft";
import TiptapEditor from "@/components/email/TiptapEditor";
import { formatEmailHtml } from "@/lib/email-styles";
import { CannedResponsePicker } from "./CannedResponsePicker";
import type { CSTicket, CSTicketEvent } from "@/lib/cs-types";

type Mode = "reply" | "note";

const UNDO_WINDOW_MS = 5000;

interface Props {
  ticket: CSTicket;
  lastInboundEmail?: CSTicketEvent | null;
  actorId?: string;
  initialBody?: string; // HTML — from AI draft, canned response, or restored autosave
  onReplySent?: (sentBody: string) => void;
}

export function TicketReplyComposer({
  ticket,
  lastInboundEmail,
  actorId,
  initialBody,
  onReplySent,
}: Props) {
  const [mode, setMode] = useState<Mode>("reply");
  // Body is HTML throughout — TipTap is the single source of rich text.
  const [bodyHtml, setBodyHtml] = useState<string>(initialBody || "");
  const [ccField, setCcField] = useState("");
  const [showCc, setShowCc] = useState(false);

  // editorKey is bumped whenever an external source (AI draft, canned response,
  // autosaved draft restore) replaces the body. Changing the key forces TipTap
  // to remount with fresh content — that's the cleanest way to sync external
  // content changes without risking render loops in the editor's onChange.
  const [editorKey, setEditorKey] = useState(0);

  const toast = useToast();
  const sendReply = useSendTicketReply();
  const addNote = useAddTicketNote();
  const { data: signature } = useAgentSignature(actorId);
  const { initialDraft, loaded: draftLoaded, scheduleSave, clearDraft } =
    useReplyDraft(ticket.id, actorId);

  // Undo-send state. Timer + interval live in refs so they survive re-renders
  // cleanly and can be cancelled from anywhere without touching React state
  // lifecycle. `isPendingSend` is the simple boolean that drives the button
  // label; `undoCountdown` just drives the countdown text.
  //
  // abortRef is a belt-and-suspenders safeguard: even if clearTimeout fails
  // for any reason (timing, React batching quirks, browser bugs), the
  // scheduled send callback checks this flag before actually sending, so
  // Peruuta is guaranteed to stop the send.
  const [isPendingSend, setIsPendingSend] = useState(false);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);
  // Mirror of isPendingSend that's always up-to-date during the current event,
  // so handleSubmit can synchronously check it without stale-closure issues
  // even if cancelPending and handleSubmit run back-to-back.
  const pendingSendRef = useRef(false);

  // Track the last external value we synced, so we only remount when the
  // parent actually pushes a new body (not when we echo our own state back).
  const lastExternalRef = useRef<string | null>(initialBody ?? null);

  // External body change from parent (AI draft inserted, canned response picked).
  // When the parent pushes a NEW initialBody that differs from what we last
  // received, we always honor it — the user explicitly clicked something to
  // trigger this. The autosave-restore logic below is independent and only
  // runs once on load, so it cannot race with explicit inserts.
  useEffect(() => {
    if (initialBody === undefined) return;
    if (initialBody === lastExternalRef.current) return;
    lastExternalRef.current = initialBody;
    if (!initialBody) return; // don't clear the editor just because parent sent ""
    setBodyHtml(initialBody);
    setEditorKey((k) => k + 1);
  }, [initialBody]);

  // Restore autosaved draft once on load.
  useEffect(() => {
    if (!draftLoaded || !initialDraft) return;
    if (initialDraft.body_html) {
      setBodyHtml(initialDraft.body_html);
      setEditorKey((k) => k + 1);
    }
    if (initialDraft.cc_field) {
      setCcField(initialDraft.cc_field);
      if (initialDraft.cc_field.trim()) setShowCc(true);
    }
  }, [draftLoaded, initialDraft]);

  // Autosave on change
  useEffect(() => {
    if (!draftLoaded) return;
    scheduleSave(bodyHtml, ccField);
  }, [bodyHtml, ccField, draftLoaded, scheduleSave]);

  // Clean up timers on unmount only — refs are stable so this runs once.
  useEffect(() => {
    return () => {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const replyTo = lastInboundEmail?.sales_emails?.from_address || ticket.customer_email;
  const replySubject = ticket.subject.startsWith("Re:")
    ? ticket.subject
    : `Re: ${ticket.subject}`;
  const threadId = ticket.gmail_thread_id ?? undefined;
  // In-Reply-To MUST be the RFC 2822 Message-ID header (e.g.
  // "<CAB+abc@mail.gmail.com>"), not Gmail's internal message ID hex.
  // Using the wrong value breaks threading on the recipient's side and each
  // reply appears as a new conversation. If rfc_message_id is not yet
  // populated for this row (pre-migration data), we fall back to undefined
  // — threading won't propagate for that reply but at least nothing breaks.
  const inReplyTo = lastInboundEmail?.sales_emails?.rfc_message_id || undefined;

  const isBusy = sendReply.isPending || addNote.isPending || isPendingSend;

  // Cheap HTML-emptiness check: strip tags, check for any non-whitespace.
  const isEmptyHtml = useCallback((html: string): boolean => {
    const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    return text.length === 0;
  }, []);

  const cancelPending = useCallback(() => {
    // Set abort + ref FIRST so any in-flight callback or synchronously-fired
    // handleSubmit sees the cancelled state before React commits the setState.
    abortRef.current = true;
    pendingSendRef.current = false;
    if (sendTimerRef.current) {
      clearTimeout(sendTimerRef.current);
      sendTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setIsPendingSend(false);
    setUndoCountdown(0);
    toast.success("Lähetys peruutettu");
  }, [toast]);

  const actuallySend = useCallback(
    (finalHtml: string) => {
      if (!replyTo) {
        toast.error("Vastaanottajaosoitetta ei löydy");
        sendTimerRef.current = null;
        setIsPendingSend(false);
        return;
      }
      // Append signature as a new paragraph block inside the body so
      // formatEmailHtml applies consistent <p> → margin + <br> handling.
      // Exactly matches how sales emails are built.
      const bodyWithSig = signature?.html
        ? `${finalHtml}<p></p>${signature.html}`
        : finalHtml;
      const html = formatEmailHtml(bodyWithSig);
      sendReply.mutate(
        {
          ticketId: ticket.id,
          to: [replyTo],
          cc: ccField
            ? ccField.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
          subject: replySubject,
          body_html: html,
          thread_id: threadId,
          in_reply_to: inReplyTo,
          actorId,
        },
        {
          onSuccess: async () => {
            onReplySent?.(finalHtml);
            setBodyHtml("");
            setEditorKey((k) => k + 1);
            setCcField("");
            sendTimerRef.current = null;
            pendingSendRef.current = false;
            setIsPendingSend(false);
            setUndoCountdown(0);
            await clearDraft();
            toast.success("Vastaus lähetetty");
          },
          onError: (err) => {
            sendTimerRef.current = null;
            pendingSendRef.current = false;
            setIsPendingSend(false);
            setUndoCountdown(0);
            toast.error(`Lähetys epäonnistui: ${err.message}`);
          },
        }
      );
    },
    [
      replyTo,
      ticket.id,
      ccField,
      replySubject,
      threadId,
      inReplyTo,
      actorId,
      signature?.html,
      sendReply,
      onReplySent,
      clearDraft,
      toast,
    ]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Use the ref, not the state, to avoid stale closures if cancelPending
    // and handleSubmit fire back-to-back within one React batch.
    if (isEmptyHtml(bodyHtml) || isBusy || pendingSendRef.current) return;

    if (mode === "note") {
      const plainText = bodyHtml.replace(/<[^>]*>/g, "").trim();
      addNote.mutate(
        {
          ticketId: ticket.id,
          bodyHtml: bodyHtml,
          bodyText: plainText,
          actorId,
          isInternal: true,
        },
        {
          onSuccess: () => {
            setBodyHtml("");
            setEditorKey((k) => k + 1);
            toast.success("Muistiinpano lisätty");
          },
          onError: (err) => toast.error(`Virhe: ${err.message}`),
        }
      );
      return;
    }

    // Reply mode: schedule an undo-able send. Timer is stored in a ref so it
    // survives re-renders and can be cancelled from anywhere without state
    // dance. abortRef is checked inside the timer callback as a final safety
    // net — even if clearTimeout somehow fails, the send will bail out.
    const finalHtml = bodyHtml;
    // Clear any stale timers from a previous aborted cycle.
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    abortRef.current = false;
    pendingSendRef.current = true;

    sendTimerRef.current = setTimeout(() => {
      sendTimerRef.current = null;
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (abortRef.current) return;
      actuallySend(finalHtml);
    }, UNDO_WINDOW_MS);

    setIsPendingSend(true);
    setUndoCountdown(Math.round(UNDO_WINDOW_MS / 1000));
    countdownIntervalRef.current = setInterval(() => {
      setUndoCountdown((v) => {
        if (v <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  // Global keyboard shortcut for Cmd/Ctrl+Enter to submit, since TipTap
  // doesn't fire form-level keydown for the editor region.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const form = document.activeElement?.closest("form");
        if (form) {
          e.preventDefault();
          form.requestSubmit();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white">
      {/* Mode tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setMode("reply")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === "reply"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Send className="h-3.5 w-3.5" />
          Vastaa
        </button>
        <button
          type="button"
          onClick={() => setMode("note")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === "note"
              ? "border-amber-600 text-amber-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Sisäinen muistiinpano
        </button>
        {draftLoaded && initialDraft && (
          <span className="ml-auto text-xs text-gray-400 self-center pr-3">
            Luonnos tallennettu automaattisesti
          </span>
        )}
      </div>

      {/* Reply info */}
      {mode === "reply" && (
        <div className="px-3 sm:px-4 py-2 border-b border-gray-100 text-xs space-y-1">
          <div className="flex items-center gap-2 text-gray-500 min-w-0">
            <span className="font-medium w-14 shrink-0">Kenelle:</span>
            <span className="text-gray-700 truncate">{replyTo || "—"}</span>
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="ml-auto text-indigo-600 hover:text-indigo-800"
              >
                Cc
              </button>
            )}
          </div>
          {showCc && (
            <div className="flex items-center gap-2 text-gray-500">
              <span className="font-medium w-14">Cc:</span>
              <input
                type="text"
                value={ccField}
                onChange={(e) => setCcField(e.target.value)}
                placeholder="email1@example.com, email2@example.com"
                className="flex-1 text-xs border-none bg-transparent focus:outline-none text-gray-700"
              />
              <button
                type="button"
                onClick={() => {
                  setShowCc(false);
                  setCcField("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 text-gray-500 min-w-0">
            <span className="font-medium w-14 shrink-0">Aihe:</span>
            <span className="text-gray-700 truncate">{replySubject}</span>
          </div>
        </div>
      )}

      {/* Note mode header */}
      {mode === "note" && (
        <div className="px-4 py-2 border-b border-amber-100 bg-amber-50/50 text-xs text-amber-700">
          Sisäinen muistiinpano — ei näy asiakkaalle
        </div>
      )}

      {/* Rich text editor */}
      <div className="px-3 sm:px-4 py-3">
        <TiptapEditor
          key={editorKey}
          content={bodyHtml}
          placeholder={
            mode === "reply"
              ? "Kirjoita vastaus..."
              : "Kirjoita sisäinen muistiinpano..."
          }
          onChange={setBodyHtml}
          autofocus={false}
        />
        {isPendingSend && (
          <div className="mt-2 text-xs text-orange-600 font-medium">
            Viesti lähetetään {undoCountdown} sekunnissa... peruuta alla.
          </div>
        )}
        {mode === "reply" && signature?.html && (
          <div
            className="mt-2 pt-2 border-t border-dashed border-gray-200 text-xs text-gray-500"
            dangerouslySetInnerHTML={{
              __html: `<div class="opacity-70">${signature.html}</div>`,
            }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-gray-100 px-3 sm:px-4 py-2 gap-2">
        <div className="flex items-center gap-1">
          {mode === "reply" && (
            <CannedResponsePicker
              ticket={ticket}
              onSelect={(html) => {
                // Canned responses are HTML — append, don't strip.
                setBodyHtml((prev) => (prev ? prev + html : html));
                setEditorKey((k) => k + 1);
              }}
            />
          )}
        </div>
        {isPendingSend ? (
          <button
            type="button"
            onClick={(e) => {
              // preventDefault + stopPropagation keep the click from bubbling
              // to the form — without these, Peruuta was re-triggering submit.
              e.preventDefault();
              e.stopPropagation();
              cancelPending();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Peruuta lähetys ({undoCountdown}s)
          </button>
        ) : (
          <button
            type="submit"
            disabled={isEmptyHtml(bodyHtml) || isBusy}
            title="Cmd/Ctrl + Enter"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === "reply"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {mode === "reply" ? (
              <>
                <Send className="h-3.5 w-3.5" />
                {sendReply.isPending ? "Lähetetään..." : "Lähetä"}
              </>
            ) : (
              <>
                <StickyNote className="h-3.5 w-3.5" />
                {addNote.isPending ? "Tallennetaan..." : "Lisää muistiinpano"}
              </>
            )}
          </button>
        )}
      </div>
    </form>
  );
}

