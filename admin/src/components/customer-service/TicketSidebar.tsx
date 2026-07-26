import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SLAIndicator } from "./SLAIndicator";
import {
  useUpdateTicketStatus,
  useUpdateTicketPriority,
  useUpdateTicketCategory,
  useAssignTicket,
  useUpdateTicketTags,
} from "@/hooks/customer-service/useTicketDetail";
import { useCSCategories } from "@/hooks/customer-service/useTickets";
import { useEmployees } from "@/hooks/useEmployees";
import { useToast } from "@/context/ToastContext";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_CHANNEL_LABELS,
  type CSTicket,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/cs-types";
import {
  Tag,
  Plus,
  X,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface Props {
  ticket: CSTicket;
  actorId?: string;
}

export function TicketSidebar({ ticket, actorId }: Props) {
  const toast = useToast();
  const { data: categories } = useCSCategories();
  const { data: agents } = useEmployees("admin");
  const updateStatus = useUpdateTicketStatus();
  const updatePriority = useUpdateTicketPriority();
  const updateCategory = useUpdateTicketCategory();
  const assignTicket = useAssignTicket();
  const updateTags = useUpdateTicketTags();

  const [newTag, setNewTag] = useState("");

  function handleStatusChange(status: TicketStatus) {
    updateStatus.mutate(
      { ticketId: ticket.id, status, actorId },
      { onError: (e) => toast.error(e.message) }
    );
  }

  function handlePriorityChange(priority: TicketPriority) {
    updatePriority.mutate(
      { ticketId: ticket.id, priority, actorId },
      { onError: (e) => toast.error(e.message) }
    );
  }

  function handleCategoryChange(category: string) {
    updateCategory.mutate(
      { ticketId: ticket.id, category, actorId },
      { onError: (e) => toast.error(e.message) }
    );
  }

  function handleAssign(agentId: string) {
    assignTicket.mutate(
      { ticketId: ticket.id, agentId: agentId || null, actorId },
      { onError: (e) => toast.error(e.message) }
    );
  }

  function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag || ticket.tags.includes(tag)) return;
    updateTags.mutate(
      { ticketId: ticket.id, tags: [...ticket.tags, tag], actorId },
      { onError: (e) => toast.error(e.message) }
    );
    setNewTag("");
  }

  function removeTag(tag: string) {
    updateTags.mutate(
      { ticketId: ticket.id, tags: ticket.tags.filter((t) => t !== tag), actorId },
      { onError: (e) => toast.error(e.message) }
    );
  }


  return (
    <div className="space-y-5">
      {/* SLA */}
      <div>
        <SLAIndicator ticket={ticket} />
      </div>

      {/* Status */}
      <Section label="Tila">
        <select
          value={ticket.status}
          onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
          className="w-full rounded-xl border border-border text-sm px-3 py-2 bg-surface"
        >
          {Object.entries(TICKET_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Section>

      {/* Priority */}
      <Section label="Prioriteetti">
        <select
          value={ticket.priority}
          onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
          className="w-full rounded-xl border border-border text-sm px-3 py-2 bg-surface"
        >
          {Object.entries(TICKET_PRIORITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Section>

      {/* Category */}
      <Section label="Kategoria">
        <select
          value={ticket.category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="w-full rounded-xl border border-border text-sm px-3 py-2 bg-surface"
        >
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Section>

      {/* Assignment */}
      <Section label="Vastuuhenkilö">
        <select
          value={ticket.assigned_agent_id ?? ""}
          onChange={(e) => handleAssign(e.target.value)}
          className="w-full rounded-xl border border-border text-sm px-3 py-2 bg-surface"
        >
          <option value="">Ei vastuuhenkilöä</option>
          {(agents ?? []).filter((a) => a.active !== false).map((a) => (
            <option key={a.id} value={a.id}>
              {a.first_name} {a.last_name}
            </option>
          ))}
        </select>
      </Section>

      {/* Tags */}
      <Section label="Tägit">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ticket.tags.map((tag) => (
            <Badge
              key={tag}
              className="bg-gray-100 text-gray-700 text-xs inline-flex items-center gap-1"
            >
              <Tag className="h-3 w-3" />
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="ml-0.5 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="Lisää tägi..."
            className="flex-1 rounded-xl border border-border text-sm px-3 py-1.5 bg-surface"
          />
          <button
            type="button"
            onClick={addTag}
            disabled={!newTag.trim()}
            className="p-1.5 rounded-xl border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </Section>

      {/* Info */}
      <Section label="Tiedot">
        <div className="space-y-2 text-xs text-gray-600">
          <InfoRow label="Tiketti" value={`#${ticket.ticket_number}`} />
          <InfoRow label="Kanava" value={TICKET_CHANNEL_LABELS[ticket.channel]} />
          <InfoRow label="Luotu" value={formatDateTime(ticket.created_at)} />
          {ticket.first_response_at && (
            <InfoRow label="Ensivastaus" value={formatDateTime(ticket.first_response_at)} />
          )}
          {ticket.resolved_at && (
            <InfoRow label="Ratkaistu" value={formatDateTime(ticket.resolved_at)} />
          )}
        </div>
      </Section>

      {/* Customer info */}
      {(ticket.customer_name || ticket.customer_email || ticket.customer_phone) && (
        <Section label="Asiakas">
          <div className="space-y-1 text-sm">
            {ticket.customer_name && (
              <p className="font-medium text-gray-900">{ticket.customer_name}</p>
            )}
            {ticket.customer_email && (
              <p className="text-gray-600 text-xs break-all">{ticket.customer_email}</p>
            )}
            {ticket.customer_phone && (
              <p className="text-gray-600 text-xs">{ticket.customer_phone}</p>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-700 font-medium">{value}</span>
    </div>
  );
}
