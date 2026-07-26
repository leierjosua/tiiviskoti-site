import { useRef, useState, useMemo } from "react";
import { CameraView } from "@/components/BarcodeScanner";
import { beep } from "@/lib/scanFeedback";
import { lookupProductByCode } from "@/lib/productLookup";
import { useReceiveUnits } from "@/hooks/useInventoryUnits";
import { useApplyReceivedToOrders } from "@/hooks/useReceiveStock";
import { useProducts, useUpdateProduct } from "@/hooks/useProducts";
import { useToast } from "@/context/ToastContext";
import { inputCls } from "@/lib/constants";
import type { Product } from "@/lib/types";
import { X, Package, ScanLine, Check, Trash2, ArrowDown, Search, Hash } from "lucide-react";

interface Group {
  product: Product;
  serials: string[];
}

type ScanTarget = "product" | "serial";

/**
 * Guided "scan to receive" flow.
 *   - A scanned code that matches a product's SKU/barcode → becomes the active product.
 *   - An unknown code is interpreted by the selected target:
 *       "product" → opens the link picker, which saves the code as products.barcode
 *                   so the same box is recognised automatically next time.
 *       "serial"  → recorded as a serial number for the active product.
 * After a product is set, the target auto-switches to "serial".
 */
export function ScanReceiveDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const receive = useReceiveUnits();
  const applyToOrders = useApplyReceivedToOrders();
  const updateProduct = useUpdateProduct();

  const [groups, setGroups] = useState<Group[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [scanTarget, setScanTarget] = useState<ScanTarget>("product");
  const [linkCode, setLinkCode] = useState<string | null>(null);

  // Refs mirror state so the (async) scan handler never reads a stale snapshot.
  const groupsRef = useRef<Group[]>([]);
  const activeRef = useRef<Product | null>(null);
  const targetRef = useRef<ScanTarget>("product");
  const linkActiveRef = useRef(false);
  const busyRef = useRef(false);

  const writeGroups = (next: Group[]) => {
    groupsRef.current = next;
    setGroups(next);
  };

  const setTarget = (t: ScanTarget) => {
    targetRef.current = t;
    setScanTarget(t);
  };

  const setActiveProduct = (p: Product) => {
    activeRef.current = p;
    setActiveId(p.id);
    if (!groupsRef.current.some((g) => g.product.id === p.id)) {
      writeGroups([...groupsRef.current, { product: p, serials: [] }]);
    }
    setTarget("serial");
  };

  const handleScan = async (code: string) => {
    if (linkActiveRef.current || busyRef.current) return;
    busyRef.current = true;
    try {
      let found: Product | null = null;
      try {
        found = await lookupProductByCode(code);
      } catch {
        toast.error("Tuotehaku epäonnistui");
        return;
      }

      // Known product code → switch active product (works in either target).
      if (found) {
        setActiveProduct(found);
        beep();
        toast.info(`${found.name} — skannaa nyt sarjanumerot`);
        return;
      }

      // Unknown code → behaviour depends on the selected target.
      if (targetRef.current === "product") {
        linkActiveRef.current = true;
        setLinkCode(code);
        return;
      }

      const ap = activeRef.current;
      if (!ap) {
        toast.error("Valitse ensin tuote (skannaa tuotekoodi)");
        return;
      }
      if (groupsRef.current.some((g) => g.serials.includes(code))) {
        toast.info(`Sarjanumero jo lisätty: ${code}`);
        return;
      }
      writeGroups(
        groupsRef.current.map((g) =>
          g.product.id === ap.id ? { ...g, serials: [...g.serials, code] } : g,
        ),
      );
      beep();
    } finally {
      busyRef.current = false;
    }
  };

  const handleLinked = async (product: Product) => {
    const code = linkCode;
    linkActiveRef.current = false;
    setLinkCode(null);
    if (!code) return;
    try {
      await updateProduct.mutateAsync({ id: product.id, barcode: code });
      toast.success(`Koodi liitetty: ${product.name}`);
    } catch {
      toast.error("Koodin tallennus epäonnistui — käytetään silti tässä erässä");
    }
    setActiveProduct({ ...product, barcode: code });
  };

  const cancelLink = () => {
    linkActiveRef.current = false;
    setLinkCode(null);
  };

  const removeSerial = (productId: string, sn: string) => {
    writeGroups(
      groupsRef.current.map((g) =>
        g.product.id === productId ? { ...g, serials: g.serials.filter((s) => s !== sn) } : g,
      ),
    );
  };

  const removeGroup = (productId: string) => {
    writeGroups(groupsRef.current.filter((g) => g.product.id !== productId));
    if (activeRef.current?.id === productId) {
      activeRef.current = null;
      setActiveId(null);
      setTarget("product");
    }
  };

  const totalUnits = useMemo(
    () => groups.reduce((sum, g) => sum + g.serials.length, 0),
    [groups],
  );

  const handleSave = async () => {
    const withSerials = groups.filter((g) => g.serials.length > 0);
    if (withSerials.length === 0) return;
    try {
      for (const g of withSerials) {
        await receive.mutateAsync({
          product_id: g.product.id,
          serial_numbers: g.serials,
          notes: notes.trim() || undefined,
        });
        // Auto-deduct the received qty from open purchase orders (oldest first),
        // same as the manual "Vastaanota käsin" flow. Split products are ordered
        // at the component level, so apply per component; others by product id.
        const p = g.product;
        if (p.indoor_component_id && p.outdoor_component_id) {
          await applyToOrders.mutateAsync({ productId: p.indoor_component_id, qty: g.serials.length });
          await applyToOrders.mutateAsync({ productId: p.outdoor_component_id, qty: g.serials.length });
        } else {
          await applyToOrders.mutateAsync({ productId: p.id, qty: g.serials.length });
        }
      }
      toast.success(`Tallennettu ${totalUnits} yksikköä`);
      onClose();
      onSaved?.(); // jump to the allocation board so received stock can be assigned
    } catch {
      toast.error("Tallennus epäonnistui");
    }
  };

  const activeName = groups.find((g) => g.product.id === activeId)?.product.name;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[94vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <ScanLine className="w-4 h-4 text-accent flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-text-primary truncate">Skannaa saapuva tavara</h3>
              <p className="text-xs text-text-muted truncate">
                Skannaa laitteen koodi, sitten sen sarjanumerot
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-hover transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Camera */}
        <div className="relative bg-black h-56 flex-shrink-0">
          <CameraView onDetected={handleScan} />
        </div>

        {/* Target toggle */}
        <div className="px-5 py-2.5 border-b border-border flex items-center gap-2">
          <span className="text-[11px] text-text-muted">Skannaan:</span>
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setTarget("product")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                scanTarget === "product"
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <Package className="w-3.5 h-3.5" /> Tuotekoodi
            </button>
            <button
              onClick={() => setTarget("serial")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                scanTarget === "serial"
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <Hash className="w-3.5 h-3.5" /> Sarjanumero
            </button>
          </div>
        </div>

        {/* Active product banner */}
        <div className="px-5 py-2 border-b border-border bg-surface-alt flex items-center gap-2">
          {activeName ? (
            <>
              <Package className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="text-sm font-medium text-text-primary truncate">{activeName}</span>
              {scanTarget === "serial" && (
                <span className="text-xs text-text-muted ml-auto flex items-center gap-1">
                  <ArrowDown className="w-3 h-3" /> sarjanumerot tähän
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-text-muted">
              Skannaa tuotteen koodi aloittaaksesi
            </span>
          )}
        </div>

        {/* Grouped list */}
        <div className="px-5 py-3 space-y-3 overflow-y-auto flex-1">
          {groups.length === 0 ? (
            <p className="text-center text-xs text-text-muted py-6">Ei vielä skannauksia.</p>
          ) : (
            groups.map((g) => (
              <div key={g.product.id} className="rounded-xl border border-border bg-surface-alt p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{g.product.name}</p>
                    <p className="text-[11px] text-text-muted font-mono">
                      {g.product.sku || g.product.barcode || "—"} · {g.serials.length} kpl
                    </p>
                  </div>
                  <button
                    onClick={() => removeGroup(g.product.id)}
                    className="p-1 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {g.serials.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {g.serials.map((sn) => (
                      <span
                        key={sn}
                        className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-surface border border-border text-[11px] font-mono text-text-secondary"
                      >
                        {sn}
                        <button
                          onClick={() => removeSerial(g.product.id, sn)}
                          className="p-0.5 rounded hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          {groups.length > 0 && (
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">
                Muistiinpanot (valinnainen)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Esim. toimituserä #2026-18"
                className={inputCls}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-5 py-4 border-t border-border flex-shrink-0">
          <p className="text-xs text-text-muted">
            {totalUnits > 0 ? `Tallentaa ${totalUnits} yksikköä` : "Skannaa laitteita"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-xl transition-colors"
            >
              Peruuta
            </button>
            <button
              onClick={handleSave}
              disabled={totalUnits === 0 || receive.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {receive.isPending ? "Tallennetaan..." : "Tallenna"}
            </button>
          </div>
        </div>
      </div>

      {linkCode !== null && (
        <LinkProductPicker code={linkCode} onCancel={cancelLink} onPicked={handleLinked} />
      )}
    </div>
  );
}

// ─── Link an unknown code to a product (saves products.barcode) ────────────────

function LinkProductPicker({
  code,
  onCancel,
  onPicked,
}: {
  code: string;
  onCancel: () => void;
  onPicked: (product: Product) => void;
}) {
  const { data: products } = useProducts();
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (products || [])
      .filter((p) => p.active)
      .filter((p) => {
        if (!query) return true;
        return `${p.name} ${p.sku || ""} ${p.brand || ""} ${p.model || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fi"))
      .slice(0, 60);
  }, [products, q]);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-text-primary">Tuntematon koodi</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Mihin tuotteeseen koodi <span className="font-mono text-text-secondary">{code}</span>{" "}
            kuuluu? Se tallennetaan tuotteelle, ja sama laatikko tunnistuu jatkossa automaattisesti.
          </p>
        </div>

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Hae nimellä, SKU:lla, merkillä..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={inputCls + " pl-9"}
              autoFocus
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {list.length === 0 ? (
            <p className="text-center text-xs text-text-muted py-6">Ei tuotteita haulla.</p>
          ) : (
            <ul>
              {list.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => onPicked(p)}
                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-border/60 last:border-b-0 hover:bg-surface-hover transition-colors"
                  >
                    <Package className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-text-primary truncate">{p.name}</div>
                      <div className="text-[11px] text-text-muted font-mono">
                        {p.sku || "ei SKU"}
                        {p.barcode ? ` · EAN ${p.barcode}` : ""}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-xl transition-colors"
          >
            Peruuta
          </button>
        </div>
      </div>
    </div>
  );
}
