import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useCustomer, useCustomerBookings, useUpdateCustomer, useDeleteCustomer } from "@/hooks/useCustomers";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import { useCustomerContracts } from "@/hooks/useContracts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import {
  formatCents,
  formatDate,
  formatDateTime,
  STATUS_LABELS,
  STATUS_COLORS,
  PLAN_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  FREQUENCY_LABELS,
  formatAddress,
} from "@/lib/utils";
import { inputCls } from "@/lib/constants";
import { ArrowLeft, Plus, Pencil, Save, X, XCircle, Trash2, ThumbsUp, Minus, ThumbsDown, Mail, MessageSquare, Star, StickyNote, FileText, Download, MapPin } from "lucide-react";
import type { CustomerSatisfaction, BookingNote } from "@/lib/types";

interface BookingFeedback {
  id: string;
  booking_id: string;
  token: string;
  rating: "positive" | "neutral" | "negative" | null;
  comment: string | null;
  submitted_at: string | null;
  created_at: string;
}

interface ReviewSmsLog {
  id: string;
  booking_id: string;
  customer_id: string;
  created_at: string;
}

function useCustomerFeedback(bookingIds: string[] | undefined) {
  return useQuery({
    queryKey: ["customer-feedback", bookingIds],
    queryFn: async () => {
      if (!bookingIds || bookingIds.length === 0) return [];
      const { data, error } = await supabase
        .from("booking_feedback")
        .select("id, booking_id, token, rating, comment, submitted_at, created_at")
        .in("booking_id", bookingIds)
        .not("submitted_at", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BookingFeedback[];
    },
    enabled: !!bookingIds && bookingIds.length > 0,
  });
}

function useCustomerBookingNotes(bookingIds: string[] | undefined) {
  return useQuery({
    queryKey: ["customer-booking-notes", bookingIds],
    queryFn: async () => {
      if (!bookingIds || bookingIds.length === 0) return [];
      const { data, error } = await supabase
        .from("booking_notes")
        .select("*")
        .in("booking_id", bookingIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BookingNote[];
    },
    enabled: !!bookingIds && bookingIds.length > 0,
  });
}

function useCustomerReviewSms(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-review-sms", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data, error } = await supabase
        .from("review_sms_log")
        .select("id, booking_id, customer_id, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ReviewSmsLog[];
    },
    enabled: !!customerId,
  });
}

interface CustomerDocument {
  type: "protocol" | "receipt" | "contract";
  label: string;
  bookingNumber: number | null;
  date: string;
  storageBucket: string;
  storagePath: string;
}

function useCustomerDocuments(bookingIds: string[] | undefined) {
  return useQuery({
    queryKey: ["customer-documents", bookingIds],
    queryFn: async () => {
      if (!bookingIds || bookingIds.length === 0) return [];
      const docs: CustomerDocument[] = [];

      // Fetch completed protocols (with or without PDF)
      const { data: protocols } = await supabase
        .from("work_protocols")
        .select("id, booking_id, pdf_storage_path, completed_at, status")
        .in("booking_id", bookingIds)
        .eq("status", "completed");

      // Fetch booking numbers for protocols
      if (protocols && protocols.length > 0) {
        const bIds = protocols.map((p) => p.booking_id);
        const { data: bookings } = await supabase
          .from("bookings")
          .select("id, booking_number")
          .in("id", bIds);
        const bnMap = new Map((bookings || []).map((b) => [b.id, b.booking_number]));

        for (const p of protocols) {
          docs.push({
            type: "protocol",
            label: `Pöytäkirja #${bnMap.get(p.booking_id) || ""}`,
            bookingNumber: bnMap.get(p.booking_id) || null,
            date: p.completed_at || "",
            storageBucket: "protocol-files",
            storagePath: p.pdf_storage_path || "",
          });
        }
      }

      return docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
    enabled: !!bookingIds && bookingIds.length > 0,
  });
}

const SATISFACTION_ICON: Record<CustomerSatisfaction, { icon: typeof ThumbsUp; color: string; label: string }> = {
  happy: { icon: ThumbsUp, color: "text-green-600", label: "Erinomainen" },
  neutral: { icon: Minus, color: "text-yellow-600", label: "Ok" },
  unhappy: { icon: ThumbsDown, color: "text-red-500", label: "Huono" },
};

const RATING_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  positive: { color: "text-green-700", bg: "bg-green-100", label: "Positiivinen" },
  neutral: { color: "text-yellow-700", bg: "bg-yellow-100", label: "Neutraali" },
  negative: { color: "text-red-700", bg: "bg-red-100", label: "Negatiivinen" },
};

const labelCls = "text-text-muted text-xs uppercase tracking-wide mb-1";

interface EditForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  postal_code: string;
  notes: string;
  do_not_contact: boolean;
}

function DeleteCustomerButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const deleteCustomer = useDeleteCustomer();

  return (
    <button
      onClick={async () => {
        if (!await confirm({ message: `Haluatko varmasti poistaa asiakkaan "${customerName}"? Tätä ei voi perua.`, confirmLabel: "Poista", variant: "danger" })) return;
        await deleteCustomer.mutateAsync(customerId);
        navigate("/asiakkaat");
        toast("Asiakas poistettu");
      }}
      disabled={deleteCustomer.isPending}
      className="inline-flex items-center gap-2 px-3 py-2 border border-red-200 text-red-500 rounded-xl text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
      Poista
    </button>
  );
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading } = useCustomer(id);
  const { data: bookings } = useCustomerBookings(id);
  const { data: contracts } = useCustomerContracts(id);
  const bookingIds = useMemo(() => bookings?.map((b) => b.id), [bookings]);
  const { data: feedbacks } = useCustomerFeedback(bookingIds);
  const { data: reviewSmsLogs } = useCustomerReviewSms(id);
  const { data: allBookingNotes } = useCustomerBookingNotes(bookingIds);
  const { data: documents } = useCustomerDocuments(bookingIds);
  const { data: sites = [] } = useQuery({
    queryKey: ["customer-sites", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_sites")
        .select("*, site_files(id, filename, bucket, path, photo_category)")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as { id: string; address: string; postal_code: string; city: string | null; label: string | null; created_at: string; site_files: { id: string; filename: string; bucket: string; path: string; photo_category: string | null }[] }[];
    },
  });
  const updateCustomer = useUpdateCustomer();
  const toast = useToast();

  // Build feedback map: booking_id -> feedback (only submitted ones)
  const feedbackMap = useMemo(() => {
    const map = new Map<string, BookingFeedback>();
    if (feedbacks) {
      for (const f of feedbacks) {
        if (!map.has(f.booking_id)) map.set(f.booking_id, f);
      }
    }
    return map;
  }, [feedbacks]);

  // Build SMS sent map: booking_id -> true
  const smsSentMap = useMemo(() => {
    const set = new Set<string>();
    if (reviewSmsLogs) {
      for (const log of reviewSmsLogs) set.add(log.booking_id);
    }
    return set;
  }, [reviewSmsLogs]);

  // Satisfaction summary
  const satisfactionSummary = useMemo(() => {
    if (!bookings) return null;
    const completed = bookings.filter((b) => b.status === "completed");
    if (completed.length === 0) return null;
    const withSat = completed.filter((b) => b.customer_satisfaction);
    const happy = withSat.filter((b) => b.customer_satisfaction === "happy").length;
    const neutral = withSat.filter((b) => b.customer_satisfaction === "neutral").length;
    const unhappy = withSat.filter((b) => b.customer_satisfaction === "unhappy").length;
    const smsSent = reviewSmsLogs?.length || 0;
    const feedbackAnswered = feedbacks?.length || 0;
    return { total: completed.length, withSat: withSat.length, happy, neutral, unhappy, smsSent, feedbackAnswered };
  }, [bookings, feedbacks, reviewSmsLogs]);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    postal_code: "",
    notes: "",
    do_not_contact: false,
  });

  function startEditing() {
    if (!customer) return;
    setForm({
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone || "",
      address: customer.address || "",
      postal_code: customer.postal_code || "",
      notes: customer.notes || "",
      do_not_contact: customer.do_not_contact ?? false,
    });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  async function handleSave() {
    if (!customer) return;
    try {
      await updateCustomer.mutateAsync({
        id: customer.id,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || null,
        address: form.address || null,
        postal_code: form.postal_code || null,
        notes: form.notes || null,
        do_not_contact: form.do_not_contact,
      });
      toast("Asiakastiedot päivitetty", "success");
      setEditing(false);
    } catch {
      toast("Tallennus epäonnistui", "error");
    }
  }

  function updateField(field: keyof EditForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-6 bg-border rounded w-32" />
      <div className="h-48 bg-surface rounded-2xl" />
    </div>;
  }

  if (!customer) {
    return <p className="text-text-muted">Asiakasta ei löytynyt</p>;
  }

  return (
    <div>
      <Link to="/asiakkaat" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />
        Takaisin
      </Link>

      <h1 className="text-xl sm:text-2xl font-bold text-text-primary mb-6">
        {customer.first_name} {customer.last_name}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Customer info */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-6">
          <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-text-primary">Yhteystiedot</h2>
            <div className="flex items-center gap-1">
              {!editing && (
                <button
                  onClick={startEditing}
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent-dark hover:bg-accent-muted transition-colors"
                  title="Muokkaa"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <DeleteCustomerButton customerId={id!} customerName={`${customer.first_name} ${customer.last_name}`} />
            </div>
          </div>

          {editing ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={labelCls}>Etunimi</p>
                  <input
                    className={inputCls}
                    value={form.first_name}
                    onChange={(e) => updateField("first_name", e.target.value)}
                  />
                </div>
                <div>
                  <p className={labelCls}>Sukunimi</p>
                  <input
                    className={inputCls}
                    value={form.last_name}
                    onChange={(e) => updateField("last_name", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <p className={labelCls}>Sähköposti</p>
                <input
                  type="email"
                  className={inputCls}
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                />
              </div>
              <div>
                <p className={labelCls}>Puhelin</p>
                <input
                  type="tel"
                  className={inputCls}
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                />
              </div>
              <div>
                <p className={labelCls}>Osoite</p>
                <input
                  className={inputCls}
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                />
              </div>
              <div>
                <p className={labelCls}>Postinumero</p>
                <input
                  className={inputCls}
                  value={form.postal_code}
                  onChange={(e) => updateField("postal_code", e.target.value)}
                />
              </div>
              <div>
                <p className={labelCls}>Muistiinpanot</p>
                <textarea
                  className={inputCls + " min-h-[80px] resize-y"}
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none py-1">
                <input
                  type="checkbox"
                  checked={form.do_not_contact}
                  onChange={(e) => setForm((prev) => ({ ...prev, do_not_contact: e.target.checked }))}
                  className="w-4 h-4 rounded border-border text-red-500 focus:ring-red-500"
                />
                <span className="text-sm text-red-600 font-medium">Älä ota yhteyttä (estää automaattiset viestit)</span>
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={updateCustomer.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-dark transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {updateCustomer.isPending ? "Tallennetaan..." : "Tallenna"}
                </button>
                <button
                  onClick={cancelEditing}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                >
                  <X className="w-4 h-4" />
                  Peruuta
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <p className={labelCls}>Sähköposti</p>
                <p className="font-medium text-text-primary">{customer.email}</p>
              </div>
              <div>
                <p className={labelCls}>Puhelin</p>
                <p className="font-medium text-text-primary">{customer.phone || "-"}</p>
              </div>
              <div>
                <p className={labelCls}>Osoite</p>
                <p className="font-medium text-text-primary">{customer.address || "-"}</p>
              </div>
              <div>
                <p className={labelCls}>Postinumero</p>
                <p className="font-medium text-text-primary">{customer.postal_code || "-"}</p>
              </div>
              <div>
                <p className={labelCls}>Asiakas luotu</p>
                <p className="font-medium text-text-primary">{formatDateTime(customer.created_at)}</p>
              </div>
              {customer.notes && (
                <div>
                  <p className={labelCls}>Muistiinpanot</p>
                  <p className="text-text-primary">{customer.notes}</p>
                </div>
              )}
              {customer.do_not_contact && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-xs font-medium text-red-600">Älä ota yhteyttä — automaattiset viestit estetty</span>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Sites / Kohteet */}
          {sites.length > 0 && (
            <div>
              <h2 className="font-semibold text-text-primary mb-3">Kohteet</h2>
              <div className="space-y-2">
                {sites.map((site) => {
                  const siteBookings = (bookings || []).filter((b) => b.site_id === site.id);
                  return (
                    <div key={site.id} className="p-3 rounded-xl border border-border bg-surface-hover/30">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary">
                            {formatAddress(site.address, site.postal_code, site.city)}
                          </p>
                          {site.label && <p className="text-xs text-accent-dark">{site.label}</p>}
                          {siteBookings.length > 0 && (
                            <p className="text-[11px] text-text-muted mt-0.5">
                              {siteBookings.length} {siteBookings.length === 1 ? "varaus" : "varausta"}
                              {site.site_files.length > 0 && ` · ${site.site_files.length} tiedostoa`}
                            </p>
                          )}
                          {/* Site photos thumbnail strip */}
                          {(() => {
                            const images = site.site_files.filter((f) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));
                            if (images.length === 0) return null;
                            return (
                              <div className="flex gap-1.5 mt-2 overflow-x-auto">
                                {images.slice(0, 6).map((f) => {
                                  const url = supabase.storage.from(f.bucket).getPublicUrl(f.path).data?.publicUrl;
                                  return (
                                    <a key={f.id} href={url || undefined} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-lg overflow-hidden border border-border shrink-0 hover:ring-2 hover:ring-accent/30 transition-all">
                                      <img src={url || ""} alt="" className="w-full h-full object-cover" />
                                    </a>
                                  );
                                })}
                                {images.length > 6 && <span className="text-[10px] text-text-muted self-center ml-1">+{images.length - 6}</span>}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Satisfaction & feedback summary */}
          {satisfactionSummary && (
            <div>
              <h2 className="font-semibold text-text-primary mb-3">Tyytyväisyys & palautteet</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-surface-hover/50">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Asentajan arvio</p>
                  {satisfactionSummary.withSat > 0 ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-green-600 font-bold text-sm">{satisfactionSummary.happy}</span>
                      <ThumbsUp className="w-3 h-3 text-green-600" />
                      {satisfactionSummary.neutral > 0 && (
                        <>
                          <span className="text-yellow-600 font-bold text-sm">{satisfactionSummary.neutral}</span>
                          <Minus className="w-3 h-3 text-yellow-600" />
                        </>
                      )}
                      {satisfactionSummary.unhappy > 0 && (
                        <>
                          <span className="text-red-500 font-bold text-sm">{satisfactionSummary.unhappy}</span>
                          <ThumbsDown className="w-3 h-3 text-red-500" />
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted mt-1">Ei arvioita</p>
                  )}
                </div>
                <div className="p-2.5 rounded-xl bg-surface-hover/50">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Arvostelukutsut (SMS)</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Mail className="w-3 h-3 text-text-muted" />
                    <span className="text-sm font-bold text-text-primary">{satisfactionSummary.smsSent}</span>
                    <span className="text-[10px] text-text-muted">lähetetty</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <MessageSquare className="w-3 h-3 text-text-muted" />
                    <span className="text-sm font-bold text-text-primary">{satisfactionSummary.feedbackAnswered}</span>
                    <span className="text-[10px] text-text-muted">vastattu</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contracts section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-text-primary">Sopimukset</h2>
              <Link
                to={`/sopimukset/uusi`}
                className="p-1.5 rounded-lg text-text-muted hover:text-accent-dark hover:bg-accent-muted transition-colors"
                title="Luo sopimus"
              >
                <Plus className="w-4 h-4" />
              </Link>
            </div>
            {!contracts || contracts.length === 0 ? (
              <p className="text-sm text-text-muted">Ei sopimuksia</p>
            ) : (
              <div className="space-y-2">
                {contracts.map((c) => (
                  <Link
                    key={c.id}
                    to={`/sopimukset/${c.contract_number}`}
                    className="block p-3 rounded-xl border border-border hover:border-accent/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-text-primary">#{c.contract_number}</span>
                      <Badge className={CONTRACT_STATUS_COLORS[c.status] + " text-[10px] px-2 py-0.5"}>
                        {CONTRACT_STATUS_LABELS[c.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-muted">
                      {c.contract_templates?.name || FREQUENCY_LABELS[c.frequency]} · {formatCents(c.contract_price_cents)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Documents */}
        {documents && documents.length > 0 && (
          <div className="lg:col-span-2 bg-surface rounded-2xl border border-border">
            <div className="px-6 py-5 border-b border-border flex items-center gap-2">
              <FileText className="w-4 h-4 text-text-muted" />
              <h2 className="font-semibold text-text-primary">
                Tiedostot ({documents.length})
              </h2>
            </div>
            <div className="divide-y divide-border">
              {documents.map((doc, idx) => (
                <div key={idx} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent-muted">
                      <FileText className="w-4 h-4 text-accent-dark" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{doc.label}</p>
                      <p className="text-xs text-text-muted">{doc.date ? formatDate(doc.date.split("T")[0]) : ""}</p>
                    </div>
                  </div>
                  {doc.storagePath ? (
                    <button
                      onClick={async () => {
                        const { data } = await supabase.storage
                          .from(doc.storageBucket)
                          .createSignedUrl(doc.storagePath, 60);
                        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Avaa
                    </button>
                  ) : (
                    <span className="text-xs text-text-muted">PDF puuttuu — avaa varaus ja lataa PDF</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Booking notes across all bookings */}
        {allBookingNotes && allBookingNotes.length > 0 && (
          <div className="lg:col-span-2 bg-surface rounded-2xl border border-border">
            <div className="px-6 py-5 border-b border-border flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-text-muted" />
              <h2 className="font-semibold text-text-primary">
                Muistiinpanot ({allBookingNotes.length})
              </h2>
            </div>
            <div className="divide-y divide-border">
              {allBookingNotes.map((note) => {
                const noteBooking = bookings?.find((b) => b.id === note.booking_id);
                return (
                  <div key={note.id} className="px-6 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      {noteBooking && (
                        <Link
                          to={`/varaukset/${noteBooking.booking_number}`}
                          className="text-[10px] font-medium text-accent hover:underline"
                        >
                          #{noteBooking.booking_number}
                        </Link>
                      )}
                      <span className="text-[10px] text-text-muted">
                        {formatDateTime(note.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{note.content}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Booking history */}
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-border">
          <div className="px-6 py-5 border-b border-border">
            <h2 className="font-semibold text-text-primary">
              Varaushistoria ({bookings?.length || 0})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {!bookings || bookings.length === 0 ? (
              <p className="p-6 text-sm text-text-muted">Ei varauksia</p>
            ) : (
              bookings.map((b) => {
                const fb = feedbackMap.get(b.id);
                const smsSent = smsSentMap.has(b.id);
                const sat = b.customer_satisfaction ? SATISFACTION_ICON[b.customer_satisfaction] : null;
                return (
                  <Link
                    key={b.id}
                    to={`/varaukset/${b.booking_number}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 hover:bg-surface-hover transition-colors gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-text-primary">
                        {formatDate(b.booking_date)} klo {b.time_slot}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5 truncate">
                        {b.services?.name || (b.plan && PLAN_LABELS[b.plan]) || "–"} — {b.address}
                      </p>
                      {/* Satisfaction & feedback row */}
                      {(sat || fb || smsSent) && (
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {sat && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${sat.color}`}>
                              <sat.icon className="w-3 h-3" />
                              {sat.label}
                            </span>
                          )}
                          {fb ? (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${RATING_STYLE[fb.rating || ""]?.color || "text-text-muted"}`}>
                              <Star className="w-3 h-3" />
                              <span className={`px-1.5 py-0.5 rounded-full ${RATING_STYLE[fb.rating || ""]?.bg || ""} ${RATING_STYLE[fb.rating || ""]?.color || ""}`}>
                                {RATING_STYLE[fb.rating || ""]?.label || "Vastattu"}
                              </span>
                              {fb.comment && <span className="text-text-muted ml-1">"{fb.comment.slice(0, 40)}{fb.comment.length > 40 ? "..." : ""}"</span>}
                            </span>
                          ) : smsSent ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600">
                              <Mail className="w-3 h-3" />
                              SMS lähetetty, ei vastausta
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge className={STATUS_COLORS[b.status]}>
                        {STATUS_LABELS[b.status]}
                      </Badge>
                      <span className="text-sm font-bold text-text-primary">
                        {formatCents(b.price_cents)}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
