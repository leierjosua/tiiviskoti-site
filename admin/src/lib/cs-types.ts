// ─── Customer Service Types ──────────────────────────────────────────────────

// ─── Enums ───────────────────────────────────────────────────────────────────

export type TicketStatus =
  | "new"
  | "open"
  | "waiting_customer"
  | "waiting_internal"
  | "resolved"
  | "closed";

export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type TicketChannel = "email" | "form" | "phone" | "manual";

export type TicketEventType =
  | "email_inbound"
  | "email_outbound"
  | "note"
  | "status_change"
  | "assignment"
  | "priority_change"
  | "category_change"
  | "tag_change"
  | "merge"
  | "ai_draft"
  | "csat_response"
  | "sla_breach"
  | "form_submission";

export type KBVisibility = "internal" | "customer_facing";

export type AIFeedbackAction = "approved" | "edited" | "discarded";

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface CSTicket {
  id: string;
  ticket_number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  channel: TicketChannel;

  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;

  assigned_agent_id: string | null;

  gmail_thread_id: string | null;
  form_submission_id: string | null;

  first_response_at: string | null;
  resolved_at: string | null;
  sla_first_response_minutes: number | null;
  sla_resolution_minutes: number | null;
  sla_breached: boolean;

  csat_score: number | null;
  csat_comment: string | null;
  csat_sent_at: string | null;

  merged_into_id: string | null;
  is_merged: boolean;
  gmail_archived: boolean;
  gmail_trashed: boolean;

  tags: string[];
  snippet: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;

  // Relations (joined)
  assigned_agent?: { id: string; first_name: string; last_name: string } | null;
  cs_categories?: CSCategory | null;
}

export interface CSTicketEvent {
  id: string;
  ticket_id: string;
  type: TicketEventType;
  actor_id: string | null;
  email_id: string | null;
  body_html: string | null;
  body_text: string | null;
  payload: Record<string, unknown>;
  is_internal: boolean;
  created_at: string;

  // Relations (joined)
  actor?: { id: string; first_name: string; last_name: string } | null;
  sales_emails?: {
    id: string;
    gmail_message_id: string;
    rfc_message_id?: string | null;
    from_address: string;
    from_name: string | null;
    to_addresses: string[];
    cc_addresses: string[];
    subject: string | null;
    body_html: string | null;
    body_text: string | null;
    snippet: string | null;
    date: string;
    is_read: boolean;
    attachments?: {
      id: string;
      gmail_attachment_id: string;
      filename: string;
      mime_type: string;
      size_bytes: number;
    }[];
  } | null;
}

export interface CSCategory {
  id: string;
  label: string;
  color: string;
  sla_first_response_minutes: number | null;
  sla_resolution_minutes: number | null;
  auto_archive: boolean;
  position: number;
  is_active: boolean;
  created_at: string;
}

export interface CSTicketWatcher {
  ticket_id: string;
  employee_id: string;
  created_at: string;
  employees?: { id: string; first_name: string; last_name: string };
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────

export interface KBArticle {
  id: string;
  title: string;
  slug: string;
  category: string;
  body_html: string;
  body_text: string;
  visibility: KBVisibility;
  tags: string[];
  is_published: boolean;
  view_count: number;
  use_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator?: { id: string; first_name: string; last_name: string } | null;
}

export interface KBArticleVersion {
  id: string;
  article_id: string;
  title: string;
  body_html: string;
  body_text: string;
  changed_by: string | null;
  created_at: string;
  changer?: { id: string; first_name: string; last_name: string } | null;
}

// ─── Canned Responses ────────────────────────────────────────────────────────

export interface CSCannedResponse {
  id: string;
  name: string;
  category: string | null;
  subject: string | null;
  body_html: string;
  body_text: string | null;
  variables: string[];
  usage_count: number;
  is_active: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Automation Rules ────────────────────────────────────────────────────────

export type CSAutomationTrigger =
  | "ticket_created"
  | "ticket_updated"
  | "sla_approaching"
  | "sla_breached"
  | "schedule";

export interface CSAutomationRule {
  id: string;
  name: string;
  trigger_type: CSAutomationTrigger;
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export interface CSAIFeedback {
  id: string;
  ticket_id: string;
  event_id: string;
  action: AIFeedbackAction;
  edited_body: string | null;
  agent_id: string | null;
  created_at: string;
}

export interface CSAIDraftResult {
  draft_html: string;
  suggested_category: string;
  suggested_priority: TicketPriority;
  confidence: number;
}

// ─── Agent Presence ──────────────────────────────────────────────────────────

export interface CSAgentPresence {
  ticket_id: string;
  employee_id: string;
  is_composing: boolean;
  last_seen_at: string;
  employees?: { id: string; first_name: string; last_name: string };
}

// ─── Display Helpers ─────────────────────────────────────────────────────────

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: "Uusi",
  open: "Avoin",
  waiting_customer: "Odottaa asiakasta",
  waiting_internal: "Odottaa sisäistä",
  resolved: "Ratkaistu",
  closed: "Suljettu",
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  open: "bg-amber-100 text-amber-800",
  waiting_customer: "bg-purple-100 text-purple-800",
  waiting_internal: "bg-orange-100 text-orange-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Matala",
  normal: "Normaali",
  high: "Korkea",
  urgent: "Kiireellinen",
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-800",
};

export const TICKET_PRIORITY_DOT_COLORS: Record<TicketPriority, string> = {
  low: "bg-gray-400",
  normal: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-600",
};

export const TICKET_CHANNEL_LABELS: Record<TicketChannel, string> = {
  email: "Sähköposti",
  form: "Lomake",
  phone: "Puhelin",
  manual: "Manuaalinen",
};

export const EVENT_TYPE_LABELS: Record<TicketEventType, string> = {
  email_inbound: "Saapunut viesti",
  email_outbound: "Lähetetty viesti",
  note: "Muistiinpano",
  status_change: "Tila muutettu",
  assignment: "Vastuuhenkilö vaihdettu",
  priority_change: "Prioriteetti muutettu",
  category_change: "Kategoria muutettu",
  tag_change: "Tägit muutettu",
  merge: "Tiketti yhdistetty",
  ai_draft: "AI-luonnos",
  csat_response: "Asiakaspalaute",
  sla_breach: "SLA ylitetty",
  form_submission: "Lomakelähetys",
};

// ─── Filter Types ────────────────────────────────────────────────────────────

export interface TicketFilters {
  status?: TicketStatus | TicketStatus[] | "all";
  priority?: TicketPriority | "all";
  category?: string | "all";
  channel?: TicketChannel | "all";
  assigned_agent_id?: string | "all" | "unassigned";
  search?: string;
  page?: number;
}

export interface KBFilters {
  category?: string | "all";
  visibility?: KBVisibility | "all";
  search?: string;
  page?: number;
}

export const TICKETS_PAGE_SIZE = 50;
export const KB_PAGE_SIZE = 25;
