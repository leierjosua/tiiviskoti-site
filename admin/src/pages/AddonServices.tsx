import { useState } from "react";
import {
  useAddonServices,
  useCreateAddonService,
  useUpdateAddonService,
  useDeleteAddonService,
  useAddonServiceLinks,
  useLinkAddonToService,
  useUnlinkAddonFromService,
  useUpdateAddonServiceLinkRole,
} from "@/hooks/useAddonServices";
import { useServices } from "@/hooks/useServices";
import {
  usePalkallinenDefaults,
  savePalkallinenInternalCost,
  useInvalidatePalkallinenCosts,
} from "@/hooks/usePalkallinenInternalCosts";
import { formatCents } from "@/lib/utils";
import { inputCls } from "@/lib/constants";
import { Plus, Pencil, Layers, Link2, Unlink, Trash2, Sparkles, Power, PowerOff, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import type { AddonService, PalkallinenInternalCost } from "@/lib/types";

type AddonForm = {
  name: string;
  description: string;
  price_cents: string;
  material_cost_cents: string;
  duration_minutes: string;
  commission_yrittaja_cents: string;
  commission_alihankkija_cents: string;
  sales_commission_cents: string;
};

const emptyForm: AddonForm = {
  name: "",
  description: "",
  price_cents: "",
  material_cost_cents: "",
  duration_minutes: "0",
  commission_yrittaja_cents: "",
  commission_alihankkija_cents: "",
  sales_commission_cents: "",
};

function toForm(a: AddonService): AddonForm {
  return {
    name: a.name,
    description: a.description || "",
    price_cents: String(a.price_cents / 100),
    material_cost_cents: String(a.material_cost_cents / 100),
    duration_minutes: String(a.duration_minutes),
    commission_yrittaja_cents: a.commission_yrittaja_cents != null ? String(a.commission_yrittaja_cents / 100) : "",
    commission_alihankkija_cents: a.commission_alihankkija_cents != null ? String(a.commission_alihankkija_cents / 100) : "",
    sales_commission_cents: a.sales_commission_cents != null ? String(a.sales_commission_cents / 100) : "",
  };
}

function formToData(f: AddonForm) {
  return {
    name: f.name,
    description: f.description || null,
    price_cents: Math.round(parseFloat(f.price_cents || "0") * 100),
    material_cost_cents: Math.round(parseFloat(f.material_cost_cents || "0") * 100),
    duration_minutes: parseInt(f.duration_minutes, 10) || 0,
    commission_yrittaja_cents: f.commission_yrittaja_cents ? Math.round(parseFloat(f.commission_yrittaja_cents) * 100) : null,
    commission_alihankkija_cents: f.commission_alihankkija_cents ? Math.round(parseFloat(f.commission_alihankkija_cents) * 100) : null,
    sales_commission_cents: f.sales_commission_cents ? Math.round(parseFloat(f.sales_commission_cents) * 100) : null,
    active: true,
    sort_order: 0,
    service_category_id: null,
  };
}

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

function AddonInternalCostRow({ addonId }: { addonId?: string }) {
  const { data: defaults } = usePalkallinenDefaults();
  const invalidate = useInvalidatePalkallinenCosts();
  const toast = useToast();
  const row = (defaults || []).find((d: PalkallinenInternalCost) => d.addon_service_id === addonId);

  if (!addonId) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-hover/40 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-3.5 h-3.5 text-text-muted" />
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Sisäinen kulu (vain ylläpito)</p>
        </div>
        <p className="text-xs text-text-muted">Tallenna lisäpalvelu ensin, niin voit asettaa palkallisten sisäisen kulun.</p>
      </div>
    );
  }

  async function handleBlur(raw: string) {
    const cents = raw.trim() ? Math.round(parseFloat(raw) * 100) : 0;
    const current = row?.internal_cost_cents ?? 0;
    if (cents === current) return;
    try {
      await savePalkallinenInternalCost({ kind: "addon", addon_service_id: addonId! }, null, cents, 0);
      invalidate();
    } catch {
      toast("Sisäisen kulun tallennus epäonnistui", "error");
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-hover/40 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Lock className="w-3.5 h-3.5 text-text-muted" />
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Sisäinen kulu palkalliselle (vain ylläpito)</p>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Mitä toinen yhtiö laskuttaa, kun palkallinen asentaja tekee tämän lisäpalvelun. Ei näy asentajalle.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Sisäinen kulu (€)</label>
          <input
            key={`addon-${row?.internal_cost_cents ?? 0}`}
            type="number"
            min={0}
            step={0.01}
            defaultValue={row ? String(row.internal_cost_cents / 100) : ""}
            onBlur={(e) => handleBlur(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
    </div>
  );
}

function AddonFormFields({ form, setForm, error, onSubmit, onCancel, submitLabel, isPending, addonId }: {
  form: AddonForm;
  setForm: (f: AddonForm) => void;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  isPending: boolean;
  addonId?: string;
}) {
  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-2xl border border-border p-6 mb-6 space-y-5">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Lisäpalvelun nimi *</label>
          <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Kuvaus</label>
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-3">Hinnoittelu</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Hinta (€) *</label>
            <input type="number" required min={0} step={0.01} value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Materiaalikustannus (€)</label>
            <input type="number" min={0} step={0.01} value={form.material_cost_cents} onChange={(e) => setForm({ ...form, material_cost_cents: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Kesto (min)</label>
            <input type="number" min={0} step={5} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className={inputCls} />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-3">Provisiot</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Yrittäjä-provisio (€)</label>
            <input type="number" min={0} step={0.01} value={form.commission_yrittaja_cents} onChange={(e) => setForm({ ...form, commission_yrittaja_cents: e.target.value })} className={inputCls} placeholder="Tyhjä = ei provisiota" />
          </div>
          <div>
            <label className={labelCls}>Alihankkija-provisio (€)</label>
            <input type="number" min={0} step={0.01} value={form.commission_alihankkija_cents} onChange={(e) => setForm({ ...form, commission_alihankkija_cents: e.target.value })} className={inputCls} placeholder="Tyhjä = ei provisiota" />
          </div>
          <div>
            <label className={labelCls}>Myyntiprovisio (€)</label>
            <input type="number" min={0} step={0.01} value={form.sales_commission_cents} onChange={(e) => setForm({ ...form, sales_commission_cents: e.target.value })} className={inputCls} placeholder="Tyhjä = ei provisiota" />
          </div>
        </div>
      </div>

      <AddonInternalCostRow addonId={addonId} />

      <div className="flex gap-3">
        <button type="submit" disabled={isPending}
          className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
          {isPending ? "Tallennetaan..." : submitLabel}
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
          Peruuta
        </button>
      </div>
    </form>
  );
}

function LinkManager({ addonId }: { addonId: string }) {
  const { data: links } = useAddonServiceLinks(addonId);
  const { data: services } = useServices();
  const linkMutation = useLinkAddonToService();
  const unlinkMutation = useUnlinkAddonFromService();
  const roleMutation = useUpdateAddonServiceLinkRole();
  const [showPicker, setShowPicker] = useState(false);

  const linkedServiceIds = new Set(links?.map((l) => l.service_id));
  const availableServices = services?.filter((s) => !linkedServiceIds.has(s.id) && s.active) || [];

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Linkitetyt palvelut</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {links?.map((link) => {
          const isUpsell = link.role === "upsell";
          return (
            <div key={link.id} className="inline-flex items-center gap-0.5">
              <button
                onClick={() => unlinkMutation.mutate({ addon_service_id: addonId, service_id: link.service_id })}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-l-lg transition-colors group ${
                  isUpsell ? "bg-amber-50 text-amber-700 hover:bg-red-50 hover:text-red-600" : "bg-accent-muted text-accent-dark hover:bg-red-50 hover:text-red-600"
                }`}
              >
                {link.services?.name || "—"}
                <Unlink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button
                onClick={() => roleMutation.mutate({
                  addon_service_id: addonId,
                  service_id: link.service_id,
                  role: isUpsell ? "addon" : "upsell",
                })}
                title={isUpsell ? "Lisämyynti — klikkaa vaihtaaksesi lisäpalveluksi" : "Lisäpalvelu — klikkaa vaihtaaksesi lisämyynniksi"}
                className={`inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium rounded-r-lg transition-colors ${
                  isUpsell
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "bg-gray-100 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                }`}
              >
                <Sparkles className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
        {!showPicker && (
          <button
            onClick={() => setShowPicker(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-border text-text-muted text-xs rounded-lg hover:border-accent hover:text-accent transition-colors"
          >
            <Plus className="w-3 h-3" /> Linkitä palvelu
          </button>
        )}
      </div>
      {showPicker && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {availableServices.length === 0 ? (
            <span className="text-xs text-text-muted">Kaikki palvelut on jo linkitetty</span>
          ) : (
            availableServices.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  linkMutation.mutate({ addon_service_id: addonId, service_id: s.id });
                }}
                className="px-2.5 py-1 border border-border text-xs rounded-lg hover:bg-accent-muted hover:text-accent-dark hover:border-accent/30 transition-colors"
              >
                {s.name}
              </button>
            ))
          )}
          <button onClick={() => setShowPicker(false)} className="px-2 py-1 text-xs text-text-muted hover:text-text-primary">
            Peruuta
          </button>
        </div>
      )}
    </div>
  );
}

export default function AddonServices() {
  const { data: addons, isLoading } = useAddonServices();
  const createAddon = useCreateAddonService();
  const updateAddon = useUpdateAddonService();
  const deleteAddon = useDeleteAddonService();
  const toast = useToast();
  const confirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddonForm>(emptyForm);
  const [error, setError] = useState("");

  function startEdit(a: AddonService) {
    setEditingId(a.id);
    setForm(toForm(a));
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  }

  async function handleCreate(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    try {
      await createAddon.mutateAsync(formToData(form));
      setShowForm(false);
      setForm(emptyForm);
      toast("Lisäpalvelu luotu", "success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Luonti epäonnistui");
    }
  }

  async function handleUpdate(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editingId) return;
    setError("");
    try {
      await updateAddon.mutateAsync({ id: editingId, ...formToData(form) });
      cancelEdit();
      toast("Lisäpalvelu päivitetty", "success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Päivitys epäonnistui");
    }
  }

  async function toggleActive(a: AddonService) {
    await updateAddon.mutateAsync({ id: a.id, active: !a.active });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Lisäpalvelut</h1>
        </div>
        <button onClick={() => { setEditingId(null); setForm(emptyForm); setError(""); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap">
          <Plus className="w-4 h-4" /> Lisää lisäpalvelu
        </button>
      </div>

      {showForm && (
        <AddonFormFields
          form={form} setForm={setForm} error={error}
          onSubmit={handleCreate} onCancel={cancelEdit}
          submitLabel="Luo lisäpalvelu" isPending={createAddon.isPending}
          addonId={undefined}
        />
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">Ladataan...</div>
        ) : !addons || addons.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
            Ei lisäpalveluita. Lisää ensimmäinen lisäpalvelu yllä olevasta napista.
          </div>
        ) : (
          addons.map((a) => (
            <div key={a.id} className="bg-surface rounded-2xl border border-border overflow-hidden">
              {editingId === a.id ? (
                <AddonFormFields
                  form={form} setForm={setForm} error={error}
                  onSubmit={handleUpdate} onCancel={cancelEdit}
                  submitLabel="Tallenna" isPending={updateAddon.isPending}
                  addonId={a.id}
                />
              ) : (
                <div className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-semibold text-sm text-text-primary">{a.name}</span>
                      {!a.active && (
                        <Badge className="bg-gray-100 text-gray-500 border border-gray-200">Pois käytöstä</Badge>
                      )}
                      <span className="text-xs text-text-secondary">{formatCents(a.price_cents)}</span>
                      {a.duration_minutes > 0 && <span className="text-xs text-text-muted">{a.duration_minutes} min</span>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleActive(a)}
                        className={`p-1.5 rounded-lg transition-colors ${a.active ? "text-accent-dark hover:text-red-500 hover:bg-red-50" : "text-text-muted hover:text-accent-dark hover:bg-accent-muted"}`}
                        title={a.active ? "Poista käytöstä" : "Ota käyttöön"}>
                        {a.active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => startEdit(a)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={async () => {
                        if (await confirm({ message: `Poistetaanko lisäpalvelu "${a.name}" pysyvästi?`, confirmLabel: "Poista", variant: "danger" })) {
                          await deleteAddon.mutateAsync(a.id);
                          toast("Lisäpalvelu poistettu", "success");
                        }
                      }}
                        className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Poista pysyvästi">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <LinkManager addonId={a.id} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
