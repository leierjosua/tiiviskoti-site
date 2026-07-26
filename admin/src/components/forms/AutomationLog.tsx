import { useState } from "react";
import { useAutomationLog } from "@/hooks/useFormAutomations";
import { formatDateTime } from "@/lib/utils";
import { CheckCircle, XCircle, MinusCircle, Activity, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const STATUS_CONFIG = {
  success: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "Onnistui" },
  failed: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "Epäonnistui" },
  skipped: { icon: MinusCircle, color: "text-amber-600", bg: "bg-amber-50", label: "Ohitettu" },
};

type LogStatus = "success" | "failed" | "skipped";

const STATUS_TABS: { value: LogStatus | "all"; label: string }[] = [
  { value: "all", label: "Kaikki" },
  { value: "success", label: "Onnistuneet" },
  { value: "failed", label: "Epäonnistuneet" },
  { value: "skipped", label: "Ohitetut" },
];

export function AutomationLog() {
  const [statusFilter, setStatusFilter] = useState<LogStatus | "all">("all");
  const [page, setPage] = useState(0);

  const { data: result, isLoading, isFetching } = useAutomationLog({
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
  });

  const log = result?.data ?? [];
  const totalPages = result?.totalPages ?? 0;
  const totalCount = result?.count ?? 0;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-surface rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex flex-wrap sm:flex-nowrap gap-1 overflow-x-auto bg-surface rounded-xl border border-border p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(0); }}
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
          {totalCount} lokiriviä
          {isFetching && !isLoading && <span className="ml-2 w-3 h-3 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />}
        </span>
      </div>

      {!log.length ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center">
          <Activity className="w-10 h-10 text-text-muted/30 mx-auto mb-3" />
          <p className="text-text-muted">
            {statusFilter !== "all" ? "Ei lokitietoja valitulla suodattimella" : "Ei automaatiohistoriaa"}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {log.map((entry) => {
              const cfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.failed;
              const Icon = cfg.icon;

              return (
                <div
                  key={entry.id}
                  className="bg-surface border border-border rounded-xl px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                >
                  <div className={`p-1.5 rounded-lg ${cfg.bg} flex-shrink-0 hidden sm:block`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {entry.form_automations?.name || "Tuntematon automaatio"}
                    </p>
                    {entry.error_message && (
                      <p className="text-xs text-red-600 truncate mt-0.5">{entry.error_message}</p>
                    )}
                    {!!entry.result && !entry.error_message && (
                      <p className="text-xs text-text-muted truncate mt-0.5">
                        {typeof entry.result === "object" && (entry.result as Record<string, unknown>).to
                          ? `→ ${String((entry.result as Record<string, unknown>).to)}`
                          : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-text-muted whitespace-nowrap">
                      {formatDateTime(entry.executed_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">
                Sivu {page + 1} / {totalPages}
              </p>
              <div className="flex items-center gap-0.5 sm:gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30 transition-colors"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30 transition-colors"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
