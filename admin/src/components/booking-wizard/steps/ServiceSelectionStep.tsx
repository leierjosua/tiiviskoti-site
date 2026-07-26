import { Plus, Trash2, Search, Layers, ShoppingBag } from "lucide-react";
import { formatCents, getUnitPriceCents } from "@/lib/utils";
import { isComponentProduct } from "@/lib/products";
import type { AddonService, Service, ServiceVariant } from "@/lib/types";
import { inputCls } from "@/lib/constants";
import type { ExtraItemForm } from "../types";

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

interface ServiceSelectionStepProps {
  allServices: Service[] | undefined;
  allAddons: AddonService[] | undefined;
  allProducts: any[] | undefined;
  linkedAddons: any[] | undefined;
  serviceVariants: ServiceVariant[] | undefined;
  // State
  serviceQty: Record<string, number>;
  setServiceQty: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  selectedVariantId: string | null;
  setSelectedVariantId: (id: string | null) => void;
  selectedAddons: Record<string, number>;
  setSelectedAddons: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  selectedProducts: Record<string, number>;
  setSelectedProducts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  productSearch: string;
  setProductSearch: (s: string) => void;
  showAllAddons: boolean;
  setShowAllAddons: (b: boolean) => void;
  showAllServices: boolean;
  setShowAllServices: (b: boolean) => void;
  showProductPicker: boolean;
  setShowProductPicker: (b: boolean) => void;
  extraItems: ExtraItemForm[];
  setExtraItems: React.Dispatch<React.SetStateAction<ExtraItemForm[]>>;
  // Derived
  subtotalCents: number;
  totalDuration: number;
  canProceed: boolean;
  // Navigation
  onBack: () => void;
  onNext: () => void;
}

export function ServiceSelectionStep({
  allServices, allAddons, allProducts, linkedAddons, serviceVariants,
  serviceQty, setServiceQty,
  selectedVariantId, setSelectedVariantId,
  selectedAddons, setSelectedAddons,
  selectedProducts, setSelectedProducts,
  productSearch, setProductSearch,
  showAllAddons, setShowAllAddons,
  showAllServices, setShowAllServices,
  showProductPicker, setShowProductPicker,
  extraItems, setExtraItems,
  subtotalCents, totalDuration, canProceed,
  onBack, onNext,
}: ServiceSelectionStepProps) {
  const selectedServiceIds = Object.keys(serviceQty).filter((id) => serviceQty[id] > 0);
  const selectedProductList = (allProducts || []).filter((p: any) => (selectedProducts[p.id] || 0) > 0);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Services grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary">Palvelut</h3>
          {!showAllServices && (
            <button onClick={() => setShowAllServices(true)} className="text-sm text-accent-dark font-semibold hover:underline">
              Näytä kaikki
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {allServices?.filter((s) => s.active).filter((s) => {
            if (showAllServices || serviceQty[s.id] > 0) return true;
            const n = s.name.toLowerCase();
            return n.includes("huoltopesu") || n.includes("vianhaku") || n.includes("iv-puhdistus") || n.includes("ilmanvaihd") || n.includes("tarkastus");
          }).map((svc) => {
            const qty = serviceQty[svc.id] || 0;
            return (
              <div key={svc.id} className={`p-4 rounded-xl border-2 transition-all ${qty > 0 ? "border-accent bg-accent-muted" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-text-primary">{svc.name}</p>
                    <p className="text-xs text-text-muted mt-1">{formatCents(svc.base_price_cents)} &middot; {svc.duration_minutes} min</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {qty > 0 && (
                      <button
                        onClick={() => setServiceQty((prev) => { const next = { ...prev }; if (next[svc.id] <= 1) delete next[svc.id]; else next[svc.id]--; return next; })}
                        className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover transition-colors text-sm font-bold"
                      >−</button>
                    )}
                    {qty > 0 && <span className="w-6 text-center text-sm font-semibold text-text-primary">{qty}</span>}
                    <button
                      onClick={() => setServiceQty((prev) => ({ ...prev, [svc.id]: (prev[svc.id] || 0) + 1 }))}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover transition-colors text-sm font-bold"
                    >+</button>
                  </div>
                </div>
                {qty > 1 && (() => {
                  const unitPrice = getUnitPriceCents(svc, qty);
                  const hasDiscount = unitPrice < svc.base_price_cents;
                  return (
                    <p className="text-xs text-accent-dark mt-2 font-medium">
                      {qty} × {formatCents(unitPrice)} = {formatCents(unitPrice * qty)}
                      {hasDiscount && <span className="ml-1 text-green-600">(paljousalennus)</span>}
                    </p>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Variant selection */}
      {serviceVariants && serviceVariants.filter(v => v.active).length > 0 && selectedServiceIds.length > 0 && (
        <div>
          <h3 className="font-semibold text-text-primary mb-3">Variantti</h3>
          <select value={selectedVariantId || ""} onChange={(e) => setSelectedVariantId(e.target.value || null)} className={inputCls}>
            <option value="">Ei varianttia (perushinta)</option>
            {serviceVariants.filter(v => v.active).map((v) => (
              <option key={v.id} value={v.id}>{v.label} — {formatCents(v.price_cents)} · {v.duration_minutes} min</option>
            ))}
          </select>
        </div>
      )}

      {/* Add-on services */}
      {(linkedAddons && linkedAddons.length > 0) || (allAddons && allAddons.filter(a => a.active).length > 0) ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-primary flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-500" /> Lisäpalvelut
            </h3>
            {!showAllAddons && (
              <button onClick={() => setShowAllAddons(true)} className="text-sm text-accent-dark font-semibold hover:underline">Näytä kaikki</button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(showAllAddons
              ? (allAddons || []).filter(a => a.active)
              : linkedAddons?.map((l: any) => l.addon_services).filter((a: any): a is AddonService => !!a && a.active) || []
            ).map((addon: AddonService) => {
              const qty = selectedAddons[addon.id] || 0;
              return (
                <div key={addon.id} className={`p-4 rounded-xl border-2 transition-all ${qty > 0 ? "border-purple-400 bg-purple-50" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-text-primary">{addon.name}</p>
                      <p className="text-xs text-text-muted mt-1">
                        {formatCents(addon.price_cents)}
                        {addon.duration_minutes > 0 && <> &middot; {addon.duration_minutes} min</>}
                      </p>
                      {addon.description && <p className="text-xs text-text-muted mt-0.5">{addon.description}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {qty > 0 && (
                        <button
                          onClick={() => setSelectedAddons((prev) => { const next = { ...prev }; if (next[addon.id] <= 1) delete next[addon.id]; else next[addon.id]--; return next; })}
                          className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover transition-colors text-sm font-bold"
                        >−</button>
                      )}
                      {qty > 0 && <span className="w-6 text-center text-sm font-semibold text-text-primary">{qty}</span>}
                      <button
                        onClick={() => setSelectedAddons((prev) => ({ ...prev, [addon.id]: (prev[addon.id] || 0) + 1 }))}
                        className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover transition-colors text-sm font-bold"
                      >+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Products */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-500" /> Tuotteet
          </h3>
          <button onClick={() => setShowProductPicker(!showProductPicker)} className="text-sm text-accent-dark font-semibold hover:underline">
            {showProductPicker ? "Piilota" : "Lisää tuote"}
          </button>
        </div>
        {selectedProductList.length > 0 && (
          <div className="space-y-2 mb-3">
            {selectedProductList.map((prod: any) => {
              const qty = selectedProducts[prod.id] || 1;
              return (
                <div key={prod.id} className="flex items-center justify-between p-3 rounded-xl border-2 border-amber-300 bg-amber-50">
                  <div>
                    {prod.brand && <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mr-1">{prod.brand}</span>}
                    <span className="font-semibold text-sm text-text-primary">{prod.name}</span>
                    <span className="text-xs text-text-muted ml-2">{formatCents(prod.price_cents)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedProducts((prev) => { const next = { ...prev }; if (next[prod.id] <= 1) delete next[prod.id]; else next[prod.id]--; return next; })}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover text-sm font-bold"
                    >−</button>
                    <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                    <button
                      onClick={() => setSelectedProducts((prev) => ({ ...prev, [prod.id]: (prev[prod.id] || 0) + 1 }))}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover text-sm font-bold"
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {showProductPicker && (
          <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Hae tuotetta nimellä, merkillä tai SKU:lla..." className={`${inputCls} pl-10`} />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {(allProducts || [])
                .filter((p: any) => p.active && !selectedProducts[p.id])
                .filter((p: any) => {
                  const q = productSearch.trim().toLowerCase();
                  // Components (sisä-/ulkoyksiköt) are hidden from the default
                  // list to keep it clean — a search reveals them so spare
                  // parts stay reachable without cluttering the picker.
                  if (!q) return !isComponentProduct(p);
                  return p.name.toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
                })
                .map((p: any) => (
                  <button key={p.id} onClick={() => { setSelectedProducts((prev) => ({ ...prev, [p.id]: 1 })); setProductSearch(""); }}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-hover transition-colors text-left">
                    <div>
                      {p.brand && <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mr-1">{p.brand}</span>}
                      <span className="text-sm font-medium text-text-primary">{p.name}</span>
                      {isComponentProduct(p) && <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded px-1 py-0.5 ml-1.5 align-middle">komponentti</span>}
                      {p.sku && <span className="text-[10px] text-text-muted ml-2 font-mono">SKU: {p.sku}</span>}
                    </div>
                    <span className="text-sm font-semibold text-text-primary">{formatCents(p.price_cents)}</span>
                  </button>
                ))}
              {allProducts && allProducts.filter((p: any) => p.active && !isComponentProduct(p)).length === 0 && (
                <p className="text-sm text-text-muted text-center py-3">Ei tuotteita</p>
              )}
              {!productSearch.trim() && (
                <p className="text-[11px] text-text-muted pt-1">Komponentit (sisä-/ulkoyksiköt) löytyvät hakemalla nimellä tai SKU:lla.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Extra items (custom charges) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary">Muut veloitukset</h3>
          <button onClick={() => setExtraItems((prev) => [...prev, { name: "", price: "", duration: "", materialCost: "" }])}
            className="inline-flex items-center gap-1.5 text-sm text-accent-dark font-semibold hover:underline">
            <Plus className="w-4 h-4" /> Lisää rivi
          </button>
        </div>
        {extraItems.length === 0 && <p className="text-sm text-text-muted">Ei lisäveloituksia</p>}
        {extraItems.map((item, idx) => (
          <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-3 items-end">
            <div>
              <label className={labelCls}>Nimi *</label>
              <input value={item.name} onChange={(e) => { const next = [...extraItems]; next[idx] = { ...next[idx], name: e.target.value }; setExtraItems(next); }} placeholder="Muu veloitus" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Hinta (€) *</label>
              <input type="number" step="0.01" value={item.price} onChange={(e) => { const next = [...extraItems]; next[idx] = { ...next[idx], price: e.target.value }; setExtraItems(next); }} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Kesto (min)</label>
              <input type="number" value={item.duration} onChange={(e) => { const next = [...extraItems]; next[idx] = { ...next[idx], duration: e.target.value }; setExtraItems(next); }} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Materiaali (€)</label>
              <input type="number" step="0.01" value={item.materialCost} onChange={(e) => { const next = [...extraItems]; next[idx] = { ...next[idx], materialCost: e.target.value }; setExtraItems(next); }} className={inputCls} />
            </div>
            <div className="flex items-end">
              <button onClick={() => setExtraItems((prev) => prev.filter((_, i) => i !== idx))}
                className="p-2.5 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Subtotal summary */}
      {canProceed && (
        <p className="text-sm text-text-muted">
          Yhteensä: <span className="font-semibold text-text-primary">{formatCents(subtotalCents)}</span>
          {totalDuration > 0 && <> &middot; {totalDuration} min</>}
        </p>
      )}

      {/* Navigation */}
      <div className="flex justify-center gap-3 pt-4">
        <button onClick={onBack} className="px-6 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">Takaisin</button>
        <button disabled={!canProceed} onClick={onNext} className="px-6 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40">Seuraava</button>
      </div>
    </div>
  );
}
