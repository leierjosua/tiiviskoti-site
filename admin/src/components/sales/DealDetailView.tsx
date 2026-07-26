import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Phone, Mail, MapPin, Save, FileText, CalendarPlus,
  Bell, MessageSquare, Send, Paperclip, ImagePlus, Camera,
  Tag, ChevronDown, RefreshCw, UserPlus, X, Pencil, Trash2, Check,
  PhoneCall, MailOpen, ArrowRightLeft, CheckCircle, XCircle, Copy, Merge,
  Calendar, Download, Eye, EyeOff, HardHat,
} from "lucide-react";
import { useSalesOpportunity, useUpdateOpportunity, useDeleteOpportunity, useOpportunityNotes, useCreateOpportunityNote, useUpdateOpportunityNote, useDeleteOpportunityNote, useOpportunityEvents, useDuplicateOpportunities, useMergeOpportunities } from "@/hooks/sales/useSalesOpportunities";
import { useOpportunityStages } from "@/hooks/sales/useSalesStages";
import { useOffersByOpportunity } from "@/hooks/sales/useSalesOffers";
import { useSalesTags } from "@/hooks/sales/useSalesTags";
import { useEmployees } from "@/hooks/useEmployees";
import { OfferStatusBadge } from "./SalesStatusBadge";
import { OfferOrderStatusBadge } from "./OfferOrderStatusBadge";
import { BookFromOfferPanel } from "./BookFromOfferPanel";
import { formatDateTime } from "@/lib/utils";
import { postalCity, LEAD_SOURCE_LABELS } from "@/lib/utils";
import { inputCls, selectCls } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useEmailsByOpportunity, emailToColor } from "@/hooks/sales/useSalesEmails";
import MessageAttachments from "@/components/email/MessageAttachments";
import EmailBodyWithCid from "@/components/email/EmailBodyWithCid";
import { COMPANY_EMAIL } from "@/lib/email-styles";
import ComposeModal from "@/components/email/ComposeModal";
import type { ComposeState } from "@/components/email/ComposeModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useStorageUrls } from "@/lib/storage";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesOpportunityFile } from "@/lib/sales-types";
import { InstallPlanTab } from "./InstallPlanTab";

type Tab = "timeline" | "notes" | "files" | "emails" | "install_plan";

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Puhelin",
  contact_form: "Yhteydenottolomake",
  door_to_door: "Ovelta ovelle",
  email: "Sähköposti",
  other: "Muu",
  manual: "Manuaalinen",
  // Legacy values (old deals)
  website: "Verkkosivut",
  referral: "Suosittelu",
  social: "Some",
  event: "Tapahtuma",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manuaalinen",
  csv_import: "CSV-tuonti",
  form: "Lomake",
  ...LEAD_SOURCE_LABELS,
};

interface DealDetailViewProps {
  id: string;
  backPath: string;
  quotePath: (oppId: string) => string;
  offerWizardPath: (oppId: string) => string;
  bookTimePath: (oppId: string) => string;
  offerPdfPath: (offerId: string) => string;
  /** If true, show admin-only features like assignment */
  isAdmin?: boolean;
}

export function DealDetailView({ id, backPath, quotePath, offerWizardPath, bookTimePath, offerPdfPath, isAdmin }: DealDetailViewProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const { data: opp, isLoading } = useSalesOpportunity(id);
  const { data: stages = [] } = useOpportunityStages();
  const { data: notes = [] } = useOpportunityNotes(id);
  const { data: events = [] } = useOpportunityEvents(id);
  const { data: offers = [] } = useOffersByOpportunity(id);
  const { data: allTags = [] } = useSalesTags();
  const { data: sellers = [] } = useEmployees("seller");
  const { data: allEmployees = [] } = useEmployees();
  const { data: files = [] } = useQuery({
    queryKey: queryKeys.sales.opportunities.files(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunity_files")
        .select("*")
        .eq("opportunity_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOpportunityFile[];
    },
  });

  const { data: linkedBookings = [] } = useQuery({
    queryKey: ["opportunity-bookings", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_number, booking_date, time_slot, status, services(name)")
        .eq("opportunity_id", id!)
        .order("booking_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d: Record<string, unknown>) => ({
        ...d,
        services: Array.isArray(d.services) ? d.services[0] ?? null : d.services ?? null,
      })) as { id: string; booking_number: string; booking_date: string; time_slot: string; status: string; services: { name: string } | null }[];
    },
  });

  const { data: duplicates = [] } = useDuplicateOpportunities(id, opp?.email_norm, opp?.phone_norm);
  const mergeOpps = useMergeOpportunities();

  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();
  const createNote = useCreateOpportunityNote();
  const updateNoteOpp = useUpdateOpportunityNote();
  const deleteNoteOpp = useDeleteOpportunityNote();

  const [tab, setTab] = useState<Tab>("timeline");
  const [dirty, setDirty] = useState(false);
  const [lossReasonOpen, setLossReasonOpen] = useState(false);
  const [lossReason, setLossReason] = useState("");
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [bookingOfferId, setBookingOfferId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    address: "",
    postcode: "",
    city: "",
    dealValue: "",
  });

  // Sync form from opp
  useEffect(() => {
    if (opp) {
      const parts = (opp.name || "").split(" ");
      setForm({
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ") || "",
        phone: opp.phone || "",
        email: opp.email || "",
        address: opp.address || "",
        postcode: opp.postcode || "",
        city: opp.city || "",
        dealValue: (opp as unknown as Record<string, unknown>).deal_value_cents
          ? String(Number((opp as unknown as Record<string, unknown>).deal_value_cents) / 100)
          : "",
      });
    }
  }, [opp]);

  // Auto-fill city from postcode
  const handlePostcodeChange = useCallback((value: string) => {
    setForm((f) => {
      const updated = { ...f, postcode: value };
      if (value.length >= 2) {
        const city = postalCity(value);
        if (city) updated.city = city;
      }
      return updated;
    });
    setDirty(true);
  }, []);

  function handleFormChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);

    // Auto-save debounce (1.5s)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      doSave({ ...form, [field]: value });
    }, 1500);
  }

  async function doSave(data: typeof form) {
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ");
    await updateOpp.mutateAsync({
      id,
      name: name || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      postcode: data.postcode || null,
      city: data.city || null,
    });
    setDirty(false);
  }

  async function handleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await doSave(form);
    toast("Tallennettu");
  }

  async function handleStageChange(stageKey: string) {
    const stage = stages.find((s) => s.key === stageKey);
    // If moving to a close stage (lost), ask for loss reason
    if (stage?.is_close_stage && stageKey === "havitty") {
      setPendingStage(stageKey);
      setLossReasonOpen(true);
      return;
    }
    await updateOpp.mutateAsync({ id, status: stageKey });
    toast("Vaihe päivitetty");
  }

  async function handleConfirmLoss() {
    if (!pendingStage || !lossReason.trim()) return;
    await updateOpp.mutateAsync({
      id,
      status: pendingStage,
      archived_reason: lossReason || null,
    });
    setLossReasonOpen(false);
    setLossReason("");
    setPendingStage(null);
    toast("Diili merkitty hävityksi");
  }

  async function handleFollowup(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    await updateOpp.mutateAsync({ id, next_followup_at: date.toISOString() });
    toast("Seuranta asetettu");
  }

  async function handleAssign(salespersonId: string) {
    await updateOpp.mutateAsync({ id, assigned_salesperson_id: salespersonId || null });
    toast("Myyjä vaihdettu");
  }

  async function handleToggleTag(tagName: string) {
    const current = opp?.tags_cache || [];
    const updated = current.includes(tagName)
      ? current.filter((t) => t !== tagName)
      : [...current, tagName];

    // Update via the join table
    if (current.includes(tagName)) {
      await supabase.from("sales_opportunity_tags").delete()
        .eq("opportunity_id", id).eq("tag_name", tagName);
    } else {
      await supabase.from("sales_opportunity_tags").insert({ opportunity_id: id, tag_name: tagName });
    }
    // Update cache
    await updateOpp.mutateAsync({ id, tags_cache: updated });
  }

  if (isLoading || !opp) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeStages = stages.filter((s) => s.is_active).sort((a, b) => a.position - b.position);
  const currentIdx = activeStages.findIndex((s) => s.key === opp.status);
  const currentStage = activeStages[currentIdx];

  const daysInStage = opp.updated_at
    ? Math.max(0, Math.floor((Date.now() - new Date(opp.updated_at).getTime()) / 86400000))
    : 0;

  const followupOverdue = opp.next_followup_at && new Date(opp.next_followup_at) < new Date();
  const followupDaysLate = opp.next_followup_at
    ? Math.max(0, Math.floor((Date.now() - new Date(opp.next_followup_at).getTime()) / 86400000))
    : 0;

  const initials = [form.firstName?.[0], form.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const isLost = opp.status === "havitty";
  const isWon = opp.status === "voitettu";
  const assignedSeller = sellers.find((s) => s.id === opp.assigned_salesperson_id);

  const oppTags = opp.tags_cache || [];
  const availableTags = allTags.filter((t) => t.is_active && (t.scope === "opportunity" || t.scope === "both" || !t.scope));
  const lossReasonTags = allTags.filter((t) => t.tag_type === "loss_reason" && t.is_active);

  return (
    <div>
      {/* ─── Loss Reason Modal ─────────────────────────────────────────── */}
      {lossReasonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-sm font-semibold mb-3">Häviösyy</h3>
            <p className="text-xs text-text-muted mb-3">Miksi diili hävittiin?</p>
            {lossReasonTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {lossReasonTags.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setLossReason(t.name)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      lossReason === t.name
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-border text-text-muted hover:border-red-200"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={lossReasonTags.some((t) => t.name === lossReason) ? "" : lossReason}
              onChange={(e) => setLossReason(e.target.value)}
              placeholder="Tai kirjoita vapaamuotoinen syy..."
              rows={2}
              className={`${inputCls} !text-xs resize-none mb-3`}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setLossReasonOpen(false); setPendingStage(null); }} className="px-3 py-1.5 text-xs text-text-muted">
                Peruuta
              </button>
              <button onClick={handleConfirmLoss} disabled={!lossReason.trim()} className="px-4 py-1.5 bg-red-500 text-white rounded-xl text-xs font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                Merkitse hävityksi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-3 mb-4">
        <button onClick={() => navigate(backPath)} className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-lg font-bold truncate">{opp.name || "Nimetön diili"}</h1>
            {opp.channel && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-600 border border-purple-200">
                {CHANNEL_LABELS[opp.channel] || opp.channel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            {opp.phone && <span>{opp.phone}</span>}
            {opp.phone && opp.postcode && <span>·</span>}
            {opp.postcode && <span>{opp.postcode}</span>}
            {assignedSeller && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <UserPlus className="w-3 h-3" />
                  {assignedSeller.first_name} {assignedSeller.last_name}
                </span>
              </>
            )}
          </div>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={updateOpp.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-xl text-xs font-semibold hover:bg-accent/90 shadow-sm shadow-accent/20 transition-all"
          >
            <Save className="w-3.5 h-3.5" /> Tallenna
          </button>
        )}
      </div>

      {/* ─── Lost/Won Banner ─────────────────────────────────────────────── */}
      {isLost && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-700">Diili hävitty</p>
            {opp.archived_reason && <p className="text-[11px] text-red-600 mt-0.5">Syy: {opp.archived_reason}</p>}
          </div>
        </div>
      )}
      {isWon && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-xs font-semibold text-emerald-700">Diili voitettu</p>
        </div>
      )}

      {/* ─── Booking Info Banner ────────────────────────────────────────── */}
      {linkedBookings.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl">
          <div className="flex items-center gap-2 mb-1">
            <CalendarPlus className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-blue-800">
              {linkedBookings.length === 1 ? "Varaus" : `${linkedBookings.length} varausta`}
            </p>
          </div>
          <div className="space-y-1">
            {linkedBookings.map((b) => {
              const dateFi = new Date(b.booking_date + "T00:00:00").toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric", year: "numeric" });
              const isPast = new Date(b.booking_date) < new Date(new Date().toDateString());
              return (
                <button
                  key={b.id}
                  onClick={() => navigate(`/varaukset/${b.booking_number}`)}
                  className="flex items-center gap-2 w-full text-left text-[11px] hover:bg-blue-100 rounded-lg px-1.5 py-1 transition-colors"
                >
                  <span className={`font-semibold ${isPast ? "text-blue-400" : "text-blue-800"}`}>
                    {dateFi} klo {b.time_slot}
                  </span>
                  {b.services?.name && <span className="text-blue-600 truncate">{b.services.name}</span>}
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-medium ${
                    b.status === "confirmed" ? "bg-emerald-100 text-emerald-700" :
                    b.status === "completed" ? "bg-gray-100 text-gray-600" :
                    b.status === "cancelled" ? "bg-red-100 text-red-600" :
                    "bg-blue-100 text-blue-700"
                  }`}>
                    {b.status === "confirmed" ? "Vahvistettu" : b.status === "completed" ? "Valmis" : b.status === "cancelled" ? "Peruutettu" : b.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Book from Offer Panel ──────────────────────────────────────── */}
      {bookingOfferId && (() => {
        const offer = offers.find((o) => o.id === bookingOfferId);
        if (!offer) return null;
        return (
          <BookFromOfferPanel
            offer={offer}
            opportunity={opp}
            onClose={() => setBookingOfferId(null)}
            onSuccess={() => {
              setBookingOfferId(null);
              queryClient.invalidateQueries({ queryKey: queryKeys.sales.offers.byOpportunity(id) });
              queryClient.invalidateQueries({ queryKey: ["opportunity-bookings", id] });
            }}
          />
        );
      })()}

      {/* ─── Duplicate Banner ─────────────────────────────────────────── */}
      {duplicates.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Copy className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-amber-800">
              {duplicates.length} {duplicates.length === 1 ? "muu diili" : "muuta diilia"} samalla sähköpostilla/puhelinnumerolla
            </p>
          </div>
          <div className="space-y-1.5">
            {duplicates.map((dup) => (
              <div key={dup.id} className="flex items-center justify-between gap-2 text-[11px]">
                <button
                  onClick={() => navigate(`/myynti/inbound/${dup.id}`)}
                  className="text-amber-700 hover:text-amber-900 hover:underline truncate text-left"
                >
                  {dup.name || dup.email || dup.phone || "Nimetön"} — {dup.status?.replace(/_/g, " ")} — {new Date(dup.created_at).toLocaleDateString("fi-FI")}
                </button>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Yhdistä diilit",
                      message: `Yhdistetäänkö "${dup.name || dup.email || "Nimetön"}" tähän diiliin? Muistiinpanot, tapahtumat, tarjoukset ja tiedostot siirretään tänne. Toinen diili arkistoidaan.`,
                      confirmLabel: "Yhdistä",
                      variant: "danger",
                    });
                    if (!ok) return;
                    try {
                      await mergeOpps.mutateAsync({ targetId: id, sourceId: dup.id });
                      toast.success("Diilit yhdistetty");
                    } catch {
                      toast.error("Yhdistäminen epäonnistui");
                    }
                  }}
                  disabled={mergeOpps.isPending}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Merge className="w-3 h-3" /> Yhdistä tähän
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Stage Pipeline ────────────────────────────────────────────── */}
      <div className="mb-5">
        {/* Progress track */}
        <div className="relative h-1 bg-border/40 rounded-full mb-3">
          <div
            className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-300"
            style={{ width: `${activeStages.length > 1 ? (currentIdx / (activeStages.length - 1)) * 100 : 0}%` }}
          />
        </div>
        {/* Stage buttons */}
        <div className="flex overflow-x-auto -mx-1 px-1">
          {activeStages.map((stage, i) => {
            const isCurrent = stage.key === opp.status;
            const isPast = i < currentIdx;
            return (
              <button
                key={stage.key}
                onClick={() => handleStageChange(stage.key)}
                className="flex-1 min-w-0 text-left group px-1 first:pl-0 last:pr-0"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  {/* Dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${
                    isCurrent
                      ? "bg-accent ring-4 ring-accent/15"
                      : isPast
                        ? "bg-accent"
                        : "bg-border group-hover:bg-text-muted"
                  }`} />
                  <span className={`text-[11px] font-semibold truncate transition-colors ${
                    isCurrent
                      ? "text-text"
                      : isPast
                        ? "text-text/70"
                        : "text-text-muted group-hover:text-text/60"
                  }`}>
                    {stage.label}
                  </span>
                </div>
                {isCurrent && (
                  <span className="text-[10px] text-accent font-medium pl-3.5">
                    {daysInStage} pv
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Action Buttons ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => navigate(bookTimePath(opp.id))}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-accent text-white rounded-xl text-xs font-semibold hover:bg-accent/90 transition-colors shadow-sm shadow-accent/20"
        >
          <CalendarPlus className="w-3.5 h-3.5" /> Varaa aika
        </button>
        <button
          onClick={() => navigate(offerWizardPath(opp.id))}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-semibold hover:bg-emerald-600 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" /> Tee tarjous
        </button>
      </div>

      {/* ─── Main Layout ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* ─── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <div className="lg:col-span-4 space-y-4">

          {/* Follow-up */}
          <div className={`bg-surface border rounded-2xl p-4 ${followupOverdue ? "border-red-200 bg-red-50/30" : "border-border"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Bell className={`w-3.5 h-3.5 ${followupOverdue ? "text-red-500" : "text-text-muted"}`} />
              <span className="text-xs font-semibold">Seuraava seuranta</span>
              {followupOverdue && (
                <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                  {followupDaysLate} pv myöhässä
                </span>
              )}
            </div>
            {opp.next_followup_at ? (
              <p className={`text-xs font-medium mb-2 ${followupOverdue ? "text-red-600" : ""}`}>
                {formatDateTime(opp.next_followup_at)}
              </p>
            ) : (
              <p className="text-xs text-text-muted mb-2">Ei asetettu</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Huomenna", days: 1 },
                { label: "3 pv", days: 3 },
                { label: "Viikko", days: 7 },
                { label: "2 vk", days: 14 },
              ].map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => handleFollowup(opt.days)}
                  className="px-2.5 py-1 border border-border rounded-lg text-[11px] font-medium text-text-muted hover:text-text hover:border-accent/30 hover:bg-accent/5 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact Card */}
          <div className="bg-surface border border-border rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{opp.name || "Nimetön"}</p>
                {currentStage && (
                  <span
                    className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                    style={{
                      backgroundColor: currentStage.color + "18",
                      color: currentStage.color,
                      borderColor: currentStage.color + "40",
                    }}
                  >
                    {currentStage.label}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Nimi</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input value={form.firstName} onChange={(e) => handleFormChange("firstName", e.target.value)} placeholder="Etunimi" className={`${inputCls} !py-1.5 !text-xs`} />
                  <input value={form.lastName} onChange={(e) => handleFormChange("lastName", e.target.value)} placeholder="Sukunimi" className={`${inputCls} !py-1.5 !text-xs`} />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                  <Phone className="w-3 h-3" /> Puhelin
                </label>
                <input value={form.phone} onChange={(e) => handleFormChange("phone", e.target.value)} className={`${inputCls} !py-1.5 !text-xs mt-1`} />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                  <Mail className="w-3 h-3" /> Sähköposti
                </label>
                <input value={form.email} onChange={(e) => handleFormChange("email", e.target.value)} type="email" className={`${inputCls} !py-1.5 !text-xs mt-1`} />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                  <MapPin className="w-3 h-3" /> Osoite
                </label>
                <input value={form.address} onChange={(e) => handleFormChange("address", e.target.value)} placeholder="Osoite" className={`${inputCls} !py-1.5 !text-xs mt-1`} />
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <input
                    value={form.postcode}
                    onChange={(e) => {
                      handlePostcodeChange(e.target.value);
                      // Trigger auto-save debounce
                      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                      saveTimerRef.current = setTimeout(() => {
                        const pc = e.target.value;
                        const c = pc.length >= 2 ? postalCity(pc) || form.city : form.city;
                        doSave({ ...form, postcode: pc, city: c });
                      }, 1500);
                    }}
                    placeholder="Postinumero"
                    className={`${inputCls} !py-1.5 !text-xs`}
                  />
                  <input value={form.city} onChange={(e) => handleFormChange("city", e.target.value)} placeholder="Kaupunki" className={`${inputCls} !py-1.5 !text-xs`} />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="mt-4">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                <Tag className="w-3 h-3" /> Tagit
              </label>
              <div className="flex flex-wrap gap-1">
                {availableTags.map((tag) => {
                  const selected = oppTags.includes(tag.name);
                  return (
                    <button
                      key={tag.name}
                      onClick={() => handleToggleTag(tag.name)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                        selected
                          ? ""
                          : "opacity-40 hover:opacity-70"
                      }`}
                      style={{
                        backgroundColor: tag.color + (selected ? "20" : "08"),
                        color: tag.color,
                        borderColor: tag.color + (selected ? "50" : "20"),
                      }}
                    >
                      {selected ? tag.name : `+ ${tag.name}`}
                    </button>
                  );
                })}
                {availableTags.length === 0 && oppTags.length === 0 && (
                  <span className="text-[10px] text-text-muted">Ei tageja</span>
                )}
              </div>
            </div>

            {/* Assigned seller */}
            {isAdmin && (sellers.length > 0 || opp.assigned_salesperson_id) && (
              <div className="mt-4">
                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">
                  <UserPlus className="w-3 h-3" /> Vastuumyyjä
                </label>
                <select
                  value={opp.assigned_salesperson_id || ""}
                  onChange={(e) => handleAssign(e.target.value)}
                  className={`${selectCls} !py-1.5 !text-xs`}
                >
                  <option value="">Ei valittu</option>
                  {sellers.filter((s) => s.active !== false).map((s) => (
                    <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                  ))}
                  {opp.assigned_salesperson_id && !sellers.find((s) => s.id === opp.assigned_salesperson_id) && (() => {
                    const emp = allEmployees.find((e) => e.id === opp.assigned_salesperson_id);
                    return emp ? <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option> : null;
                  })()}
                </select>
              </div>
            )}
          </div>

          {/* Offers */}
          <div className="bg-surface border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Tarjoukset</h3>
              <button
                onClick={() => navigate(quotePath(opp.id))}
                className="text-[10px] text-accent font-semibold hover:underline"
              >
                + Uusi
              </button>
            </div>
            {offers.length === 0 ? (
              <p className="text-xs text-text-muted py-2">Ei tarjouksia</p>
            ) : (
              <div className="space-y-1.5">
                {offers.map((offer) => {
                  const isLocked = offer.status === "accepted";
                  return (
                    <div
                      key={offer.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-border text-xs"
                    >
                      <button
                        onClick={() => navigate(`${quotePath(opp.id)}?offerId=${offer.id}`)}
                        className="flex-1 min-w-0 text-left flex items-center gap-2"
                        title={isLocked ? "Tarjous hyväksytty — muokkaus lukittu" : "Muokkaa tarjousta"}
                      >
                        <span className="font-medium truncate">{offer.title || `#${offer.offer_number || "–"}`}</span>
                        <span className="font-semibold flex-shrink-0">{Number(offer.total).toFixed(0)} €</span>
                        <OfferStatusBadge status={offer.status} />
                        {offer.status === "accepted" && <OfferOrderStatusBadge offerId={offer.id} />}
                      </button>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {!isLocked && (
                          <button
                            onClick={() => setBookingOfferId(offer.id)}
                            className="p-1.5 rounded-lg hover:bg-muted/40 text-text-muted hover:text-accent transition-colors"
                            title="Tee varaus"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => navigate(offerPdfPath(offer.id))}
                          className="p-1.5 rounded-lg hover:bg-muted/40 text-text-muted hover:text-accent transition-colors"
                          title="Avaa PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="bg-surface border border-border rounded-2xl p-4 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-text-muted">Luotu</span>
              <span>{formatDateTime(opp.created_at)}</span>
            </div>
            {opp.last_contact_at && (
              <div className="flex justify-between">
                <span className="text-text-muted">Viim. kontakti</span>
                <span>{formatDateTime(opp.last_contact_at)}</span>
              </div>
            )}
            {opp.channel && (
              <div className="flex justify-between">
                <span className="text-text-muted">Kanava</span>
                <span>{CHANNEL_LABELS[opp.channel] || opp.channel}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-muted">Lähde</span>
              <span>{SOURCE_LABELS[opp.external_source] || opp.external_source}</span>
            </div>
          </div>

        </div>

        {/* ─── RIGHT CONTENT ─────────────────────────────────────────────── */}
        <div className="lg:col-span-8">
          <div className="flex gap-0 border-b border-border mb-4 overflow-x-auto -mx-1 px-1">
            {([
              { key: "timeline", label: "Aikajana" },
              { key: "notes", label: "Muistiinpanot" },
              { key: "files", label: "Tiedostot" },
              { key: "install_plan", label: "Asennussuunnitelma" },
              { key: "emails", label: "Sähköpostit" },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 sm:px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? "border-accent text-accent"
                    : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                {t.label}
                {t.key === "files" && files.length > 0 && (
                  <span className="ml-1.5 text-[10px] bg-muted rounded-full px-1.5 py-0.5">{files.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Customer message from form submission — prominent placement */}
          {!!opp.source_payload?.message && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageSquare className="w-4 h-4 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800 mb-1">
                  Asiakkaan viesti
                  {!!opp.source_payload.form_slug && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                      {String(opp.source_payload.form_slug)}
                    </span>
                  )}
                </p>
                <p className="text-sm text-amber-900 whitespace-pre-wrap">{String(opp.source_payload.message)}</p>
              </div>
            </div>
          )}

          <div className="bg-surface border border-border rounded-2xl p-4">
            {tab === "timeline" && (
              <TimelineTab notes={notes} events={events} onAddNote={(body) => createNote.mutate({ opportunity_id: id, body })} onUpdateNote={(nid, body) => updateNoteOpp.mutate({ id: nid, body, oppId: id })} onDeleteNote={(nid) => deleteNoteOpp.mutate({ id: nid, oppId: id })} onToggleShowToInstaller={(nid, val) => updateNoteOpp.mutate({ id: nid, oppId: id, show_to_installer: val })} isPending={createNote.isPending} />
            )}
            {tab === "notes" && (
              <NotesTab notes={notes} onAddNote={(body) => createNote.mutate({ opportunity_id: id, body })} onUpdateNote={(nid, body) => updateNoteOpp.mutate({ id: nid, body, oppId: id })} onDeleteNote={(nid) => deleteNoteOpp.mutate({ id: nid, oppId: id })} onToggleShowToInstaller={(nid, val) => updateNoteOpp.mutate({ id: nid, oppId: id, show_to_installer: val })} isPending={createNote.isPending} />
            )}
            {tab === "files" && (
              <FilesTab files={files} opportunityId={id} />
            )}
            {tab === "install_plan" && opp && (
              <InstallPlanTab opportunity={opp} files={files} />
            )}
            {tab === "emails" && (
              <DealEmailsTab
                opportunityId={id}
                customerEmail={opp?.email_norm ?? undefined}
                customerName={opp?.name ?? undefined}
                seller={assignedSeller}
              />
            )}
          </div>
        </div>
      </div>

      {/* Admin delete — small, at the bottom */}
      {isAdmin && (
        <div className="mt-8 pt-4 border-t border-border/50 flex justify-end">
          <button
            onClick={async () => {
              if (!await confirm({ message: `Haluatko varmasti poistaa liidin "${opp.name || "Nimetön"}"? Kaikki liidiin liittyvä data poistetaan pysyvästi.`, confirmLabel: "Poista pysyvästi", variant: "danger" })) return;
              await deleteOpp.mutateAsync(opp.id);
              navigate(backPath);
              toast("Liidi poistettu");
            }}
            className="text-[11px] text-text-muted hover:text-red-500 transition-colors"
          >
            Poista liidi
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Timeline Tab ────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, React.ElementType> = {
  status_change: ArrowRightLeft,
  call: PhoneCall,
  email_sent: MailOpen,
  assignment: UserPlus,
  offer_created: FileText,
  offer_sent: Send,
  offer_accepted: CheckCircle,
  note_added: MessageSquare,
};

function TimelineTab({ notes, events, onAddNote, onUpdateNote, onDeleteNote, onToggleShowToInstaller, isPending }: {
  notes: Array<{ id: string; body: string; created_at: string; show_to_installer?: boolean }>;
  events: Array<{ id: string; type: string; payload: Record<string, unknown>; created_at: string }>;
  onAddNote: (body: string) => void;
  onUpdateNote?: (id: string, body: string) => void;
  onDeleteNote?: (id: string) => void;
  onToggleShowToInstaller?: (id: string, value: boolean) => void;
  isPending: boolean;
}) {
  const [body, setBody] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const combined = useMemo(() => [
    ...notes.map((n) => ({ id: n.id, body: n.body, created_at: n.created_at, kind: "note" as const, eventType: "note_added", show_to_installer: n.show_to_installer ?? false })),
    ...events.map((e) => ({ id: e.id, body: fmtEvent(e), created_at: e.created_at, kind: "event" as const, eventType: e.type, show_to_installer: false })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [notes, events]);

  const visible = showAll ? combined : combined.slice(0, 8);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    onAddNote(body.trim());
    setBody("");
  }

  function saveEdit() {
    if (!editingId || !editBody.trim() || !onUpdateNote) return;
    onUpdateNote(editingId, editBody.trim());
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Lisää muistiinpano..."
          className="flex-1 px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button type="submit" disabled={!body.trim() || isPending} className="px-3 py-2 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </form>

      <div className="space-y-0">
        {visible.map((item) => {
          const IconComp = EVENT_ICONS[item.eventType] || RefreshCw;
          const isNote = item.kind === "note";
          return (
            <div key={item.id} className="flex gap-3 py-3 border-b border-border/50 last:border-b-0 group">
              <div className="mt-0.5 flex-shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  isNote ? "bg-accent/10" : "bg-muted"
                }`}>
                  <IconComp className={`w-3.5 h-3.5 ${isNote ? "text-accent" : "text-text-muted"}`} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text-muted mb-0.5">{formatDateTime(item.created_at)}</p>
                {editingId === item.id ? (
                  <div className="flex gap-1.5">
                    <input
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                      className="flex-1 px-2 py-1 border border-accent/40 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                      autoFocus
                    />
                    <button onClick={saveEdit} className="p-1 text-accent hover:text-accent-dark"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-text-muted hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm ${!isNote ? "text-text-muted italic" : ""}`}>{item.body}</p>
                    {isNote && item.show_to_installer && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
                        <HardHat className="w-2.5 h-2.5" /> näkyy asentajalle
                      </span>
                    )}
                  </div>
                )}
              </div>
              {isNote && editingId !== item.id && (onUpdateNote || onDeleteNote || onToggleShowToInstaller) && (
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-center">
                  {onToggleShowToInstaller && (
                    <button
                      onClick={() => onToggleShowToInstaller(item.id, !item.show_to_installer)}
                      className={`p-1 transition-colors ${item.show_to_installer ? "text-amber-700 hover:text-amber-900" : "text-text-muted hover:text-amber-700"}`}
                      title={item.show_to_installer ? "Piilota asentajalta" : "Näytä asentajalle"}
                    >
                      {item.show_to_installer ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                  )}
                  {onUpdateNote && (
                    <button onClick={() => { setEditingId(item.id); setEditBody(item.body); }} className="p-1 text-text-muted hover:text-accent transition-colors" title="Muokkaa">
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  {onDeleteNote && (
                    <button onClick={() => onDeleteNote(item.id)} className="p-1 text-text-muted hover:text-red-500 transition-colors" title="Poista">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {combined.length === 0 && (
          <p className="text-xs text-text-muted text-center py-8">Ei tapahtumia</p>
        )}
      </div>

      {combined.length > 8 && !showAll && (
        <button onClick={() => setShowAll(true)} className="w-full flex items-center justify-center gap-1 py-2 text-xs font-medium text-text-muted hover:text-accent transition-colors">
          <ChevronDown className="w-3.5 h-3.5" /> Näytä {combined.length - 8} aiempaa
        </button>
      )}
    </div>
  );
}

// ─── Notes Tab ───────────────────────────────────────────────────────────────

function NotesTab({ notes, onAddNote, onUpdateNote, onDeleteNote, onToggleShowToInstaller, isPending }: {
  notes: Array<{ id: string; body: string; created_at: string; show_to_installer?: boolean }>;
  onAddNote: (body: string) => void;
  onUpdateNote?: (id: string, body: string) => void;
  onDeleteNote?: (id: string) => void;
  onToggleShowToInstaller?: (id: string, value: boolean) => void;
  isPending: boolean;
}) {
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    onAddNote(body.trim());
    setBody("");
  }

  function saveEdit() {
    if (!editingId || !editBody.trim() || !onUpdateNote) return;
    onUpdateNote(editingId, editBody.trim());
    setEditingId(null);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Kirjoita muistiinpano..." rows={2} className="flex-1 px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
        <button type="submit" disabled={!body.trim() || isPending} className="px-3 py-2 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors self-end">
          <Send className="w-4 h-4" />
        </button>
      </form>
      <div className="space-y-2">
        {notes.map((note) => (
          <div key={note.id} className={`px-3 py-2.5 rounded-xl group ${note.show_to_installer ? "bg-amber-50 border border-amber-200" : "bg-muted/20"}`}>
            {editingId === note.id ? (
              <div className="flex gap-1.5">
                <input
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                  className="flex-1 px-2 py-1 border border-accent/40 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                  autoFocus
                />
                <button onClick={saveEdit} className="p-1 text-accent hover:text-accent-dark"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditingId(null)} className="p-1 text-text-muted hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm">{note.body}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[11px] text-text-muted">{formatDateTime(note.created_at)}</p>
                    {note.show_to_installer && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
                        <HardHat className="w-2.5 h-2.5" /> näkyy asentajalle
                      </span>
                    )}
                  </div>
                </div>
                {(onUpdateNote || onDeleteNote || onToggleShowToInstaller) && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {onToggleShowToInstaller && (
                      <button
                        onClick={() => onToggleShowToInstaller(note.id, !note.show_to_installer)}
                        className={`p-1 transition-colors ${note.show_to_installer ? "text-amber-700 hover:text-amber-900" : "text-text-muted hover:text-amber-700"}`}
                        title={note.show_to_installer ? "Piilota asentajalta" : "Näytä asentajalle"}
                      >
                        {note.show_to_installer ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                    )}
                    {onUpdateNote && (
                      <button onClick={() => { setEditingId(note.id); setEditBody(note.body); }} className="p-1 text-text-muted hover:text-accent transition-colors" title="Muokkaa">
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {onDeleteNote && (
                      <button onClick={() => onDeleteNote(note.id)} className="p-1 text-text-muted hover:text-red-500 transition-colors" title="Poista">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {notes.length === 0 && <p className="text-xs text-text-muted text-center py-6">Ei muistiinpanoja</p>}
      </div>
    </div>
  );
}

// ─── Files Tab ───────────────────────────────────────────────────────────────

const PHOTO_CATEGORIES = [
  { value: "indoor_unit", label: "Sisäyksikön sijainti" },
  { value: "outdoor_unit", label: "Ulkoyksikön sijainti" },
  { value: "electrical", label: "Sähkösyöttö" },
  { value: "condensate", label: "Kondenssivesi" },
  { value: "other", label: "Muu" },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(PHOTO_CATEGORIES.map((c) => [c.value, c.label]));

function FilesTab({ files, opportunityId }: { files: SalesOpportunityFile[]; opportunityId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingCategories, setPendingCategories] = useState<Record<number, string>>({});

  async function uploadFiles(fileList: File[], categories: Record<number, string>) {
    setUploading(true);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const ext = file.name.split(".").pop() || "bin";
        const path = `${opportunityId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("sales-opportunity-files").upload(path, file, { upsert: true });
        if (uploadErr) {
          console.error("Storage upload error:", uploadErr.message);
          toast(`Lataus epäonnistui: ${uploadErr.message}`, "error");
          continue;
        }
          const isImage = /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(file.name) || file.type.startsWith("image/");
          await supabase.from("sales_opportunity_files").insert({
            opportunity_id: opportunityId,
            filename: file.name,
            bucket: "sales-opportunity-files",
            path,
            file_type: "manual",
            photo_category: isImage ? (categories[i] || "other") : null,
          });
      }
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.files(opportunityId) });
      toast("Tiedostot ladattu");
    } catch {
      toast("Lataus epäonnistui", "error");
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    const hasImages = fileList.some((f) => f.type.startsWith("image/"));
    if (hasImages) {
      setPendingFiles(fileList);
      setPendingCategories(Object.fromEntries(fileList.map((_, i) => [i, "other"])));
    } else {
      uploadFiles(fileList, {});
    }
    e.target.value = "";
  }

  function handleCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    setPendingFiles(fileList);
    setPendingCategories(Object.fromEntries(fileList.map((_, i) => [i, "other"])));
    e.target.value = "";
  }

  const urls = useStorageUrls(files);

  async function updateCategory(fileId: string, category: string) {
    await supabase.from("sales_opportunity_files").update({ photo_category: category }).eq("id", fileId);
    qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.files(opportunityId) });
  }

  async function deleteFile(file: SalesOpportunityFile) {
    const ok = await confirm({
      title: "Poista tiedosto",
      message: `Haluatko varmasti poistaa tiedoston "${file.filename}"?`,
      confirmLabel: "Poista",
      variant: "danger",
    });
    if (!ok) return;
    await supabase.storage.from(file.bucket).remove([file.path]);
    await supabase.from("sales_opportunity_files").delete().eq("id", file.id);
    qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.files(opportunityId) });
    toast("Tiedosto poistettu");
  }

  const images = files.filter((f) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));
  const docs = files.filter((f) => !/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));

  return (
    <div className="space-y-4">
      {/* Category picker modal for pending uploads */}
      {pendingFiles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 w-[calc(100%-2rem)] sm:w-[400px] max-w-[400px] space-y-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-text-primary">Valitse kuvien tyypit</h3>
            <div className="space-y-3">
              {pendingFiles.map((file, idx) => {
                const isImage = file.type.startsWith("image/");
                if (!isImage) return null;
                const previewUrl = URL.createObjectURL(file);
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <img src={previewUrl} alt={file.name} className="w-12 h-12 rounded-lg object-cover border border-border flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-text-muted truncate mb-1">{file.name}</p>
                      <select
                        value={pendingCategories[idx] || "other"}
                        onChange={(e) => setPendingCategories((prev) => ({ ...prev, [idx]: e.target.value }))}
                        className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-bg-secondary"
                      >
                        {PHOTO_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
            {pendingFiles.length > 1 && (
              <div className="pt-1 border-t border-border">
                <p className="text-[10px] text-text-muted mb-1.5">Aseta kaikille sama tyyppi:</p>
                <div className="flex flex-wrap gap-1">
                  {PHOTO_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setPendingCategories(Object.fromEntries(pendingFiles.map((_, i) => [i, cat.value])))}
                      className="px-2 py-1 rounded-lg text-[10px] font-medium bg-bg-secondary text-text-primary hover:bg-accent hover:text-white transition-colors"
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setPendingFiles([])}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-muted hover:bg-bg-secondary"
              >
                Peruuta
              </button>
              <button
                onClick={() => {
                  uploadFiles(pendingFiles, pendingCategories);
                  setPendingFiles([]);
                }}
                disabled={uploading}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {uploading ? "Ladataan..." : `Lataa ${pendingFiles.length > 1 ? `(${pendingFiles.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload buttons */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-text-muted">{files.length} tiedostoa</p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => cameraRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 disabled:opacity-50">
            <Camera className="w-3.5 h-3.5" /> Ota kuva
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 disabled:opacity-50">
            <ImagePlus className="w-3.5 h-3.5" /> Lisää tiedosto
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" multiple onChange={handleFileSelect} className="hidden" />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleCameraCapture} className="hidden" />
      </div>

      {/* Images grouped by category */}
      {images.length > 0 && (
        <div className="space-y-3">
          {PHOTO_CATEGORIES.map((cat) => {
            const catImages = images.filter((f) => f.photo_category === cat.value);
            if (catImages.length === 0) return null;
            return (
              <div key={cat.value}>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">{cat.label}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {catImages.map((f) => (
                    <div key={f.id} className="relative group">
                      <a href={urls[f.id]} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-border hover:border-accent/30 transition-colors">
                        <img src={urls[f.id]} alt={f.filename} className="w-full h-full object-cover" />
                      </a>
                      <button onClick={() => deleteFile(f)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">
                        <X className="w-3 h-3" />
                      </button>
                      <select
                        value={f.photo_category || "other"}
                        onChange={(e) => updateCategory(f.id, e.target.value)}
                        className="absolute bottom-1 left-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-lg text-[10px] px-1.5 py-1 border border-border"
                      >
                        {PHOTO_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {/* Uncategorized images */}
          {(() => {
            const uncategorized = images.filter((f) => !f.photo_category || !CATEGORY_LABELS[f.photo_category]);
            if (uncategorized.length === 0) return null;
            return (
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Luokittelematon</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {uncategorized.map((f) => (
                    <div key={f.id} className="relative group">
                      <a href={urls[f.id]} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-border hover:border-accent/30 transition-colors">
                        <img src={urls[f.id]} alt={f.filename} className="w-full h-full object-cover" />
                      </a>
                      <button onClick={() => deleteFile(f)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">
                        <X className="w-3 h-3" />
                      </button>
                      <select
                        value={f.photo_category || ""}
                        onChange={(e) => updateCategory(f.id, e.target.value)}
                        className="absolute bottom-1 left-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-lg text-[10px] px-1.5 py-1 border border-border"
                      >
                        <option value="">Valitse tyyppi...</option>
                        {PHOTO_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Documents */}
      {docs.length > 0 && (
        <div className="space-y-1">
          {docs.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/20 text-xs transition-colors">
              <Paperclip className="w-3.5 h-3.5 text-text-muted" />
              <a href={urls[f.id]} target="_blank" rel="noopener noreferrer" className="font-medium flex-1 truncate hover:text-accent">{f.filename}</a>
              <span className="text-text-muted">{formatDateTime(f.created_at)}</span>
              <button onClick={() => deleteFile(f)} className="text-text-muted hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {files.length === 0 && <p className="text-xs text-text-muted text-center py-6">Ei tiedostoja</p>}
    </div>
  );
}

function fmtEvent(e: { type: string; payload: Record<string, unknown> }): string {
  const p = e.payload;
  switch (e.type) {
    case "status_change": return `Vaihe: ${p.from || "–"} → ${p.to || "–"}`;
    case "call": return `Soitto (${p.result || "–"})`;
    case "assignment": return `Siirretty myyjälle`;
    case "note_added": return `Muistiinpano lisätty`;
    case "offer_created": return `Tarjous luotu`;
    case "offer_sent": return `Tarjous lähetetty`;
    case "offer_accepted": return `Tarjous hyväksytty`;
    case "email_sent": return `Sähköposti lähetetty`;
    default: return e.type;
  }
}

// ─── Deal Emails Tab ─────────────────────────────────────────────────────────

interface DealEmailsTabProps {
  opportunityId: string;
  customerEmail?: string;
  customerName?: string;
  seller?: { id: string; first_name: string; last_name: string; email: string; phone?: string | null } | null;
}

function DealEmailsTab({ opportunityId, customerEmail, customerName, seller }: DealEmailsTabProps) {
  const { data: threads = [], isLoading } = useEmailsByOpportunity(opportunityId, customerEmail);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set());
  const [composeState, setComposeState] = useState<ComposeState | null>(null);

  function openCompose(opts?: { threadId?: string; subject?: string; inReplyTo?: string }) {
    setComposeState({
      mode: opts?.threadId ? "reply" : "new",
      to: customerEmail || "",
      subject: opts?.subject || "",
      body: "",
      inReplyTo: opts?.inReplyTo,
      threadId: opts?.threadId,
    });
  }

  // When a thread is expanded, auto-expand only the latest message
  function toggleThread(threadId: string) {
    if (expandedThread === threadId) {
      setExpandedThread(null);
      return;
    }
    setExpandedThread(threadId);
    const thread = threads.find((t) => t.thread_id === threadId);
    if (thread && thread.messages.length > 0) {
      setExpandedMsgs(new Set([thread.messages[thread.messages.length - 1].id]));
    }
  }

  function toggleMsg(msgId: string) {
    setExpandedMsgs((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }

  function expandAll(thread: { messages: { id: string }[] }) {
    setExpandedMsgs(new Set(thread.messages.map((m) => m.id)));
  }

  function formatRelative(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "juuri nyt";
    if (diffMins < 60) return `${diffMins} min sitten`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} h sitten`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} pv sitten`;
    return d.toLocaleDateString("fi-FI", { day: "numeric", month: "short", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  }

  const replyTargetName = customerName?.split(" ")[0] || customerEmail?.split("@")[0] || "";

  return (
    <div className="space-y-3">
      {/* Compose button */}
      {seller?.email && customerEmail && (
        <button
          onClick={() => openCompose()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-xl hover:bg-accent/90 transition-colors"
        >
          <Send className="w-3 h-3" /> Uusi viesti
        </button>
      )}

      {/* Compose modal */}
      {composeState && seller?.email && (
        <ComposeModal
          state={composeState}
          onClose={() => setComposeState(null)}
          senderEmail={seller.email}
          senderName={`${seller.first_name} ${seller.last_name}`.trim()}
          employeeId={seller.id}
          employee={seller as any}
          category="sales"
        />
      )}

      {/* Threads */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-8">
          <Mail className="w-8 h-8 text-text-muted/30 mx-auto mb-2" />
          <p className="text-xs text-text-muted">
            {customerEmail ? `Ei sähköposteja osoitteelle ${customerEmail}` : "Ei linkitettyjä sähköposteja"}
          </p>
        </div>
      ) : (
        threads.map((thread) => {
          const isOpen = expandedThread === thread.thread_id;
          return (
            <div key={thread.thread_id} className="border border-border rounded-xl overflow-hidden bg-white">
              {/* Thread header */}
              <button
                onClick={() => toggleThread(thread.thread_id)}
                className={`w-full text-left px-4 py-3 transition-colors ${isOpen ? "border-b border-border" : "hover:bg-bg-secondary/50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-semibold text-text-primary truncate ${isOpen ? "text-base" : "text-sm"}`}>
                    {thread.subject || "(ei otsikkoa)"}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {thread.message_count > 1 && (
                      <span className="text-[11px] text-text-muted tabular-nums">{thread.message_count}</span>
                    )}
                    {thread.has_attachments && <Paperclip className="w-3.5 h-3.5 text-text-muted" />}
                    {!isOpen && (
                      <span className="text-[11px] text-text-muted whitespace-nowrap">{formatRelative(thread.last_date)}</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </div>
                {!isOpen && (
                  <p className="text-xs text-text-muted truncate mt-0.5">
                    {thread.messages[thread.messages.length - 1]?.snippet}
                  </p>
                )}
              </button>

              {/* Expanded thread — Gmail-style conversation */}
              {isOpen && (
                <>
                  {thread.message_count > 2 && expandedMsgs.size < thread.message_count && (
                    <button
                      onClick={() => expandAll(thread)}
                      className="w-full text-center py-2 text-xs text-text-muted hover:text-accent hover:bg-bg-secondary/40 transition-colors border-b border-border"
                    >
                      Näytä kaikki {thread.message_count} viestiä
                    </button>
                  )}

                  <div className="divide-y divide-border">
                    {thread.messages.map((msg) => {
                      const isMsgExpanded = expandedMsgs.has(msg.id);
                      const senderInitial = (msg.from_name || msg.from_address)[0]?.toUpperCase() || "?";
                      const senderLabel = msg.from_name || msg.from_address;
                      const senderColor = emailToColor(msg.from_address);

                      return (
                        <div key={msg.id}>
                          <button
                            onClick={() => toggleMsg(msg.id)}
                            className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-bg-secondary/30 transition-colors"
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: senderColor }}
                            >
                              {senderInitial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-text-primary truncate">
                                  {senderLabel}
                                </span>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {msg.has_attachments && <Paperclip className="w-3.5 h-3.5 text-text-muted" />}
                                  <span className="text-[11px] text-text-muted whitespace-nowrap">
                                    {formatRelative(msg.date)}
                                  </span>
                                </div>
                              </div>
                              {isMsgExpanded ? (
                                <div className="text-[11px] text-text-muted mt-0.5 truncate">
                                  vastaanottaja: {msg.to_addresses.join(", ")}
                                  {msg.cc_addresses.length > 0 && (
                                    <span className="ml-2">cc: {msg.cc_addresses.join(", ")}</span>
                                  )}
                                  <span className="ml-2">· {formatDateTime(msg.date)}</span>
                                </div>
                              ) : (
                                <p className="text-xs text-text-muted truncate mt-0.5">{msg.snippet}</p>
                              )}
                            </div>
                          </button>

                          {isMsgExpanded && (
                            <div className="px-4 pb-4 pl-[60px]">
                              {msg.body_html ? (
                                <EmailBodyWithCid
                                  bodyHtml={msg.body_html}
                                  emailId={msg.id}
                                  gmailMessageId={msg.gmail_message_id}
                                  senderEmail={msg.is_inbound ? (msg.to_addresses[0] || COMPANY_EMAIL) : msg.from_address}
                                  isInThread={thread.message_count > 1}
                                />
                              ) : msg.body_text ? (
                                <p className="text-sm text-text-primary whitespace-pre-line">{msg.body_text}</p>
                              ) : (
                                <p className="text-sm text-text-muted">{msg.snippet}</p>
                              )}
                              {msg.has_attachments && (
                                <div className="mt-3">
                                  <MessageAttachments
                                    emailId={msg.id}
                                    gmailMessageId={msg.gmail_message_id}
                                    senderEmail={msg.is_inbound ? (msg.to_addresses[0] || COMPANY_EMAIL) : msg.from_address}
                                    bodyHtml={msg.body_html}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Reply prompt — Gmail-style inline field */}
                  {seller?.email && customerEmail && (
                    <div className="border-t border-border px-4 py-3 bg-bg-secondary/20">
                      <button
                        onClick={() => {
                          const lastMsg = thread.messages[thread.messages.length - 1];
                          openCompose({
                            threadId: thread.thread_id,
                            subject: thread.subject?.startsWith("Re:") ? thread.subject : `Re: ${thread.subject || ""}`,
                            inReplyTo: lastMsg?.gmail_message_id,
                          });
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-muted bg-white border border-border rounded-full hover:border-accent hover:text-accent hover:shadow-sm transition-all text-left"
                      >
                        <ArrowRightLeft className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">
                          {replyTargetName ? `Vastaa ${replyTargetName}...` : "Vastaa..."}
                        </span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

