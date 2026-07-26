import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  useKBArticles,
  useCreateKBArticle,
  useDeleteKBArticle,
} from "@/hooks/customer-service/useKnowledgeBase";
import { useCSCategories } from "@/hooks/customer-service/useTickets";
import { useUserRole } from "@/context/UserRoleContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import type { KBFilters, KBArticle } from "@/lib/cs-types";
import {
  BookOpen,
  Plus,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Globe,
  Lock,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { employee } = useUserRole();

  const [filters, setFilters] = useState<KBFilters>({
    category: "all",
    visibility: "all",
    search: "",
    page: 0,
  });
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newCategory, setNewCategory] = useState("general");

  const { data: result, isLoading } = useKBArticles(filters);
  const { data: categories } = useCSCategories();
  const createArticle = useCreateKBArticle();
  const deleteArticle = useDeleteKBArticle();

  const articles = result?.data ?? [];

  function generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[äå]/g, "a")
      .replace(/ö/g, "o")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const slug = newSlug.trim() || generateSlug(newTitle);
    createArticle.mutate(
      {
        title: newTitle,
        slug,
        category: newCategory,
        body_html: "",
        body_text: "",
        visibility: "internal",
        tags: [],
        created_by: employee?.id,
      },
      {
        onSuccess: (article) => {
          setShowNewForm(false);
          setNewTitle("");
          setNewSlug("");
          navigate(`/asiakaspalvelu/tietopankki/${article.slug}`);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  async function handleDelete(article: KBArticle) {
    const ok = await confirm({
      title: "Poista artikkeli",
      message: `Haluatko varmasti poistaa artikkelin "${article.title}"?`,
      confirmLabel: "Poista",
      variant: "danger",
    });
    if (!ok) return;
    deleteArticle.mutate(article.id, {
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-gray-500 shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold">Tietopankki</h1>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Uusi artikkeli
        </button>
      </div>

      {/* New article form */}
      {showNewForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Otsikko *
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  if (!newSlug) setNewSlug(generateSlug(e.target.value));
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Slug
              </label>
              <input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="auto-generoitu"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Kategoria
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              >
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!newTitle.trim() || createArticle.isPending}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {createArticle.isPending ? "Luodaan..." : "Luo artikkeli"}
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="px-4 py-1.5 text-gray-600 text-sm hover:text-gray-800"
            >
              Peruuta
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Hae artikkeleista..."
            value={filters.search}
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value, page: 0 }))
            }
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={filters.category}
          onChange={(e) =>
            setFilters((f) => ({ ...f, category: e.target.value, page: 0 }))
          }
          className="rounded-md border border-gray-300 text-sm px-3 py-2"
        >
          <option value="all">Kaikki kategoriat</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={filters.visibility}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              visibility: e.target.value as KBFilters["visibility"],
              page: 0,
            }))
          }
          className="rounded-md border border-gray-300 text-sm px-3 py-2"
        >
          <option value="all">Kaikki</option>
          <option value="internal">Sisäinen</option>
          <option value="customer_facing">Julkinen</option>
        </select>
      </div>

      {/* Article list */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
        {isLoading ? (
          <div className="space-y-0 divide-y divide-gray-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-4">
                <div className="h-5 w-2/3 rounded bg-gray-200 animate-pulse mb-2" />
                <div className="h-3 w-1/3 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <BookOpen className="h-12 w-12 mb-3" />
            <p className="text-sm font-medium">Ei artikkeleita</p>
          </div>
        ) : (
          articles.map((article) => {
            const cat = categories?.find((c) => c.id === article.category);
            return (
              <Link
                key={article.id}
                to={`/asiakaspalvelu/tietopankki/${article.slug}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {article.title}
                    </h3>
                    {article.visibility === "customer_facing" ? (
                      <Globe className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    )}
                    {!article.is_published && (
                      <Badge className="bg-gray-100 text-gray-500 text-[10px]">
                        Luonnos
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {cat && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: cat.color + "18",
                          color: cat.color,
                        }}
                      >
                        {cat.label}
                      </span>
                    )}
                    <span>
                      Päivitetty {formatDateTime(article.updated_at)}
                    </span>
                    {article.view_count > 0 && (
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {article.view_count}
                      </span>
                    )}
                    {article.tags.length > 0 && (
                      <span className="text-gray-400 truncate">
                        {article.tags.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(article);
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Link>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {result && result.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {result.count} artikkelia
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={(filters.page ?? 0) === 0}
              onClick={() =>
                setFilters((f) => ({ ...f, page: (f.page ?? 0) - 1 }))
              }
              className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-600">
              {(filters.page ?? 0) + 1} / {result.totalPages}
            </span>
            <button
              disabled={(filters.page ?? 0) >= result.totalPages - 1}
              onClick={() =>
                setFilters((f) => ({ ...f, page: (f.page ?? 0) + 1 }))
              }
              className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
