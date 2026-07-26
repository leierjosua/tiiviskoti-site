import { useState } from "react";
import DOMPurify from "dompurify";
import {
  Sparkles,
  Check,
  X,
  Loader2,
  Brain,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  useGenerateAIDraft,
  useSubmitAIFeedback,
  useDeleteAIDraft,
} from "@/hooks/customer-service/useAIDraft";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import type { CSTicket, CSTicketEvent } from "@/lib/cs-types";
import { TICKET_PRIORITY_LABELS } from "@/lib/cs-types";

interface Props {
  ticket: CSTicket;
  onInsertDraft: (html: string) => void;
  actorId?: string;
  /** Latest AI draft event from timeline, if any */
  latestAIDraft?: CSTicketEvent | null;
}

// AI draft card — shows the latest generated draft for the ticket with Käytä /
// Hylkää / Poista actions. Displays intent metadata and confidence. Draft is
// persisted as a cs_ticket_events row server-side so it survives refresh;
// the "Poista luonnos" button deletes the row outright (cascades to feedback).

export function AIDraftCard({ ticket, onInsertDraft, actorId, latestAIDraft }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const generateDraft = useGenerateAIDraft();
  const submitFeedback = useSubmitAIFeedback();
  const deleteDraft = useDeleteAIDraft();

  // Default to OPEN whenever a draft exists — previously we defaulted to false
  // which meant drafts disappeared into a collapsed card after refresh with
  // no way to reveal them again.
  const [collapsed, setCollapsed] = useState(false);

  const draft = latestAIDraft;
  const confidence = (draft?.payload?.confidence as number) ?? 0;
  const suggestedCategory = draft?.payload?.suggested_category as string;
  const suggestedPriority = draft?.payload?.suggested_priority as string;
  const intent = draft?.payload?.intent as string | undefined;
  const customerType = draft?.payload?.customer_type as string | undefined;
  const needsHuman = draft?.payload?.needs_human as boolean | undefined;
  const humanHandoffReason = draft?.payload?.human_handoff_reason as string | null | undefined;

  function handleGenerate(agentHint?: string) {
    generateDraft.mutate(
      { ticketId: ticket.id, agentHint },
      {
        onSuccess: () => {
          setCollapsed(false);
          toast.success(
            agentHint ? "Uusi AI-luonnos generoitu" : "AI-luonnos generoitu"
          );
        },
        onError: (err) => toast.error(`AI-virhe: ${err.message}`),
      }
    );
  }

  function handleRegenerateWithNote() {
    const note = window.prompt(
      "Kerro mitä haluat muuttaa luonnoksessa (esim. 'lyhyemmin', 'mainitse kesähinta', 'muotoile uudelleen'):"
    );
    if (note && note.trim()) {
      handleGenerate(note.trim());
    }
  }

  function handleApprove() {
    if (!draft) return;
    onInsertDraft(draft.body_html || "");
    submitFeedback.mutate({
      ticketId: ticket.id,
      eventId: draft.id,
      action: "approved",
      agentId: actorId,
      intent,
      customerType,
      confidence,
    });
    toast.success("Luonnos lisätty vastauskenttään");
  }

  function handleDiscard() {
    if (!draft) return;
    submitFeedback.mutate(
      {
        ticketId: ticket.id,
        eventId: draft.id,
        action: "discarded",
        agentId: actorId,
        intent,
        customerType,
        confidence,
      },
      {
        onSuccess: () => toast.success("Luonnos merkitty hylätyksi"),
      }
    );
    setCollapsed(true);
  }

  async function handleDelete() {
    if (!draft) return;
    const ok = await confirm({
      title: "Poista AI-luonnos?",
      message:
        "Luonnos poistetaan kokonaan tiketin historiasta. Palautetta ei voi enää antaa.",
      confirmLabel: "Poista",
      variant: "danger",
    });
    if (!ok) return;
    deleteDraft.mutate(
      { ticketId: ticket.id, eventId: draft.id },
      {
        onSuccess: () => toast.success("Luonnos poistettu"),
        onError: (err) => toast.error(err.message),
      }
    );
  }

  const confidenceColor =
    confidence >= 70
      ? "text-green-600 bg-green-100"
      : confidence >= 40
      ? "text-amber-600 bg-amber-100"
      : "text-red-600 bg-red-100";

  const hasDraft = !!draft && !!draft.body_html;

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5">
        <button
          type="button"
          onClick={() => hasDraft && setCollapsed((c) => !c)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:cursor-default"
          disabled={!hasDraft}
        >
          <Sparkles className="h-4 w-4 text-purple-500 flex-shrink-0" />
          <span className="text-sm font-medium text-purple-800">AI-avustaja</span>
          {hasDraft && (
            <>
              <span
                className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${confidenceColor}`}
              >
                {confidence}%
              </span>
              {intent && (
                <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full hidden sm:inline">
                  {intent}
                </span>
              )}
              {needsHuman && (
                <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-semibold">
                  Vaatii ihmisen
                </span>
              )}
              {collapsed ? (
                <ChevronDown className="h-4 w-4 text-purple-400 ml-auto flex-shrink-0" />
              ) : (
                <ChevronUp className="h-4 w-4 text-purple-400 ml-auto flex-shrink-0" />
              )}
            </>
          )}
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasDraft && (
            <button
              type="button"
              onClick={handleRegenerateWithNote}
              disabled={generateDraft.isPending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-50 disabled:opacity-50"
              title="Generoi uudelleen omalla ohjeella"
            >
              Ohjeella
            </button>
          )}
          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={generateDraft.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {generateDraft.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generoidaan...
              </>
            ) : (
              <>
                <Brain className="h-3.5 w-3.5" />
                {hasDraft ? "Generoi uudestaan" : "Generoi vastausluonnos"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Draft content — always visible when a draft exists and not manually collapsed */}
      {hasDraft && !collapsed && (
        <div className="border-t border-purple-200 px-3 sm:px-4 py-3 space-y-3">
          {/* Extra metadata badges not in the compact header */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {customerType && (
              <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                {customerType === "existing" ? "Olemassa oleva asiakas" : "Uusi asiakas"}
              </span>
            )}
            {needsHuman && humanHandoffReason && (
              <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                {humanHandoffReason}
              </span>
            )}
            {suggestedCategory && suggestedCategory !== ticket.category && (
              <span className="text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                Ehdotettu kategoria: {suggestedCategory}
              </span>
            )}
            {suggestedPriority && suggestedPriority !== ticket.priority && (
              <span className="text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                Ehdotettu prioriteetti:{" "}
                {TICKET_PRIORITY_LABELS[
                  suggestedPriority as keyof typeof TICKET_PRIORITY_LABELS
                ] ?? suggestedPriority}
              </span>
            )}
          </div>

          {/* Draft body */}
          <div className="bg-white rounded-lg border border-purple-100 p-3">
            <div
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draft.body_html || "") }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleApprove}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
            >
              <Check className="h-3.5 w-3.5" />
              Käytä vastauksena
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-gray-600 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50"
              title="Merkitse palaute: hylätty (pysyy historiassa)"
            >
              <X className="h-3.5 w-3.5" />
              Hylkää
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteDraft.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-50 ml-auto disabled:opacity-50"
              title="Poista luonnos kokonaan tiketin historiasta"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Poista
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
