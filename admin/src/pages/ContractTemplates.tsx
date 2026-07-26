import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Check, Eye, X } from "lucide-react";
import {
  useContractTemplates,
  useCreateContractTemplate,
  useUpdateContractTemplate,
} from "@/hooks/useContracts";
import { useServices } from "@/hooks/useServices";
import { Badge } from "@/components/ui/badge";
import {
  formatCents,
  FREQUENCY_LABELS,
  MONTH_LABELS_FI,
} from "@/lib/utils";
import { inputCls } from "@/lib/constants";
import type { ContractFrequency } from "@/lib/types";

interface VolumeStepForm {
  min_qty: string;
  contract_price: string;
  regular_price: string;
}

interface TierForm {
  months: string;
  contract_price: string;
  regular_price: string;
  volume_pricing: VolumeStepForm[];
}

interface TemplateForm {
  name: string;
  slug: string;
  description: string;
  frequency: ContractFrequency;
  visit_months: number[];
  visit_interval_months: string;
  billing_interval_months: string;
  service_id: string;
  tiers: TierForm[];
  auto_renew: boolean;
  terms_text: string;
  cancellation_notice_days: string;
  sales_commission_cents: string;
}

const emptyForm: TemplateForm = {
  name: "",
  slug: "",
  description: "",
  frequency: "custom",
  visit_months: [],
  visit_interval_months: "12",
  billing_interval_months: "12",
  service_id: "",
  tiers: [{ months: "12", contract_price: "", regular_price: "", volume_pricing: [] }],
  auto_renew: true,
  terms_text: "",
  cancellation_notice_days: "30",
  sales_commission_cents: "",
};

export default function ContractTemplates() {
  const { data: templates, isLoading } = useContractTemplates();
  const { data: services } = useServices();
  const createTemplate = useCreateContractTemplate();
  const updateTemplate = useUpdateContractTemplate();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [form, setForm] = useState<TemplateForm>(emptyForm);

  const activeServices = (services || []).filter((s) => s.active);

  function handleEdit(t: any) {
    setEditingId(t.id);
    type RawTier = {
      months: number;
      contract_price_cents: number;
      regular_price_cents: number;
      volume_pricing?: { min_qty: number; contract_price_cents: number; regular_price_cents: number }[];
    };
    const rawTiers: RawTier[] = Array.isArray(t.duration_tiers) && t.duration_tiers.length > 0
      ? (t.duration_tiers as RawTier[])
      : [{
          months: t.duration_months as number,
          contract_price_cents: t.contract_price_cents as number,
          regular_price_cents: t.regular_price_cents as number,
        }];
    setForm({
      name: t.name,
      slug: t.slug,
      description: t.description || "",
      frequency: t.frequency,
      visit_months: t.visit_months,
      service_id: t.service_id,
      tiers: rawTiers.map((tier) => ({
        months: String(tier.months),
        contract_price: String((tier.contract_price_cents ?? 0) / 100),
        regular_price: String((tier.regular_price_cents ?? 0) / 100),
        volume_pricing: (tier.volume_pricing || []).map((step) => ({
          min_qty: String(step.min_qty),
          contract_price: String((step.contract_price_cents ?? 0) / 100),
          regular_price: String((step.regular_price_cents ?? 0) / 100),
        })),
      })),
      auto_renew: t.auto_renew,
      terms_text: t.terms_text || "",
      cancellation_notice_days: String(t.cancellation_notice_days),
      sales_commission_cents: t.sales_commission_cents ? String(t.sales_commission_cents / 100) : "",
      visit_interval_months: String(t.visit_interval_months || 12),
      billing_interval_months: String(t.billing_interval_months || 12),
    });
    setShowForm(true);
  }

  function updateTier(index: number, patch: Partial<TierForm>) {
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    }));
  }

  function addTier() {
    setForm((prev) => ({
      ...prev,
      tiers: [...prev.tiers, { months: "", contract_price: "", regular_price: "", volume_pricing: [] }],
    }));
  }

  function removeTier(index: number) {
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.length > 1 ? prev.tiers.filter((_, i) => i !== index) : prev.tiers,
    }));
  }

  function updateVolumeStep(tierIdx: number, stepIdx: number, patch: Partial<VolumeStepForm>) {
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) =>
        i === tierIdx
          ? { ...tier, volume_pricing: tier.volume_pricing.map((step, j) => (j === stepIdx ? { ...step, ...patch } : step)) }
          : tier,
      ),
    }));
  }

  function addVolumeStep(tierIdx: number) {
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) =>
        i === tierIdx
          ? { ...tier, volume_pricing: [...tier.volume_pricing, { min_qty: "2", contract_price: "", regular_price: "" }] }
          : tier,
      ),
    }));
  }

  function removeVolumeStep(tierIdx: number, stepIdx: number) {
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) =>
        i === tierIdx
          ? { ...tier, volume_pricing: tier.volume_pricing.filter((_, j) => j !== stepIdx) }
          : tier,
      ),
    }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function toggleMonth(month: number) {
    setForm((prev) => ({
      ...prev,
      visit_months: prev.visit_months.includes(month)
        ? prev.visit_months.filter((m) => m !== month)
        : [...prev.visit_months, month].sort((a, b) => a - b),
    }));
  }

  async function handleSubmit() {
    const parsedTiers = form.tiers
      .map((tier) => {
        const volumeSteps = tier.volume_pricing
          .map((step) => ({
            min_qty: parseInt(step.min_qty),
            contract_price_cents: Math.round(parseFloat(step.contract_price) * 100),
            regular_price_cents: Math.round(parseFloat(step.regular_price) * 100),
          }))
          .filter((step) =>
            Number.isFinite(step.min_qty) && step.min_qty >= 2 &&
            Number.isFinite(step.contract_price_cents) &&
            Number.isFinite(step.regular_price_cents),
          )
          .sort((a, b) => a.min_qty - b.min_qty);
        return {
          months: parseInt(tier.months),
          contract_price_cents: Math.round(parseFloat(tier.contract_price) * 100),
          regular_price_cents: Math.round(parseFloat(tier.regular_price) * 100),
          ...(volumeSteps.length > 0 ? { volume_pricing: volumeSteps } : {}),
        };
      })
      .filter((tier) =>
        Number.isFinite(tier.months) && tier.months > 0 &&
        Number.isFinite(tier.contract_price_cents) &&
        Number.isFinite(tier.regular_price_cents),
      )
      .sort((a, b) => a.months - b.months);

    if (parsedTiers.length === 0) return;

    const defaultTier = parsedTiers[0];

    const payload = {
      name: form.name,
      slug: form.slug,
      description: form.description || null,
      frequency: form.frequency,
      visit_months: form.visit_months,
      service_id: form.service_id,
      duration_tiers: parsedTiers,
      contract_price_cents: defaultTier.contract_price_cents,
      regular_price_cents: defaultTier.regular_price_cents,
      duration_months: defaultTier.months,
      auto_renew: form.auto_renew,
      terms_text: form.terms_text,
      cancellation_notice_days: parseInt(form.cancellation_notice_days),
      sales_commission_cents: form.sales_commission_cents ? Math.round(parseFloat(form.sales_commission_cents) * 100) : 0,
      visit_interval_months: parseInt(form.visit_interval_months) || 12,
      billing_interval_months: parseInt(form.billing_interval_months) || 12,
    };

    if (editingId) {
      await updateTemplate.mutateAsync({ id: editingId, ...payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }
    handleCancel();
  }

  return (
    <div>
      <Link
        to="/sopimukset"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Takaisin sopimuksiin
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Sopimusmallit</h1>
        {!showForm && (
          <button
            onClick={handleNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors"
          >
            <Plus className="w-4 h-4" />
            Uusi malli
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-surface rounded-2xl border border-border p-6 mb-6">
          <h2 className="font-semibold text-text-primary mb-4">
            {editingId ? "Muokkaa mallia" : "Uusi sopimusmalli"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Nimi</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Huolenpitosopimus" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Slug</label>
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={inputCls} placeholder="annual-autumn" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Kuvaus</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Palvelu</label>
              <select
                value={form.service_id}
                onChange={(e) => setForm({ ...form, service_id: e.target.value })}
                className={inputCls}
              >
                <option value="">Valitse...</option>
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Tiheys</label>
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as ContractFrequency })}
                className={inputCls}
              >
                <option value="once_yearly">{FREQUENCY_LABELS.once_yearly}</option>
                <option value="twice_yearly">{FREQUENCY_LABELS.twice_yearly}</option>
                <option value="custom">{FREQUENCY_LABELS.custom}</option>
              </select>
            </div>
          </div>

          {/* Month selection */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Käyntikuukaudet</label>
            <div className="flex flex-wrap gap-2">
              {MONTH_LABELS_FI.map((label, i) => {
                const month = i + 1;
                const selected = form.visit_months.includes(month);
                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() => toggleMonth(month)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selected
                        ? "bg-accent text-white"
                        : "bg-surface-hover text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration tiers */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Sopimuskaudet ja hinnat
            </label>
            <p className="text-xs text-text-muted mb-3">
              Ensimmäinen rivi on oletuskausi. Lyhin kausi näkyy ensimmäisenä myyntinäkymässä.
            </p>
            <div className="space-y-4">
              {form.tiers.map((tier, i) => (
                <div key={i} className="border border-border rounded-xl p-3 bg-surface-hover/40">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[100px]">
                      <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
                        Kausi (kk)
                      </label>
                      <input
                        type="number"
                        value={tier.months}
                        onChange={(e) => updateTier(i, { months: e.target.value })}
                        className={inputCls}
                        placeholder="24"
                      />
                    </div>
                    <div className="flex-1 min-w-[130px]">
                      <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
                        Sopimushinta (€/laite)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={tier.contract_price}
                        onChange={(e) => updateTier(i, { contract_price: e.target.value })}
                        className={inputCls}
                        placeholder="240"
                      />
                    </div>
                    <div className="flex-1 min-w-[130px]">
                      <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
                        Normaalihinta (€/laite)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={tier.regular_price}
                        onChange={(e) => updateTier(i, { regular_price: e.target.value })}
                        className={inputCls}
                        placeholder="280"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTier(i)}
                      disabled={form.tiers.length === 1}
                      className="p-2 rounded-lg text-text-muted hover:text-red-500 hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Poista kausi"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Volume pricing rows for this tier */}
                  <div className="mt-3 pl-3 border-l-2 border-border">
                    <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-2">
                      Volyymialennukset (per laite, alkaen kpl)
                    </p>
                    {tier.volume_pricing.length === 0 ? (
                      <p className="text-xs text-text-muted mb-2">Ei volyymialennusta — kaikilla laitemäärillä sama yksikköhinta.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {tier.volume_pricing.map((step, j) => (
                          <div key={j} className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-text-muted">≥</span>
                            <input
                              type="number"
                              min={2}
                              value={step.min_qty}
                              onChange={(e) => updateVolumeStep(i, j, { min_qty: e.target.value })}
                              className={`${inputCls} max-w-[70px]`}
                              placeholder="2"
                            />
                            <span className="text-xs text-text-muted">kpl:</span>
                            <input
                              type="number"
                              step="0.01"
                              value={step.contract_price}
                              onChange={(e) => updateVolumeStep(i, j, { contract_price: e.target.value })}
                              className={`${inputCls} flex-1 min-w-[100px]`}
                              placeholder="Sopimus € / laite"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={step.regular_price}
                              onChange={(e) => updateVolumeStep(i, j, { regular_price: e.target.value })}
                              className={`${inputCls} flex-1 min-w-[100px]`}
                              placeholder="Norm. € / laite"
                            />
                            <button
                              type="button"
                              onClick={() => removeVolumeStep(i, j)}
                              className="p-1.5 rounded text-text-muted hover:text-red-500 hover:bg-surface transition-colors"
                              title="Poista porras"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => addVolumeStep(i)}
                      className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-dark transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Lisää volyymiporras
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addTier}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-dark transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Lisää kausi
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Käyntiväli (kk)</label>
              <input type="number" value={form.visit_interval_months} onChange={(e) => setForm({ ...form, visit_interval_months: e.target.value })} className={inputCls} placeholder="12" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Laskutusväli (kk)</label>
              <input type="number" value={form.billing_interval_months} onChange={(e) => setForm({ ...form, billing_interval_months: e.target.value })} className={inputCls} placeholder="12" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Irtisanomisaika (pv)</label>
              <input type="number" value={form.cancellation_notice_days} onChange={(e) => setForm({ ...form, cancellation_notice_days: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Myyntiprovisio (€)</label>
              <input type="number" step="0.01" value={form.sales_commission_cents} onChange={(e) => setForm({ ...form, sales_commission_cents: e.target.value })} className={inputCls} placeholder="0" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Sopimusehdot</label>
            <textarea
              value={form.terms_text}
              onChange={(e) => setForm({ ...form, terms_text: e.target.value })}
              rows={6}
              className={`${inputCls} resize-none`}
              placeholder="Sopimuksen ehdot..."
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Peruuta
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                createTemplate.isPending ||
                updateTemplate.isPending ||
                !form.name ||
                !form.slug ||
                !form.service_id ||
                !form.tiers.some((t) => t.months && t.contract_price && t.regular_price)
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {editingId ? "Tallenna" : "Luo malli"}
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-surface rounded-2xl" />
          ))}
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center">
          <p className="text-text-muted">Ei sopimusmalleja vielä</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const tiers = (Array.isArray(t.duration_tiers) && t.duration_tiers.length > 0)
              ? t.duration_tiers
              : [{
                  months: t.duration_months,
                  contract_price_cents: t.contract_price_cents,
                  regular_price_cents: t.regular_price_cents,
                }];
            const defaultTier = tiers[0];
            const savings = (defaultTier.regular_price_cents || 0) - (defaultTier.contract_price_cents || 0);
            const monthsLabel = (m: number) =>
              m % 12 === 0 ? `${m / 12} v` : `${m} kk`;
            return (
              <div
                key={t.id}
                className={`bg-surface rounded-2xl border p-5 ${
                  t.active ? "border-border" : "border-border opacity-60"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-text-primary">{t.name}</h3>
                      {!t.active && (
                        <Badge className="bg-gray-50 text-gray-500 border border-gray-200">Piilotettu</Badge>
                      )}
                    </div>
                    <p className="text-sm text-text-muted">
                      {t.visit_interval_months ? (t.visit_interval_months >= 12 ? (t.visit_interval_months === 12 ? "Kerran vuodessa" : `${t.visit_interval_months / 12} vuoden välein`) : `${t.visit_interval_months} kk välein`) : FREQUENCY_LABELS[t.frequency]} · {t.services?.name || "–"}
                    </p>
                    {tiers.length > 1 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tiers.map((tier, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-hover text-[11px] text-text-secondary"
                          >
                            <strong className="text-text-primary">{monthsLabel(tier.months)}</strong>
                            {formatCents(tier.contract_price_cents)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-text-primary">{formatCents(defaultTier.contract_price_cents)}</p>
                      {savings > 0 && (
                        <p className="text-xs text-accent-dark">Säästö {formatCents(savings)}</p>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        if (previewUrl) { setPreviewUrl(null); return; }
                        setPreviewLoading(true);
                        try {
                          const { previewContractPdf } = await import("@/lib/chromiumPdf");
                          const url = await previewContractPdf(
                            { ...t, services: t.services, service_name: t.services?.name },
                            { first_name: "Matti", last_name: "Meikäläinen", email: "matti@esimerkki.fi", phone: "040 123 4567", address: "Esimerkkikatu 1", postal_code: "00100" },
                            { address: "Esimerkkikatu 1", postal_code: "00100" },
                            null,
                          );
                          setPreviewUrl(url);
                        } finally {
                          setPreviewLoading(false);
                        }
                      }}
                      disabled={previewLoading}
                      className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-surface-hover transition-colors disabled:opacity-50"
                      title="Esikatsele PDF"
                    >
                      {previewLoading ? <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEdit(t)}
                      className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline PDF preview */}
      {previewUrl && (
        <div className="mt-6 bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-text-primary">PDF Esikatselu</p>
            <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="text-xs text-text-muted hover:text-text-primary">Sulje</button>
          </div>
          <iframe src={previewUrl} className="w-full border-0" style={{ height: 700 }} />
        </div>
      )}
    </div>
  );
}
