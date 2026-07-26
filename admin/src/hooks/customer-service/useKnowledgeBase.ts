import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { KBArticle, KBArticleVersion, KBFilters } from "@/lib/cs-types";
import { KB_PAGE_SIZE } from "@/lib/cs-types";

// ─── Article List ────────────────────────────────────────────────────────────

export interface PaginatedArticles {
  data: KBArticle[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useKBArticles(filters: KBFilters = {}) {
  const { category = "all", visibility = "all", search, page = 0 } = filters;
  return useQuery({
    queryKey: queryKeys.customerService.knowledgeBase.list({
      category,
      visibility,
      search,
      page,
    }),
    queryFn: async (): Promise<PaginatedArticles> => {
      let query = supabase
        .from("cs_knowledge_articles")
        .select(
          "*, creator:employees!cs_knowledge_articles_created_by_fkey(id, first_name, last_name)",
          { count: "exact" }
        )
        .order("updated_at", { ascending: false })
        .range(page * KB_PAGE_SIZE, (page + 1) * KB_PAGE_SIZE - 1);

      if (category !== "all") query = query.eq("category", category);
      if (visibility !== "all") query = query.eq("visibility", visibility);
      if (search) {
        query = query.or(
          `title.ilike.%${search}%,body_text.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const total = count ?? 0;
      return {
        data: (data ?? []) as KBArticle[],
        count: total,
        page,
        pageSize: KB_PAGE_SIZE,
        totalPages: Math.ceil(total / KB_PAGE_SIZE),
      };
    },
    placeholderData: keepPreviousData,
  });
}

// ─── Single Article ──────────────────────────────────────────────────────────

export function useKBArticle(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customerService.knowledgeBase.bySlug(slug),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_knowledge_articles")
        .select(
          "*, creator:employees!cs_knowledge_articles_created_by_fkey(id, first_name, last_name)"
        )
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data as KBArticle;
    },
    enabled: !!slug,
  });
}

export function useKBArticleById(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customerService.knowledgeBase.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_knowledge_articles")
        .select(
          "*, creator:employees!cs_knowledge_articles_created_by_fkey(id, first_name, last_name)"
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as KBArticle;
    },
    enabled: !!id,
  });
}

// ─── Versions ────────────────────────────────────────────────────────────────

export function useKBArticleVersions(articleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customerService.knowledgeBase.versions(articleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_knowledge_versions")
        .select(
          "*, changer:employees(id, first_name, last_name)"
        )
        .eq("article_id", articleId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KBArticleVersion[];
    },
    enabled: !!articleId,
  });
}

// ─── Full-text Search ────────────────────────────────────────────────────────

export function useKBSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.customerService.knowledgeBase.search(query),
    queryFn: async () => {
      if (!query.trim()) return [];
      const { data, error } = await supabase
        .from("cs_knowledge_articles")
        .select("id, title, slug, category, visibility, snippet:body_text")
        .eq("is_published", true)
        .textSearch("body_text", query, { type: "websearch", config: "finnish" })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: query.trim().length >= 2,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      article: Pick<KBArticle, "title" | "slug" | "category" | "body_html" | "body_text" | "visibility" | "tags"> & {
        created_by?: string;
      }
    ) => {
      const { data, error } = await supabase
        .from("cs_knowledge_articles")
        .insert(article)
        .select()
        .single();
      if (error) throw error;
      return data as KBArticle;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.knowledgeBase.all,
      });
    },
  });
}

export function useUpdateKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      changedBy,
      ...updates
    }: Partial<KBArticle> & { id: string; changedBy?: string }) => {
      // Save version before updating
      const { data: current } = await supabase
        .from("cs_knowledge_articles")
        .select("title, body_html, body_text")
        .eq("id", id)
        .single();

      if (current) {
        await supabase.from("cs_knowledge_versions").insert({
          article_id: id,
          title: current.title,
          body_html: current.body_html,
          body_text: current.body_text,
          changed_by: changedBy ?? null,
        });
      }

      const { error } = await supabase
        .from("cs_knowledge_articles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.knowledgeBase.all,
      });
    },
  });
}

export function useDeleteKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cs_knowledge_articles")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.knowledgeBase.all,
      });
    },
  });
}
