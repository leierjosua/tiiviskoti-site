import { useEffect, useMemo, useState } from "react";
import { Combine, Layers, Package, PenLine, Plus, Search, ShoppingBag } from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { useProducts } from "@/hooks/useProducts";
import { useAddonServices } from "@/hooks/useAddonServices";
import { inputCls } from "@/lib/constants";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { isComponentProduct } from "@/lib/products";

export interface CatalogPickerItem {
  line_type: "service" | "product" | "additional_service" | "other_charge";
  item_id: string | null;
  name: string;
  description: string;
  unit_price: number;
  quantity: number;
  duration_minutes?: number | null;
}

interface Props {
  /** Called once per added line. For combos (product + service) it is called twice. */
  onAdd: (item: CatalogPickerItem) => void;
}

type Tab = "services" | "products" | "addons" | "custom" | "combo";

const TABS: { key: Tab; label: string; icon: typeof Package }[] = [
  { key: "services", label: "Palvelut", icon: Package },
  { key: "products", label: "Tuotteet", icon: ShoppingBag },
  { key: "addons", label: "Lisäpalvelut", icon: Layers },
  { key: "custom", label: "Muu", icon: PenLine },
  { key: "combo", label: "Kombo", icon: Combine },
];

export function QuoteCatalogPicker({ onAdd }: Props) {
  const { data: services = [] } = useServices();
  const { data: products = [] } = useProducts();
  const { data: addons = [] } = useAddonServices();

  const [tab, setTab] = useState<Tab>("services");
  const [search, setSearch] = useState("");

  const q = search.toLowerCase();
  const filteredServices = useMemo(
    () => services.filter((s) => s.name.toLowerCase().includes(q)),
    [services, q],
  );
  const filteredProducts = useMemo(
    () => products.filter((p) => {
      // Components (sisä-/ulkoyksiköt) stay hidden until the user searches.
      if (!q) return !isComponentProduct(p);
      return p.name.toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
    }),
    [products, q],
  );
  const filteredAddons = useMemo(
    () => addons.filter((a) => a.name.toLowerCase().includes(q)),
    [addons, q],
  );

  return (
    <div className="border border-border rounded-xl bg-bg-secondary/40">
      <div className="flex flex-wrap gap-1 p-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setSearch(""); }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              tab === t.key ? "bg-accent text-white" : "bg-bg-secondary text-text-muted hover:text-text-primary"
            }`}
          >
            <t.icon className="w-3 h-3" /> {t.label}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-2">
        {tab !== "custom" && tab !== "combo" && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              className={`${inputCls} !py-1.5 !text-xs !pl-8`}
              placeholder="Hae..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        {tab === "services" && (
          <CatalogList
            items={filteredServices.map((s) => ({
              id: s.id,
              name: s.name,
              price: s.base_price_cents / 100,
              sub: `${s.duration_minutes} min`,
            }))}
            onAdd={(item) => {
              const svc = services.find((s) => s.id === item.id);
              onAdd({
                line_type: "service",
                item_id: item.id,
                name: item.name,
                description: "",
                unit_price: item.price,
                quantity: 1,
                duration_minutes: svc?.duration_minutes ?? null,
              });
            }}
          />
        )}

        {tab === "products" && (
          <CatalogList
            items={filteredProducts.map((p) => ({
              id: p.id,
              name: p.name,
              price: p.price_cents / 100,
              sub: p.brand || undefined,
            }))}
            onAdd={(item) => onAdd({
              line_type: "product",
              item_id: item.id,
              name: item.name,
              description: "",
              unit_price: item.price,
              quantity: 1,
              duration_minutes: null,
            })}
          />
        )}

        {tab === "addons" && (
          <CatalogList
            items={filteredAddons.map((a) => ({
              id: a.id,
              name: a.name,
              price: a.price_cents / 100,
            }))}
            onAdd={(item) => onAdd({
              line_type: "additional_service",
              item_id: item.id,
              name: item.name,
              description: "",
              unit_price: item.price,
              quantity: 1,
              duration_minutes: null,
            })}
          />
        )}

        {tab === "custom" && (
          <CustomItemForm
            onAdd={(name, price, qty) => onAdd({
              line_type: "other_charge",
              item_id: null,
              name,
              description: "",
              unit_price: price,
              quantity: qty,
              duration_minutes: null,
            })}
          />
        )}

        {tab === "combo" && (
          <ComboForm
            services={services}
            products={products}
            onAdd={(prod, svc, prodPrice, svcPrice) => {
              if (prod) {
                onAdd({
                  line_type: "product",
                  item_id: prod.id,
                  name: prod.name,
                  description: "",
                  unit_price: prodPrice,
                  quantity: 1,
                  duration_minutes: null,
                });
              }
              if (svc) {
                onAdd({
                  line_type: "service",
                  item_id: svc.id,
                  name: svc.name,
                  description: "",
                  unit_price: svcPrice,
                  quantity: 1,
                  duration_minutes: svc.duration_minutes ?? null,
                });
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function CatalogList({
  items,
  onAdd,
}: {
  items: { id: string; name: string; price: number; sub?: string }[];
  onAdd: (item: { id: string; name: string; price: number }) => void;
}) {
  return (
    <div className="max-h-56 overflow-y-auto space-y-0.5">
      {items.length === 0 && <p className="text-xs text-text-muted text-center py-2">Ei tuloksia</p>}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onAdd(item)}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-bg-secondary text-left transition-colors"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{item.name}</p>
            {item.sub && <p className="text-[10px] text-text-muted">{item.sub}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-xs font-semibold">{item.price.toFixed(2)} €</span>
            <Plus className="w-3.5 h-3.5 text-accent" />
          </div>
        </button>
      ))}
    </div>
  );
}

function CustomItemForm({ onAdd }: { onAdd: (name: string, price: number, qty: number) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");

  function handleAdd() {
    if (!name.trim()) return;
    onAdd(name.trim(), parseFloat(price) || 0, parseInt(qty) || 1);
    setName("");
    setPrice("");
    setQty("1");
  }

  return (
    <div className="space-y-2">
      <input
        className={`${inputCls} !py-1.5 !text-xs`}
        placeholder="Rivin nimi"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <input
            type="number"
            className={`${inputCls} !py-1.5 !text-xs !pr-6`}
            placeholder="Hinta"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            step="0.01"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
        </div>
        <input
          type="number"
          className={`${inputCls} !py-1.5 !text-xs`}
          placeholder="Määrä"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          min="1"
        />
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={!name.trim()}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
      >
        <Plus className="w-3 h-3" /> Lisää rivi
      </button>
    </div>
  );
}

type ServiceLike = { id: string; name: string; base_price_cents: number; duration_minutes: number };
type ProductLike = {
  id: string;
  name: string;
  price_cents: number;
  brand?: string | null;
  sku?: string | null;
  is_component?: boolean;
  product_categories?: { slug?: string | null } | null;
};

function ComboForm({
  services,
  products,
  onAdd,
}: {
  services: ServiceLike[];
  products: ProductLike[];
  onAdd: (
    product: ProductLike | undefined,
    service: ServiceLike | undefined,
    productPrice: number,
    servicePrice: number,
  ) => void;
}) {
  const defaultServiceId = useMemo(
    () => services.find((s) => s.name.toLowerCase().includes("perusasennus"))?.id || "",
    [services],
  );
  const [productId, setProductId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [productPrice, setProductPrice] = useState(0);
  const [servicePrice, setServicePrice] = useState(0);

  useEffect(() => {
    if (defaultServiceId && !serviceId) setServiceId(defaultServiceId);
  }, [defaultServiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prod = products.find((p) => p.id === productId);
    const svc = services.find((s) => s.id === serviceId);
    setProductPrice(prod ? prod.price_cents / 100 : 0);
    setServicePrice(svc ? svc.base_price_cents / 100 : 0);
  }, [productId, serviceId, products, services]);

  const total = productPrice + servicePrice;
  const prod = products.find((p) => p.id === productId);
  const svc = services.find((s) => s.id === serviceId);

  function handleAdd() {
    if (!prod && !svc) return;
    onAdd(prod, svc, productPrice, servicePrice);
    setProductId("");
    setServiceId(defaultServiceId);
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-text-muted">Tuote + palvelu kahdelle riville samaan tarjoukseen.</p>
      <SearchableSelect
        value={productId}
        onChange={setProductId}
        placeholder="Valitse tuote..."
        searchPlaceholder="Hae tuotetta nimellä, merkillä tai SKU:lla..."
        hint="Komponentit (sisä-/ulkoyksiköt) löytyvät hakemalla."
        options={products.map((p) => ({
          id: p.id,
          label: p.name,
          sublabel: p.brand || undefined,
          price: p.price_cents / 100,
          keywords: p.sku || undefined,
          hiddenUntilSearch: isComponentProduct(p),
          badge: isComponentProduct(p) ? "komponentti" : undefined,
        }))}
      />
      <SearchableSelect
        value={serviceId}
        onChange={setServiceId}
        placeholder="Valitse palvelu..."
        searchPlaceholder="Hae palvelua..."
        options={services.map((s) => ({
          id: s.id,
          label: s.name,
          price: s.base_price_cents / 100,
        }))}
      />
      {(productId || serviceId) && (
        <div className="space-y-2">
          {productId && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-14">Tuote</span>
              <div className="relative flex-1">
                <input
                  type="number"
                  className={`${inputCls} !py-1.5 !text-xs !pr-6`}
                  value={productPrice || ""}
                  onChange={(e) => setProductPrice(parseFloat(e.target.value) || 0)}
                  step="0.01"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
              </div>
            </div>
          )}
          {serviceId && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-14">Palvelu</span>
              <div className="relative flex-1">
                <input
                  type="number"
                  className={`${inputCls} !py-1.5 !text-xs !pr-6`}
                  value={servicePrice || ""}
                  onChange={(e) => setServicePrice(parseFloat(e.target.value) || 0)}
                  step="0.01"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Yht: <span className="font-semibold text-text-primary">{total.toFixed(2)} €</span></span>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!prod && !svc}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" /> Lisää kombo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
