import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProductCategories, useCreateProductCategory, useUpdateProductCategory } from "@/hooks/useProducts";
import { inputCls, selectCls } from "@/lib/constants";
import { Plus, Pencil, X, Check, FolderOpen, Trash2, ChevronRight, FolderPlus, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/context/ToastContext";
import type { ProductCategory, SpecField } from "@/lib/types";

type CategoryForm = {
  parent_id: string;
  name: string;
  slug: string;
  description: string;
  spec_schema: SpecField[];
};

const emptyForm: CategoryForm = {
  parent_id: "",
  name: "",
  slug: "",
  description: "",
  spec_schema: [],
};

function toForm(c: ProductCategory): CategoryForm {
  return {
    parent_id: c.parent_id || "",
    name: c.name,
    slug: c.slug,
    description: c.description || "",
    spec_schema: c.spec_schema,
  };
}

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function keyify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
}

const SPEC_TYPES = [
  { value: "text", label: "Teksti" },
  { value: "number", label: "Numero" },
  { value: "boolean", label: "Kyllä/Ei" },
  { value: "select", label: "Valinta" },
] as const;

function SpecSchemaEditor({ fields, onChange }: { fields: SpecField[]; onChange: (f: SpecField[]) => void }) {
  // Collect unique groups for datalist
  const existingGroups = [...new Set(fields.map((f) => f.group).filter(Boolean))] as string[];

  function addField() {
    onChange([...fields, { key: "", label: "", type: "text" }]);
  }

  function updateField(index: number, patch: Partial<SpecField>) {
    const updated = fields.map((f, i) => {
      if (i !== index) return f;
      const merged = { ...f, ...patch };
      // Auto-generate key from label if key hasn't been manually edited
      if (patch.label !== undefined && (f.key === "" || f.key === keyify(f.label))) {
        merged.key = keyify(patch.label);
      }
      return merged;
    });
    onChange(updated);
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const updated = [...fields];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    onChange(updated);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Tuotekentät</p>
        <button type="button" onClick={addField}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-surface-hover transition-colors">
          <Plus className="w-3 h-3" /> Lisää kenttä
        </button>
      </div>
      {fields.length === 0 && (
        <p className="text-xs text-text-muted mb-3">Ei tuotekenttiä. Nämä kentät näkyvät tuotteen tiedoissa (esim. teho, energialuokka).</p>
      )}
      <datalist id="spec-groups">
        {existingGroups.map((g) => <option key={g} value={g} />)}
      </datalist>
      <div className="space-y-3">
        {fields.map((field, i) => (
          <div key={i} className="bg-surface-hover/50 rounded-xl p-3">
            <div className="flex gap-2 items-start">
              <div className="flex flex-col gap-0.5 mt-1.5 shrink-0">
                <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0}
                  className="text-text-muted hover:text-text-primary disabled:opacity-20 text-[10px] leading-none p-1">▲</button>
                <button type="button" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1}
                  className="text-text-muted hover:text-text-primary disabled:opacity-20 text-[10px] leading-none p-1">▼</button>
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <input
                  type="text" placeholder="Kentän nimi (esim. Lämmitysteho)" value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  className={inputCls + " text-xs"}
                />
                <select
                  value={field.type}
                  onChange={(e) => updateField(i, { type: e.target.value as SpecField["type"] })}
                  className={inputCls + " text-xs"}
                >
                  {SPEC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <input
                  type="text" placeholder="Yksikkö (esim. kW)" value={field.unit || ""}
                  onChange={(e) => updateField(i, { unit: e.target.value || undefined })}
                  className={inputCls + " text-xs"}
                />
                <input
                  type="text" list="spec-groups" placeholder="Ryhmä (esim. Suorituskyky)" value={field.group || ""}
                  onChange={(e) => updateField(i, { group: e.target.value || undefined })}
                  className={inputCls + " text-xs"}
                />
              </div>
              <div className="flex items-center gap-1 mt-1 shrink-0">
                <label className="flex items-center gap-1 cursor-pointer" title="Pakollinen">
                  <input type="checkbox" checked={!!field.required}
                    onChange={(e) => updateField(i, { required: e.target.checked || undefined })}
                    className="rounded border-border text-accent focus:ring-accent/30 w-3 h-3"
                  />
                  <span className="text-[10px] text-text-muted">Pak.</span>
                </label>
                <button type="button" onClick={() => removeField(i)}
                  className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {field.type === "select" && (
              <div className="mt-2 ml-6">
                <input
                  type="text" placeholder="Vaihtoehdot pilkuilla erotettuna (esim. A+++, A++, A+, A, B)" value={field.options?.join(", ") || ""}
                  onChange={(e) => updateField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  className={inputCls + " text-xs w-full"}
                />
              </div>
            )}
            {field.key && (
              <p className="text-[10px] text-text-muted mt-1.5 ml-6 font-mono">
                Tunnus: {field.key}
                {field.group && <span className="ml-2 text-amber-600">Ryhmä: {field.group}</span>}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Build a tree from flat categories list */
function buildTree(categories: ProductCategory[]): (ProductCategory & { children: ProductCategory[] })[] {
  const map = new Map<string, ProductCategory & { children: ProductCategory[] }>();
  for (const c of categories) {
    map.set(c.id, { ...c, children: [] });
  }
  const roots: (ProductCategory & { children: ProductCategory[] })[] = [];
  for (const c of map.values()) {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

function CategoryCard({
  category,
  depth,
  editingId,
  onStartEdit,
  onToggleActive,
  onAddSubcategory,
  formContent,
}: {
  category: ProductCategory & { children?: ProductCategory[] };
  depth: number;
  editingId: string | null;
  onStartEdit: (c: ProductCategory) => void;
  onToggleActive: (c: ProductCategory) => void;
  onAddSubcategory: (parentId: string) => void;
  formContent: () => React.ReactNode;
}) {
  return (
    <>
      <div
        className={`bg-surface rounded-2xl border border-border overflow-hidden ${depth > 0 ? "ml-3 sm:ml-6" : ""}`}
      >
        {editingId === category.id ? (
          formContent()
        ) : (
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                depth === 0 ? "bg-amber-50" : "bg-amber-50/50"
              }`}>
                {depth > 0 ? (
                  <ChevronRight className="w-4 h-4 text-amber-400" />
                ) : (
                  <FolderOpen className="w-5 h-5 text-amber-600" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {depth > 0 && <span className="text-xs text-text-muted">↳</span>}
                  <span className="font-semibold text-sm text-text-primary">{category.name}</span>
                  <Badge className="bg-gray-100 text-gray-500 border border-gray-200 font-mono text-[10px]">
                    {category.slug}
                  </Badge>
                  <Badge className={category.active ? "bg-accent-muted text-accent-dark border border-accent/30" : "bg-gray-100 text-gray-500 border border-gray-200"}>
                    {category.active ? "Aktiivinen" : "Pois käytöstä"}
                  </Badge>
                </div>
                {category.description && <p className="text-xs text-text-muted mt-0.5">{category.description}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {category.spec_schema.map((f) => (
                    <span key={f.key} className="px-2 py-0.5 bg-surface-hover text-text-secondary text-[10px] rounded-md">
                      {f.group ? `${f.group} / ` : ""}{f.label}{f.unit ? ` (${f.unit})` : ""}
                    </span>
                  ))}
                  {category.spec_schema.length === 0 && <span className="text-xs text-text-muted">Ei tuotekenttiä</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {depth === 0 && (
                <button onClick={() => onAddSubcategory(category.id)}
                  className="p-2 rounded-lg text-text-muted hover:text-amber-600 hover:bg-amber-50 transition-colors"
                  title="Lisää alakategoria">
                  <FolderPlus className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => onToggleActive(category)}
                className={`p-2 rounded-lg transition-colors ${category.active ? "text-text-muted hover:text-red-500 hover:bg-red-50" : "text-text-muted hover:text-accent-dark hover:bg-accent-muted"}`}
                title={category.active ? "Poista käytöstä" : "Ota käyttöön"}>
                {category.active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => onStartEdit(category)}
                className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title="Muokkaa">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      {category.children?.map((child) => (
        <CategoryCard
          key={child.id}
          category={child as ProductCategory & { children?: ProductCategory[] }}
          depth={depth + 1}
          editingId={editingId}
          onStartEdit={onStartEdit}
          onToggleActive={onToggleActive}
          onAddSubcategory={onAddSubcategory}
          formContent={formContent}
        />
      ))}
    </>
  );
}

export default function ProductCategories() {
  const { data: categories, isLoading } = useProductCategories();
  const createCategory = useCreateProductCategory();
  const updateCategory = useUpdateProductCategory();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Build tree for display
  const tree = useMemo(() => buildTree(categories || []), [categories]);

  // Only top-level categories can be parents
  const topLevelCategories = (categories || []).filter((c) => !c.parent_id);

  // Scroll to form when shown
  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm]);

  function openCreateForm(parentId?: string) {
    setEditingId(null);
    setForm({ ...emptyForm, parent_id: parentId || "" });
    setShowForm(true);
    setError("");
  }

  function startEdit(c: ProductCategory) {
    setEditingId(c.id);
    setForm(toForm(c));
    setShowForm(false);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
    setError("");
  }

  async function handleCreate(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    try {
      await createCategory.mutateAsync({
        parent_id: form.parent_id || null,
        name: form.name,
        slug: form.slug || slugify(form.name),
        description: form.description || null,
        spec_schema: form.spec_schema,
        seo_title: null,
        seo_description: null,
        hero_image: null,
        active: true,
        sort_order: 0,
      });
      setShowForm(false);
      setForm(emptyForm);
      toast("Kategoria luotu", "success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Luonti epäonnistui");
    }
  }

  async function handleUpdate(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editingId) return;
    setError("");
    try {
      await updateCategory.mutateAsync({
        id: editingId,
        parent_id: form.parent_id || null,
        name: form.name,
        slug: form.slug,
        description: form.description || null,
        spec_schema: form.spec_schema,
      });
      cancelEdit();
      toast("Kategoria päivitetty", "success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Päivitys epäonnistui");
    }
  }

  async function toggleActive(c: ProductCategory) {
    try {
      await updateCategory.mutateAsync({ id: c.id, active: !c.active });
      toast(c.active ? "Kategoria poistettu käytöstä" : "Kategoria otettu käyttöön", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Päivitys epäonnistui", "error");
    }
  }

  const renderForm = (onSubmit: (e: React.FormEvent) => void, submitLabel: string, isPending: boolean) => (
    <form ref={showForm ? formRef : undefined} onSubmit={onSubmit} className="bg-surface rounded-2xl border border-border p-6 mb-6 space-y-5">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Yläkategoria</label>
          <select
            value={form.parent_id}
            onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            className={selectCls}
          >
            <option value="">— Ylin taso (ei yläkategoriaa)</option>
            {topLevelCategories
              .filter((c) => c.id !== editingId)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Kategorian nimi *</label>
          <input type="text" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value, slug: editingId ? form.slug : slugify(e.target.value) })}
            className={inputCls} placeholder="Esim. Ilmalämpöpumput" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>URL-tunnus (slug)</label>
          <input type="text" required value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className={inputCls + " font-mono text-sm"} />
          <p className="text-[10px] text-text-muted mt-1">Luodaan automaattisesti nimestä</p>
        </div>
        <div>
          <label className={labelCls}>Kuvaus</label>
          <input type="text" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={inputCls} placeholder="Valinnainen kuvaus" />
        </div>
      </div>

      <SpecSchemaEditor fields={form.spec_schema} onChange={(spec_schema) => setForm({ ...form, spec_schema })} />

      <div className="flex gap-3">
        <button type="submit" disabled={isPending}
          className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
          {isPending ? "Tallennetaan..." : submitLabel}
        </button>
        <button type="button" onClick={cancelEdit}
          className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
          Peruuta
        </button>
      </div>
    </form>
  );

  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/tuotteet")}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Tuotekategoriat</h1>
        </div>
        <button onClick={() => openCreateForm()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap">
          <Plus className="w-4 h-4" /> Lisää kategoria
        </button>
      </div>

      {showForm && renderForm(handleCreate, "Luo kategoria", createCategory.isPending)}

      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">Ladataan...</div>
        ) : !categories || categories.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border p-12 text-center">
            <FolderOpen className="w-10 h-10 text-text-muted/30 mx-auto mb-3" />
            <p className="text-sm text-text-muted mb-4">Ei tuotekategorioita vielä.</p>
            <button onClick={() => openCreateForm()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" /> Luo ensimmäinen kategoria
            </button>
          </div>
        ) : (
          tree.map((c) => (
            <CategoryCard
              key={c.id}
              category={c}
              depth={0}
              editingId={editingId}
              onStartEdit={startEdit}
              onToggleActive={toggleActive}
              onAddSubcategory={(parentId) => openCreateForm(parentId)}
              formContent={() => renderForm(handleUpdate, "Tallenna", updateCategory.isPending)}
            />
          ))
        )}
      </div>
    </div>
  );
}
