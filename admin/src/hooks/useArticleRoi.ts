import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Sisältö-/artikkeli-ROI (analytics_article_roi RPC)
// ---------------------------------------------------------------------------

export interface ArticleRoiItem {
  article: string;
  sessions: number;
  directConversions: number;
  assistedConversions: number;
  /** direct_conversions / sessions (%) */
  directRate: number;
}

export interface ArticleRoiData {
  totals: {
    totalArticleSessions: number;
    totalDirectConversions: number;
    totalAssistedConversions: number;
  };
  articles: ArticleRoiItem[];
}

export function useArticleRoi(from: string, to: string) {
  return useQuery<ArticleRoiData>({
    queryKey: ["article-roi", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics_article_roi", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      const r = (data || {}) as any;

      return {
        totals: {
          totalArticleSessions: Number(r.totals?.total_article_sessions) || 0,
          totalDirectConversions: Number(r.totals?.total_direct_conversions) || 0,
          totalAssistedConversions: Number(r.totals?.total_assisted_conversions) || 0,
        },
        articles: ((r.articles || []) as any[]).map((a) => {
          const sessions = Number(a.sessions) || 0;
          const directConversions = Number(a.direct_conversions) || 0;
          return {
            article: String(a.article),
            sessions,
            directConversions,
            assistedConversions: Number(a.assisted_conversions) || 0,
            directRate: sessions > 0 ? Math.round((directConversions / sessions) * 1000) / 10 : 0,
          };
        }),
      };
    },
  });
}
