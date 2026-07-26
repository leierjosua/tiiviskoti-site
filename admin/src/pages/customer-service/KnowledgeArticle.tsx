import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import DOMPurify from "dompurify";
import { Badge } from "@/components/ui/badge";
import {
  useKBArticle,
  useUpdateKBArticle,
  useKBArticleVersions,
} from "@/hooks/customer-service/useKnowledgeBase";
import { useCSCategories } from "@/hooks/customer-service/useTickets";
import { useUserRole } from "@/context/UserRoleContext";
import { useToast } from "@/context/ToastContext";
import {
  ArrowLeft,
  Save,
  Globe,
  Lock,
  History,
  X,
  Plus,
  Loader2,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export default function KnowledgeArticleEditor() {
  const { slug } = useParams<{ slug: string }>();
  const toast = useToast();
  const { employee } = useUserRole();

  const { data: article, isLoading } = useKBArticle(slug);
  const { data: categories } = useCSCategories();
  const { data: versions } = useKBArticleVersions(article?.id);
  const updateArticle = useUpdateKBArticle();

  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [category, setCategory] = useState("general");
  const [visibility, setVisibility] = useState<"internal" | "customer_facing">("internal");
  const [isPublished, setIsPublished] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (article) {
      setTitle(article.title);
      setBodyHtml(article.body_html);
      setBodyText(article.body_text);
      setCategory(article.category);
      setVisibility(article.visibility);
      setIsPublished(article.is_published);
      setTags(article.tags);
      setDirty(false);
    }
  }, [article]);

  function handleSave() {
    if (!article) return;
    updateArticle.mutate(
      {
        id: article.id,
        title,
        body_html: bodyHtml,
        body_text: bodyText,
        category,
        visibility,
        is_published: isPublished,
        tags,
        changedBy: employee?.id,
      },
      {
        onSuccess: () => {
          toast.success("Artikkeli tallennettu");
          setDirty(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    setTags([...tags, tag]);
    setNewTag("");
    setDirty(true);
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
    setDirty(true);
  }

  function stripHtml(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = DOMPurify.sanitize(html);
    return div.textContent || div.innerText || "";
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="text-center py-24">
        <p className="text-gray-500">Artikkelia ei löytynyt</p>
        <Link to="/asiakaspalvelu/tietopankki" className="text-indigo-600 text-sm mt-2 inline-block">
          ← Takaisin tietopankkiin
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/asiakaspalvelu/tietopankki"
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg sm:text-xl font-bold">Artikkeli</h1>
          {dirty && (
            <Badge className="bg-amber-100 text-amber-700 text-xs shrink-0">
              Tallentamattomia muutoksia
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="inline-flex items-center gap-2 px-3 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Versiot</span> ({versions?.length ?? 0})
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || updateArticle.isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {updateArticle.isPending ? "Tallennetaan..." : "Tallenna"}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Editor */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="w-full text-2xl font-bold border-none bg-transparent focus:outline-none placeholder:text-gray-300"
            placeholder="Artikkelin otsikko..."
          />

          {/* Content editor */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <textarea
              value={bodyHtml}
              onChange={(e) => {
                setBodyHtml(e.target.value);
                setBodyText(stripHtml(e.target.value));
                setDirty(true);
              }}
              rows={20}
              className="w-full px-4 py-3 text-sm border-none bg-transparent focus:outline-none resize-y font-mono"
              placeholder="Kirjoita artikkelin sisältö HTML-muodossa..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-72 shrink-0 space-y-4">
          {/* Settings */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">
                Kategoria
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setDirty(true);
                }}
                className="w-full rounded-md border border-gray-300 text-sm px-2 py-1.5"
              >
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">
                Näkyvyys
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVisibility("internal");
                    setDirty(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                    visibility === "internal"
                      ? "bg-gray-200 text-gray-800"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Sisäinen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVisibility("customer_facing");
                    setDirty(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                    visibility === "customer_facing"
                      ? "bg-green-100 text-green-800"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  Julkinen
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">
                Tila
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => {
                    setIsPublished(e.target.checked);
                    setDirty(true);
                  }}
                  className="rounded border-gray-300"
                />
                Julkaistu
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">
                Tägit
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    className="bg-gray-100 text-gray-700 text-xs inline-flex items-center gap-1"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), addTag())
                  }
                  placeholder="Lisää..."
                  className="flex-1 rounded-md border border-gray-300 text-sm px-2 py-1"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="p-1 rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-1 text-xs text-gray-500 border-t border-gray-100 pt-3">
              <p>Katselukerrat: {article.view_count}</p>
              <p>AI-käytöt: {article.use_count}</p>
              <p>Luotu: {formatDateTime(article.created_at)}</p>
              <p>Muokattu: {formatDateTime(article.updated_at)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Version history */}
      {showVersions && versions && versions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Versiohistoria
          </h3>
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div>
                  <p className="text-sm text-gray-700">{v.title}</p>
                  <p className="text-xs text-gray-500">
                    {v.changer
                      ? `${v.changer.first_name} ${v.changer.last_name}`
                      : "Tuntematon"}{" "}
                    — {formatDateTime(v.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setTitle(v.title);
                    setBodyHtml(v.body_html);
                    setBodyText(v.body_text);
                    setDirty(true);
                    toast.success("Versio palautettu — tallenna muutokset");
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  Palauta
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
