export type BookingPlan = "pieni" | "keski" | "iso";
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type PaymentStatus = "paid" | "unpaid";
export type EmployeeRole = "installer" | "seller" | "admin";
export type InstallerTier = "yrittaja" | "alihankkija" | "palkallinen";

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  notes: string | null;
  company_name: string | null;
  business_id: string | null;
  do_not_contact: boolean;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  customer_id: string;
  booking_number: number;
  plan: BookingPlan | null;
  price_cents: number;
  booking_date: string;
  time_slot: string;
  postal_code: string | null;
  address: string | null;
  notes: string | null;
  inside_notes: string | null;
  status: BookingStatus;
  employee_id: string | null;
  service_id: string | null;
  variant_id: string | null;
  calendar_id: string | null;
  discount_code_id: string | null;
  discount_amount_cents: number;
  duration_minutes: number | null;
  payment_status: PaymentStatus;
  lead_source: string | null;
  page_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_page: string | null;
  opportunity_id: string | null;
  salesperson_id: string | null;
  site_id: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  customer_satisfaction: CustomerSatisfaction | null;
  installer_satisfaction: CustomerSatisfaction | null;
  send_receipt: boolean;
  finalized_at: string | null;
  device_count: number;
  service_label: string | null;
  unit_price_cents: number | null;
  payment_note: string | null;
  created_at: string;
  updated_at: string;
  customers?: Customer;
  employees?: Employee;
  services?: Service;
  service_variants?: ServiceVariant;
  booking_employees?: BookingEmployee[];
  discount_codes?: DiscountCode;
  margin_cents?: number;
}

// ─── Customer Sites ─────────────────────────────────────────────────────────

export interface CustomerSite {
  id: string;
  customer_id: string;
  address: string;
  postal_code: string;
  city: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteFile {
  id: string;
  site_id: string;
  booking_id: string | null;
  filename: string;
  bucket: string;
  path: string;
  file_type: string;
  photo_category: string | null;
  created_at: string;
  created_by_user_id: string | null;
}

export type BookingEmployeeRole = "primary" | "secondary";

export interface BookingEmployee {
  id: string;
  booking_id: string;
  employee_id: string;
  calendar_id: string | null;
  role: BookingEmployeeRole;
  commission_cents: number;
  commission_override_cents: number | null;
  sort_order: number;
  created_at: string;
  employees?: Employee;
}

export interface BookingStatusLog {
  id: string;
  booking_id: string;
  old_status: BookingStatus | null;
  new_status: BookingStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export interface BookingAuditLog {
  id: string;
  booking_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface BookingNote {
  id: string;
  booking_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface CustomerNote {
  id: string;
  customer_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface EmployeeServicePriority {
  id: string;
  employee_id: string;
  service_id: string;
  priority: ServicePriority;
}

export interface Employee {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  postal_code: string | null;
  tukes_number: string | null;
  roles: EmployeeRole[];
  tier: InstallerTier | null;
  salary_cents: number;
  hourly_rate_cents: number;
  contract_weekly_hours: number;
  overtime_multiplier: number;
  contract_commission_cents: number;
  google_calendar_id: string | null;
  ref_code: string | null;
  active: boolean;
  notify_new_job: boolean;
  notify_rescheduled: boolean;
  notify_cancelled: boolean;
  notify_new_lead: boolean;
  can_see_prices: boolean;
  can_reschedule_own_bookings: boolean;
  created_at: string;
  updated_at: string;
  employee_service_priorities?: EmployeeServicePriority[];
}

export interface ServiceArea {
  id: string;
  employee_id: string | null;
  name: string;
  description: string | null;
  postal_codes: string[];
  center_postal: string | null;
  radius_km: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceVariant {
  id: string;
  service_id: string;
  label: string;
  price_cents: number;
  duration_minutes: number;
  material_cost_cents: number;
  commission_yrittaja_cents: number | null;
  commission_alihankkija_cents: number | null;
  sales_commission_cents: number | null;
  secondary_commission_yrittaja_cents: number | null;
  secondary_commission_alihankkija_cents: number | null;
  metadata: Record<string, string>;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VolumePricingTier {
  min_qty: number;
  price_cents: number;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  base_price_cents: number;
  material_cost_cents: number;
  commission_yrittaja_cents: number;
  commission_alihankkija_cents: number;
  sales_commission_cents: number;
  duration_minutes: number;
  transition_minutes: number | null;
  min_scheduling_notice_hours: number;
  max_advance_days: number | null;
  volume_pricing: VolumePricingTier[];
  extra_duration_per_unit_minutes: number | null;
  required_employees: number;
  secondary_commission_yrittaja_cents: number;
  secondary_commission_alihankkija_cents: number;
  category_id: string | null;
  chatbot_enabled: boolean;
  review_sms_template: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
}

export interface EmployeeService {
  id: string;
  employee_id: string;
  service_id: string;
}

export type ServicePriority = "high" | "medium" | "low";

export interface CalendarService {
  id: string;
  calendar_id: string;
  service_id: string;
}

export interface CalendarServiceArea {
  id: string;
  calendar_id: string;
  service_area_id: string;
}

export interface InstallerCalendar {
  id: string;
  employee_id: string;
  service_priorities: Record<string, ServicePriority>;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  calendar_services?: CalendarService[];
  calendar_service_areas?: CalendarServiceArea[];
}

export interface CalendarWeeklySlot {
  id: string;
  calendar_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface CompanySettings {
  id: string;
  default_transition_minutes: number;
  optimization_weight_distance: number;
  optimization_weight_workload: number;
  optimization_weight_route: number;
  review_sms_enabled: boolean;
  review_sms_template: string;
  review_sms_delay_minutes: number;
  review_sms_service_ids: string[];
  cs_auto_archive_system_emails: boolean;
  cs_auto_archive_ai_junk: boolean;
  updated_at: string;
}

export interface CalendarOverride {
  id: string;
  calendar_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  override_type: "available" | "blocked";
  reason: string | null;
  created_at: string;
}

export interface ExtraItem {
  name: string;
  price_cents: number;
  duration_minutes: number;
  material_cost_cents: number;
}

export type CustomerSatisfaction = "happy" | "neutral" | "unhappy";

export type ContractStatus = "draft" | "pending_signature" | "active" | "expiring" | "expired" | "cancelled" | "renewed";
export type ContractFrequency = "once_yearly" | "twice_yearly" | "custom";
export type VisitStatus = "scheduled" | "booking_created" | "completed" | "skipped" | "cancelled";
export type SignatureMethod = "on_site" | "remote_link" | "admin";

export interface ContractTierVolumeStep {
  min_qty: number;
  contract_price_cents: number;
  regular_price_cents: number;
}

export interface ContractDurationTier {
  months: number;
  contract_price_cents: number;
  regular_price_cents: number;
  volume_pricing?: ContractTierVolumeStep[];
}

export interface ContractTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  frequency: ContractFrequency;
  visit_months: number[];
  visit_interval_months: number;
  billing_interval_months: number;
  service_id: string;
  contract_price_cents: number;
  regular_price_cents: number;
  duration_months: number;
  duration_tiers: ContractDurationTier[];
  auto_renew: boolean;
  terms_text: string;
  cancellation_notice_days: number;
  sales_commission_cents: number;
  device_count: number;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  services?: Service;
}

export interface Contract {
  id: string;
  contract_number: number;
  template_id: string;
  customer_id: string;
  service_id: string;
  frequency: ContractFrequency;
  visit_months: number[];
  visit_interval_months: number;
  billing_interval_months: number;
  duration_months: number;
  device_count: number;
  sold_by_employee_id: string | null;
  contract_price_cents: number;
  service_address: string;
  service_postal_code: string;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  cancellation_notice_days: number;
  status: ContractStatus;
  signed_at: string | null;
  signature_data: string | null;
  signature_ip: string | null;
  signed_by_name: string | null;
  signature_method: SignatureMethod | null;
  created_by_employee_id: string | null;
  previous_contract_id: string | null;
  renewed_contract_id: string | null;
  pdf_storage_path: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  renewal_discount_percent: number;
  renewal_year: number;
  created_at: string;
  updated_at: string;
  customers?: Customer;
  services?: Service;
  employees?: Employee;
  contract_templates?: ContractTemplate;
}

export interface ContractVisit {
  id: string;
  contract_id: string;
  scheduled_month: number;
  scheduled_year: number;
  visit_status: VisitStatus;
  booking_id: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  bookings?: Booking;
}

export interface ContractStatusLog {
  id: string;
  contract_id: string;
  old_status: ContractStatus | null;
  new_status: ContractStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export type FormSubmissionStatus = "new" | "read" | "handled";

export interface FormSubmission {
  id: string;
  form_slug: string;
  form_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  postal_code: string | null;
  message: string | null;
  page_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrer: string | null;
  landing_page: string | null;
  status: FormSubmissionStatus;
  notes: string | null;
  cs_ticket_id: string | null;
  submission_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // Joined
  contact_forms?: { name: string; category: "support" | "sales" } | null;
}

// ─── Contact Forms & Automations ─────────────────────────────────────────────

export interface ContactFormField {
  id?: string;
  name?: string;
  label: string;
  type: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export interface ContactForm {
  id: string;
  name: string;
  slug: string;
  description?: string;
  fields: ContactFormField[];
  page_urls: string[];
  is_active: boolean;
  form_type?: string;
  category: "support" | "sales";
  notification_enabled: boolean;
  notification_emails: string[];
  submission_count?: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationCondition {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "starts_with" | "in" | "exists";
  value?: string | string[];
}

export type AutomationActionType = "send_email_template" | "send_raw_email" | "create_opportunity";

export interface FormAutomation {
  id: string;
  form_id: string;
  name: string;
  is_active: boolean;
  priority: number;
  conditions: AutomationCondition[];
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  delay_minutes: number;
  created_at: string;
  updated_at: string;
}

export type AutomationQueueStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface FormAutomationQueueItem {
  id: string;
  automation_id: string;
  submission_id: string;
  scheduled_at: string;
  status: AutomationQueueStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  result: unknown;
  processed_at: string | null;
  created_at: string;
  // Joined
  form_automations?: { name: string };
}

export interface FormAutomationLogEntry {
  id: string;
  automation_id: string | null;
  submission_id: string;
  queue_id: string | null;
  action_type: string;
  status: "success" | "failed" | "skipped";
  result: unknown;
  error_message: string | null;
  executed_at: string;
  // Joined
  form_automations?: { name: string; form_id: string };
}

// ─── Employee Commissions ────────────────────────────────────────────────────

export interface EmployeeCommission {
  id: string;
  employee_id: string;
  service_id: string | null;
  addon_service_id: string | null;
  commission_cents: number;
  secondary_commission_cents: number;
  created_at: string;
  updated_at: string;
  services?: Service;
  addon_services?: AddonService;
}

// ─── Palkallinen internal costs (admin-only, inter-company invoicing) ────────
// See migration 20260414000003_palkallinen_internal_costs.sql

export interface PalkallinenInternalCost {
  id: string;
  employee_id: string | null; // null = service/variant/addon default
  service_id: string | null;
  service_variant_id: string | null;
  addon_service_id: string | null;
  internal_cost_cents: number;
  secondary_internal_cost_cents: number;
  created_at: string;
  updated_at: string;
}

export interface BookingEmployeeInternalCost {
  booking_employee_id: string;
  booking_id: string;
  employee_id: string;
  internal_cost_cents: number;
  created_at: string;
  updated_at: string;
}

// ─── Add-on Services ─────────────────────────────────────────────────────────

export interface AddonService {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  material_cost_cents: number;
  duration_minutes: number;
  commission_yrittaja_cents: number | null;
  commission_alihankkija_cents: number | null;
  sales_commission_cents: number | null;
  active: boolean;
  sort_order: number;
  service_category_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddonServiceLink {
  id: string;
  addon_service_id: string;
  service_id: string;
  role: "addon" | "upsell";
  sort_order: number;
  created_at: string;
  addon_services?: AddonService;
  services?: Service;
}

export interface ServiceProductLink {
  service_id: string;
  product_id: string;
  role: "addon" | "upsell";
  sort_order: number;
  products?: Product;
}

// ─── Products ────────────────────────────────────────────────────────────────

export interface SpecField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select";
  options?: string[];
  unit?: string;
  group?: string;
  required?: boolean;
}

export interface ProductCategory {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  spec_schema: SpecField[];
  seo_title: string | null;
  seo_description: string | null;
  hero_image: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children?: ProductCategory[];
}

export const PRODUCT_TAG_OPTIONS = [
  { value: "suositeltu", label: "Suositeltu", color: "bg-accent-muted text-accent-dark border-accent/30" },
  { value: "premium", label: "Premium", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "design", label: "Design", color: "bg-pink-50 text-pink-700 border-pink-200" },
  { value: "edullinen", label: "Edullinen", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "uutuus", label: "Uutuus", color: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "tarjous", label: "Tarjous", color: "bg-amber-50 text-amber-700 border-amber-200" },
] as const;

export type ProductTag = (typeof PRODUCT_TAG_OPTIONS)[number]["value"];

export interface Product {
  id: string;
  category_id: string;
  name: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  cost_cents: number;
  specs: Record<string, string | number | boolean>;
  images: string[];
  tags: string[];
  stock_quantity: number | null;
  stock_low_threshold: number | null;
  show_on_website: boolean;
  is_component?: boolean;
  slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  features: string[] | null;
  long_description: string | null;
  brochure_url: string | null;
  brochure_filename: string | null;
  active: boolean;
  sort_order: number;
  indoor_component_id: string | null;
  outdoor_component_id: string | null;
  /** For multisplit outdoor units: how many indoor units can attach (2..8). NULL = not multisplit. */
  multisplit_ports: number | null;
  created_at: string;
  updated_at: string;
  product_categories?: ProductCategory;
  product_faqs?: ProductFaq[];
}

export interface ProductFaq {
  id: string;
  product_id: string | null;
  category_id: string | null;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export type InventoryMovementType =
  | "inbound"
  | "outbound"
  | "adjustment"
  | "booking_reserve"
  | "booking_cancel";

export const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  inbound: "Sisään",
  outbound: "Ulos",
  adjustment: "Korjaus",
  booking_reserve: "Varaus",
  booking_cancel: "Peruutus",
};

export const MOVEMENT_TYPE_STYLES: Record<InventoryMovementType, string> = {
  inbound: "bg-emerald-50 text-emerald-700 border-emerald-200",
  outbound: "bg-red-50 text-red-700 border-red-200",
  adjustment: "bg-amber-50 text-amber-700 border-amber-200",
  booking_reserve: "bg-blue-50 text-blue-700 border-blue-200",
  booking_cancel: "bg-purple-50 text-purple-700 border-purple-200",
};

export interface InventoryMovement {
  id: string;
  product_id: string;
  quantity: number;
  movement_type: InventoryMovementType;
  reason: string | null;
  booking_id: string | null;
  performed_by: string | null;
  created_at: string;
  products?: Pick<Product, "id" | "name" | "sku" | "brand" | "model" | "images">;
}

// ─── Inventory Units (physical pieces with optional pairing) ────────────────

export type InventoryUnitStatus = "in_stock" | "reserved" | "installed" | "returned";

export const INVENTORY_UNIT_STATUS_LABELS: Record<InventoryUnitStatus, string> = {
  in_stock: "Varastossa",
  reserved: "Varattu",
  installed: "Asennettu",
  returned: "Palautettu",
};

export const INVENTORY_UNIT_STATUS_STYLES: Record<InventoryUnitStatus, string> = {
  in_stock: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reserved: "bg-blue-50 text-blue-700 border-blue-200",
  installed: "bg-slate-100 text-slate-700 border-slate-200",
  returned: "bg-purple-50 text-purple-700 border-purple-200",
};

export interface InventoryUnit {
  id: string;
  product_id: string;
  serial_number: string | null;
  received_at: string;
  status: InventoryUnitStatus;
  pair_id: string | null;
  assigned_booking_id: string | null;
  assigned_installer_id: string | null;
  installation_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  products?: Pick<Product, "id" | "name" | "sku" | "brand" | "model" | "images" | "indoor_component_id" | "outdoor_component_id">;
}

// ─── Logistics ──────────────────────────────────────────────────────────────

export type ProductOrderSource = "from_stock" | "single_order" | "batch_order";

export type ProductOrderStatus =
  | "pending"
  | "sourced_from_stock"
  | "order_placed"
  | "order_confirmed"
  | "shipped"
  | "received"
  | "ready_for_pickup"
  | "picked_up"
  | "delivered"
  | "cancelled";

export const PRODUCT_ORDER_STATUS_LABELS: Record<ProductOrderStatus, string> = {
  pending: "Odottaa",
  sourced_from_stock: "Varastosta",
  order_placed: "Tilattu",
  order_confirmed: "Vahvistettu",
  shipped: "Toimitettu",
  received: "Vastaanotettu",
  ready_for_pickup: "Noudettavissa",
  picked_up: "Noudettu",
  delivered: "Toimitettu asiakkaalle",
  cancelled: "Peruutettu",
};

export const PRODUCT_ORDER_STATUS_STYLES: Record<ProductOrderStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  sourced_from_stock: "bg-blue-50 text-blue-700",
  order_placed: "bg-amber-50 text-amber-700",
  order_confirmed: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  received: "bg-teal-50 text-teal-700",
  ready_for_pickup: "bg-orange-50 text-orange-700",
  picked_up: "bg-cyan-50 text-cyan-700",
  delivered: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

export const PRODUCT_ORDER_SOURCE_LABELS: Record<ProductOrderSource, string> = {
  from_stock: "Varasto",
  single_order: "Yksittäistilaus",
  batch_order: "Erätilaus",
};

export type ManufacturerOrderStatus =
  | "draft"
  | "placed"
  | "confirmed"
  | "shipped"
  | "partially_received"
  | "received"
  | "cancelled";

export const MANUFACTURER_ORDER_STATUS_LABELS: Record<ManufacturerOrderStatus, string> = {
  draft: "Luonnos",
  placed: "Tilattu",
  confirmed: "Vahvistettu",
  shipped: "Toimitettu",
  partially_received: "Osittain vast.",
  received: "Vastaanotettu",
  cancelled: "Peruutettu",
};

export const MANUFACTURER_ORDER_STATUS_STYLES: Record<ManufacturerOrderStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  placed: "bg-amber-50 text-amber-700",
  confirmed: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  partially_received: "bg-orange-50 text-orange-700",
  received: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

export interface ManufacturerOrder {
  id: string;
  order_number: number;
  brand: string | null;
  order_type: "single" | "batch";
  status: ManufacturerOrderStatus;
  booking_id: string | null;
  offer_id: string | null;
  outbox_id: string | null;
  gmail_thread_id: string | null;
  placed_at: string | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  expected_delivery: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  manufacturer_order_lines?: ManufacturerOrderLine[];
  bookings?: Pick<Booking, "id" | "booking_number" | "booking_date" | "address" | "status">;
}

export interface ManufacturerOrderLine {
  id: string;
  manufacturer_order_id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number;
  cost_cents: number | null;
  products?: Pick<Product, "id" | "name" | "brand" | "model" | "sku" | "images">;
}

export interface BookingProductOrder {
  id: string;
  booking_id: string;
  booking_line_item_id: string;
  product_id: string;
  quantity: number;
  source: ProductOrderSource | null;
  manufacturer_order_id: string | null;
  status: ProductOrderStatus;
  sourced_at: string | null;
  order_placed_at: string | null;
  order_confirmed_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  ready_for_pickup_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  picked_up_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  products?: Pick<Product, "id" | "name" | "brand" | "model" | "sku" | "images">;
  bookings?: Pick<Booking, "id" | "booking_number" | "booking_date" | "address" | "status"> & {
    customers?: Pick<Customer, "id" | "first_name" | "last_name">;
    employees?: Pick<Employee, "id" | "first_name" | "last_name">;
  };
  manufacturer_orders?: Pick<ManufacturerOrder, "id" | "order_number" | "status" | "expected_delivery">;
}

export type AutoReorderStatus = "suggested" | "approved" | "dismissed";

export interface AutoReorderAlert {
  id: string;
  product_id: string;
  triggered_at: string;
  current_stock: number;
  threshold: number;
  suggested_quantity: number;
  manufacturer_order_id: string | null;
  status: AutoReorderStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  products?: Pick<Product, "id" | "name" | "brand" | "model" | "sku" | "images" | "stock_quantity" | "stock_low_threshold">;
}

// ─── Booking Line Items ──────────────────────────────────────────────────────

export type LineItemType = "service" | "addon_service" | "product" | "custom";

export interface BookingLineItem {
  id: string;
  booking_id: string;
  line_type: LineItemType;
  addon_service_id: string | null;
  product_id: string | null;
  name: string;
  price_cents: number;
  quantity: number;
  duration_minutes: number;
  material_cost_cents: number;
  cost_cents: number;
  commission_cents: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  addon_services?: AddonService;
  products?: Product;
}

// ─── Discount Codes ──────────────────────────────────────────────────────────

// ─── SMS ────────────────────────────────────────────────────────────────────

export interface SmsMessage {
  id: string;
  phone_e164: string;
  direction: "inbound" | "outbound";
  body: string;
  twilio_sid: string | null;
  twilio_status: string | null;
  reference_type: string | null;
  reference_id: string | null;
  customer_id: string | null;
  employee_id: string | null;
  booking_id: string | null;
  sent_by: string | null;
  read_at: string | null;
  error_message: string | null;
  created_at: string;
  customers?: Customer;
  employees?: Employee;
  bookings?: Booking;
  sender?: Employee;
}

export interface SmsConversation {
  phone_e164: string;
  last_message: string;
  last_direction: "inbound" | "outbound";
  last_message_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  unread_count: number;
  total_messages: number;
}

// ─── Work Protocols (Pöytäkirjat) ───────────────────────────────────────────

export interface ProtocolFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "textarea";
  options?: string[];
  required?: boolean;
  default_value?: string | number | boolean;
  unit?: string;
  placeholder?: string;
}

export interface ProtocolSectionDef {
  key: string;
  title: string;
  fields: ProtocolFieldDef[];
  /** When true, the section is hidden in the form and PDF if all fields are empty */
  optional?: boolean;
}

export interface ProtocolTemplate {
  id: string;
  name: string;
  slug: string;
  service_id: string | null;
  sections: ProtocolSectionDef[];
  photo_labels: string[];
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ProtocolStatus = "draft" | "completed";

export interface WorkProtocol {
  id: string;
  booking_id: string;
  template_id: string;
  sequence_number: number;
  field_data: Record<string, string | number | boolean>;
  notes: string | null;
  signature_data: string | null;
  signed_by: string | null;
  customer_signature_data: string | null;
  customer_signed_by: string | null;
  show_technician: boolean;
  status: ProtocolStatus;
  pdf_storage_path: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  protocol_templates?: ProtocolTemplate;
  protocol_photos?: ProtocolPhoto[];
}

export interface ProtocolPhoto {
  id: string;
  protocol_id: string;
  label: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
}

export type DiscountType = "eur" | "percent";

export interface DiscountCode {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_uses: number | null;
  times_used: number;
  expires_at: string | null;
  active: boolean;
  employee_id: string | null;
  commission_cents: number;
  created_at: string;
  updated_at: string;
  employees?: Employee;
}

export interface EmployeeTeam {
  id: string;
  name: string;
  color: string;
  active: boolean;
  created_at: string;
  members?: EmployeeTeamMember[];
}

export interface EmployeeTeamMember {
  team_id: string;
  employee_id: string;
  joined_at: string;
  employees?: Employee;
}

// ─── Heat pumps (curated EPREL comparison catalog) ────────────────────────────
// Schema mirrors the EPREL "Tuoteseloste" / EU 626/2011 product fiche exactly.
// Anything not in the fiche (TOL, Tbiv, COP, refrigerant charge, dimensions,
// pipe lengths, etc.) is intentionally absent — it would be brochure data.
export type HeatPumpCurationStatus = "draft" | "verified" | "archived";

export interface HeatPump {
  id: string;
  created_at: string;
  updated_at: string;

  // Visibility / curation
  visible: boolean;
  display_order: number;
  curation_status: HeatPumpCurationStatus;
  notes: string | null;

  // Identification (fiche)
  brand: string;
  series: string | null;                              // editorial grouping
  marketing_name: string;                             // editorial display label
  search_aliases: string[] | null;                    // alternative names (e.g. cosmetic variants)
  model_identifier: string | null;                    // fiche "Mallitunniste"
  model_indoor: string | null;                        // fiche "Sisäyksikön mallitunniste"
  model_outdoor: string | null;                       // fiche "Ulkoyksikön mallitunniste"
  eprel_registration_number: string | null;
  eprel_url: string | null;
  fiche_pdf_url: string | null;
  thumbnail_url: string | null;
  market_since_date: string | null;                   // fiche "Malli unionin markkinoilla alkaen"

  // Sound (fiche — 4 distinct values)
  sound_indoor_cooling_db: number | null;
  sound_indoor_heating_db: number | null;
  sound_outdoor_cooling_db: number | null;
  sound_outdoor_heating_db: number | null;

  // Refrigerant (fiche)
  refrigerant: string | null;
  refrigerant_gwp: number | null;

  // Cooling (fiche)
  seer: number | null;
  energy_class_cooling: string | null;
  annual_electricity_cooling_kwh: number | null;
  pdesignc_kw: number | null;

  // Heating per climate zone (fiche × Average / Warm / Cold)
  scop_average: number | null;
  scop_warm: number | null;
  scop_cold: number | null;
  energy_class_heating_average: string | null;
  energy_class_heating_warm: string | null;
  energy_class_heating_cold: string | null;
  annual_electricity_heating_average_kwh: number | null;
  annual_electricity_heating_warm_kwh: number | null;
  annual_electricity_heating_cold_kwh: number | null;
  pdesignh_average_kw: number | null;
  pdesignh_warm_kw: number | null;
  pdesignh_cold_kw: number | null;
  pdh_average_kw: number | null;                      // fiche "Ilmoitettu teho"
  pdh_warm_kw: number | null;
  pdh_cold_kw: number | null;
  elbu_average_kw: number | null;                     // fiche "Varalämmitysteho"
  elbu_warm_kw: number | null;
  elbu_cold_kw: number | null;

  // Lasikiilto editorial (not from fiche)
  our_price_eur: number | null;
  our_product_url: string | null;
  highlight_text: string | null;
}

export type HeatPumpInput = Partial<Omit<HeatPump, "id" | "created_at" | "updated_at">> & {
  brand: string;
  marketing_name: string;
};
