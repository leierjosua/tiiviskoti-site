import { useEffect, useState, useCallback, useRef } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Sentry } from "@/lib/sentry";

// Surfaces Gmail sync health on every CS page so degraded/failing sync state
// is never silent. Part of the CS rework: the #1 trust-breaker in the old
// inbox was that sync could quietly fall behind with no signal.

type SyncState = {
  email_address: string;
  status: string;
  last_synced_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
};

const COMPANY_INBOX = "info@lasikiilto.fi";

function formatRelative(iso: string | null): string {
  if (!iso) return "ei koskaan";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "juuri nyt";
  if (minutes < 60) return `${minutes} min sitten`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h sitten`;
  const days = Math.round(hours / 24);
  return `${days} pv sitten`;
}

export function SyncHealthBanner() {
  const [state, setState] = useState<SyncState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const lastAlertedStatusRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("gmail_sync_state")
      .select(
        "email_address, status, last_synced_at, consecutive_failures, last_error"
      )
      .eq("email_address", COMPANY_INBOX)
      .maybeSingle();
    const next = (data as SyncState) ?? null;
    setState(next);

    // Alert Sentry once per status transition into a non-healthy state.
    // Avoids spamming on every 60s poll while the problem persists.
    if (
      next &&
      next.status !== "healthy" &&
      next.status !== lastAlertedStatusRef.current
    ) {
      Sentry.captureMessage(
        `Gmail sync ${next.status} for ${next.email_address}`,
        {
          level: next.status === "failing" ? "error" : "warning",
          tags: {
            gmail_sync_status: next.status,
            gmail_inbox: next.email_address,
          },
          extra: {
            consecutive_failures: next.consecutive_failures,
            last_error: next.last_error,
            last_synced_at: next.last_synced_at,
          },
        }
      );
      lastAlertedStatusRef.current = next.status;
    } else if (next && next.status === "healthy") {
      lastAlertedStatusRef.current = null;
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const forceSync = useCallback(async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke("sync-gmail", {
        body: { email_address: COMPANY_INBOX },
      });
      await load();
    } finally {
      setSyncing(false);
    }
  }, [load]);

  if (!state) return null;
  if (state.status === "healthy") return null;

  const isFailing = state.status === "failing";
  const bg = isFailing
    ? "bg-red-50 border-red-300 text-red-900"
    : "bg-amber-50 border-amber-300 text-amber-900";
  const iconColor = isFailing ? "text-red-600" : "text-amber-600";

  return (
    <div
      className={`mb-3 rounded-md border px-4 py-3 flex items-start gap-3 ${bg}`}
    >
      <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">
          {isFailing
            ? "Gmail-synkronointi epäonnistuu"
            : "Gmail-synkronointi on hidastunut"}
        </div>
        <div className="text-xs mt-1 space-y-0.5">
          <div>
            Viimeisin onnistunut synkronointi:{" "}
            <span className="font-medium">
              {formatRelative(state.last_synced_at)}
            </span>{" "}
            · Peräkkäisiä virheitä:{" "}
            <span className="font-medium">{state.consecutive_failures}</span>
          </div>
          {state.last_error && (
            <div className="font-mono text-[11px] opacity-80 truncate">
              {state.last_error}
            </div>
          )}
          <div className="opacity-90">
            Uudet viestit eivät välttämättä näy alla. Jos ongelma jatkuu,
            tarkista Gmail-yhteys.
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={forceSync}
        disabled={syncing}
        className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded bg-white/70 hover:bg-white border border-current/20 disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        Pakota synkronointi
      </button>
    </div>
  );
}
