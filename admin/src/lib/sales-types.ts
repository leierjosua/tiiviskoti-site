// ─── Sales Types ─────────────────────────────────────────────────────────────

// ─── Enums ───────────────────────────────────────────────────────────────────

export type LeadStatus =
  | "new"
  | "called"
  | "answered"
  | "no_answer"
  | "not_interested"
  | "qualified"
  | "booked"
  | "won"
  | "lost"
  | "do_not_call";

export type OpportunityStatus = string; // dynamic from sales_opportunity_stages

export type OfferStatus = "draft" | "sent" | "accepted" | "expired" | "cancelled";

export type OfferLineType = "service" | "additional_service" | "product" | "other_charge";

export type TagType = "normal" | "service" | "loss_reason" | "import";
export type TagScope = "lead" | "opportunity" | "both";

export type QueueState = "queued" | "done" | "skipped";

export type OpportunityFileType = "manual" | "offer_pdf" | "installation_plan_pdf";

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface SalesLead {
  id: string;
  external_source: string;
  external_id: string;
  call_list_id: string | null;
  name: string | null;
  phone: string | null;
  phone_norm: string | null;
  email: string | null;
  email_norm: string | null;
  address: string | null;
  postcode: string | null;
  city: string | null;
  company: string | null;
  status: LeadStatus;
  assigned_salesperson_id: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  last_activity_at: string | null;
  tags_cache: string[];
  service_tags_cache?: string[];
  loss_reason_tags_cache?: string[];
  imported_at: string;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
  // Relations
  sales_call_lists?: SalesCallList;
  assigned_salesperson?: { id: string; first_name: string; last_name: string };
}

export interface SalesLeadNote {
  id: string;
  lead_id: string;
  created_by_user_id: string | null;
  body: string;
  created_at: string;
}

export interface SalesLeadEvent {
  id: string;
  lead_id: string;
  salesperson_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SalesTag {
  name: string;
  color: string;
  position: number;
  is_active: boolean;
  tag_type: TagType | null;
  scope: TagScope | null;
  created_at: string;
  updated_at: string;
}

export interface SalesLeadTag {
  lead_id: string;
  tag_id: string;
  created_at: string;
}

// ─── Call Lists ──────────────────────────────────────────────────────────────

export interface SalesCallList {
  id: string;
  name: string;
  category: string;
  description: string | null;
  imported_by: string | null;
  lead_count: number;
  created_at: string;
}

// ─── Lead Stages ─────────────────────────────────────────────────────────────

export interface SalesLeadStage {
  key: string;
  label: string;
  color: string;
  position: number;
  is_active: boolean;
  is_system: boolean;
  is_close_stage: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Call Scripts ────────────────────────────────────────────────────────────

export interface SalesCallScript {
  id: string;
  name: string;
  content: string;
  service_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ─── Daily Queue ─────────────────────────────────────────────────────────────

export interface SalesDailyQueue {
  salesperson_id: string;
  day: string;
  lead_id: string;
  position: number;
  state: QueueState;
  created_at: string;
  updated_at: string;
}

export interface SalesDailyTarget {
  salesperson_id: string;
  day: string;
  target_count: number;
  created_at: string;
  updated_at: string;
}

// ─── Points / Gamification ───────────────────────────────────────────────────

export interface SalesPointsEvent {
  id: string;
  salesperson_id: string;
  points: number;
  reason: string;
  lead_id: string | null;
  booking_id: string | null;
  created_at: string;
}

// ─── Install plan (stored on opportunity) ────────────────────────────────────

export interface InstallPlanData {
  lapivienti: "sisayksikon_taakse" | "asennuskotelolla";
  /** Optional override for the bullet text rendered on the PDF. When empty/missing, the preset default is used. */
  lapivienti_text?: string;
  teline: "seinateline" | "parvekkeen_lattia" | "maateline";
  teline_text?: string;
  sahko: "kiintea" | "pistotulppa";
  sahko_text?: string;
  kondenssi: "maahan" | "sadevesikaivoon" | "parveke" | "parveke_astia";
  kondenssi_text?: string;
  huomiot?: string;
}

// ─── Opportunities (Inbound) ─────────────────────────────────────────────────

export interface SalesOpportunity {
  id: string;
  external_source: string;
  external_id: string;
  name: string | null;
  phone: string | null;
  phone_norm: string | null;
  email: string | null;
  email_norm: string | null;
  address: string | null;
  postcode: string | null;
  city: string | null;
  company: string | null;
  channel: string | null;
  status: string;
  assigned_salesperson_id: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  last_activity_at: string | null;
  source_payload: Record<string, unknown>;
  is_archived: boolean;
  archived_at: string | null;
  archived_reason: string | null;
  tags_cache: string[];
  install_plan: InstallPlanData | null;
  created_at: string;
  updated_at: string;
  // Relations
  assigned_salesperson?: { id: string; first_name: string; last_name: string };
  sales_offers?: SalesOffer[];
}

export interface SalesOpportunityStage {
  key: string;
  label: string;
  color: string;
  position: number;
  is_active: boolean;
  is_system: boolean;
  is_close_stage: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesOpportunityNote {
  id: string;
  opportunity_id: string;
  created_by_user_id: string | null;
  body: string;
  show_to_installer: boolean;
  created_at: string;
}

export interface SalesOpportunityEvent {
  id: string;
  opportunity_id: string;
  salesperson_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SalesOpportunityFile {
  id: string;
  opportunity_id: string;
  filename: string;
  bucket: string;
  path: string;
  file_type: OpportunityFileType;
  offer_id: string | null;
  created_at: string;
  created_by_user_id: string | null;
  photo_category: string | null;
}

// ─── Emails ─────────────────────────────────────────────────────────────────

export interface SalesEmail {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  opportunity_id: string | null;
  synced_by_employee_id: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string | null;
  snippet: string | null;
  body_html: string | null;
  body_text: string | null;
  date: string;
  is_inbound: boolean;
  is_starred: boolean;
  is_archived: boolean;
  is_trashed: boolean;
  is_draft: boolean;
  is_read: boolean;
  labels: string[];
  has_attachments: boolean;
  in_reply_to_message_id: string | null;
  rfc_message_id: string | null;
  created_at: string;
}

export interface SalesEmailAttachment {
  id: string;
  email_id: string;
  gmail_attachment_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export interface EmailThread {
  thread_id: string;
  subject: string | null;
  snippet: string | null;
  last_date: string;
  message_count: number;
  is_starred: boolean;
  is_read: boolean;
  has_attachments: boolean;
  participants: string[];
  messages: SalesEmail[];
}

export type EmailMailbox = "inbox" | "sent" | "drafts" | "archive" | "trash" | "starred" | "label";

export interface GmailLabel {
  id: string;
  gmail_label_id: string;
  email_address: string;
  name: string;
  type: string;
  text_color: string | null;
  background_color: string | null;
  parent_gmail_label_id: string | null;
}

// ─── Offers / Quotes ─────────────────────────────────────────────────────────

export interface SalesOffer {
  id: string;
  opportunity_id: string;
  created_by_user_id: string | null;
  created_by_salesperson_id: string | null;
  status: OfferStatus;
  title: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_postcode: string | null;
  customer_city: string | null;
  validity_days: number;
  subtotal: number;
  discount: number;
  total: number;
  sent_at: string | null;
  accepted_at: string | null;
  signed_at: string | null;
  offer_number: string | null;
  service_category_id: string | null;
  signature_data_url: string | null;
  signer_name: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  sales_offer_line_items?: SalesOfferLineItem[];
}

export interface SalesOfferLineItem {
  id: string;
  offer_id: string;
  line_type: OfferLineType;
  item_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  labor_portion: number;
  sort_order: number;
  duration_minutes: number | null;
  option_group: string | null;
  is_upsell: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesOfferToken {
  id: string;
  offer_id: string;
  token: string;
  expires_at: string | null;
  consumed_at: string | null;
  is_revoked: boolean;
  customer_selections: { selectedGroup?: string | null; selectedUpsellIds?: string[] } | null;
  created_at: string;
}

// ─── Quote Templates ─────────────────────────────────────────────────────────

export interface SalesQuoteTemplate {
  id: string;
  name: string;
  description: string | null;
  note_title: string | null;
  note_content: string | null;
  validity_days: number | null;
  is_active: boolean;
  sort_order: number;
  kind: "template" | "one_off";
  opportunity_id: string | null;
  offer_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  discount_cents: number;
  created_at: string;
  updated_at: string;
  sales_quote_template_items?: SalesQuoteTemplateItem[];
}

export interface SalesQuoteTemplateItem {
  id: string;
  template_id: string;
  line_type: "service" | "product" | "addon_service" | "custom";
  item_id: string | null;
  name: string;
  description: string | null;
  unit_price_cents: number;
  quantity: number;
  is_optional: boolean;
  sort_order: number;
  combo_group: string | null;
  section_title: string | null;
  section_order: number | null;
}

// ─── Commissions ─────────────────────────────────────────────────────────────

export interface BookingSalesAttribution {
  booking_id: string;
  salesperson_id: string;
  attribution_type: string;
  matched_opportunity_id: string | null;
  matched_lead_id: string | null;
  matched_by: string | null;
  created_at: string;
}

export interface BookingSalesCommission {
  booking_id: string;
  salesperson_id: string;
  commission_eur: number;
  computed_at: string;
  breakdown: Record<string, unknown>;
}

// ─── Assignment Settings ─────────────────────────────────────────────────────

export interface SalesInboundAssignmentSetting {
  salesperson_id: string;
  weekly_limit: number;
  priority: number;
  is_active: boolean;
  email_notifications: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  salesperson?: { id: string; first_name: string; last_name: string };
}

// ─── Email Templates ─────────────────────────────────────────────────────────

export interface SalesEmailTemplate {
  id: string;
  slug: string | null;
  category: string;
  description: string | null;
  owner_salesperson_id: string | null;
  name: string;
  subject_template: string;
  body_template: string;
  default_subject: string | null;
  default_body: string | null;
  available_variables: Array<{ key: string; label: string; description?: string }>;
  is_active: boolean;
  is_system: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  // Relations
  email_template_attachments?: SalesEmailTemplateAttachment[];
}

export interface SalesEmailTemplateAttachment {
  id: string;
  template_id: string;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  quote_template_id: string | null;
  created_at: string;
  // Joined relation (optional)
  sales_quote_templates?: SalesQuoteTemplate;
}

// ─── Brand Order Rules ───────────────────────────────────────────────────────

export interface BrandOrderRule {
  id: string;
  brand: string;
  recipient_email: string;
  recipient_name: string | null;
  subject_template: string;
  body_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Offer Order Emails ─────────────────────────────────────────────────────

export interface OfferOrderEmail {
  id: string;
  offer_id: string;
  brand: string;
  outbox_id: string | null;
  status: "pending" | "sent" | "failed";
  created_at: string;
}

// ─── Sales Users ─────────────────────────────────────────────────────────────

export interface SalesUser {
  id: string;
  user_id: string;
  salesperson_id: string;
  created_at: string;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

/** Default offer validity period in days */
export const DEFAULT_OFFER_VALIDITY_DAYS = 30;

// ─── Constants ───────────────────────────────────────────────────────────────

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Uusi",
  called: "Soitettu",
  answered: "Vastasi",
  no_answer: "Ei vastausta",
  not_interested: "Ei kiinnostunut",
  qualified: "Kvalifioitu",
  booked: "Varattu",
  won: "Voitettu",
  lost: "Hävitty",
  do_not_call: "Älä soita",
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-50 text-blue-700 border border-blue-200",
  called: "bg-purple-50 text-purple-700 border border-purple-200",
  answered: "bg-sky-50 text-sky-700 border border-sky-200",
  no_answer: "bg-amber-50 text-amber-700 border border-amber-200",
  not_interested: "bg-gray-50 text-gray-600 border border-gray-200",
  qualified: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  booked: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  won: "bg-accent-muted text-accent-dark border border-accent/30",
  lost: "bg-red-50 text-red-600 border border-red-200",
  do_not_call: "bg-red-100 text-red-800 border border-red-300",
};

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: "Luonnos",
  sent: "Lähetetty",
  accepted: "Hyväksytty",
  expired: "Vanhentunut",
  cancelled: "Peruutettu",
};

export const OFFER_STATUS_COLORS: Record<OfferStatus, string> = {
  draft: "bg-gray-50 text-gray-600 border border-gray-200",
  sent: "bg-blue-50 text-blue-700 border border-blue-200",
  accepted: "bg-accent-muted text-accent-dark border border-accent/30",
  expired: "bg-amber-50 text-amber-700 border border-amber-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
};
