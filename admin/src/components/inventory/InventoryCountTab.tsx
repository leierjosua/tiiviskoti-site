import { useEffect, useMemo, useState } from "react";
import {
  useInventoryCountList,
  useApplyInventoryCount,
  useInventoryCounts,
  type InventoryCountRow,
} from "@/hooks/useInventoryCount";
import { inputCls } from "@/lib/constants";
import {
  ClipboardCheck,
  Search,
  History,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  X,
} from "lucide-react";

const todayStr = () => new Date().toISOString().slice(0, 10);

function productLabel(p: InventoryCountRow) {
  return [p.brand, p.name].filter(Boolean).join(" ") + (p.model ? ` (${p.model})` : "");
}

export function InventoryCountTab() {
  const { data, isLoading, isError, error } = useInventoryCountList();
  const apply = useApplyInventoryCount();

  // product_id -> counted value (string for controlled input)
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [countDate, setCountDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [done, setDone] = useState<null | {
    added: number;
    removed: number;
    recorded: number;
    appliedToOrders: number;
  }>(null);

  // Pre-fill counted = system in_stock once the list loads.
  const allRows = useMemo(
    () => (data?.groups || []).flatMap((g) => g.rows),
    [data],
  );
  useEffect(() => {
    if (!allRows.length) return;
    setCounts((prev) => {
      if (Object.keys(prev).length) return prev; // don't clobber edits
      const next: Record<string, string> = {};
      for (const r of allRows) next[r.id] = String(r.inStock);
      return next;
    });
  }, [allRows]);

  const countedFor = (r: InventoryCountRow) => {
    const raw = counts[r.id];
    if (raw === undefined) return r.inStock;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const deltaFor = (r: InventoryCountRow) => countedFor(r) - r.inStock;

  // Changed lines drive the summary + the actual payload.
  const changed = useMemo(
    () => allRows.filter((r) => deltaFor(r) !== 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, counts],
  );
  const totalAdded = changed.reduce((s, r) => s + Math.max(0, deltaFor(r)), 0);
  const totalRemoved = changed.reduce((s, r) => s + Math.max(0, -deltaFor(r)), 0);

  const matches = (r: InventoryCountRow) => {
    if (onlyDiff && deltaFor(r) === 0) return false;
    if (!search.trim()) return true;
    const hay = `${r.name} ${r.brand || ""} ${r.model || ""} ${r.sku || ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  };

  const visibleGroups = (data?.groups || [])
    .map((g) => ({ ...g, rows: g.rows.filter(matches) }))
    .filter((g) => g.rows.length > 0);

  const submit = async () => {
    const lines = changed.map((r) => ({ product_id: r.id, counted: countedFor(r) }));
    const res = await apply.mutateAsync({ countDate, note, lines });
    setConfirmOpen(false);
    setDone({
      added: res.total_added,
      removed: res.total_removed,
      recorded: res.lines_recorded,
      appliedToOrders: res.applied_to_orders,
    });
    setCounts({}); // re-prefill from fresh system counts
    setNote("");
  };

  if (isLoading) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
        Ladataan tuotteita…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-800">
        Virhe: {(error as Error)?.message}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-2xl border border-border bg-surface p-4 flex items-start gap-3">
        <ClipboardCheck className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="text-sm text-text-secondary">
          Laske hylly kerralla. Jokaisen tuotteen <strong>Laskettu</strong>-kenttä on esitäytetty
          järjestelmäsaldolla — korjaa vain ne jotka eroavat. Vahvistus täsmäyttää varastoyksiköt
          laskettuun määrään, kuittaa löytyneen ylimäärän avoimista tilauksista (vanhin ensin) ja
          nollaa automaattisen vähennyksen lähtöpäivän tähän päivään.
        </div>
      </div>

      {/* Success banner */}
      {done && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800 flex-1">
            Inventaario tallennettu: {done.recorded} riviä päivitetty
            {done.added > 0 && `, +${done.added} lisätty`}
            {done.removed > 0 && `, −${done.removed} poistettu`}
            {done.appliedToOrders > 0 &&
              `, ${done.appliedToOrders} kuitattu avoimista tilauksista`}
            . Lähtöpäivä päivitetty.
          </div>
          <button onClick={() => setDone(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hae tuotetta…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-surface text-text-secondary hover:bg-surface-hover cursor-pointer">
          <input
            type="checkbox"
            checked={onlyDiff}
            onChange={(e) => setOnlyDiff(e.target.checked)}
            className="rounded border-border text-accent focus:ring-accent/30"
          />
          Vain eroavat
        </label>
      </div>

      {/* Table */}
      {visibleGroups.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
          Ei tuotteita.
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/50 text-text-muted">
                <th className="text-left px-4 py-3 font-medium">Tuote</th>
                <th className="text-right px-3 py-3 font-medium w-24">Järjestelmä</th>
                <th className="text-right px-3 py-3 font-medium w-20 hidden sm:table-cell">Varattu</th>
                <th className="text-right px-3 py-3 font-medium w-28">Laskettu</th>
                <th className="text-right px-4 py-3 font-medium w-20">Erotus</th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((g) => (
                <FragmentGroup
                  key={g.categoryId || "none"}
                  name={g.categoryName}
                  rows={g.rows}
                  counts={counts}
                  setCounts={setCounts}
                  deltaFor={deltaFor}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 bg-surface/95 backdrop-blur border border-border rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow-lg">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">Muutoksia:</span>
          <strong className="text-text-primary">{changed.length}</strong>
          {totalAdded > 0 && <span className="text-emerald-600 font-semibold">+{totalAdded}</span>}
          {totalRemoved > 0 && <span className="text-red-600 font-semibold">−{totalRemoved}</span>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-text-muted">Päivä</label>
          <input
            type="date"
            value={countDate}
            onChange={(e) => setCountDate(e.target.value)}
            className="px-2.5 py-2 border border-border rounded-lg text-sm bg-surface"
          />
          <button
            disabled={changed.length === 0}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-accent hover:bg-accent-dark text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ClipboardCheck className="w-4 h-4" />
            Vahvista inventaario
          </button>
        </div>
      </div>

      <CountHistory />

      {confirmOpen && (
        <ConfirmDialog
          changed={changed}
          countDate={countDate}
          note={note}
          setNote={setNote}
          deltaFor={deltaFor}
          countedFor={countedFor}
          onClose={() => setConfirmOpen(false)}
          onConfirm={submit}
          pending={apply.isPending}
          errorMsg={apply.isError ? (apply.error as Error)?.message : null}
        />
      )}
    </div>
  );
}

// ─── Category group rows ──────────────────────────────────────────────────────

function FragmentGroup({
  name,
  rows,
  counts,
  setCounts,
  deltaFor,
}: {
  name: string;
  rows: InventoryCountRow[];
  counts: Record<string, string>;
  setCounts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  deltaFor: (r: InventoryCountRow) => number;
}) {
  return (
    <>
      <tr className="bg-surface-hover/30">
        <td colSpan={5} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {name}
        </td>
      </tr>
      {rows.map((r) => {
        const delta = deltaFor(r);
        return (
          <tr key={r.id} className="border-b border-border/50 hover:bg-surface-hover/30 transition-colors">
            <td className="px-4 py-2.5">
              <div className="font-medium text-text-primary">{productLabel(r)}</div>
              {r.sku && <div className="text-xs text-text-muted">{r.sku}</div>}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.inStock}</td>
            <td className="px-3 py-2.5 text-right tabular-nums text-text-muted hidden sm:table-cell">
              {r.reserved > 0 ? r.reserved : "—"}
            </td>
            <td className="px-3 py-2.5 text-right">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={counts[r.id] ?? String(r.inStock)}
                onChange={(e) =>
                  setCounts((prev) => ({ ...prev, [r.id]: e.target.value }))
                }
                className={`w-20 px-2 py-1.5 border rounded-lg text-sm text-right tabular-nums bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                  delta !== 0 ? "border-accent" : "border-border"
                }`}
              />
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
              {delta === 0 ? (
                <span className="text-text-muted">0</span>
              ) : delta > 0 ? (
                <span className="text-emerald-600">+{delta}</span>
              ) : (
                <span className="text-red-600">{delta}</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  changed,
  countDate,
  note,
  setNote,
  deltaFor,
  countedFor,
  onClose,
  onConfirm,
  pending,
  errorMsg,
}: {
  changed: InventoryCountRow[];
  countDate: string;
  note: string;
  setNote: (v: string) => void;
  deltaFor: (r: InventoryCountRow) => number;
  countedFor: (r: InventoryCountRow) => number;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  errorMsg: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-text-primary">Vahvista inventaario {countDate}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <p className="text-sm text-text-secondary mb-3">
            Seuraavat {changed.length} tuotetta täsmäytetään. Tämä muuttaa varastoyksiköitä ja
            päivittää automaattisen vähennyksen lähtöpäivän.
          </p>
          <div className="rounded-xl border border-border divide-y divide-border/60 mb-4">
            {changed.map((r) => {
              const d = deltaFor(r);
              return (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-text-primary truncate pr-3">{productLabel(r)}</span>
                  <span className="text-text-muted tabular-nums shrink-0">
                    {r.inStock} → {countedFor(r)}{" "}
                    <span className={d > 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                      ({d > 0 ? "+" : ""}
                      {d})
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <label className="block text-xs text-text-muted mb-1">Muistiinpano (valinnainen)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="esim. Kuukausi-inventaario"
            className={inputCls}
          />
          {errorMsg && <p className="text-sm text-red-600 mt-3">{errorMsg}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Peruuta
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-accent hover:bg-accent-dark text-white transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {pending ? "Tallennetaan…" : "Vahvista"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────

function CountHistory() {
  const [open, setOpen] = useState(false);
  const { data } = useInventoryCounts(10);

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <History className="w-4 h-4" />
        Inventaariohistoria
        {data && data.length > 0 && (
          <span className="text-text-muted">({data.length})</span>
        )}
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border/60">
          {!data || data.length === 0 ? (
            <div className="px-4 py-4 text-sm text-text-muted">Ei vielä inventaarioita.</div>
          ) : (
            data.map((c) => {
              const lines = c.inventory_count_lines || [];
              const changedLines = lines.filter((l) => l.delta !== 0);
              const added = changedLines.reduce((s, l) => s + Math.max(0, l.delta), 0);
              const removed = changedLines.reduce((s, l) => s + Math.max(0, -l.delta), 0);
              return (
                <details key={c.id} className="px-4 py-3">
                  <summary className="flex items-center gap-3 cursor-pointer text-sm">
                    <span className="font-medium text-text-primary">{c.count_date}</span>
                    <span className="text-text-muted">{changedLines.length} muutosta</span>
                    {added > 0 && <span className="text-emerald-600">+{added}</span>}
                    {removed > 0 && <span className="text-red-600">−{removed}</span>}
                    {c.note && <span className="text-text-muted italic truncate">— {c.note}</span>}
                  </summary>
                  <div className="mt-2 pl-1 space-y-1">
                    {changedLines.length === 0 ? (
                      <p className="text-xs text-text-muted">Ei poikkeamia — kaikki täsmäsi.</p>
                    ) : (
                      changedLines.map((l) => (
                        <div key={l.id} className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary truncate pr-3">
                            {[l.products?.brand, l.products?.name].filter(Boolean).join(" ") || l.product_id}
                          </span>
                          <span className="text-text-muted tabular-nums shrink-0">
                            {l.system_count} → {l.counted_count}{" "}
                            <span className={l.delta > 0 ? "text-emerald-600" : "text-red-600"}>
                              ({l.delta > 0 ? "+" : ""}
                              {l.delta})
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
