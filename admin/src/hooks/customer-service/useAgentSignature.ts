import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Per-agent email signature, stored in cs_agent_signatures. Used by the CS
// reply composer to auto-append a trailing signature block on reply.

export function useAgentSignature(agentId: string | undefined) {
  return useQuery({
    queryKey: ["cs-agent-signature", agentId],
    enabled: !!agentId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_agent_signatures")
        .select("id, agent_id, html, is_default, updated_at")
        .eq("agent_id", agentId!)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as { id: string; agent_id: string; html: string; is_default: boolean; updated_at: string } | null;
    },
  });
}

export function useUpsertAgentSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentId, html }: { agentId: string; html: string }) => {
      const { error } = await supabase
        .from("cs_agent_signatures")
        .upsert(
          {
            agent_id: agentId,
            html,
            is_default: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "agent_id" }
        );
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["cs-agent-signature", v.agentId] });
    },
  });
}
