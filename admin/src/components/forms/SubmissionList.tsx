import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Inbox,
  Eye,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowRightToLine,
  X,
  ExternalLink,
  MapPin,
  Mail,
  Phone,
  StickyNote,
  Loader2,
  Shuffle,
  UserCheck,
  TrendingUp,
  FileText,
} from "lucide-react";
import { useFormSubmissions, useUpdateFormSubmission } from "@/hooks/useFormSubmissions";
import { useContactForms } from "@/hooks/useContactForms";
import { useTransferToSales } from "@/hooks/useTransferToSales";
import { useSalesAssignmentSettings } from "@/hooks/sales/useSalesAssignment";
import { useOpportunityStages } from "@/hooks/sales/useSalesStages";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase";
import { useStorageUrl } from "@/lib/storage";
import { formatDateTime } from "@/lib/utils";
import type { FormSubmission, FormSubmissionStatus } from "@/lib/types";

// ─── Linked opportunity info for submissions ────────────────────────────────

interface LinkedOpportunity {
  id: string;
  status: string;
  assigned_salesperson_id: string | null;
  salesperson?: { first_name: string; last_name: string } | null;
  external_id: string;
}

function useLinkedOpportunities(submissionIds: string[]) {
  return useQuery({
    queryKey: ["linked-opportunities", submissionIds],
    enabled: submissionIds.length > 0,
    queryFn: async () => {
      const externalIds = submissionIds.map((id) => `form-submission-${id}`);
      const { data, error } = await supabase
        .from("sales_opportunities")
        .select(
          "id, status, assigned_salesperson_id, external_id, salesperson:employees!sales_opportunities_assigned_salesperson_id_fkey(first_name, last_name)"
        )
        .eq("external_source", "form")
        .in("external_id", externalIds);
      if (error) throw error;

      const map = new Map<string, LinkedOpportunity>();
      for (const opp of data ?? []) {
        const subId = (opp.external_id as string).replace("form-submission-", "");
        map.set(subId, opp as unknown as LinkedOpportunity);
      }
      return map;
    },
    staleTime: 10_000,
  });
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  FormSubmissionStatus,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  new: { label: "Uusi", color: "text-blue-700", bg: "bg-blue-50", icon: Clock },
  read: { label: "Luettu", color: "text-amber-700", bg: "bg-amber-50", icon: Eye },
  handled: { label: "Käsitelty", color: "text-green-700", bg: "bg-green-50", icon: CheckCircle },
};

const STATUS_TABS: { value: FormSubmissionStatus | "all"; label: string }[] = [
  { value: "all", label: "Kaikki" },
  { value: "new", label: "Uudet" },
  { value: "read", label: "Luetut" },
  { value: "handled", label: "Käsitellyt" },
];

// ─── Derive a human-readable form name for legacy submissions from page_url ─

const PAGE_URL_FORM_NAMES: Record<string, string> = {
  "/ilmalampopumpun-asennus": "ILP asennus",
  "/ilmalampopumpun-huolto-ja-puhdistus": "ILP huolto",
  "/yhteydenotto": "Yhteydenotto",
  "/meille-toihin": "Työhakemus",
  "/ilmanvaihdon-puhdistus": "IV-puhdistus",
  "/ilmalampopumpun-vianhaku": "ILP vianhaku",
  "/ilmalampopumput": "ILP yleiset",
  "/meista": "Meistä",
};

function deriveFormName(sub: FormSubmission): string {
  if (sub.form_slug !== "legacy" || !sub.page_url) return sub.form_slug;
  try {
    const pathname = new URL(sub.page_url).pathname.replace(/\/$/, "").split("?")[0].split("#")[0];
    for (const [prefix, name] of Object.entries(PAGE_URL_FORM_NAMES)) {
      if (pathname === prefix || pathname.startsWith(prefix + "/")) return name;
    }
    // Fallback: ILP huolto city pages like /ilmalampopumpun-huolto-espoo
    if (pathname.startsWith("/ilmalampopumpun-huolto-")) {
      const city = pathname.replace("/ilmalampopumpun-huolto-", "").replace(/-/g, " ");
      return `ILP huolto – ${city.charAt(0).toUpperCase() + city.slice(1)}`;
    }
    if (pathname === "" || pathname === "/") return "Etusivu";
    return sub.form_slug;
  } catch {
    return sub.form_slug;
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SubmissionList() {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<FormSubmissionStatus | "all">("all");
  const [formFilter, setFormFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<FormSubmission | null>(null);

  const { data: forms } = useContactForms();
  const { data: result, isLoading, isFetching } = useFormSubmissions({
    status: statusFilter === "all" ? undefined : statusFilter,
    formId: formFilter || undefined,
    search: search || undefined,
    page,
  });
  const updateSubmission = useUpdateFormSubmission();

  const submissions = result?.data ?? [];
  const totalPages = result?.totalPages ?? 0;
  const totalCount = result?.count ?? 0;

  // Fetch linked opportunities for current page of submissions
  const submissionIds = useMemo(() => submissions.map((s) => s.id), [submissions]);
  const { data: linkedOpps } = useLinkedOpportunities(submissionIds);

  // Fetch opportunity stages for label/color lookup
  const { data: oppStages } = useOpportunityStages();
  const stageMap = useMemo(() => {
    const m = new Map<string, { label: string; color: string }>();
    for (const s of oppStages ?? []) {
      m.set(s.key, { label: s.label, color: s.color });
    }
    return m;
  }, [oppStages]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(0);
  }

  function handleStatusChange(sub: FormSubmission, newStatus: FormSubmissionStatus) {
    updateSubmission.mutate({ id: sub.id, status: newStatus });
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-surface rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 overflow-x-auto bg-surface rounded-xl border border-border p-1 flex-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(0);
              }}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.value
                  ? "bg-brand text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <span className="ml-auto flex items-center px-3 text-xs text-text-muted whitespace-nowrap">
            {totalCount} vastausta
            {isFetching && !isLoading && (
              <span className="ml-2 w-3 h-3 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={formFilter}
          onChange={(e) => {
            setFormFilter(e.target.value);
            setPage(0);
          }}
          className="text-sm border border-border rounded-xl px-3 py-2 bg-surface min-w-0 sm:w-48"
        >
          <option value="">Kaikki lomakkeet</option>
          {forms?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Hae nimellä, sähköpostilla, puhelinnumerolla..."
              className="w-full text-sm border border-border rounded-xl pl-9 pr-3 py-2 bg-surface"
            />
          </div>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSearchInput("");
                setPage(0);
              }}
              className="p-2 rounded-xl border border-border text-text-muted hover:bg-surface-hover"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>

      {/* List */}
      {!submissions.length ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center">
          <Inbox className="w-10 h-10 text-text-muted/30 mx-auto mb-3" />
          <p className="text-text-muted">Ei lomakevastauksia</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {submissions.map((sub) => {
              const statusCfg = STATUS_CONFIG[sub.status];
              const StatusIcon = statusCfg.icon;
              const formName = sub.contact_forms?.name ?? deriveFormName(sub);
              const formCategory = sub.contact_forms?.category ?? "support";
              const isExpanded = expandedId === sub.id;
              const linkedOpp = linkedOpps?.get(sub.id);
              const stage = linkedOpp ? stageMap.get(linkedOpp.status) : null;

              return (
                <div
                  key={sub.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => {
                      setExpandedId(isExpanded ? null : sub.id);
                      if (sub.status === "new") {
                        handleStatusChange(sub, "read");
                      }
                    }}
                    className="w-full text-left px-3 sm:px-4 py-3 flex items-center gap-3"
                  >
                    <div className={`p-1.5 rounded-lg ${statusCfg.bg} flex-shrink-0 hidden sm:block`}>
                      <StatusIcon className={`w-4 h-4 ${statusCfg.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {sub.name}
                        </p>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            formCategory === "sales"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-sky-50 text-sky-700"
                          }`}
                        >
                          {formCategory === "sales" ? "Myynti" : "Aspa"}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono text-text-muted bg-surface-hover truncate max-w-32">
                          {formName}
                        </span>
                        {/* Linked opportunity badge */}
                        {linkedOpp && (
                          <>
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{
                                backgroundColor: stage?.color ? `${stage.color}20` : "#f3f4f6",
                                color: stage?.color || "#6b7280",
                              }}
                            >
                              <TrendingUp
                                className="w-3 h-3 inline-block mr-0.5 -mt-px"
                              />
                              {stage?.label ?? linkedOpp.status}
                            </span>
                            {linkedOpp.salesperson && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700">
                                <UserCheck className="w-3 h-3 inline-block mr-0.5 -mt-px" />
                                {linkedOpp.salesperson.first_name} {linkedOpp.salesperson.last_name}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5 truncate">
                        {sub.email}
                        {sub.phone && ` · ${sub.phone}`}
                        {sub.postal_code && ` · ${sub.postal_code}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusCfg.bg} ${statusCfg.color} hidden sm:inline-block`}
                      >
                        {statusCfg.label}
                      </span>
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        {formatDateTime(sub.created_at)}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-3 sm:px-4 py-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-text-muted" />
                          <a href={`mailto:${sub.email}`} className="text-blue-600 hover:underline truncate">
                            {sub.email}
                          </a>
                        </div>
                        {sub.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="w-4 h-4 text-text-muted" />
                            <a href={`tel:${sub.phone}`} className="text-blue-600 hover:underline">
                              {sub.phone}
                            </a>
                          </div>
                        )}
                        {sub.postal_code && (
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="w-4 h-4 text-text-muted" />
                            <span>{sub.postal_code}</span>
                          </div>
                        )}
                      </div>

                      {/* Linked opportunity details */}
                      {linkedOpp && (
                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-purple-50 border border-purple-100">
                          <TrendingUp className="w-4 h-4 text-purple-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-purple-800">
                              Myyntiputkessa
                              <span
                                className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{
                                  backgroundColor: stage?.color ? `${stage.color}30` : "#e9d5ff",
                                  color: stage?.color || "#7e22ce",
                                }}
                              >
                                {stage?.label ?? linkedOpp.status}
                              </span>
                            </p>
                            {linkedOpp.salesperson && (
                              <p className="text-xs text-purple-700 mt-0.5">
                                Myyjä: {linkedOpp.salesperson.first_name} {linkedOpp.salesperson.last_name}
                              </p>
                            )}
                          </div>
                          <a
                            href={`/myynti/inbound/${linkedOpp.id}`}
                            className="text-xs font-medium text-purple-700 hover:text-purple-900 whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Avaa diili &rarr;
                          </a>
                        </div>
                      )}

                      {sub.message && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-1">
                            <StickyNote className="w-3 h-3" />
                            Viesti
                          </p>
                          <p className="text-sm text-text-primary whitespace-pre-wrap bg-surface-hover rounded-lg p-3">
                            {sub.message}
                          </p>
                        </div>
                      )}

                      {sub.submission_data && Object.keys(sub.submission_data).length > 0 && (() => {
                        const isFileRef = (v: unknown): v is { bucket: string; path: string; contentType?: string; name?: string } =>
                          typeof v === "object" && v !== null && "bucket" in v && "path" in v;
                        const textEntries = Object.entries(sub.submission_data).filter(([, v]) => !isFileRef(v));
                        const fileEntries = Object.entries(sub.submission_data).filter(([, v]) => isFileRef(v));

                        return (
                          <div className="space-y-2">
                            {textEntries.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                                  Lomakkeen lisätiedot
                                </p>
                                <div className="bg-surface-hover rounded-lg p-3 space-y-1">
                                  {textEntries.map(([key, value]) => (
                                    <div key={key} className="flex gap-2 text-sm">
                                      <span className="text-text-muted font-medium min-w-24">{key}:</span>
                                      <span className="text-text-primary">
                                        {typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {fileEntries.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                                  Liitteet
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {fileEntries.map(([key, value]) => {
                                    const file = value as { bucket: string; path: string; contentType?: string; name?: string };
                                    const isImage = file.contentType?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(file.path);
                                    return (
                                      <StorageFileCard key={key} bucket={file.bucket} path={file.path} label={key} alt={file.name || key} isImage={isImage} fallbackName={file.name || file.path.split("/").pop() || ""} />
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {sub.page_url && (
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <ExternalLink className="w-3 h-3" />
                          <a
                            href={sub.page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate hover:text-accent hover:underline"
                          >
                            {sub.page_url}
                          </a>
                        </div>
                      )}

                      {(sub.utm_source || sub.utm_campaign || sub.gclid || sub.fbclid || sub.referrer || sub.landing_page) && (
                        <div className="border-t border-border pt-2 mt-1">
                          <p className="text-text-muted text-[10px] uppercase tracking-wide mb-1.5">Markkinointiattribuutio</p>
                          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            {sub.utm_source && (
                              <div>
                                <span className="text-text-muted">utm_source: </span>
                                <span className="font-medium text-text-primary">{sub.utm_source}</span>
                              </div>
                            )}
                            {sub.utm_medium && (
                              <div>
                                <span className="text-text-muted">utm_medium: </span>
                                <span className="font-medium text-text-primary">{sub.utm_medium}</span>
                              </div>
                            )}
                            {sub.utm_campaign && (
                              <div className="sm:col-span-2">
                                <span className="text-text-muted">Kampanja: </span>
                                <span className="font-medium text-text-primary break-all">{sub.utm_campaign}</span>
                              </div>
                            )}
                            {sub.utm_content && (
                              <div className="sm:col-span-2">
                                <span className="text-text-muted">Mainos: </span>
                                <span className="font-medium text-text-primary break-all">{sub.utm_content}</span>
                              </div>
                            )}
                            {sub.utm_term && (
                              <div className="sm:col-span-2">
                                <span className="text-text-muted">Hakusana: </span>
                                <span className="font-medium text-text-primary break-all">{sub.utm_term}</span>
                              </div>
                            )}
                            {sub.gclid && (
                              <div className="sm:col-span-2">
                                <span className="text-text-muted">Google klikki: </span>
                                <span className="font-mono text-[10px] text-text-primary break-all">{sub.gclid}</span>
                              </div>
                            )}
                            {sub.fbclid && (
                              <div className="sm:col-span-2">
                                <span className="text-text-muted">Meta klikki: </span>
                                <span className="font-mono text-[10px] text-text-primary break-all">{sub.fbclid}</span>
                              </div>
                            )}
                            {sub.referrer && (
                              <div className="sm:col-span-2">
                                <span className="text-text-muted">Lähettäjä: </span>
                                <span className="font-medium text-text-primary break-all">{sub.referrer}</span>
                              </div>
                            )}
                            {sub.landing_page && (
                              <div className="sm:col-span-2">
                                <span className="text-text-muted">Saapumissivu: </span>
                                <span className="font-medium text-text-primary break-all">{sub.landing_page}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                        {sub.status !== "handled" && (
                          <button
                            onClick={() => handleStatusChange(sub, "handled")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Merkitse käsitellyksi
                          </button>
                        )}
                        {sub.status === "handled" && (
                          <button
                            onClick={() => handleStatusChange(sub, "new")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            Palauta uudeksi
                          </button>
                        )}

                        {!linkedOpp && (
                          <button
                            onClick={() => setTransferTarget(sub)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                          >
                            <ArrowRightToLine className="w-3.5 h-3.5" />
                            Siirrä myyntiin
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">
                Sivu {page + 1} / {totalPages}
              </p>
              <div className="flex items-center gap-0.5 sm:gap-1">
                <button onClick={() => setPage(0)} disabled={page === 0} className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30 transition-colors">
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30 transition-colors">
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Transfer to sales modal */}
      {transferTarget && (
        <TransferToSalesModal
          submission={transferTarget}
          onClose={() => setTransferTarget(null)}
          onSuccess={() => {
            handleStatusChange(transferTarget, "handled");
            setTransferTarget(null);
            toast("Siirretty myyntiin", "success");
          }}
          onError={(msg) => {
            toast(msg, "error");
          }}
        />
      )}
    </div>
  );
}

function StorageFileCard({ bucket, path, label, alt, isImage, fallbackName }: { bucket: string; path: string; label: string; alt: string; isImage: boolean; fallbackName: string }) {
  const url = useStorageUrl(bucket, path);
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-border overflow-hidden hover:border-brand transition-colors"
    >
      {isImage ? (
        url ? <img src={url} alt={alt} className="w-full h-32 object-cover" /> : <div className="w-full h-32 bg-surface-hover animate-pulse" />
      ) : (
        <div className="flex flex-col items-center justify-center h-32 bg-surface-hover">
          <FileText className="w-8 h-8 text-text-muted mb-1" />
          <span className="text-xs text-text-muted truncate max-w-full px-2">{fallbackName}</span>
        </div>
      )}
      <div className="px-2 py-1.5 text-xs text-text-muted truncate">{label}</div>
    </a>
  );
}

// ─── Transfer Modal ──────────────────────────────────────────────────────────

function TransferToSalesModal({
  submission,
  onClose,
  onSuccess,
  onError,
}: {
  submission: FormSubmission;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [selectedSellerId, setSelectedSellerId] = useState<string>("");
  const { data: assignmentSettings, isLoading: loadingSettings } = useSalesAssignmentSettings();
  const transferToSales = useTransferToSales();

  const activeSellers = assignmentSettings?.filter((s) => s.is_active) ?? [];

  async function handleTransfer() {
    try {
      await transferToSales.mutateAsync({
        submissionId: submission.id,
        name: submission.name,
        email: submission.email,
        phone: submission.phone || undefined,
        postalCode: submission.postal_code || undefined,
        message: submission.message || undefined,
        formSlug: submission.form_slug,
        salespersonId: mode === "manual" ? selectedSellerId || undefined : undefined,
      });
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Siirto epäonnistui");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-text-primary">Siirrä myyntiin</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:bg-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-surface-hover rounded-xl p-3 space-y-1">
            <p className="text-sm font-semibold text-text-primary">{submission.name}</p>
            <p className="text-xs text-text-muted">
              {submission.email}
              {submission.phone && ` · ${submission.phone}`}
              {submission.postal_code && ` · ${submission.postal_code}`}
            </p>
            {submission.message && (
              <p className="text-xs text-text-muted mt-1 line-clamp-2">{submission.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Myyjän valinta
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode("auto")}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  mode === "auto"
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-border text-text-muted hover:bg-surface-hover"
                }`}
              >
                <Shuffle className="w-4 h-4" />
                Automaattinen
              </button>
              <button
                onClick={() => setMode("manual")}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  mode === "manual"
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-border text-text-muted hover:bg-surface-hover"
                }`}
              >
                <UserCheck className="w-4 h-4" />
                Valitse myyjä
              </button>
            </div>
          </div>

          {mode === "auto" && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
              <Shuffle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                Myyjä valitaan automaattisesti rotaation mukaan.
                {submission.postal_code && " Postinumero huomioidaan aluemäärityksessä."}
              </p>
            </div>
          )}

          {mode === "manual" && (
            <div className="space-y-2">
              {loadingSettings ? (
                <div className="flex items-center gap-2 text-sm text-text-muted py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ladataan myyjiä...
                </div>
              ) : activeSellers.length === 0 ? (
                <p className="text-sm text-text-muted py-2">
                  Ei aktiivisia myyjiä. Tarkista myyntiasetukset.
                </p>
              ) : (
                <select
                  value={selectedSellerId}
                  onChange={(e) => setSelectedSellerId(e.target.value)}
                  className="w-full text-sm border border-border rounded-xl px-3 py-2.5 bg-surface"
                >
                  <option value="">Valitse myyjä...</option>
                  {activeSellers.map((s) => (
                    <option key={s.salesperson_id} value={s.salesperson_id}>
                      {s.salesperson?.first_name} {s.salesperson?.last_name}
                      {s.weekly_limit > 0 ? ` (max ${s.weekly_limit}/vk)` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:bg-surface-hover transition-colors"
          >
            Peruuta
          </button>
          <button
            onClick={handleTransfer}
            disabled={
              transferToSales.isPending ||
              (mode === "manual" && !selectedSellerId)
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {transferToSales.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRightToLine className="w-4 h-4" />
            )}
            Siirrä myyntiin
          </button>
        </div>
      </div>
    </div>
  );
}
