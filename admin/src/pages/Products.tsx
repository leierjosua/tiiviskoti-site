import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useProducts, useProductCategories } from "@/hooks/useProducts";
import { formatCents } from "@/lib/utils";
import { PRODUCT_TAG_OPTIONS } from "@/lib/types";
import type { Product, ProductCategory } from "@/lib/types";
import { inputCls, selectCls } from "@/lib/constants";
import { Plus, ShoppingBag, Eye, AlertTriangle, Search, ArrowUpDown, Globe, LayoutGrid, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type SortKey = "name" | "brand" | "price_asc" | "price_desc" | "laitetyyppi";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Nimi (A-Ö)" },
  { value: "brand", label: "Merkki (A-Ö)" },
  { value: "price_asc", label: "Hinta (halvin ensin)" },
  { value: "price_desc", label: "Hinta (kallein ensin)" },
  { value: "laitetyyppi", label: "Laitetyyppi" },
];

const COMPONENT_SLUG = "komponentit";
const DEFAULT_SLUG = "ilmalampopumput";

type ProductRow = Product & { product_categories?: ProductCategory };

export default function Products() {
  const { data: categories } = useProductCategories();
  // Fetch ALL products once and filter client-side, so a parent tab can show
  // its whole subtree (the old per-category query left parent tabs empty).
  const { data: products, isLoading } = useProducts();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [showInactive, setShowInactive] = useState(false);
  const [compact, setCompact] = useState(false);
  // null = "Kaikki"; "__default" sentinel resolved to the default category below.
  const [tab, setTab] = useState<string | "__default" | null>("__default");

  // ─── Category tree (active parents + active children) ───────────────────────
  const categoryTree = useMemo(() => {
    if (!categories) return [];
    return categories
      .filter((c) => !c.parent_id && c.active)
      .map((p) => ({ ...p, children: categories.filter((c) => c.parent_id === p.id && c.active) }))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "fi"));
  }, [categories]);

  const defaultCategoryId = useMemo(() => {
    if (!categoryTree.length) return null;
    return (categoryTree.find((c) => c.slug === DEFAULT_SLUG) || categoryTree[0]).id;
  }, [categoryTree]);

  // Resolve the active category id (null = all).
  const activeCategoryId = tab === "__default" ? defaultCategoryId : tab;

  const componentParentId = useMemo(
    () => categories?.find((c) => c.slug === COMPONENT_SLUG && !c.parent_id)?.id ?? null,
    [categories],
  );

  // Set of category ids the active tab covers (a parent expands to its subtree).
  const selectedIdSet = useMemo(() => {
    if (!activeCategoryId || !categories) return null; // null = all
    const ids = new Set<string>([activeCategoryId]);
    for (const c of categories) if (c.parent_id === activeCategoryId) ids.add(c.id);
    return ids;
  }, [activeCategoryId, categories]);

  // Active tab belongs to the components subtree → default to compact list.
  const isComponentTab = useMemo(() => {
    if (!componentParentId || !activeCategoryId || !categories) return false;
    if (activeCategoryId === componentParentId) return true;
    return categories.find((c) => c.id === activeCategoryId)?.parent_id === componentParentId;
  }, [componentParentId, activeCategoryId, categories]);

  const effectiveCompact = compact || isComponentTab;

  // ─── Counts per category (active products, incl. subtree for parents) ───────
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    if (!products || !categories) return map;
    const direct = new Map<string, number>();
    for (const p of products) {
      if (!p.active) continue;
      direct.set(p.category_id, (direct.get(p.category_id) || 0) + 1);
    }
    for (const c of categories) {
      let n = direct.get(c.id) || 0;
      for (const kid of categories) if (kid.parent_id === c.id) n += direct.get(kid.id) || 0;
      map.set(c.id, n);
    }
    return map;
  }, [products, categories]);

  const activeTotal = useMemo(() => (products || []).filter((p) => p.active).length, [products]);

  // ─── Filter + sort ──────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let list: ProductRow[] = products;
    if (!showInactive) list = list.filter((p) => p.active);
    if (selectedIdSet) list = list.filter((p) => selectedIdSet.has(p.category_id));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.model && p.model.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)),
      );
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "name": return a.name.localeCompare(b.name, "fi");
        case "brand": {
          const c = (a.brand || "").localeCompare(b.brand || "", "fi");
          return c !== 0 ? c : a.name.localeCompare(b.name, "fi");
        }
        case "price_asc": return a.price_cents - b.price_cents;
        case "price_desc": return b.price_cents - a.price_cents;
        case "laitetyyppi": {
          const c = String(a.specs?.laitetyyppi || "").localeCompare(String(b.specs?.laitetyyppi || ""), "fi");
          return c !== 0 ? c : a.name.localeCompare(b.name, "fi");
        }
        default: return 0;
      }
    });
    return sorted;
  }, [products, search, sortBy, showInactive, selectedIdSet]);

  // Group rows by category for the compact list (sub-headers e.g. Sisä/Ulko).
  const compactGroups = useMemo(() => {
    if (!effectiveCompact) return null;
    const groups = new Map<string, ProductRow[]>();
    for (const p of filteredProducts) {
      const key = p.product_categories?.name || "Muut";
      groups.set(key, [...(groups.get(key) || []), p]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "fi"));
  }, [effectiveCompact, filteredProducts]);

  // Child sub-tabs for the active parent (or the active child's parent).
  const subTabParent = useMemo(() => {
    if (!activeCategoryId) return null;
    return categoryTree.find((p) => p.id === activeCategoryId || p.children.some((c) => c.id === activeCategoryId)) || null;
  }, [categoryTree, activeCategoryId]);

  const tabBtn = (active: boolean) =>
    `px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
      active ? "bg-accent text-white" : "bg-surface border border-border text-text-secondary hover:bg-surface-hover"
    }`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Tuotteet</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/tuotteet/kategoriat"
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
            Kategoriat
          </Link>
          <Link to="/tuotteet/uusi"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap">
            <Plus className="w-4 h-4" /> Lisää tuote
          </Link>
        </div>
      </div>

      {/* Top-level category tabs */}
      {categoryTree.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap items-center overflow-x-auto -mx-1 px-1 pb-1">
          {categoryTree.map((parent) => (
            <button key={parent.id} onClick={() => setTab(parent.id)} className={tabBtn(activeCategoryId === parent.id || parent.children.some((c) => c.id === activeCategoryId))}>
              {parent.name} <span className={activeCategoryId === parent.id ? "text-white/70" : "text-text-muted"}>({counts.get(parent.id) ?? 0})</span>
            </button>
          ))}
          <button onClick={() => setTab(null)} className={tabBtn(activeCategoryId === null)}>
            Kaikki <span className={activeCategoryId === null ? "text-white/70" : "text-text-muted"}>({activeTotal})</span>
          </button>
        </div>
      )}

      {/* Child sub-tabs (e.g. Sisäyksiköt / Ulkoyksiköt) */}
      {subTabParent && subTabParent.children.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <button
            onClick={() => setTab(subTabParent.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeCategoryId === subTabParent.id ? "bg-accent/15 text-accent-dark border border-accent/30" : "bg-surface-hover border border-border/50 text-text-muted hover:text-text-secondary"
            }`}
          >
            Kaikki
          </button>
          {subTabParent.children.map((child) => (
            <button
              key={child.id}
              onClick={() => setTab(child.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeCategoryId === child.id ? "bg-accent/15 text-accent-dark border border-accent/30" : "bg-surface-hover border border-border/50 text-text-muted hover:text-text-secondary"
              }`}
            >
              {child.name} <span className="text-text-muted">({counts.get(child.id) ?? 0})</span>
            </button>
          ))}
        </div>
      )}

      {/* Search + sort + view toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Hae nimellä, merkillä, mallilla tai SKU:lla..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls + " pl-9"}
          />
        </div>
        <div className="relative flex-shrink-0">
          <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className={selectCls + " pl-9 w-full sm:w-52"}>
            {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="flex items-center rounded-xl border border-border overflow-hidden flex-shrink-0">
          <button onClick={() => setCompact(false)} className={`p-2.5 transition-colors ${!effectiveCompact ? "bg-accent text-white" : "bg-surface text-text-muted hover:bg-surface-hover"}`} title="Ruudukko">
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setCompact(true)} className={`p-2.5 transition-colors ${effectiveCompact ? "bg-accent text-white" : "bg-surface text-text-muted hover:bg-surface-hover"}`} title="Lista">
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inactive toggle + count */}
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded border-border text-accent focus:ring-accent/30" />
          Näytä myös pois käytöstä olevat
        </label>
        <p className="text-xs text-text-muted">{filteredProducts.length} tuotetta</p>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">Ladataan...</div>
      ) : !products || products.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
          {categories && categories.length === 0
            ? "Luo ensin tuotekategoria ennen tuotteiden lisäämistä."
            : "Ei tuotteita. Lisää ensimmäinen tuote yllä olevasta napista."}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
          {search ? `Ei hakutuloksia haulle "${search}"` : "Ei tuotteita tässä kategoriassa."}
        </div>
      ) : effectiveCompact ? (
        <CompactList groups={compactGroups!} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}

// ─── Compact list (dense browsing — default for components) ────────────────────

function CompactList({ groups }: { groups: [string, ProductRow[]][] }) {
  return (
    <div className="space-y-6">
      {groups.map(([groupName, rows]) => (
        <div key={groupName}>
          {groups.length > 1 && (
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{groupName} ({rows.length})</h3>
          )}
          <div className="bg-surface rounded-2xl border border-border overflow-hidden divide-y divide-border">
            {rows.map((p) => (
              <Link key={p.id} to={`/tuotteet/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {p.brand && <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{p.brand}</span>}
                    <span className="text-sm font-medium text-text-primary truncate group-hover:text-accent-dark transition-colors">{p.name}</span>
                    {!p.active && <Badge className="bg-gray-100 text-gray-500 border border-gray-200 text-[10px]">Pois käytöstä</Badge>}
                  </div>
                  {p.sku && <span className="text-[10px] text-text-muted font-mono">{p.sku}</span>}
                </div>
                {p.cost_cents > 0 && (
                  <span className="text-[11px] text-text-muted whitespace-nowrap hidden sm:inline">osto {formatCents(p.cost_cents)}</span>
                )}
                <span className={`text-sm font-semibold whitespace-nowrap ${p.price_cents === 0 ? "text-amber-600" : "text-text-primary"}`}>
                  {p.price_cents === 0 ? "Ei hintaa" : formatCents(p.price_cents)}
                </span>
                {p.price_cents === 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Product card (grid view) ─────────────────────────────────────────────────

function ProductCard({ p }: { p: ProductRow }) {
  return (
    <Link to={`/tuotteet/${p.id}`} className="bg-surface rounded-2xl border border-border overflow-hidden hover:border-accent/30 hover:shadow-sm transition-all group">
      <div className="h-48 bg-surface-hover flex items-center justify-center p-4 relative">
        {p.images.length > 0 ? (
          <img src={p.images[0]} alt={p.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <ShoppingBag className="w-10 h-10 text-text-muted/30" />
        )}
        {p.price_cents === 0 && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2 py-0.5 text-[10px] font-semibold">
            <AlertTriangle className="w-3 h-3" /> Ei hintaa
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            {p.brand && <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{p.brand}{p.model ? ` · ${p.model}` : ""}</p>}
            <h3 className="font-semibold text-sm text-text-primary group-hover:text-accent-dark transition-colors">{p.name}</h3>
          </div>
          <Eye className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className={`text-sm font-bold ${p.price_cents === 0 ? "text-amber-600" : "text-text-primary"}`}>
            {p.price_cents === 0 ? "Ei hintaa" : formatCents(p.price_cents)}
          </span>
          {p.sku && <span className="text-[10px] text-text-muted font-mono">SKU: {p.sku}</span>}
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge className="bg-gray-100 text-gray-500 border border-gray-200 text-[10px]">{p.product_categories?.name || "—"}</Badge>
          {p.specs?.laitetyyppi && (
            <Badge className={p.specs.laitetyyppi === "Lämmittävä"
              ? "bg-orange-50 text-orange-700 border border-orange-200 text-[10px]"
              : "bg-blue-50 text-blue-700 border border-blue-200 text-[10px]"}>
              {String(p.specs.laitetyyppi)}
            </Badge>
          )}
          {p.tags?.map((tag) => {
            const tagDef = PRODUCT_TAG_OPTIONS.find((t) => t.value === tag);
            return tagDef ? <Badge key={tag} className={`${tagDef.color} border text-[10px]`}>{tagDef.label}</Badge> : null;
          })}
          {p.show_on_website && (
            <Badge className="bg-accent-muted text-accent-dark border border-accent/30 text-[10px]"><Globe className="w-3 h-3 mr-0.5" /> Sivuilla</Badge>
          )}
          {!p.active && <Badge className="bg-gray-100 text-gray-500 border border-gray-200 text-[10px]">Pois käytöstä</Badge>}
          {p.stock_quantity != null && p.stock_low_threshold != null && p.stock_quantity <= p.stock_low_threshold && (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px]"><AlertTriangle className="w-3 h-3 mr-1" /> Varasto vähissä ({p.stock_quantity})</Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
