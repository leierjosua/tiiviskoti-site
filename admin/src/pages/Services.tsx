import { useState } from "react";
import { useServices, useCreateService, useUpdateService, useDeleteService, useCompanySettings, useServiceCategories } from "@/hooks/useServices";
import { useConfirm } from "@/context/ConfirmContext";
import { useServiceVariants, useCreateServiceVariant, useUpdateServiceVariant, useDeleteServiceVariant } from "@/hooks/useServiceVariants";
import {
  usePalkallinenDefaults,
  savePalkallinenInternalCost,
  useInvalidatePalkallinenCosts,
} from "@/hooks/usePalkallinenInternalCosts";
import { formatCents } from "@/lib/utils";
import { Plus, Pencil, Package, Trash2, ChevronDown, ChevronUp, MessageCircle, Users, Power, PowerOff, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { inputCls } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import type { Service, ServiceVariant, VolumePricingTier, PalkallinenInternalCost } from "@/lib/types";

type VolumeTierForm = { min_qty: string; price_cents: string };

type ServiceForm = {
  name: string;
  description: string;
  category_id: string;
  base_price_cents: string;
  material_cost_cents: string;
  commission_yrittaja_cents: string;
  commission_alihankkija_cents: string;
  sales_commission_cents: string;
  duration_minutes: string;
  transition_minutes: string;
  min_scheduling_notice_hours: string;
  max_advance_days: string;
  extra_duration_per_unit_minutes: string;
  volume_pricing: VolumeTierForm[];
  required_employees: string;
  secondary_commission_yrittaja_cents: string;
  secondary_commission_alihankkija_cents: string;
  chatbot_enabled: boolean;
};

const emptyForm: ServiceForm = {
  name: "",
  description: "",
  category_id: "",
  base_price_cents: "",
  material_cost_cents: "",
  commission_yrittaja_cents: "",
  commission_alihankkija_cents: "",
  sales_commission_cents: "",
  duration_minutes: "60",
  transition_minutes: "",
  min_scheduling_notice_hours: "18",
  max_advance_days: "",
  extra_duration_per_unit_minutes: "",
  volume_pricing: [],
  required_employees: "1",
  secondary_commission_yrittaja_cents: "",
  secondary_commission_alihankkija_cents: "",
  chatbot_enabled: false,
};

function toForm(s: Service): ServiceForm {
  return {
    name: s.name,
    description: s.description || "",
    category_id: s.category_id || "",
    base_price_cents: String(s.base_price_cents / 100),
    material_cost_cents: String(s.material_cost_cents / 100),
    commission_yrittaja_cents: String(s.commission_yrittaja_cents / 100),
    commission_alihankkija_cents: String(s.commission_alihankkija_cents / 100),
    sales_commission_cents: String(s.sales_commission_cents / 100),
    duration_minutes: String(s.duration_minutes),
    transition_minutes: s.transition_minutes != null ? String(s.transition_minutes) : "",
    min_scheduling_notice_hours: String(s.min_scheduling_notice_hours),
    max_advance_days: s.max_advance_days != null ? String(s.max_advance_days) : "",
    extra_duration_per_unit_minutes: s.extra_duration_per_unit_minutes != null ? String(s.extra_duration_per_unit_minutes) : "",
    volume_pricing: (s.volume_pricing || []).map((t) => ({ min_qty: String(t.min_qty), price_cents: String(t.price_cents / 100) })),
    required_employees: String(s.required_employees || 1),
    secondary_commission_yrittaja_cents: String((s.secondary_commission_yrittaja_cents || 0) / 100),
    secondary_commission_alihankkija_cents: String((s.secondary_commission_alihankkija_cents || 0) / 100),
    chatbot_enabled: s.chatbot_enabled ?? false,
  };
}

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

/* ─── Admin-only: palkallinen internal cost defaults ─────────────────────── */
function PalkallinenCostSection({ serviceId, requiredEmployees }: { serviceId?: string; requiredEmployees: number }) {
  const { data: defaults } = usePalkallinenDefaults();
  const invalidate = useInvalidatePalkallinenCosts();
  const toast = useToast();

  const row = (defaults || []).find((d: PalkallinenInternalCost) => d.service_id === serviceId);

  async function persist(primaryCents: number, secondaryCents: number) {
    if (!serviceId) return;
    try {
      await savePalkallinenInternalCost(
        { kind: "service", service_id: serviceId },
        null,
        primaryCents,
        secondaryCents,
      );
      invalidate();
    } catch {
      toast("Sisäisen kulun tallennus epäonnistui", "error");
    }
  }

  async function handleBlur(which: "primary" | "secondary", raw: string) {
    const cents = raw.trim() ? Math.round(parseFloat(raw) * 100) : 0;
    const currentPrimary = row?.internal_cost_cents ?? 0;
    const currentSecondary = row?.secondary_internal_cost_cents ?? 0;
    if (which === "primary") {
      if (cents === currentPrimary) return;
      await persist(cents, currentSecondary);
    } else {
      if (cents === currentSecondary) return;
      await persist(currentPrimary, cents);
    }
  }

  if (!serviceId) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-hover/40 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-3.5 h-3.5 text-text-muted" />
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Sisäinen kulu (vain ylläpito)</p>
        </div>
        <p className="text-xs text-text-muted">Tallenna palvelu ensin, niin voit asettaa palkallisten sisäisen kulun.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-hover/40 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Lock className="w-3.5 h-3.5 text-text-muted" />
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Sisäinen kulu palkalliselle (vain ylläpito)</p>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Mitä toinen yhtiö laskuttaa Lasikiiltoilta per keikka, kun keikan tekee palkallinen asentaja. Ei näy asentajalle.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Sisäinen kulu (€)</label>
          <input
            key={`primary-${row?.internal_cost_cents ?? 0}`}
            type="number"
            min={0}
            step={0.01}
            defaultValue={row ? String(row.internal_cost_cents / 100) : ""}
            onBlur={(e) => handleBlur("primary", e.target.value)}
            className={inputCls}
          />
        </div>
        {requiredEmployees > 1 && (
          <div>
            <label className={labelCls}>2. asentaja: sisäinen kulu (€)</label>
            <input
              key={`secondary-${row?.secondary_internal_cost_cents ?? 0}`}
              type="number"
              min={0}
              step={0.01}
              defaultValue={row ? String(row.secondary_internal_cost_cents / 100) : ""}
              onBlur={(e) => handleBlur("secondary", e.target.value)}
              className={inputCls}
            />
          </div>
        )}
      </div>
    </div>
  );
}


function ServiceFormFields({ form, setForm, error, settings, categories, onSubmit, onCancel, submitLabel, isPending, serviceId, requiredEmployees }: {
  form: ServiceForm;
  setForm: (f: ServiceForm) => void;
  error: string;
  settings: { default_transition_minutes: number } | undefined;
  categories: { id: string; name: string }[] | undefined;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  isPending: boolean;
  serviceId?: string;
  requiredEmployees: number;
}) {
  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-2xl border border-border p-6 mb-6 space-y-5">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Palvelun nimi *</label>
          <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Kategoria</label>
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={inputCls}>
            <option value="">Muu</option>
            {(categories || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Kuvaus</label>
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-3">Hinnoittelu</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Perushinta (€) *</label>
            <input type="number" required min={0} step={0.01} value={form.base_price_cents} onChange={(e) => setForm({ ...form, base_price_cents: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Materiaalikustannus (€)</label>
            <input type="number" min={0} step={0.01} value={form.material_cost_cents} onChange={(e) => setForm({ ...form, material_cost_cents: e.target.value })} className={inputCls} />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-3">Provisiot</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Yrittäjä-provisio (€)</label>
            <input type="number" min={0} step={0.01} value={form.commission_yrittaja_cents} onChange={(e) => setForm({ ...form, commission_yrittaja_cents: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Alihankkija-provisio (€)</label>
            <input type="number" min={0} step={0.01} value={form.commission_alihankkija_cents} onChange={(e) => setForm({ ...form, commission_alihankkija_cents: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Myyntiprovisio (€)</label>
            <input type="number" min={0} step={0.01} value={form.sales_commission_cents} onChange={(e) => setForm({ ...form, sales_commission_cents: e.target.value })} className={inputCls} />
          </div>
        </div>
        <p className="text-xs text-text-muted mt-2">Palkallisille asentajille ei käytetä palvelukohtaista provisiota, vaan heille määritellään kuukausipalkka.</p>
        {parseInt(form.required_employees, 10) > 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <label className={labelCls}>2. asentaja: Yrittäjä-provisio (€)</label>
              <input type="number" min={0} step={0.01} value={form.secondary_commission_yrittaja_cents} onChange={(e) => setForm({ ...form, secondary_commission_yrittaja_cents: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>2. asentaja: Alihankkija-provisio (€)</label>
              <input type="number" min={0} step={0.01} value={form.secondary_commission_alihankkija_cents} onChange={(e) => setForm({ ...form, secondary_commission_alihankkija_cents: e.target.value })} className={inputCls} />
            </div>
          </div>
        )}
      </div>

      <PalkallinenCostSection serviceId={serviceId} requiredEmployees={requiredEmployees} />

      <div>
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-3">Ajoitus</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Kesto (min) *</label>
            <input type="number" required min={15} step={15} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Siirtymäaika (min)</label>
            <input type="number" min={0} step={5} value={form.transition_minutes} onChange={(e) => setForm({ ...form, transition_minutes: e.target.value })}
              placeholder={settings ? `Oletus: ${settings.default_transition_minutes} min` : ""}
              className={inputCls} />
            <p className="text-xs text-text-muted mt-1">Tyhjä = yrityksen oletus{settings ? ` (${settings.default_transition_minutes} min)` : ""}</p>
          </div>
          <div>
            <label className={labelCls}>Min. varoaika (h) *</label>
            <input type="number" required min={0} step={1} value={form.min_scheduling_notice_hours} onChange={(e) => setForm({ ...form, min_scheduling_notice_hours: e.target.value })} className={inputCls} />
            <p className="text-xs text-text-muted mt-1">Kuinka monta tuntia etukäteen varaus on tehtävä</p>
          </div>
          <div>
            <label className={labelCls}>Max. varaus etukäteen (pv)</label>
            <input type="number" min={1} step={1} value={form.max_advance_days} onChange={(e) => setForm({ ...form, max_advance_days: e.target.value })}
              placeholder="Tyhjä = ei rajaa"
              className={inputCls} />
            <p className="text-xs text-text-muted mt-1">Kuinka monta päivää etukäteen varauksen voi tehdä sivuilta</p>
          </div>
          <div>
            <label className={labelCls}>Asentajia per keikka</label>
            <input type="number" min={1} max={5} step={1} value={form.required_employees} onChange={(e) => setForm({ ...form, required_employees: e.target.value })} className={inputCls} />
            <p className="text-xs text-text-muted mt-1">Kuinka monta asentajaa tarvitaan</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-3">Paljoushinnoittelu</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
          <div>
            <label className={labelCls}>Lisäaika / lisälaite (min)</label>
            <input type="number" min={0} step={5} value={form.extra_duration_per_unit_minutes} onChange={(e) => setForm({ ...form, extra_duration_per_unit_minutes: e.target.value })}
              placeholder="Tyhjä = täysi kesto per laite"
              className={inputCls} />
            <p className="text-xs text-text-muted mt-1">Esim. 60 = 1. laite 90 min, 2. laite +60 min</p>
          </div>
        </div>
        <p className="text-xs text-text-muted mb-2">Yksikköhinta eri määrille. Perushinta käytetään kun määrä on alle pienimmän tason.</p>
        <div className="space-y-2">
          {form.volume_pricing.map((tier, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1">
                <input type="number" min={2} step={1} value={tier.min_qty} onChange={(e) => {
                  const tiers = [...form.volume_pricing];
                  tiers[i] = { ...tiers[i], min_qty: e.target.value };
                  setForm({ ...form, volume_pricing: tiers });
                }} className={inputCls} placeholder="Vähintään kpl" />
              </div>
              <div className="flex-1">
                <input type="number" min={0} step={0.01} value={tier.price_cents} onChange={(e) => {
                  const tiers = [...form.volume_pricing];
                  tiers[i] = { ...tiers[i], price_cents: e.target.value };
                  setForm({ ...form, volume_pricing: tiers });
                }} className={inputCls} placeholder="Yksikköhinta (€)" />
              </div>
              <button type="button" onClick={() => {
                const tiers = form.volume_pricing.filter((_, j) => j !== i);
                setForm({ ...form, volume_pricing: tiers });
              }} className="p-2 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, volume_pricing: [...form.volume_pricing, { min_qty: "", price_cents: "" }] })}
            className="inline-flex items-center gap-1.5 text-sm text-accent font-medium hover:text-accent-dark transition-colors">
            <Plus className="w-4 h-4" /> Lisää hintataso
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6">
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
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.chatbot_enabled} onChange={(e) => setForm({ ...form, chatbot_enabled: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
          <MessageCircle className="w-4 h-4 text-blue-400" />
          <span className="text-sm text-text-secondary">Chatbot</span>
        </label>
      </div>
    </form>
  );
}

/* ─── Variant-level internal cost ─── */
function VariantInternalCostRow({ variantId }: { variantId: string }) {
  const { data: defaults } = usePalkallinenDefaults();
  const invalidate = useInvalidatePalkallinenCosts();
  const toast = useToast();
  const row = (defaults || []).find((d: PalkallinenInternalCost) => d.service_variant_id === variantId);

  async function handleBlur(which: "primary" | "secondary", raw: string) {
    const cents = raw.trim() ? Math.round(parseFloat(raw) * 100) : 0;
    const currentPrimary = row?.internal_cost_cents ?? 0;
    const currentSecondary = row?.secondary_internal_cost_cents ?? 0;
    const next = which === "primary" ? [cents, currentSecondary] : [currentPrimary, cents];
    if (next[0] === currentPrimary && next[1] === currentSecondary) return;
    try {
      await savePalkallinenInternalCost(
        { kind: "variant", service_variant_id: variantId },
        null,
        next[0],
        next[1],
      );
      invalidate();
    } catch {
      toast("Sisäisen kulun tallennus epäonnistui", "error");
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-hover/30 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Lock className="w-3 h-3 text-text-muted" />
        <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Sisäinen kulu palkalliselle (vain ylläpito)</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-text-muted mb-1 block">Kulu (€)</label>
          <input
            key={`v-primary-${row?.internal_cost_cents ?? 0}`}
            type="number"
            min={0}
            step={0.01}
            defaultValue={row ? String(row.internal_cost_cents / 100) : ""}
            placeholder="Palvelun oletus"
            onBlur={(e) => handleBlur("primary", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-muted mb-1 block">2. as. kulu (€)</label>
          <input
            key={`v-secondary-${row?.secondary_internal_cost_cents ?? 0}`}
            type="number"
            min={0}
            step={0.01}
            defaultValue={row ? String(row.secondary_internal_cost_cents / 100) : ""}
            placeholder="Palvelun oletus"
            onBlur={(e) => handleBlur("secondary", e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Variant Section ─── */
type VariantForm = {
  label: string;
  price_cents: string;
  duration_minutes: string;
  material_cost_cents: string;
  sort_order: string;
  commission_yrittaja_cents: string;
  commission_alihankkija_cents: string;
  secondary_commission_yrittaja_cents: string;
  secondary_commission_alihankkija_cents: string;
};

const emptyVariantForm: VariantForm = { label: "", price_cents: "", duration_minutes: "120", material_cost_cents: "0", sort_order: "0", commission_yrittaja_cents: "", commission_alihankkija_cents: "", secondary_commission_yrittaja_cents: "", secondary_commission_alihankkija_cents: "" };

function VariantSection({ serviceId }: { serviceId: string }) {
  const toast = useToast();
  const { data: variants, isLoading, isError } = useServiceVariants(serviceId);
  const createVariant = useCreateServiceVariant();
  const updateVariant = useUpdateServiceVariant();
  const deleteVariant = useDeleteServiceVariant();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VariantForm>(emptyVariantForm);

  function startEdit(v: ServiceVariant) {
    setEditingId(v.id);
    setForm({
      label: v.label,
      price_cents: String(v.price_cents / 100),
      duration_minutes: String(v.duration_minutes),
      material_cost_cents: String(v.material_cost_cents / 100),
      sort_order: String(v.sort_order),
      commission_yrittaja_cents: v.commission_yrittaja_cents != null ? String(v.commission_yrittaja_cents / 100) : "",
      commission_alihankkija_cents: v.commission_alihankkija_cents != null ? String(v.commission_alihankkija_cents / 100) : "",
      secondary_commission_yrittaja_cents: v.secondary_commission_yrittaja_cents != null ? String(v.secondary_commission_yrittaja_cents / 100) : "",
      secondary_commission_alihankkija_cents: v.secondary_commission_alihankkija_cents != null ? String(v.secondary_commission_alihankkija_cents / 100) : "",
    });
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyVariantForm);
  }

  async function handleSave() {
    const data = {
      service_id: serviceId,
      label: form.label,
      price_cents: Math.round(parseFloat(form.price_cents || "0") * 100),
      duration_minutes: parseInt(form.duration_minutes, 10) || 120,
      material_cost_cents: Math.round(parseFloat(form.material_cost_cents || "0") * 100),
      sort_order: parseInt(form.sort_order, 10) || 0,
      commission_yrittaja_cents: form.commission_yrittaja_cents ? Math.round(parseFloat(form.commission_yrittaja_cents) * 100) : null,
      commission_alihankkija_cents: form.commission_alihankkija_cents ? Math.round(parseFloat(form.commission_alihankkija_cents) * 100) : null,
      secondary_commission_yrittaja_cents: form.secondary_commission_yrittaja_cents ? Math.round(parseFloat(form.secondary_commission_yrittaja_cents) * 100) : null,
      secondary_commission_alihankkija_cents: form.secondary_commission_alihankkija_cents ? Math.round(parseFloat(form.secondary_commission_alihankkija_cents) * 100) : null,
      active: true,
      metadata: {},
    };
    try {
      if (editingId) {
        await updateVariant.mutateAsync({ id: editingId, ...data });
        toast("Variantti päivitetty", "success");
      } else {
        await createVariant.mutateAsync(data as any);
        toast("Variantti luotu", "success");
      }
      cancelEdit();
    } catch {
      toast("Tallennus epäonnistui", "error");
    }
  }

  const [expanded, setExpanded] = useState(false);
  const activeVariants = (variants || []).filter((v) => v.active);

  // Don't show anything while loading or if table doesn't exist yet
  if (isLoading || isError) return null;
  // Don't show section at all if no variants and collapsed
  if (activeVariants.length === 0 && !expanded && !showForm) return null;

  return (
    <div className="border-t border-border px-6 pb-3 pt-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wide hover:text-text-secondary transition-colors"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Variantit ({activeVariants.length})
        </button>
        {expanded && (
          <button onClick={() => { setEditingId(null); setForm(emptyVariantForm); setShowForm(true); setExpanded(true); }}
            className="inline-flex items-center gap-1 text-xs text-accent font-medium hover:text-accent-dark">
            <Plus className="w-3 h-3" /> Lisää
          </button>
        )}
      </div>

      {!expanded ? null : <div className="mt-3">

      {(showForm || editingId) && (
        <div className="bg-surface-hover rounded-xl p-4 mb-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-muted mb-1 block">Nimi *</label>
              <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                className={inputCls} placeholder="Esim. Painovoimainen — alle 80 m²" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Hinta (€) *</label>
              <input type="number" min={0} step={0.01} value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: e.target.value })}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Kesto (min) *</label>
              <input type="number" min={15} step={15} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Materiaalit (€)</label>
              <input type="number" min={0} step={0.01} value={form.material_cost_cents} onChange={(e) => setForm({ ...form, material_cost_cents: e.target.value })}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Järjestys</label>
              <input type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Yrittäjä (€)</label>
              <input type="number" min={0} step={0.01} value={form.commission_yrittaja_cents} onChange={(e) => setForm({ ...form, commission_yrittaja_cents: e.target.value })}
                placeholder="Palvelun oletus" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Alihankkija (€)</label>
              <input type="number" min={0} step={0.01} value={form.commission_alihankkija_cents} onChange={(e) => setForm({ ...form, commission_alihankkija_cents: e.target.value })}
                placeholder="Palvelun oletus" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">2. as. yrittäjä (€)</label>
              <input type="number" min={0} step={0.01} value={form.secondary_commission_yrittaja_cents} onChange={(e) => setForm({ ...form, secondary_commission_yrittaja_cents: e.target.value })}
                placeholder="Palvelun oletus" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">2. as. alihankkija (€)</label>
              <input type="number" min={0} step={0.01} value={form.secondary_commission_alihankkija_cents} onChange={(e) => setForm({ ...form, secondary_commission_alihankkija_cents: e.target.value })}
                placeholder="Palvelun oletus" className={inputCls} />
            </div>
          </div>
          <p className="text-[10px] text-text-muted">Tyhjä = käytetään palvelun oletusprovisiota</p>
          {editingId && <VariantInternalCostRow variantId={editingId} />}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.label || !form.price_cents || createVariant.isPending || updateVariant.isPending}
              className="px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
              {editingId ? "Tallenna" : "Luo"}
            </button>
            <button onClick={cancelEdit} className="px-4 py-2 border border-border rounded-lg text-xs font-medium text-text-secondary hover:bg-surface-hover">
              Peruuta
            </button>
          </div>
        </div>
      )}

      {activeVariants.length > 0 && (
        <div className="space-y-1">
          {activeVariants.map((v) => (
            <div key={v.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-hover text-sm gap-1 sm:gap-3">
              <div className="min-w-0">
                <span className="font-medium text-text-primary">{v.label}</span>
                <span className="text-text-muted sm:ml-3 block sm:inline text-xs sm:text-sm">{formatCents(v.price_cents)} · {v.duration_minutes} min{v.commission_yrittaja_cents != null ? ` · yr ${formatCents(v.commission_yrittaja_cents)}` : ""}{v.commission_alihankkija_cents != null ? ` · ah ${formatCents(v.commission_alihankkija_cents)}` : ""}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => startEdit(v)} className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { deleteVariant.mutate(v.id); toast("Variantti poistettu", "success"); }}
                  className="p-1.5 rounded text-text-muted hover:text-red-500 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>}
    </div>
  );
}

function ServiceCard({ s, editingId, form, setForm, error, settings, categories, onUpdate, onCancelEdit, isPending, onStartEdit, onToggleActive, onDelete }: {
  s: Service;
  editingId: string | null;
  form: ServiceForm;
  setForm: (f: ServiceForm) => void;
  error: string;
  settings: { default_transition_minutes: number } | undefined;
  categories: { id: string; name: string }[] | undefined;
  onUpdate: (e: React.FormEvent) => void;
  onCancelEdit: () => void;
  isPending: boolean;
  onStartEdit: (s: Service) => void;
  onToggleActive: (s: Service) => void;
  onDelete: () => void;
}) {
  if (editingId === s.id) {
    return (
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <ServiceFormFields
          form={form} setForm={setForm} error={error} settings={settings} categories={categories}
          onSubmit={onUpdate} onCancel={onCancelEdit}
          submitLabel="Tallenna" isPending={isPending}
          serviceId={s.id}
          requiredEmployees={s.required_employees || 1}
        />
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-accent-dark" />
        </div>
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-sm text-text-primary">{s.name}</span>
          {!s.active && (
            <Badge className="bg-gray-100 text-gray-500 border border-gray-200">Pois käytöstä</Badge>
          )}
          <span className="text-xs text-text-secondary">{formatCents(s.base_price_cents)}</span>
          <span className="text-xs text-text-muted">{s.duration_minutes} min</span>
          {s.required_employees > 1 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-text-muted" title={`${s.required_employees} asentajaa`}>
              <Users className="w-3 h-3" />{s.required_employees}
            </span>
          )}
          {s.chatbot_enabled && (
            <MessageCircle className="w-3.5 h-3.5 text-blue-400" />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onToggleActive(s)}
            className={`p-1.5 rounded-lg transition-colors ${s.active ? "text-accent-dark hover:text-red-500 hover:bg-red-50" : "text-text-muted hover:text-accent-dark hover:bg-accent-muted"}`}
            title={s.active ? "Poista käytöstä" : "Ota käyttöön"}>
            {s.active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => onStartEdit(s)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Poista pysyvästi">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <VariantSection serviceId={s.id} />
    </div>
  );
}

export default function Services() {
  const { data: services, isLoading } = useServices();
  const { data: categories } = useServiceCategories();
  const { data: settings } = useCompanySettings();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  const toast = useToast();
  const confirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [error, setError] = useState("");

  function startEdit(s: Service) {
    setEditingId(s.id);
    setForm(toForm(s));
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  }

  function formToData(f: ServiceForm) {
    const volumeTiers: VolumePricingTier[] = f.volume_pricing
      .filter((t) => t.min_qty && t.price_cents)
      .map((t) => ({ min_qty: parseInt(t.min_qty, 10), price_cents: Math.round(parseFloat(t.price_cents) * 100) }))
      .sort((a, b) => a.min_qty - b.min_qty);
    return {
      name: f.name,
      description: f.description || null,
      category_id: f.category_id || null,
      base_price_cents: Math.round(parseFloat(f.base_price_cents || "0") * 100),
      material_cost_cents: Math.round(parseFloat(f.material_cost_cents || "0") * 100),
      commission_yrittaja_cents: Math.round(parseFloat(f.commission_yrittaja_cents || "0") * 100),
      commission_alihankkija_cents: Math.round(parseFloat(f.commission_alihankkija_cents || "0") * 100),
      sales_commission_cents: Math.round(parseFloat(f.sales_commission_cents || "0") * 100),
      duration_minutes: parseInt(f.duration_minutes, 10),
      transition_minutes: f.transition_minutes ? parseInt(f.transition_minutes, 10) : null,
      min_scheduling_notice_hours: parseInt(f.min_scheduling_notice_hours, 10) || 18,
      max_advance_days: f.max_advance_days ? parseInt(f.max_advance_days, 10) : null,
      extra_duration_per_unit_minutes: f.extra_duration_per_unit_minutes ? parseInt(f.extra_duration_per_unit_minutes, 10) : null,
      volume_pricing: volumeTiers,
      required_employees: parseInt(f.required_employees, 10) || 1,
      secondary_commission_yrittaja_cents: Math.round(parseFloat(f.secondary_commission_yrittaja_cents || "0") * 100),
      secondary_commission_alihankkija_cents: Math.round(parseFloat(f.secondary_commission_alihankkija_cents || "0") * 100),
      chatbot_enabled: f.chatbot_enabled,
      active: true,
    };
  }

  async function handleCreate(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    try {
      await createService.mutateAsync({ ...formToData(form), review_sms_template: null });
      setShowForm(false);
      setForm(emptyForm);
      toast("Palvelu luotu", "success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Luonti epäonnistui");
    }
  }

  async function handleUpdate(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editingId) return;
    setError("");
    try {
      await updateService.mutateAsync({ id: editingId, ...formToData(form) });
      cancelEdit();
      toast("Palvelu päivitetty", "success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Päivitys epäonnistui");
    }
  }

  async function toggleActive(s: Service) {
    await updateService.mutateAsync({ id: s.id, active: !s.active });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Palvelut</h1>
        </div>
        <button onClick={() => { setEditingId(null); setForm(emptyForm); setError(""); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap">
          <Plus className="w-4 h-4" /> Lisää palvelu
        </button>
      </div>

      {showForm && (
        <ServiceFormFields
          form={form} setForm={setForm} error={error} settings={settings} categories={categories}
          onSubmit={handleCreate} onCancel={cancelEdit}
          submitLabel="Luo palvelu" isPending={createService.isPending}
          serviceId={undefined}
          requiredEmployees={parseInt(form.required_employees, 10) || 1}
        />
      )}

      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">Ladataan...</div>
        ) : !services || services.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">Ei palveluita</div>
        ) : (
          <>
          {/* Grouped by category */}
          {(categories || []).map((cat) => {
            const catServices = services.filter((s) => s.category_id === cat.id);
            if (catServices.length === 0) return null;
            return (
              <div key={cat.id} className="mb-6">
                <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide mb-3">{cat.name}</h2>
                <div className="space-y-2">
                  {catServices.map((s) => (
                    <ServiceCard key={s.id} s={s} editingId={editingId} form={form} setForm={setForm} error={error}
                      settings={settings} categories={categories} onUpdate={handleUpdate} onCancelEdit={cancelEdit}
                      isPending={updateService.isPending} onStartEdit={startEdit} onToggleActive={toggleActive}
                      onDelete={async () => {
                        if (await confirm({ message: `Poistetaanko palvelu "${s.name}" pysyvästi?`, confirmLabel: "Poista", variant: "danger" })) {
                          await deleteService.mutateAsync(s.id);
                          toast("Palvelu poistettu", "success");
                        }
                      }} />
                  ))}
                </div>
              </div>
            );
          })}
          {/* Uncategorized */}
          {(() => {
            const uncategorized = services.filter((s) => !s.category_id);
            if (uncategorized.length === 0) return null;
            return (
              <div className="mb-6">
                <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide mb-3">Muut</h2>
                <div className="space-y-2">
                  {uncategorized.map((s) => (
                    <ServiceCard key={s.id} s={s} editingId={editingId} form={form} setForm={setForm} error={error}
                      settings={settings} categories={categories} onUpdate={handleUpdate} onCancelEdit={cancelEdit}
                      isPending={updateService.isPending} onStartEdit={startEdit} onToggleActive={toggleActive}
                      onDelete={async () => {
                        if (await confirm({ message: `Poistetaanko palvelu "${s.name}" pysyvästi?`, confirmLabel: "Poista", variant: "danger" })) {
                          await deleteService.mutateAsync(s.id);
                          toast("Palvelu poistettu", "success");
                        }
                      }} />
                  ))}
                </div>
              </div>
            );
          })()}
          </>
        )}
      </div>
    </div>
  );
}
