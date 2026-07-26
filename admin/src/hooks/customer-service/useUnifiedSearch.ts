import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Searches across four CS surfaces in parallel and returns grouped results.
// Used by the CS unified search modal (Cmd+K). Keeps each query small and
// capped so the combined result set stays under ~40 rows even for broad terms.

const RESULT_LIMIT = 10;
const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

export type UnifiedTicketResult = {
  kind: "ticket";
  id: string;
  ticket_number: number;
  subject: string;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
  priority: string;
  gmail_thread_id: string | null;
};

export type UnifiedEmailResult = {
  kind: "email";
  id: string;
  subject: string | null;
  from_address: string | null;
  snippet: string | null;
  date: string;
  gmail_thread_id: string | null;
  cs_ticket_id: string | null;
};

export type UnifiedArticleResult = {
  kind: "article";
  id: string;
  title: string;
  slug: string;
  category: string | null;
};

export type UnifiedCustomerResult = {
  kind: "customer";
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

export type UnifiedSearchResults = {
  tickets: UnifiedTicketResult[];
  emails: UnifiedEmailResult[];
  articles: UnifiedArticleResult[];
  customers: UnifiedCustomerResult[];
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useUnifiedSearch(query: string) {
  const trimmed = query.trim();
  const debouncedQuery = useDebounced(trimmed, DEBOUNCE_MS);
  const enabled = debouncedQuery.length >= MIN_LENGTH;

  return useQuery<UnifiedSearchResults>({
    queryKey: ["cs-unified-search", debouncedQuery],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const pattern = `%${debouncedQuery.replace(/[%_]/g, (c) => "\\" + c)}%`;

      const [tickets, emails, articles, customers] = await Promise.all([
        supabase
          .from("cs_tickets")
          .select(
            "id, ticket_number, subject, customer_name, customer_email, status, priority, gmail_thread_id"
          )
          .eq("is_merged", false)
          .or(
            `subject.ilike.${pattern},customer_name.ilike.${pattern},customer_email.ilike.${pattern}`
          )
          .order("last_activity_at", { ascending: false })
          .limit(RESULT_LIMIT),

        supabase
          .from("sales_emails")
          .select(
            "id, subject, from_address, snippet, date, gmail_thread_id, cs_ticket_id"
          )
          .or(`subject.ilike.${pattern},snippet.ilike.${pattern}`)
          .order("date", { ascending: false })
          .limit(RESULT_LIMIT),

        supabase
          .from("cs_knowledge_articles")
          .select("id, title, slug, category")
          .eq("is_published", true)
          .or(`title.ilike.${pattern},body_text.ilike.${pattern}`)
          .order("use_count", { ascending: false })
          .limit(RESULT_LIMIT),

        supabase
          .from("customers")
          .select("id, first_name, last_name, email, phone")
          .or(
            `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`
          )
          .order("updated_at", { ascending: false })
          .limit(RESULT_LIMIT),
      ]);

      return {
        tickets: (tickets.data ?? []).map((r) => ({ ...r, kind: "ticket" as const })),
        emails: (emails.data ?? []).map((r) => ({ ...r, kind: "email" as const })),
        articles: (articles.data ?? []).map((r) => ({ ...r, kind: "article" as const })),
        customers: (customers.data ?? []).map((r) => ({ ...r, kind: "customer" as const })),
      };
    },
  });
}
