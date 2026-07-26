import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";

interface SyncLogEntry {
  id: string;
  platform: "google_ads" | "meta_ads";
  synced_at: string;
  status: string;
  records_synced: number | null;
  error_message: string | null;
  duration_ms: number | null;
}

export function useMarketingSync() {
  const qc = useQueryClient();

  // Realtime: auto-refresh on new sync log entries
  useEffect(() => {
    const channel = supabase
      .channel("marketing-sync-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "marketing_sync_log" },
        () => {
          qc.invalidateQueries({ queryKey: ["marketing-sync-log"] });
          qc.invalidateQueries({ queryKey: ["marketing-overview"] });
          qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
          qc.invalidateQueries({ queryKey: ["marketing-area-profitability"] });
          qc.invalidateQueries({ queryKey: ["analytics"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const syncLogQuery = useQuery<SyncLogEntry[]>({
    queryKey: ["marketing-sync-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_sync_log")
        .select("*")
        .order("synced_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as SyncLogEntry[];
    },
  });

  const syncGoogle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("sync-google-ads");
      if (error) throw error;
    },
  });

  const syncMeta = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("sync-meta-ads");
      if (error) throw error;
    },
  });

  const syncAll = useMutation({
    mutationFn: async () => {
      // Use allSettled — individual function errors are logged in marketing_sync_log
      await Promise.allSettled([
        supabase.functions.invoke("sync-google-ads"),
        supabase.functions.invoke("sync-meta-ads"),
      ]);
      // Refresh sync log to show results (including errors)
      qc.invalidateQueries({ queryKey: ["marketing-sync-log"] });
    },
  });

  return {
    syncLog: syncLogQuery.data || [],
    isLoadingLog: syncLogQuery.isLoading,
    syncGoogle,
    syncMeta,
    syncAll,
    isSyncing: syncGoogle.isPending || syncMeta.isPending || syncAll.isPending,
  };
}
