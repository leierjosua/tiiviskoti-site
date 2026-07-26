import { useState } from "react";
import { useConfirm } from "@/context/ConfirmContext";
import { useDiscountCodes, useCreateDiscountCode, useUpdateDiscountCode, useDeleteDiscountCode, useDiscountCodeBookings } from "@/hooks/useDiscountCodes";
import { useEmployees } from "@/hooks/useEmployees";
import { formatCents, formatDateTime, formatDate, STATUS_LABELS } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/DatePicker";
import { Plus, Pencil, Trash2, Ticket, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { inputCls } from "@/lib/constants";
import type { DiscountCode, DiscountType } from "@/lib/types";

interface CodeForm {
  code: string;
  discount_type: DiscountType;
  discount_value: string;
  max_uses: string;
  expires_at: string;
  employee_id: string;
  commission_cents: string;
}

const emptyForm: CodeForm = {
  code: "",
  discount_type: "eur",
  discount_value: "",
  max_uses: "",
  expires_at: "",
  employee_id: "",
  commission_cents: "",
};

function toForm(dc: DiscountCode): CodeForm {
  return {
    code: dc.code,
    discount_type: dc.discount_type,
    discount_value: dc.discount_type === "eur" ? String(dc.discount_value / 100) : String(dc.discount_value),
    max_uses: dc.max_uses != null ? String(dc.max_uses) : "",
    expires_at: dc.expires_at ? dc.expires_at.slice(0, 10) : "",
    employee_id: dc.employee_id || "",
    commission_cents: dc.commission_cents ? String(dc.commission_cents / 100) : "",
  };
}

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

export default function DiscountCodes() {
  const confirm = useConfirm();
  const { data: codes, isLoading } = useDiscountCodes();
  const { data: employees } = useEmployees();
  const createCode = useCreateDiscountCode();
  const updateCode = useUpdateDiscountCode();
  const deleteCode = useDeleteDiscountCode();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<CodeForm>(emptyForm);
  const [error, setError] = useState("");
  const { data: usageBookings } = useDiscountCodeBookings(expandedId);

  function cancelEdit() {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
    setError("");
  }

  function startEdit(dc: DiscountCode) {
    setEditingId(dc.id);
    setForm(toForm(dc));
    setShowForm(false);
    setError("");
  }

  function formToData(f: CodeForm) {
    return {
      code: f.code.trim(),
      discount_type: f.discount_type as DiscountType,
      discount_value: f.discount_type === "eur"
        ? Math.round(parseFloat(f.discount_value || "0") * 100)
        : parseInt(f.discount_value || "0", 10),
      max_uses: f.max_uses ? parseInt(f.max_uses, 10) : null,
      expires_at: f.expires_at ? f.expires_at + "T23:59:59Z" : null,
      employee_id: f.employee_id || null,
      commission_cents: f.commission_cents ? Math.round(parseFloat(f.commission_cents) * 100) : 0,
    };
  }

  async function handleCreate(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!form.code.trim()) { setError("Koodi vaaditaan"); return; }
    try {
      await createCode.mutateAsync(formToData(form));
      cancelEdit();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("duplicate")) {
        setError("Tämä koodi on jo käytössä");
      } else {
        setError(err instanceof Error ? err.message : "Luonti epäonnistui");
      }
    }
  }

  async function handleUpdate(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editingId) return;
    setError("");
    try {
      await updateCode.mutateAsync({ id: editingId, ...formToData(form) });
      cancelEdit();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Päivitys epäonnistui");
    }
  }

  function formatDiscount(dc: DiscountCode) {
    if (dc.discount_type === "eur") return formatCents(dc.discount_value);
    return `${dc.discount_value} %`;
  }

  const formFields = (
    <form onSubmit={editingId ? handleUpdate : handleCreate} className="bg-surface rounded-2xl border border-border p-6 mb-6 space-y-5">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Koodi *</label>
          <input
            type="text"
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className={inputCls}
            placeholder="KESALE2026"
          />
          <p className="text-xs text-text-muted mt-1">Ei kirjainkokoherkkä</p>
        </div>
        <div>
          <label className={labelCls}>Alennuksen tyyppi</label>
          <div className="flex gap-2">
            {(["eur", "percent"] as DiscountType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, discount_type: t, discount_value: "" })}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  form.discount_type === t
                    ? "border-accent bg-accent-muted text-accent-dark"
                    : "border-border text-text-secondary hover:border-border-strong"
                }`}
              >
                {t === "eur" ? "€ (euroa)" : "% (prosentti)"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>
            Arvo ({form.discount_type === "eur" ? "€" : "%"}) *
          </label>
          <input
            type="number"
            required
            min={0}
            step={form.discount_type === "eur" ? 0.01 : 1}
            max={form.discount_type === "percent" ? 100 : undefined}
            value={form.discount_value}
            onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Max käyttökerrat</label>
          <input
            type="number"
            min={1}
            value={form.max_uses}
            onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
            className={inputCls}
            placeholder="Rajoittamaton"
          />
        </div>
        <div>
          <label className={labelCls}>Vanhenee</label>
          <DatePicker
            value={form.expires_at}
            onChange={(v) => setForm({ ...form, expires_at: v })}
            placeholder="Ei vanhene"
            className="w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Omistaja (työntekijä)</label>
          <select
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            className={inputCls}
          >
            <option value="">Ei omistajaa</option>
            {employees?.filter((e) => e.active).map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.last_name} ({emp.roles?.includes("seller") ? "myyjä" : "asentaja"})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Provisio per käyttö (€)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.commission_cents}
            onChange={(e) => setForm({ ...form, commission_cents: e.target.value })}
            className={inputCls}
            placeholder="0"
          />
          <p className="text-xs text-text-muted mt-1">Omistaja saa tämän jokaisesta koodin käytöstä</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={createCode.isPending || updateCode.isPending}
          className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {(createCode.isPending || updateCode.isPending) ? "Tallennetaan..." : editingId ? "Tallenna" : "Luo koodi"}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
        >
          Peruuta
        </button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Ticket className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Alennuskoodit</h1>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); if (editingId) cancelEdit(); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" /> Luo koodi
        </button>
      </div>

      {showForm && !editingId && formFields}

      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">Ladataan...</div>
        ) : !codes || codes.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">Ei alennuskoodeja</div>
        ) : (
          codes.map((dc) => (
            <div key={dc.id}>
              {editingId === dc.id ? formFields : (
                <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
                        <Ticket className="w-5 h-5 text-accent-dark" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-sm text-text-primary font-mono uppercase">{dc.code}</span>
                          <Badge className={dc.active ? "bg-accent-muted text-accent-dark border border-accent/30" : "bg-gray-100 text-gray-500 border border-gray-200"}>
                            {dc.active ? "Aktiivinen" : "Ei aktiivinen"}
                          </Badge>
                          {dc.expires_at && new Date(dc.expires_at) < new Date() && (
                            <Badge className="bg-red-50 text-red-600 border border-red-200">Vanhentunut</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-text-secondary">
                          <span>Alennus: <span className="font-semibold">{formatDiscount(dc)}</span></span>
                          <span>Käytetty: {dc.times_used}{dc.max_uses != null ? ` / ${dc.max_uses}` : ""}</span>
                          {dc.expires_at && <span>Vanhenee: {dc.expires_at.slice(0, 10)}</span>}
                          {dc.employees && (
                            <span>Omistaja: {dc.employees.first_name} {dc.employees.last_name}</span>
                          )}
                          {dc.commission_cents > 0 && (
                            <span>Provisio: {formatCents(dc.commission_cents)} / käyttö</span>
                          )}
                        </div>
                        <p className="text-[10px] text-text-muted mt-1">Luotu {formatDateTime(dc.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {dc.times_used > 0 && (
                        <button
                          onClick={() => setExpandedId(expandedId === dc.id ? null : dc.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors inline-flex items-center gap-1"
                        >
                          {expandedId === dc.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          Historia
                        </button>
                      )}
                      <button
                        onClick={() => updateCode.mutate({ id: dc.id, active: !dc.active })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          dc.active
                            ? "text-red-600 hover:bg-red-50"
                            : "text-accent-dark hover:bg-accent-muted"
                        }`}
                      >
                        {dc.active ? "Poista käytöstä" : "Aktivoi"}
                      </button>
                      <button
                        onClick={() => startEdit(dc)}
                        className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (await confirm({ message: "Poistetaanko alennuskoodi pysyvästi?", confirmLabel: "Poista", variant: "danger" })) {
                            deleteCode.mutate(dc.id);
                          }
                        }}
                        className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Usage history */}
                  {expandedId === dc.id && (
                    <div className="border-t border-border px-5 pb-4">
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mt-4 mb-2">Käyttöhistoria</p>
                      {!usageBookings || usageBookings.length === 0 ? (
                        <p className="text-sm text-text-muted py-2">Ei varauksia</p>
                      ) : (
                        <div className="space-y-1.5">
                          {usageBookings.map((b) => (
                            <Link
                              key={b.id}
                              to={`/varaukset/${b.booking_number}`}
                              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-hover transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-text-primary">
                                  #{b.booking_number} · {b.customers ? `${b.customers.first_name} ${b.customers.last_name}` : "–"}
                                </p>
                                <p className="text-xs text-text-muted">
                                  Käytetty {formatDateTime(b.created_at)} · Keikka {formatDate(b.booking_date)} · {STATUS_LABELS[b.status] || b.status}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0 ml-3 flex items-center gap-2">
                                <span className="text-sm font-semibold text-accent-dark">-{formatCents(b.discount_amount_cents)}</span>
                                <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
