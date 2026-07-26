import { useState, useMemo, useCallback } from "react";
import {
  Plus,
  Minus,
  Trash2,
  Search,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
  Package,
  Sparkles,
} from "lucide-react";
import type { WizardState, WizardAction, CustomItem } from "./types";
import type { Service, ServiceVariant, AddonService, Product, AddonServiceLink, ServiceProductLink } from "@/lib/types";
import type { ComputedTotals } from "./computeLineItems";
import { formatCents } from "@/lib/utils";
import { inputCls, selectCls } from "@/lib/constants";
import { MultisplitBuilder } from "./MultisplitBuilder";

const labelCls = "block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2";

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  allServices: Service[];
  allAddons: AddonService[];
  allProducts: Product[];
  variants: ServiceVariant[];
  serviceCategories: ServiceCategory[];
  linkedAddonData: (AddonServiceLink & { addon_services: AddonService })[];
  relevantProductCategoryIds: string[];
  productLinks: (ServiceProductLink & { products: Product })[];
  templates: { id: string; name: string; sales_quote_template_items?: { line_type: string; item_id: string | null; name: string; unit_price_cents: number; quantity: number }[] }[];
  computed: ComputedTotals;
  onApplyTemplate: (templateId: string) => void;
}

// ─── ItemSelectionPanel: reusable selection UI for any context ─────────────

interface PanelProps {
  serviceQty: Record<string, number>;
  serviceVariantId: Record<string, string>;
  addonQty: Record<string, number>;
  productQty: Record<string, number>;
  customItems: CustomItem[];
  allServices: Service[];
  allAddons: AddonService[];
  allProducts: Product[];
  variants: ServiceVariant[];
  onSetServiceQty: (id: string, qty: number) => void;
  onSetVariant: (serviceId: string, variantId: string) => void;
  onSetAddonQty: (id: string, qty: number) => void;
  onSetProductQty: (id: string, qty: number) => void;
  onAddCustomItem: (item: CustomItem) => void;
  onRemoveCustomItem: (index: number) => void;
  showServices?: boolean;
  /** When true, replace the flat device list with the 1-outdoor + N-indoor multisplit builder. */
  multisplitMode?: boolean;
}

function ItemSelectionPanel({
  serviceQty, serviceVariantId, addonQty, productQty, customItems,
  allServices, allAddons, allProducts, variants,
  onSetServiceQty, onSetVariant, onSetAddonQty, onSetProductQty,
  onAddCustomItem, onRemoveCustomItem,
  showServices = true,
  multisplitMode = false,
}: PanelProps) {
  const [productSearch, setProductSearch] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customDraft, setCustomDraft] = useState({ name: "", price: "", qty: "1", duration: "", materialCost: "" });
  const [showMoreServices, setShowMoreServices] = useState(false);
  const [expandedBrands, setExpandedBrands] = useState<Record<string, boolean>>({});
  const [showAddons, setShowAddons] = useState(true);
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<string | null>(null); // "Lämmittävä" | "Viilentävä" | null
  const [powerClassFilter, setPowerClassFilter] = useState<string | null>(null); // "25" | "35" | null

  const activeServices = useMemo(() => allServices.filter((s) => s.active), [allServices]);
  const activeAddons = useMemo(() => allAddons.filter((a) => a.active), [allAddons]);
  const activeProducts = useMemo(() => {
    let products = allProducts.filter((p) => p.active);
    if (deviceTypeFilter) {
      products = products.filter((p) => p.specs?.laitetyyppi === deviceTypeFilter);
    }
    if (powerClassFilter) {
      products = products.filter((p) => {
        // Use cooling capacity (teho_viilennys) to determine size class
        // 25-class: < 3.0 kW, 35-class: >= 3.0 kW
        const teho = Number(p.specs?.teho_viilennys || p.specs?.teho_lammitys || 0);
        if (powerClassFilter === "25") return teho > 0 && teho < 3.0;
        if (powerClassFilter === "35") return teho >= 3.0;
        return true;
      });
    }
    return products;
  }, [allProducts, deviceTypeFilter, powerClassFilter]);

  const { primaryService, otherServices } = useMemo(() => {
    const p =
      activeServices.find((s) => s.name.toLowerCase().includes("perusasennus")) ||
      activeServices.find((s) => s.name.toLowerCase().includes("asennus")) ||
      activeServices[0];
    return { primaryService: p || null, otherServices: activeServices.filter((s) => s.id !== p?.id) };
  }, [activeServices]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return activeProducts;
    const q = productSearch.toLowerCase();
    return activeProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q),
    );
  }, [activeProducts, productSearch]);

  const productsByBrand = useMemo(() => {
    const brandOrder: Record<string, number> = { "Toshiba": 0, "Panasonic": 1, "Mitsubishi Electric": 2, "Haier": 3 };
    const map: Record<string, Product[]> = {};
    filteredProducts.forEach((p) => { const b = p.brand || "Muu"; if (!map[b]) map[b] = []; map[b].push(p); });
    return Object.entries(map).sort(([a], [b]) => (brandOrder[a] ?? 99) - (brandOrder[b] ?? 99));
  }, [filteredProducts]);

  const inc = (setter: (id: string, qty: number) => void, current: Record<string, number>, id: string) => setter(id, (current[id] || 0) + 1);
  const dec = (setter: (id: string, qty: number) => void, current: Record<string, number>, id: string) => setter(id, Math.max(0, (current[id] || 0) - 1));

  const primaryServiceId = Object.entries(serviceQty).find(([, q]) => q > 0)?.[0];

  return (
    <div className="space-y-6">
      {/* Services */}
      {showServices && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Palvelu</h3>
          {primaryService && (() => {
            const svc = primaryService;
            const qty = serviceQty[svc.id] || 0;
            return (
              <div className={`border rounded-xl p-4 transition-colors mb-3 ${qty > 0 ? "border-accent bg-accent/5" : "border-border"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{svc.name}</span>
                  <span className="text-sm font-medium text-text-muted">{formatCents(svc.base_price_cents)}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => dec(onSetServiceQty, serviceQty, svc.id)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Minus size={14} /></button>
                    <span className="text-sm font-semibold w-6 text-center">{qty}</span>
                    <button onClick={() => inc(onSetServiceQty, serviceQty, svc.id)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Plus size={14} /></button>
                  </div>
                  {qty > 0 && svc.id === primaryServiceId && variants.length > 0 && (
                    <select
                      className={`${selectCls} text-xs max-w-[180px]`}
                      value={serviceVariantId[svc.id] || ""}
                      onChange={(e) => onSetVariant(svc.id, e.target.value)}
                    >
                      <option value="">Perus</option>
                      {variants.map((v) => <option key={v.id} value={v.id}>{v.label} ({formatCents(v.price_cents)})</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })()}

          {otherServices.length > 0 && (
            <div>
              <button onClick={() => setShowMoreServices(!showMoreServices)} className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors mb-2">
                {showMoreServices ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showMoreServices ? "Piilota muut palvelut" : `Muut palvelut (${otherServices.length})`}
              </button>
              {showMoreServices && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {otherServices.map((svc) => {
                    const qty = serviceQty[svc.id] || 0;
                    return (
                      <div key={svc.id} className={`border rounded-xl p-3 transition-colors ${qty > 0 ? "border-accent bg-accent/5" : "border-border"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{svc.name}</span>
                          <span className="text-xs text-text-muted">{formatCents(svc.base_price_cents)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => dec(onSetServiceQty, serviceQty, svc.id)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Minus size={14} /></button>
                          <span className="text-sm font-semibold w-6 text-center">{qty}</span>
                          <button onClick={() => inc(onSetServiceQty, serviceQty, svc.id)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Plus size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Products */}
      {multisplitMode ? (
        <MultisplitBuilder allProducts={allProducts} productQty={productQty} onSetProductQty={onSetProductQty} />
      ) : (
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Laitteet</h3>

        {/* Quick filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          {/* Device type */}
          {(["Lämmittävä", "Viilentävä"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setDeviceTypeFilter(deviceTypeFilter === t ? null : t)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                deviceTypeFilter === t
                  ? t === "Lämmittävä" ? "bg-orange-100 text-orange-700 border border-orange-300" : "bg-sky-100 text-sky-700 border border-sky-300"
                  : "bg-bg-secondary text-text-muted border border-border hover:border-accent/30"
              }`}
            >
              {t === "Lämmittävä" ? "Lämmitys" : "Viilennys"}
            </button>
          ))}
          <span className="w-px h-5 bg-border self-center" />
          {/* Power class */}
          {(["25", "35"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setPowerClassFilter(powerClassFilter === c ? null : c)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                powerClassFilter === c
                  ? "bg-brand/10 text-brand border border-brand/30"
                  : "bg-bg-secondary text-text-muted border border-border hover:border-accent/30"
              }`}
            >
              {c}-luokka
            </button>
          ))}
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input className={`${inputCls} pl-9`} placeholder="Hae laitteita..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
        </div>

        {Object.keys(productQty).filter((id) => productQty[id] > 0).length > 0 && (
          <div className="space-y-2 mb-3">
            {activeProducts.filter((p) => (productQty[p.id] || 0) > 0).map((prod) => (
              <div key={prod.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-accent bg-accent/5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Thumb src={prod.images?.[0]} />
                  <div className="min-w-0">
                    {prod.brand && <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mr-1">{prod.brand}</span>}
                    <span className="text-sm font-medium break-words">{prod.name}</span>
                    <span className="text-xs text-text-muted ml-2">{formatCents(prod.price_cents)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => dec(onSetProductQty, productQty, prod.id)} className="w-8 h-8 sm:w-7 sm:h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Minus size={14} /></button>
                  <span className="text-sm font-semibold w-6 text-center">{productQty[prod.id]}</span>
                  <button onClick={() => inc(onSetProductQty, productQty, prod.id)} className="w-8 h-8 sm:w-7 sm:h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Plus size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1">
          {productsByBrand.map(([brand, products]) => {
            const isOpen = !!expandedBrands[brand] || !!productSearch || !!deviceTypeFilter || !!powerClassFilter;
            const selectedCount = products.filter((p) => (productQty[p.id] || 0) > 0).length;
            return (
              <div key={brand} className="border border-border rounded-xl overflow-hidden">
                <button onClick={() => setExpandedBrands((prev) => ({ ...prev, [brand]: !prev[brand] }))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-muted">{brand}</span>
                    <span className="text-[10px] text-text-muted">({products.length})</span>
                    {selectedCount > 0 && <span className="text-[10px] font-semibold text-accent bg-accent/10 rounded-full px-1.5 py-0.5">{selectedCount} valittu</span>}
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {products.filter((p) => !(productQty[p.id] > 0)).map((prod) => (
                      <div
                        key={prod.id}
                        onClick={() => inc(onSetProductQty, productQty, prod.id)}
                        className="border border-border rounded-lg p-3 hover:border-accent/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start gap-2.5">
                          <Thumb src={prod.images?.[0]} size={40} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-sm font-medium truncate">{prod.name}</span>
                              <span className="text-xs text-text-muted ml-1 flex-shrink-0">{formatCents(prod.price_cents)}</span>
                            </div>
                            {prod.sku && <p className="text-[10px] text-text-muted mb-1">{prod.sku}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {filteredProducts.length === 0 && <p className="text-sm text-text-muted text-center py-4">Ei laitteita</p>}
      </div>
      )}

      {/* Addon services */}
      <div>
        {activeAddons.filter((a) => (addonQty[a.id] || 0) > 0).length > 0 && (
          <div className="space-y-2 mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Valitut lisäpalvelut</h3>
            {activeAddons.filter((a) => (addonQty[a.id] || 0) > 0).map((addon) => (
              <div key={addon.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-accent bg-accent/5">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{addon.name}</span>
                  <span className="text-xs text-text-muted ml-2">{formatCents(addon.price_cents)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => dec(onSetAddonQty, addonQty, addon.id)} className="w-8 h-8 sm:w-7 sm:h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Minus size={14} /></button>
                  <span className="text-sm font-semibold w-6 text-center">{addonQty[addon.id]}</span>
                  <button onClick={() => inc(onSetAddonQty, addonQty, addon.id)} className="w-8 h-8 sm:w-7 sm:h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Plus size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setShowAddons(!showAddons)} className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors">
          {showAddons ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showAddons ? "Piilota lisäpalvelut" : `Lisäpalvelut (${activeAddons.length})`}
        </button>
        {showAddons && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {activeAddons.filter((a) => !(addonQty[a.id] > 0)).map((addon) => (
              <div
                key={addon.id}
                onClick={() => inc(onSetAddonQty, addonQty, addon.id)}
                className="border border-border rounded-xl p-3 hover:border-accent/30 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{addon.name}</span>
                  <span className="text-xs text-text-muted">{formatCents(addon.price_cents)}</span>
                </div>
                {addon.description && <p className="text-[10px] text-text-muted mb-1">{addon.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom items */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Muut veloitukset</h3>
        {customItems.map((ci, idx) => (
          <div key={idx} className="flex items-center gap-3 mb-2 border border-border rounded-xl p-3">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{ci.name}</span>
              <div className="flex gap-3 text-[10px] text-text-muted mt-0.5">
                {ci.durationMinutes > 0 && <span>{ci.durationMinutes} min</span>}
                {ci.materialCostCents > 0 && <span>Materiaalit {formatCents(ci.materialCostCents)}</span>}
              </div>
            </div>
            <span className="text-sm text-text-muted flex-shrink-0">{ci.qty} x {formatCents(ci.priceCents)}</span>
            <button onClick={() => onRemoveCustomItem(idx)} className="text-red-500 hover:text-red-700 flex-shrink-0"><Trash2 size={14} /></button>
          </div>
        ))}
        {showCustomForm ? (
          <div className="border border-border rounded-xl p-3 space-y-3">
            <div>
              <label className={labelCls}>Nimi</label>
              <input className={inputCls} value={customDraft.name} onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })} placeholder="esim. Lisätyö, putkiremontti" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className={labelCls}>Hinta (EUR)</label><input className={inputCls} type="number" step="0.01" min="0" value={customDraft.price} onChange={(e) => setCustomDraft({ ...customDraft, price: e.target.value })} /></div>
              <div><label className={labelCls}>Määrä</label><input className={inputCls} type="number" min="1" value={customDraft.qty} onChange={(e) => setCustomDraft({ ...customDraft, qty: e.target.value })} /></div>
              <div><label className={labelCls}>Kesto (min)</label><input className={inputCls} type="number" min="0" value={customDraft.duration} onChange={(e) => setCustomDraft({ ...customDraft, duration: e.target.value })} placeholder="0" /></div>
              <div><label className={labelCls}>Materiaalit (EUR)</label><input className={inputCls} type="number" step="0.01" min="0" value={customDraft.materialCost} onChange={(e) => setCustomDraft({ ...customDraft, materialCost: e.target.value })} placeholder="0" /></div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!customDraft.name || !customDraft.price) return;
                  onAddCustomItem({
                    name: customDraft.name,
                    priceCents: Math.round(parseFloat(customDraft.price) * 100),
                    qty: parseInt(customDraft.qty) || 1,
                    durationMinutes: parseInt(customDraft.duration) || 0,
                    materialCostCents: Math.round(parseFloat(customDraft.materialCost || "0") * 100),
                  });
                  setCustomDraft({ name: "", price: "", qty: "1", duration: "", materialCost: "" });
                  setShowCustomForm(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium"
              >Lisää</button>
              <button onClick={() => setShowCustomForm(false)} className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-muted">Peruuta</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowCustomForm(true)} className="flex items-center gap-2 text-sm text-brand hover:underline">
            <Plus size={14} /> Lisää muu veloitus
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Thumbnail helper ──────────────────────────────────────────────────────

function Thumb({ src, size = 32 }: { src?: string | null; size?: number }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className="rounded-lg object-contain flex-shrink-0"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}

// ─── Unified Upsell Section ────────────────────────────────────────────────

interface UpsellSectionProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  allAddons: AddonService[];
  allProducts: Product[];
  suggestedAddons: AddonService[];
  suggestedProducts: Product[];
  upsellCount: number;
}

function UpsellSection({ state, dispatch, allAddons, allProducts, suggestedAddons, suggestedProducts, upsellCount }: UpsellSectionProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [upsellSearch, setUpsellSearch] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customDraft, setCustomDraft] = useState({ name: "", price: "", qty: "1", duration: "", materialCost: "" });

  // Unified selected upsell items
  const selectedAddons = allAddons.filter((a) => (state.upsells.addonQty[a.id] || 0) > 0);
  const selectedProducts = allProducts.filter((p) => (state.upsells.productQty[p.id] || 0) > 0);

  // Suggested upsell items shown as toggles (pre-configured via service_product_links / addon_service_links)
  const suggestedItems = useMemo(() => {
    const items: { type: "addon" | "product"; id: string; name: string; price: number; image?: string | null; description?: string | null }[] = [];
    for (const a of suggestedAddons) items.push({ type: "addon", id: a.id, name: a.name, price: a.price_cents, description: a.description });
    for (const p of suggestedProducts) items.push({ type: "product", id: p.id, name: p.name, price: p.price_cents, image: p.images?.[0] });
    return items;
  }, [suggestedAddons, suggestedProducts]);

  // Unified available items for picker (filter by search, exclude devices/setit, exclude already suggested)
  const suggestedIds = useMemo(() => new Set(suggestedItems.map((i) => `${i.type}:${i.id}`)), [suggestedItems]);
  const q = upsellSearch.toLowerCase();
  const availableItems = useMemo(() => {
    const items: { type: "addon" | "product"; id: string; name: string; price: number; image?: string | null; description?: string | null }[] = [];
    for (const a of allAddons) {
      if (state.upsells.addonQty[a.id] > 0 || suggestedIds.has(`addon:${a.id}`)) continue;
      items.push({ type: "addon", id: a.id, name: a.name, price: a.price_cents, description: a.description });
    }
    // Only show "Asennustarvikkeet" category products in picker, not devices/setit
    for (const p of allProducts) {
      if (state.upsells.productQty[p.id] > 0 || suggestedIds.has(`product:${p.id}`)) continue;
      items.push({ type: "product", id: p.id, name: p.name, price: p.price_cents, image: p.images?.[0] });
    }
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [allAddons, allProducts, state.upsells, suggestedIds, q]);

  const handleAddUpsellItem = (item: typeof availableItems[0]) => {
    if (item.type === "addon") dispatch({ type: "UPSELL_SET_ADDON_QTY", id: item.id, qty: 1 });
    else dispatch({ type: "UPSELL_SET_PRODUCT_QTY", id: item.id, qty: 1 });
  };

  return (
    <div className="border-t border-border pt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-text-primary">Lisämyynti</h3>
          <span className="text-[10px] text-text-muted">(asiakas voi valita)</span>
        </div>
        {upsellCount > 0 && (
          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
            {upsellCount} tuotetta
          </span>
        )}
      </div>

      {/* Suggested upsell items (pre-configured, toggle on/off) */}
      {suggestedItems.length > 0 && (
        <div className="space-y-2 mb-3">
          {suggestedItems.map((item) => {
            const isActive = item.type === "addon"
              ? (state.upsells.addonQty[item.id] || 0) > 0
              : (state.upsells.productQty[item.id] || 0) > 0;
            return (
              <div
                key={`${item.type}-${item.id}`}
                onClick={() => {
                  if (item.type === "addon") dispatch({ type: "UPSELL_SET_ADDON_QTY", id: item.id, qty: isActive ? 0 : 1 });
                  else dispatch({ type: "UPSELL_SET_PRODUCT_QTY", id: item.id, qty: isActive ? 0 : 1 });
                }}
                className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  isActive ? "border-amber-300 bg-amber-50" : "border-border hover:border-amber-200"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isActive ? "border-amber-500 bg-amber-500" : "border-gray-300"
                  }`}>
                    {isActive && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <Thumb src={item.image} />
                  <div>
                    <span className="text-sm font-medium">{item.name}</span>
                    {item.description && <p className="text-[10px] text-text-muted">{item.description}</p>}
                  </div>
                </div>
                <span className="text-sm font-medium text-text-muted">{formatCents(item.price)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Manually added upsell items */}
      <div className="space-y-2 mb-3">
        {selectedAddons.filter((a) => !suggestedIds.has(`addon:${a.id}`)).map((addon) => (
          <div key={`a-${addon.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-amber-300 bg-amber-50">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium">{addon.name}</span>
              <span className="text-xs text-text-muted">{formatCents(addon.price_cents)}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => dispatch({ type: "UPSELL_SET_ADDON_QTY", id: addon.id, qty: Math.max(0, (state.upsells.addonQty[addon.id] || 0) - 1) })} className="w-8 h-8 sm:w-7 sm:h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Minus size={14} /></button>
              <span className="text-sm font-semibold w-6 text-center">{state.upsells.addonQty[addon.id]}</span>
              <button onClick={() => dispatch({ type: "UPSELL_SET_ADDON_QTY", id: addon.id, qty: (state.upsells.addonQty[addon.id] || 0) + 1 })} className="w-8 h-8 sm:w-7 sm:h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Plus size={14} /></button>
            </div>
          </div>
        ))}
        {selectedProducts.filter((p) => !suggestedIds.has(`product:${p.id}`)).map((prod) => (
          <div key={`p-${prod.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-amber-300 bg-amber-50">
            <div className="flex items-center gap-2.5 min-w-0">
              <Thumb src={prod.images?.[0]} />
              <div className="min-w-0">
                <span className="text-sm font-medium break-words">{prod.name}</span>
                <span className="text-xs text-text-muted ml-2">{formatCents(prod.price_cents)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => dispatch({ type: "UPSELL_SET_PRODUCT_QTY", id: prod.id, qty: Math.max(0, (state.upsells.productQty[prod.id] || 0) - 1) })} className="w-8 h-8 sm:w-7 sm:h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Minus size={14} /></button>
              <span className="text-sm font-semibold w-6 text-center">{state.upsells.productQty[prod.id]}</span>
              <button onClick={() => dispatch({ type: "UPSELL_SET_PRODUCT_QTY", id: prod.id, qty: (state.upsells.productQty[prod.id] || 0) + 1 })} className="w-8 h-8 sm:w-7 sm:h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Plus size={14} /></button>
            </div>
          </div>
        ))}
        {state.upsells.customItems.map((ci, idx) => (
          <div key={`c-${idx}`} className="flex items-center gap-3 border border-amber-300 bg-amber-50 rounded-xl p-3">
            <div className="flex-1 min-w-0"><span className="text-sm font-medium">{ci.name}</span></div>
            <span className="text-sm text-text-muted flex-shrink-0">{ci.qty} x {formatCents(ci.priceCents)}</span>
            <button onClick={() => dispatch({ type: "UPSELL_REMOVE_CUSTOM_ITEM", index: idx })} className="text-red-500 hover:text-red-700 flex-shrink-0"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {/* Unified picker */}
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
      >
        {showPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showPicker ? "Piilota valinnat" : "Lisää ekstra"}
      </button>

      {showPicker && (
        <div className="mt-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className={`${inputCls} pl-8 text-sm`}
              placeholder="Hae lisäpalvelua tai tuotetta..."
              value={upsellSearch}
              onChange={(e) => setUpsellSearch(e.target.value)}
            />
          </div>

          {/* Unified grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto">
            {availableItems.map((item) => (
              <div key={`${item.type}-${item.id}`} className="border border-border rounded-lg p-3 hover:border-amber-300 transition-colors">
                <div className="flex items-start gap-2.5">
                  <Thumb src={item.image} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                    </div>
                    <span className="text-xs text-text-muted">{formatCents(item.price)}</span>
                    {item.description && <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">{item.description}</p>}
                    <button onClick={() => handleAddUpsellItem(item)} className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:text-amber-700">
                      <Plus size={12} /> Lisää
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {availableItems.length === 0 && <p className="text-xs text-text-muted text-center py-2">Ei tuloksia</p>}

          {/* Custom upsell item */}
          {showCustomForm ? (
            <div className="border border-border rounded-xl p-3 space-y-3">
              <div>
                <label className={labelCls}>Nimi</label>
                <input className={inputCls} value={customDraft.name} onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })} placeholder="esim. Lisätakuu 5v" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className={labelCls}>Hinta (EUR)</label><input className={inputCls} type="number" step="0.01" min="0" value={customDraft.price} onChange={(e) => setCustomDraft({ ...customDraft, price: e.target.value })} /></div>
                <div><label className={labelCls}>Määrä</label><input className={inputCls} type="number" min="1" value={customDraft.qty} onChange={(e) => setCustomDraft({ ...customDraft, qty: e.target.value })} /></div>
                <div><label className={labelCls}>Kesto (min)</label><input className={inputCls} type="number" min="0" value={customDraft.duration} onChange={(e) => setCustomDraft({ ...customDraft, duration: e.target.value })} placeholder="0" /></div>
                <div><label className={labelCls}>Materiaalit (EUR)</label><input className={inputCls} type="number" step="0.01" min="0" value={customDraft.materialCost} onChange={(e) => setCustomDraft({ ...customDraft, materialCost: e.target.value })} placeholder="0" /></div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const price = parseFloat(customDraft.price);
                    if (!customDraft.name || !customDraft.price || isNaN(price) || price < 0) return;
                    const qty = parseInt(customDraft.qty);
                    const duration = parseInt(customDraft.duration);
                    const materialCost = parseFloat(customDraft.materialCost || "0");
                    dispatch({
                      type: "UPSELL_ADD_CUSTOM_ITEM",
                      item: {
                        name: customDraft.name,
                        priceCents: Math.round(price * 100),
                        qty: isNaN(qty) || qty < 1 ? 1 : qty,
                        durationMinutes: isNaN(duration) || duration < 0 ? 0 : duration,
                        materialCostCents: Math.round((isNaN(materialCost) || materialCost < 0 ? 0 : materialCost) * 100),
                      },
                    });
                    setCustomDraft({ name: "", price: "", qty: "1", duration: "", materialCost: "" });
                    setShowCustomForm(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium"
                >Lisää</button>
                <button onClick={() => setShowCustomForm(false)} className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-muted">Peruuta</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowCustomForm(true)} className="flex items-center gap-2 text-xs text-amber-600 hover:underline">
              <Plus size={12} /> Lisää muu veloitus
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main DevicesStep ──────────────────────────────────────────────────────

export function DevicesStep({
  state,
  dispatch,
  allServices,
  allAddons,
  allProducts,
  variants,
  linkedAddonData,
  relevantProductCategoryIds,
  productLinks,
  templates,
  computed,
  onApplyTemplate,
}: Props) {
  const [showNewPkgInput, setShowNewPkgInput] = useState(false);
  const [newPkgName, setNewPkgName] = useState("");
  const [_showUpsellPicker, _setShowUpsellPicker] = useState(false);
  const [showMiscServices, setShowMiscServices] = useState(false);

  // Primary selected service (first with qty > 0)
  const primaryServiceId = useMemo(
    () => Object.entries(state.serviceQty).find(([, q]) => q > 0)?.[0],
    [state.serviceQty],
  );

  // Multisplit install type → structured 1-outdoor + N-indoor device builder.
  const isMultisplit = useMemo(
    () => allServices.some((s) => (state.serviceQty[s.id] || 0) > 0 && s.name.toLowerCase().includes("multisplit")),
    [allServices, state.serviceQty],
  );

  // Separate installation services (perusasennus-tyypit) from other services
  const { installationServices, otherServices: miscServices } = useMemo(() => {
    const active = allServices.filter((s) => s.active);
    const installNames = ["perusasennus", "multisplit", "vanhan tilalle"];
    const install = active.filter((s) => installNames.some((n) => s.name.toLowerCase().includes(n)));
    const other = active.filter((s) => !install.includes(s));
    return { installationServices: install, otherServices: other };
  }, [allServices]);

  // Split addon links by role
  const linkedAddonIds = useMemo(() => new Set(linkedAddonData.filter((l) => l.role === "addon").map((l) => l.addon_service_id)), [linkedAddonData]);
  const upsellAddonIds = useMemo(() => new Set(linkedAddonData.filter((l) => l.role === "upsell").map((l) => l.addon_service_id)), [linkedAddonData]);
  const upsellProductIds = useMemo(() => new Set(productLinks.filter((l) => l.role === "upsell").map((l) => l.product_id)), [productLinks]);

  // Filter products by relevant categories (from service_product_category_links)
  const activeProducts = useMemo(() => {
    const active = allProducts.filter((p) => p.active);
    if (state.showAllProducts || relevantProductCategoryIds.length === 0) return active;
    return active.filter((p) => relevantProductCategoryIds.includes(p.category_id));
  }, [allProducts, relevantProductCategoryIds, state.showAllProducts]);

  // Filter addons: default shows role="addon" linked ones, "show all" shows everything including upsell-role
  const activeAddons = useMemo(() => {
    const active = allAddons.filter((a) => a.active);
    if (state.showAllAddons || linkedAddonIds.size === 0) return active;
    return active.filter((a) => linkedAddonIds.has(a.id));
  }, [allAddons, linkedAddonIds, state.showAllAddons]);

  // Suggested upsell items (role="upsell" addons + products)
  const suggestedUpsellAddons = useMemo(() => allAddons.filter((a) => a.active && upsellAddonIds.has(a.id)), [allAddons, upsellAddonIds]);
  const suggestedUpsellProducts = useMemo(() => allProducts.filter((p) => p.active && upsellProductIds.has(p.id)), [allProducts, upsellProductIds]);

  // All addons for "show all" count
  const allActiveAddons = useMemo(() => allAddons.filter((a) => a.active), [allAddons]);
  const allActiveProducts = useMemo(() => allProducts.filter((p) => p.active), [allProducts]);

  const { activePackageIndex, packages } = state;
  const isBaseTab = activePackageIndex === -1;
  const activePackage = activePackageIndex >= 0 ? packages[activePackageIndex] : null;

  const handleAddPackage = useCallback(() => {
    const name = newPkgName.trim();
    if (!name) return;
    dispatch({ type: "ADD_PACKAGE", name });
    setNewPkgName("");
    setShowNewPkgInput(false);
  }, [newPkgName, dispatch]);

  // Count items in upsells
  const upsellCount = Object.values(state.upsells.addonQty).filter((q) => q > 0).length
    + Object.values(state.upsells.productQty).filter((q) => q > 0).length
    + state.upsells.customItems.length;

  return (
    <div className="space-y-6">
      {/* Template selector */}
      {templates.length > 0 && (
        <div className="flex items-center gap-3">
          <FileText size={16} className="text-text-muted" />
          <select className={selectCls} defaultValue="" onChange={(e) => { if (e.target.value) onApplyTemplate(e.target.value); }}>
            <option value="" disabled>Käytä mallia...</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {/* Installation type selector */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Asennustyyppi</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {installationServices.map((svc) => {
            const qty = state.serviceQty[svc.id] || 0;
            return (
              <div
                key={svc.id}
                onClick={() => dispatch({ type: "SET_SERVICE_QTY", id: svc.id, qty: qty > 0 ? 0 : 1 })}
                className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  qty > 0
                    ? "border-accent bg-accent/5 shadow-sm"
                    : "border-border hover:border-accent/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">{svc.name}</p>
                  <span className="text-xs text-text-muted">{formatCents(svc.base_price_cents)}</span>
                </div>
                {qty > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={(e) => { e.stopPropagation(); dispatch({ type: "SET_SERVICE_QTY", id: svc.id, qty: Math.max(0, qty - 1) }); }} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Minus size={14} /></button>
                    <span className="text-sm font-semibold w-6 text-center">{qty}</span>
                    <button onClick={(e) => { e.stopPropagation(); dispatch({ type: "SET_SERVICE_QTY", id: svc.id, qty: qty + 1 }); }} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Plus size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Variant selector for selected service */}
        {primaryServiceId && variants.length > 0 && (
          <div className="mt-3">
            <select
              className={`${selectCls} text-sm`}
              value={state.serviceVariantId[primaryServiceId] || ""}
              onChange={(e) => dispatch({ type: "SET_VARIANT", serviceId: primaryServiceId, variantId: e.target.value })}
            >
              <option value="">Perus</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.label} ({formatCents(v.price_cents)})</option>)}
            </select>
          </div>
        )}

        {/* Other services (collapsible) */}
        {miscServices.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowMiscServices(!showMiscServices)}
              className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors"
            >
              {showMiscServices ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showMiscServices ? "Piilota muut palvelut" : `Muut palvelut (${miscServices.length})`}
            </button>
            {showMiscServices && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {miscServices.map((svc) => {
                  const qty = state.serviceQty[svc.id] || 0;
                  return (
                    <div key={svc.id} className={`border rounded-xl p-3 transition-colors ${qty > 0 ? "border-accent bg-accent/5" : "border-border"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{svc.name}</span>
                        <span className="text-xs text-text-muted">{formatCents(svc.base_price_cents)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => dispatch({ type: "SET_SERVICE_QTY", id: svc.id, qty: Math.max(0, qty - 1) })} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Minus size={14} /></button>
                        <span className="text-sm font-semibold w-6 text-center">{qty}</span>
                        <button onClick={() => dispatch({ type: "SET_SERVICE_QTY", id: svc.id, qty: qty + 1 })} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted hover:bg-muted/30"><Plus size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Tab bar ─────────────────────────────────────────────────── */}
      <div className="border-b border-border">
        <div className="flex items-center gap-1 overflow-x-auto pb-px -mb-px">
          {/* Base tab */}
          <button
            onClick={() => dispatch({ type: "SET_ACTIVE_PACKAGE", index: -1 })}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              isBaseTab
                ? "border-brand text-brand"
                : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
            }`}
          >
            Perusrivit
          </button>

          {/* Package tabs */}
          {packages.map((pkg, idx) => (
            <button
              key={idx}
              onClick={() => dispatch({ type: "SET_ACTIVE_PACKAGE", index: idx })}
              className={`group flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activePackageIndex === idx
                  ? "border-brand text-brand"
                  : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
              }`}
            >
              <Package size={14} />
              {pkg.name}
              <span
                onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE_PACKAGE", index: idx }); }}
                className="ml-1 opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500 transition-opacity"
              >
                <X size={12} />
              </span>
            </button>
          ))}

          {/* Add package */}
          {showNewPkgInput ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <input
                className="text-sm border border-border rounded-lg px-2 py-1 w-40 bg-bg"
                value={newPkgName}
                onChange={(e) => setNewPkgName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPackage()}
                placeholder="Paketin nimi..."
                autoFocus
              />
              <button onClick={handleAddPackage} className="text-xs font-medium text-brand">OK</button>
              <button onClick={() => { setShowNewPkgInput(false); setNewPkgName(""); }} className="text-text-muted"><X size={14} /></button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewPkgInput(true)}
              className="flex items-center gap-1 px-3 py-2.5 text-sm font-medium text-text-muted hover:text-brand whitespace-nowrap border-b-2 border-transparent transition-colors"
            >
              <Plus size={14} /> Vaihtoehto
            </button>
          )}
        </div>
      </div>

      {/* ─── Active tab content ──────────────────────────────────────── */}
      {isBaseTab ? (
        <ItemSelectionPanel
          serviceQty={state.serviceQty}
          serviceVariantId={state.serviceVariantId}
          addonQty={state.addonQty}
          productQty={state.productQty}
          customItems={state.customItems}
          allServices={allServices}
          allAddons={activeAddons}
          allProducts={activeProducts}
          variants={variants}
          showServices={false}
          multisplitMode={isMultisplit}
          onSetServiceQty={(id, qty) => dispatch({ type: "SET_SERVICE_QTY", id, qty })}
          onSetVariant={(serviceId, variantId) => dispatch({ type: "SET_VARIANT", serviceId, variantId })}
          onSetAddonQty={(id, qty) => dispatch({ type: "SET_ADDON_QTY", id, qty })}
          onSetProductQty={(id, qty) => dispatch({ type: "SET_PRODUCT_QTY", id, qty })}
          onAddCustomItem={(item) => dispatch({ type: "ADD_CUSTOM_ITEM", item })}
          onRemoveCustomItem={(index) => dispatch({ type: "REMOVE_CUSTOM_ITEM", index })}
        />
      ) : activePackage ? (
        <ItemSelectionPanel
          serviceQty={activePackage.serviceQty}
          serviceVariantId={activePackage.serviceVariantId}
          addonQty={activePackage.addonQty}
          productQty={activePackage.productQty}
          customItems={activePackage.customItems}
          allServices={allServices}
          allAddons={activeAddons}
          allProducts={activeProducts}
          variants={variants}
          showServices={false}
          multisplitMode={isMultisplit}
          onSetServiceQty={(id, qty) => dispatch({ type: "PKG_SET_SERVICE_QTY", pkgIndex: activePackageIndex, id, qty })}
          onSetVariant={(serviceId, variantId) => dispatch({ type: "PKG_SET_VARIANT", pkgIndex: activePackageIndex, serviceId, variantId })}
          onSetAddonQty={(id, qty) => dispatch({ type: "PKG_SET_ADDON_QTY", pkgIndex: activePackageIndex, id, qty })}
          onSetProductQty={(id, qty) => dispatch({ type: "PKG_SET_PRODUCT_QTY", pkgIndex: activePackageIndex, id, qty })}
          onAddCustomItem={(item) => dispatch({ type: "PKG_ADD_CUSTOM_ITEM", pkgIndex: activePackageIndex, item })}
          onRemoveCustomItem={(index) => dispatch({ type: "PKG_REMOVE_CUSTOM_ITEM", pkgIndex: activePackageIndex, index })}
        />
      ) : null}

      {/* Show all toggles */}
      {(relevantProductCategoryIds.length > 0 || linkedAddonIds.size > 0) && (
        <div className="flex flex-wrap gap-3">
          {relevantProductCategoryIds.length > 0 && !state.showAllProducts && (
            <button
              onClick={() => dispatch({ type: "SET_FIELD", field: "showAllProducts", value: true })}
              className="text-xs text-text-muted hover:text-brand transition-colors"
            >
              Näytä kaikki tuotteet ({allActiveProducts.length})
            </button>
          )}
          {state.showAllProducts && (
            <button
              onClick={() => dispatch({ type: "SET_FIELD", field: "showAllProducts", value: false })}
              className="text-xs text-brand font-medium"
            >
              Näytä vain linkitetyt tuotteet
            </button>
          )}
          {linkedAddonIds.size > 0 && !state.showAllAddons && (
            <button
              onClick={() => dispatch({ type: "SET_FIELD", field: "showAllAddons", value: true })}
              className="text-xs text-text-muted hover:text-brand transition-colors"
            >
              Näytä kaikki lisäpalvelut ({allActiveAddons.length})
            </button>
          )}
          {state.showAllAddons && (
            <button
              onClick={() => dispatch({ type: "SET_FIELD", field: "showAllAddons", value: false })}
              className="text-xs text-brand font-medium"
            >
              Näytä vain linkitetyt lisäpalvelut
            </button>
          )}
        </div>
      )}

      {/* ─── Upsell section (unified: addons + products + custom) ────── */}
      <UpsellSection
        state={state}
        dispatch={dispatch}
        allAddons={allActiveAddons}
        allProducts={allActiveProducts}
        suggestedAddons={suggestedUpsellAddons}
        suggestedProducts={suggestedUpsellProducts}
        upsellCount={upsellCount}
      />

      {/* Sticky running total */}
      <div className="sticky bottom-0 bg-bg-primary border-t border-border pt-4 pb-2 space-y-2">
        <div className="flex items-center justify-between text-sm font-semibold text-text-primary">
          <span>Yhteensä ({computed.lineItems.length} riviä)</span>
          <span>{formatCents(computed.subtotalCents)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer text-text-muted hover:text-text-primary select-none">
            <input
              type="checkbox"
              checked={state.showMargin}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "showMargin", value: e.target.checked })}
              className="w-3.5 h-3.5 accent-brand"
            />
            Näytä kate
          </label>
          {state.showMargin && (
            <span className={`font-semibold ${computed.marginCents >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              Kate {formatCents(computed.marginCents)} ({computed.marginPct.toFixed(1)}%)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
