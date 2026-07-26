import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Ticket,
  Mail,
  BookOpen,
  User,
  X,
  Loader2,
} from "lucide-react";
import { useUnifiedSearch } from "@/hooks/customer-service/useUnifiedSearch";

// Cmd+K style search dialog across tickets, emails, KB articles, and customers.
// Mounted once in each CS page; it listens for Cmd/Ctrl+K globally while mounted.

type Tab = "all" | "tickets" | "emails" | "articles" | "customers";

export function UnifiedSearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const navigate = useNavigate();

  const { data, isLoading } = useUnifiedSearch(query);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setTab("all");
  }, []);

  const go = useCallback(
    (path: string) => {
      close();
      navigate(path);
    },
    [close, navigate]
  );

  if (!open) return null;

  const tickets = data?.tickets ?? [];
  const emails = data?.emails ?? [];
  const articles = data?.articles ?? [];
  const customers = data?.customers ?? [];
  const totalCount =
    tickets.length + emails.length + articles.length + customers.length;

  const show = {
    tickets: tab === "all" || tab === "tickets",
    emails: tab === "all" || tab === "emails",
    articles: tab === "all" || tab === "articles",
    customers: tab === "all" || tab === "customers",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/40"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-text-muted flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hae tikettejä, viestejä, artikkeleita, asiakkaita..."
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-text-muted"
          />
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-text-muted" />}
          <button
            type="button"
            onClick={close}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-bg-secondary/30 text-xs">
          {([
            { key: "all", label: `Kaikki${totalCount ? ` (${totalCount})` : ""}` },
            { key: "tickets", label: `Tiketit${tickets.length ? ` (${tickets.length})` : ""}` },
            { key: "emails", label: `Viestit${emails.length ? ` (${emails.length})` : ""}` },
            { key: "articles", label: `Ohjeet${articles.length ? ` (${articles.length})` : ""}` },
            { key: "customers", label: `Asiakkaat${customers.length ? ` (${customers.length})` : ""}` },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                tab === t.key
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-border">
          {query.trim().length < 2 && (
            <div className="px-4 py-6 text-center text-sm text-text-muted">
              Kirjoita vähintään 2 merkkiä etsiäksesi.
            </div>
          )}
          {query.trim().length >= 2 && !isLoading && totalCount === 0 && (
            <div className="px-4 py-6 text-center text-sm text-text-muted">
              Ei tuloksia haulla "{query}".
            </div>
          )}

          {show.tickets && tickets.length > 0 && (
            <section>
              <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <Ticket className="w-3 h-3" /> Tiketit
              </div>
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    go(
                      t.gmail_thread_id
                        ? `/asiakaspalvelu?thread=${encodeURIComponent(t.gmail_thread_id)}`
                        : `/asiakaspalvelu?ticket=${t.ticket_number}`
                    )
                  }
                  className="w-full text-left px-4 py-2 hover:bg-surface-hover flex items-start gap-3"
                >
                  <span className="text-xs text-text-muted font-mono pt-0.5">
                    #{t.ticket_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary truncate">
                      {t.subject || "(ei aihetta)"}
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {t.customer_name || t.customer_email || "tuntematon"}
                      {" · "}
                      {t.status} · {t.priority}
                    </div>
                  </div>
                </button>
              ))}
            </section>
          )}

          {show.emails && emails.length > 0 && (
            <section>
              <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <Mail className="w-3 h-3" /> Sähköpostit
              </div>
              {emails.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() =>
                    go(
                      e.gmail_thread_id
                        ? `/asiakaspalvelu?thread=${encodeURIComponent(e.gmail_thread_id)}`
                        : `/asiakaspalvelu`
                    )
                  }
                  className="w-full text-left px-4 py-2 hover:bg-surface-hover"
                >
                  <div className="text-sm font-medium text-text-primary truncate">
                    {e.subject || "(ei aihetta)"}
                  </div>
                  <div className="text-xs text-text-muted truncate">
                    {e.from_address || "tuntematon"} · {new Date(e.date).toLocaleDateString("fi-FI")}
                  </div>
                  {e.snippet && (
                    <div className="text-xs text-text-tertiary truncate mt-0.5">
                      {e.snippet}
                    </div>
                  )}
                </button>
              ))}
            </section>
          )}

          {show.articles && articles.length > 0 && (
            <section>
              <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" /> Ohjeartikkelit
              </div>
              {articles.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => go(`/asiakaspalvelu/tietopankki/${a.slug}`)}
                  className="w-full text-left px-4 py-2 hover:bg-surface-hover"
                >
                  <div className="text-sm font-medium text-text-primary truncate">
                    {a.title}
                  </div>
                  {a.category && (
                    <div className="text-xs text-text-muted">{a.category}</div>
                  )}
                </button>
              ))}
            </section>
          )}

          {show.customers && customers.length > 0 && (
            <section>
              <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <User className="w-3 h-3" /> Asiakkaat
              </div>
              {customers.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "(ei nimeä)";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => go(`/asiakkaat/${c.id}`)}
                    className="w-full text-left px-4 py-2 hover:bg-surface-hover"
                  >
                    <div className="text-sm font-medium text-text-primary truncate">
                      {name}
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {c.email || ""}
                      {c.email && c.phone ? " · " : ""}
                      {c.phone || ""}
                    </div>
                  </button>
                );
              })}
            </section>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border text-[11px] text-text-muted flex items-center justify-between bg-bg-secondary/30">
          <span>⌘K / Ctrl+K avaa haun</span>
          <span>Esc sulkee</span>
        </div>
      </div>
    </div>
  );
}
