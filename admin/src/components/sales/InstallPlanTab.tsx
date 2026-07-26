import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Edit2, FileText, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { getStorageFileUrl } from "@/lib/storage";
import { formatAddress } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { InstallPlanPdf } from "@/components/sales/InstallPlanPdf";
import { regenerateInstallPlanPdf } from "@/lib/regenerateInstallPlan";
import { getPlanText, getPresetDefault, INSTALL_PLAN_OPTIONS, type InstallPlanField } from "@/lib/installPlanText";
import type { SalesOpportunity, SalesOpportunityFile, InstallPlanData } from "@/lib/sales-types";

const DEFAULT_PLAN: InstallPlanData = {
  lapivienti: "sisayksikon_taakse",
  teline: "seinateline",
  sahko: "pistotulppa",
  kondenssi: "maahan",
  huomiot: "",
};

const LAPIVIENTI_LABELS: Record<InstallPlanData["lapivienti"], string> = {
  sisayksikon_taakse: "Sisäyksikön taakse",
  asennuskotelolla: "Asennuskotelolla",
};
const TELINE_LABELS: Record<InstallPlanData["teline"], string> = {
  seinateline: "Seinäteline",
  parvekkeen_lattia: "Parvekkeen lattialle",
  maateline: "Maateline",
};
const SAHKO_LABELS: Record<InstallPlanData["sahko"], string> = {
  kiintea: "Kiinteä kytkentä",
  pistotulppa: "Pistotulppa",
};
const KONDENSSI_LABELS: Record<InstallPlanData["kondenssi"], string> = {
  maahan: "Maahan",
  sadevesikaivoon: "Sadevesikaivoon",
  parveke: "Parvekkeen sadevesijärjestelmään",
  parveke_astia: "Erillinen astia parvekkeella",
};

interface Props {
  opportunity: SalesOpportunity;
  files: SalesOpportunityFile[];
}

export function InstallPlanTab({ opportunity, files }: Props) {
  const qc = useQueryClient();
  const toast = useToast();

  const opportunityId = opportunity.id;
  const savedPlan = opportunity.install_plan;

  const planFile = useMemo(
    () => files.find((f) => f.file_type === "installation_plan_pdf") ?? null,
    [files],
  );

  const downloadPlanPdf = async () => {
    if (!planFile) return;
    const url = await getStorageFileUrl(planFile.bucket, planFile.path, {
      downloadFilename: planFile.filename,
    });
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState<InstallPlanData>(savedPlan ?? DEFAULT_PLAN);
  const [saving, setSaving] = useState(false);

  const customerName = opportunity.name?.trim() || "";
  const customerAddress = formatAddress(opportunity.address, opportunity.postcode, opportunity.city);

  const previewPlan: InstallPlanData = editing ? plan : (savedPlan ?? DEFAULT_PLAN);
  const previewDate = opportunity.created_at || new Date().toISOString();
  const PREVIEW_ID = "install-plan-regen-preview";

  const startEdit = () => {
    setPlan(savedPlan ?? DEFAULT_PLAN);
    setEditing(true);
  };

  const cancelEdit = () => {
    setPlan(savedPlan ?? DEFAULT_PLAN);
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error: updErr } = await supabase
        .from("sales_opportunities")
        .update({ install_plan: plan, updated_at: new Date().toISOString() })
        .eq("id", opportunityId);
      if (updErr) throw new Error(`Liidin päivitys epäonnistui: ${updErr.message}`);

      // Wait one tick so the hidden preview re-renders with the saved plan
      await new Promise((r) => setTimeout(r, 50));

      await regenerateInstallPlanPdf({
        opportunityId,
        offerId: null,
        customerName,
        existingFile: planFile ? { id: planFile.id, path: planFile.path } : null,
        previewElementId: PREVIEW_ID,
      });

      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.detail(opportunityId) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.files(opportunityId) });
      toast.success("Asennussuunnitelma päivitetty");
      setEditing(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tuntematon virhe";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!editing ? (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-text-primary">Asennussuunnitelma</h3>
              <p className="text-xs text-text-muted mt-0.5">
                {customerName || "Asiakas"}
                {customerAddress && ` · ${customerAddress}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {planFile && (
                <button
                  type="button"
                  onClick={downloadPlanPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/40 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Lataa PDF
                </button>
              )}
              <button
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                {savedPlan ? "Muokkaa" : "Luo asennussuunnitelma"}
              </button>
            </div>
          </div>

          {savedPlan ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <ReadOnlyField
                label="Läpivienti"
                preset={LAPIVIENTI_LABELS[savedPlan.lapivienti]}
                text={getPlanText(savedPlan, "lapivienti")}
              />
              <ReadOnlyField
                label="Ulkoyksikön teline"
                preset={TELINE_LABELS[savedPlan.teline]}
                text={getPlanText(savedPlan, "teline")}
              />
              <ReadOnlyField
                label="Sähkökytkentä"
                preset={SAHKO_LABELS[savedPlan.sahko]}
                text={getPlanText(savedPlan, "sahko")}
              />
              <ReadOnlyField
                label="Kondenssivesi"
                preset={KONDENSSI_LABELS[savedPlan.kondenssi]}
                text={getPlanText(savedPlan, "kondenssi")}
              />
              {savedPlan.huomiot?.trim() && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                    Lisätiedot
                  </dt>
                  <dd className="text-text-primary whitespace-pre-line">
                    {savedPlan.huomiot}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-text-muted">
              Tälle liidille ei ole vielä luotu asennussuunnitelmaa. Voit tehdä sen jo ennen tarjousta — kun teet myöhemmin tarjouksen, suunnitelma liitetään siihen automaattisesti.
            </p>
          )}
        </div>
      ) : (
        <Editor
          plan={plan}
          onChange={setPlan}
          onCancel={cancelEdit}
          onSave={save}
          saving={saving}
        />
      )}

      {/* Hidden render target for PDF generation. innerHTML of this div is sent to Chromium. */}
      <div
        id={PREVIEW_ID}
        style={{ position: "absolute", left: "-9999px", top: 0, width: "794px", background: "white" }}
        aria-hidden
      >
        <InstallPlanPdf
          installPlan={previewPlan}
          customerName={customerName}
          customerAddress={customerAddress}
          date={previewDate}
        />
      </div>
    </div>
  );
}

function ReadOnlyField({ label, preset, text }: { label: string; preset: string; text: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-text-primary font-medium">{preset}</dd>
      <dd className="text-text-muted text-xs mt-0.5 whitespace-pre-line">{text}</dd>
    </div>
  );
}

function Editor({
  plan,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  plan: InstallPlanData;
  onChange: (p: InstallPlanData) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const labelCls = "block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2";

  const Group = <K extends InstallPlanField>({
    field,
    label,
    options,
    cols = "grid-cols-1 sm:grid-cols-2",
  }: {
    field: K;
    label: string;
    options: readonly { value: InstallPlanData[K]; label: string; desc: string }[];
    cols?: string;
  }) => {
    const textKey = `${field}_text` as `${K}_text`;
    const currentPreset = plan[field] as string;
    const presetDefault = getPresetDefault(field, currentPreset);
    const override = plan[textKey] as string | undefined;
    const currentText = override && override.trim() ? override : presetDefault;
    const isCustomized = !!override && override.trim() !== "" && override.trim() !== presetDefault.trim();

    const handlePresetChange = (value: InstallPlanData[K]) => {
      // Preserve the user's custom override (if any) when switching presets.
      // If no override, the textarea will simply show the new preset's default.
      onChange({ ...plan, [field]: value } as InstallPlanData);
    };

    const handleTextChange = (text: string) => {
      onChange({ ...plan, [textKey]: text } as InstallPlanData);
    };

    const resetText = () => {
      const next = { ...plan } as InstallPlanData;
      delete (next as unknown as Record<string, unknown>)[textKey];
      onChange(next);
    };

    return (
      <div>
        <label className={labelCls}>{label}</label>
        <div className={`grid ${cols} gap-2`}>
          {options.map((opt) => {
            const selected = plan[field] === opt.value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => handlePresetChange(opt.value)}
                className={`border rounded-xl p-3 text-left transition-colors ${selected ? "border-accent bg-accent/5" : "border-border hover:border-border/80"}`}
              >
                <p className="text-sm font-semibold text-text-primary">{opt.label}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-muted">Teksti PDF:lle (muokattavissa)</span>
            {isCustomized && (
              <button
                type="button"
                onClick={resetText}
                className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Palauta oletus
              </button>
            )}
          </div>
          <textarea
            value={currentText}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={3}
            className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:border-accent ${isCustomized ? "border-accent/40 bg-accent/5" : "border-border"}`}
            placeholder={presetDefault}
          />
          <p className="text-[10px] text-text-muted mt-1">
            Jokainen rivi tulee PDF:lle omana rankuksenaan.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-accent" />
        <h3 className="font-semibold text-text-primary">Muokkaa asennussuunnitelmaa</h3>
      </div>

      <Group
        field="lapivienti"
        label="Läpivienti"
        options={INSTALL_PLAN_OPTIONS.lapivienti as readonly { value: InstallPlanData["lapivienti"]; label: string; desc: string }[]}
      />

      <Group
        field="teline"
        label="Ulkoyksikön teline"
        cols="grid-cols-1 sm:grid-cols-3"
        options={INSTALL_PLAN_OPTIONS.teline as readonly { value: InstallPlanData["teline"]; label: string; desc: string }[]}
      />

      <Group
        field="sahko"
        label="Sähkökytkentä"
        options={INSTALL_PLAN_OPTIONS.sahko as readonly { value: InstallPlanData["sahko"]; label: string; desc: string }[]}
      />

      <Group
        field="kondenssi"
        label="Kondenssivesi"
        options={INSTALL_PLAN_OPTIONS.kondenssi as readonly { value: InstallPlanData["kondenssi"]; label: string; desc: string }[]}
      />

      <div>
        <label className={labelCls}>Lisätiedot / kohdekohtaiset huomiot</label>
        <textarea
          value={plan.huomiot ?? ""}
          onChange={(e) => onChange({ ...plan, huomiot: e.target.value })}
          placeholder="Esim. Ulkoyksikkö kiinnitetään sokkeliin, ei seinään. Taloyhtiön lupa hankittu."
          rows={4}
          className="w-full border border-border rounded-xl p-3 text-sm focus:outline-none focus:border-accent"
        />
        <p className="text-[10px] text-text-muted mt-1">
          Jokainen rivi tulee PDF:lle omana rankuksenaan "Lisätiedot"-osioon.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-muted/40 disabled:opacity-50"
        >
          Peruuta
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Tallenna ja luo PDF
        </button>
      </div>
    </div>
  );
}
