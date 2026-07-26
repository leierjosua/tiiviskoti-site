import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type {
  CSTicket,
  CSTicketEvent,
  CSTicketWatcher,
  TicketStatus,
  TicketPriority,
} from "@/lib/cs-types";

const COMPANY_EMAIL = "info@lasikiilto.fi";

// ─── Ticket Detail ───────────────────────────────────────────────────────────

export function useTicketDetail(ticketNumber: number | undefined) {
  return useQuery({
    queryKey: queryKeys.customerService.tickets.detail(
      ticketNumber?.toString()
    ),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_tickets")
        .select(
          `*, assigned_agent:employees!cs_tickets_assigned_agent_id_fkey(id, first_name, last_name), cs_categories(*)`
        )
        .eq("ticket_number", ticketNumber!)
        .single();
      if (error) throw error;
      return data as CSTicket;
    },
    enabled: !!ticketNumber,
  });
}

export function useTicketById(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customerService.tickets.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_tickets")
        .select(
          `*, assigned_agent:employees!cs_tickets_assigned_agent_id_fkey(id, first_name, last_name), cs_categories(*)`
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as CSTicket;
    },
    enabled: !!id,
  });
}

// ─── Ticket Events (timeline) ────────────────────────────────────────────────

export function useTicketEvents(ticketId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customerService.tickets.events(ticketId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_ticket_events")
        .select(
          `*, actor:employees(id, first_name, last_name), sales_emails(id, gmail_message_id, rfc_message_id, from_address, from_name, to_addresses, cc_addresses, subject, body_html, body_text, snippet, date, is_read, sales_email_attachments(id, gmail_attachment_id, filename, mime_type, size_bytes))`
        )
        .eq("ticket_id", ticketId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CSTicketEvent[];
    },
    enabled: !!ticketId,
  });
}

// ─── Watchers ────────────────────────────────────────────────────────────────

export function useTicketWatchers(ticketId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customerService.tickets.watchers(ticketId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_ticket_watchers")
        .select("*, employees(id, first_name, last_name)")
        .eq("ticket_id", ticketId!);
      if (error) throw error;
      return (data ?? []) as CSTicketWatcher[];
    },
    enabled: !!ticketId,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function useInvalidateTicket() {
  const qc = useQueryClient();
  return (ticketId?: string) => {
    qc.invalidateQueries({
      queryKey: queryKeys.customerService.tickets.all,
    });
    if (ticketId) {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.tickets.events(ticketId),
      });
    }
  };
}

export function useUpdateTicketStatus() {
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: async ({
      ticketId,
      status,
      actorId,
    }: {
      ticketId: string;
      status: TicketStatus;
      actorId?: string;
    }) => {
      const updates: Record<string, unknown> = {
        status,
        last_activity_at: new Date().toISOString(),
      };
      if (status === "resolved" || status === "closed") {
        updates.resolved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("cs_tickets")
        .update(updates)
        .eq("id", ticketId);
      if (error) throw error;

      // Log event
      const { error: evErr } = await supabase
        .from("cs_ticket_events")
        .insert({
          ticket_id: ticketId,
          type: "status_change",
          actor_id: actorId ?? null,
          payload: { new_status: status },
          is_internal: true,
        });
      if (evErr) throw evErr;

      // Sync to Gmail: archive/unarchive the thread
      const { data: ticket } = await supabase
        .from("cs_tickets")
        .select("gmail_thread_id")
        .eq("id", ticketId)
        .single();

      if (ticket?.gmail_thread_id) {
        const shouldArchive = status === "resolved" || status === "closed";
        const shouldUnarchive =
          status === "new" || status === "open" || status === "waiting_internal";

        if (shouldArchive || shouldUnarchive) {
          try {
            await supabase.functions.invoke("modify-gmail-labels", {
              body: {
                sender_email: COMPANY_EMAIL,
                action: shouldArchive ? "archive_thread" : "unarchive_thread",
                gmail_thread_id: ticket.gmail_thread_id,
              },
            });
          } catch {
            // Non-critical: don't fail the status update if Gmail sync fails
            console.warn("Gmail thread sync failed");
          }
        }
      }
    },
    onSuccess: (_, v) => invalidate(v.ticketId),
  });
}

export function useUpdateTicketPriority() {
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: async ({
      ticketId,
      priority,
      actorId,
    }: {
      ticketId: string;
      priority: TicketPriority;
      actorId?: string;
    }) => {
      const { error } = await supabase
        .from("cs_tickets")
        .update({ priority, last_activity_at: new Date().toISOString() })
        .eq("id", ticketId);
      if (error) throw error;

      const { error: evErr } = await supabase
        .from("cs_ticket_events")
        .insert({
          ticket_id: ticketId,
          type: "priority_change",
          actor_id: actorId ?? null,
          payload: { new_priority: priority },
          is_internal: true,
        });
      if (evErr) throw evErr;
    },
    onSuccess: (_, v) => invalidate(v.ticketId),
  });
}

export function useUpdateTicketCategory() {
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: async ({
      ticketId,
      category,
      actorId,
    }: {
      ticketId: string;
      category: string;
      actorId?: string;
    }) => {
      // Fetch SLA targets for new category
      const { data: cat } = await supabase
        .from("cs_categories")
        .select("sla_first_response_minutes, sla_resolution_minutes")
        .eq("id", category)
        .single();

      const { error } = await supabase
        .from("cs_tickets")
        .update({
          category,
          sla_first_response_minutes: cat?.sla_first_response_minutes ?? null,
          sla_resolution_minutes: cat?.sla_resolution_minutes ?? null,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", ticketId);
      if (error) throw error;

      const { error: evErr } = await supabase
        .from("cs_ticket_events")
        .insert({
          ticket_id: ticketId,
          type: "category_change",
          actor_id: actorId ?? null,
          payload: { new_category: category },
          is_internal: true,
        });
      if (evErr) throw evErr;
    },
    onSuccess: (_, v) => invalidate(v.ticketId),
  });
}

export function useAssignTicket() {
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: async ({
      ticketId,
      agentId,
      actorId,
    }: {
      ticketId: string;
      agentId: string | null;
      actorId?: string;
    }) => {
      // Fetch current ticket to know previous agent and gmail thread
      const { data: ticket } = await supabase
        .from("cs_tickets")
        .select("status, assigned_agent_id, gmail_thread_id")
        .eq("id", ticketId)
        .single();

      const updates: Record<string, unknown> = {
        assigned_agent_id: agentId,
        last_activity_at: new Date().toISOString(),
      };
      // Auto-set status to open when first assigned
      if (agentId && ticket?.status === "new") {
        updates.status = "open";
      }
      const { error } = await supabase
        .from("cs_tickets")
        .update(updates)
        .eq("id", ticketId);
      if (error) throw error;

      const { error: evErr } = await supabase
        .from("cs_ticket_events")
        .insert({
          ticket_id: ticketId,
          type: "assignment",
          actor_id: actorId ?? null,
          payload: { assigned_agent_id: agentId },
          is_internal: true,
        });
      if (evErr) throw evErr;

      // Sync agent label to Gmail thread
      if (ticket?.gmail_thread_id) {
        try {
          await syncAgentGmailLabel(
            ticket.gmail_thread_id,
            ticket.assigned_agent_id,
            agentId
          );
        } catch {
          // Non-critical: don't fail assignment if Gmail sync fails
          console.warn("Gmail agent label sync failed");
        }
      }
    },
    onSuccess: (_, v) => invalidate(v.ticketId),
  });
}

/**
 * Sync the "👤Etunimi" Gmail label on a thread when assignment changes.
 * Removes old agent's label, adds new agent's label.
 */
async function syncAgentGmailLabel(
  gmailThreadId: string,
  oldAgentId: string | null,
  newAgentId: string | null
) {
  // Helper: find or create the "👤Etunimi" label for an agent
  async function getOrCreateAgentLabel(agentId: string): Promise<string | null> {
    const { data: emp } = await supabase
      .from("employees")
      .select("first_name")
      .eq("id", agentId)
      .single();
    if (!emp) return null;

    const labelName = `👤${emp.first_name}`;

    // Check if label already exists
    const { data: existing } = await supabase
      .from("gmail_labels")
      .select("gmail_label_id")
      .eq("email_address", COMPANY_EMAIL)
      .eq("name", labelName)
      .maybeSingle();

    if (existing) return existing.gmail_label_id;

    // Create the label in Gmail
    const { data: created, error } = await supabase.functions.invoke(
      "modify-gmail-labels",
      {
        body: {
          sender_email: COMPANY_EMAIL,
          action: "create_label",
          label_name: labelName,
        },
      }
    );
    if (error) throw error;
    return created?.label?.id ?? null;
  }

  // Remove old agent's label
  if (oldAgentId) {
    const oldLabelId = await getOrCreateAgentLabel(oldAgentId);
    if (oldLabelId) {
      await supabase.functions.invoke("modify-gmail-labels", {
        body: {
          sender_email: COMPANY_EMAIL,
          action: "remove_label_thread",
          gmail_thread_id: gmailThreadId,
          label_id: oldLabelId,
        },
      });
    }
  }

  // Add new agent's label
  if (newAgentId) {
    const newLabelId = await getOrCreateAgentLabel(newAgentId);
    if (newLabelId) {
      await supabase.functions.invoke("modify-gmail-labels", {
        body: {
          sender_email: COMPANY_EMAIL,
          action: "add_label_thread",
          gmail_thread_id: gmailThreadId,
          label_id: newLabelId,
        },
      });
    }
  }
}

export function useUpdateTicketTags() {
  const invalidate = useInvalidateTicket();
  return useMutation({
    mutationFn: async ({
      ticketId,
      tags,
      actorId,
    }: {
      ticketId: string;
      tags: string[];
      actorId?: string;
    }) => {
      const { error } = await supabase
        .from("cs_tickets")
        .update({ tags, last_activity_at: new Date().toISOString() })
        .eq("id", ticketId);
      if (error) throw error;

      const { error: evErr } = await supabase
        .from("cs_ticket_events")
        .insert({
          ticket_id: ticketId,
          type: "tag_change",
          actor_id: actorId ?? null,
          payload: { tags },
          is_internal: true,
        });
      if (evErr) throw evErr;
    },
    onSuccess: (_, v) => invalidate(v.ticketId),
  });
}

// ─── Watcher Mutations ──────────────────────────────────────────────────────

export function useAddTicketWatcher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      employeeId,
    }: {
      ticketId: string;
      employeeId: string;
    }) => {
      const { error } = await supabase
        .from("cs_ticket_watchers")
        .upsert({ ticket_id: ticketId, employee_id: employeeId });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.tickets.watchers(v.ticketId),
      });
    },
  });
}

export function useRemoveTicketWatcher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      employeeId,
    }: {
      ticketId: string;
      employeeId: string;
    }) => {
      const { error } = await supabase
        .from("cs_ticket_watchers")
        .delete()
        .eq("ticket_id", ticketId)
        .eq("employee_id", employeeId);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.tickets.watchers(v.ticketId),
      });
    },
  });
}
