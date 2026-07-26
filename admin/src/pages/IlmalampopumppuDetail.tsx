import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Trash2,
  ExternalLink,
  Snowflake,
  ChevronDown,
  Loader2,
} from "lucide-react";
import {
  useHeatPump,
  useCreateHeatPump,
  useUpdateHeatPump,
  useDeleteHeatPump,
} from "@/hooks/useHeatPumps";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { inputCls, selectCls } from "@/lib/constants";
import type { HeatPump, HeatPumpCurationStatus, HeatPumpInput } from "@/lib/types";

// ─── Form state — all values as strings (binds to inputs cleanly) ─────────────
type FormState = {
  // Visibility / curation
  visible: boolean;
  display_order: string;
  curation_status: HeatPumpCurationStatus;
  notes: string;

  // Identification
  brand: string;
  series: string;
  marketing_name: string;
  search_aliases: string;       // textarea, one per line
  model_identifier: string;
  model_indoor: string;
  model_outdoor: string;
  eprel_registration_number: string;
  eprel_url: string;
  fiche_pdf_url: string;
  thumbnail_url: string;
  market_since_date: string;

  // Sound (4 fiche fields)
  sound_indoor_cooling_db: string;
  sound_indoor_heating_db: string;
  sound_outdoor_cooling_db: string;
  sound_outdoor_heating_db: string;

  // Refrigerant
  refrigerant: string;
  refrigerant_gwp: string;

  // Cooling
  seer: string;
  energy_class_cooling: string;
  annual_electricity_cooling_kwh: string;
  pdesignc_kw: string;

  // Heating per zone
  scop_average: string;
  scop_warm: string;
  scop_cold: string;
  energy_class_heating_average: string;
  energy_class_heating_warm: string;
  energy_class_heating_cold: string;
  annual_electricity_heating_average_kwh: string;
  annual_electricity_heating_warm_kwh: string;
  annual_electricity_heating_cold_kwh: string;
  pdesignh_average_kw: string;
  pdesignh_warm_kw: string;
  pdesignh_cold_kw: string;
  pdh_average_kw: string;
  pdh_warm_kw: string;
  pdh_cold_kw: string;
  elbu_average_kw: string;
  elbu_warm_kw: string;
  elbu_cold_kw: string;

  // Lasikiilto editorial
  our_price_eur: string;
  our_product_url: string;
  highlight_text: string;
};

const EMPTY_FORM: FormState = {
  visible: false,
  display_order: "0",
  curation_status: "draft",
  notes: "",

  brand: "",
  series: "",
  marketing_name: "",
  search_aliases: "",
  model_identifier: "",
  model_indoor: "",
  model_outdoor: "",
  eprel_registration_number: "",
  eprel_url: "",
  fiche_pdf_url: "",
  thumbnail_url: "",
  market_since_date: "",

  sound_indoor_cooling_db: "",
  sound_indoor_heating_db: "",
  sound_outdoor_cooling_db: "",
  sound_outdoor_heating_db: "",

  refrigerant: "",
  refrigerant_gwp: "",

  seer: "",
  energy_class_cooling: "",
  annual_electricity_cooling_kwh: "",
  pdesignc_kw: "",

  scop_average: "",
  scop_warm: "",
  scop_cold: "",
  energy_class_heating_average: "",
  energy_class_heating_warm: "",
  energy_class_heating_cold: "",
  annual_electricity_heating_average_kwh: "",
  annual_electricity_heating_warm_kwh: "",
  annual_electricity_heating_cold_kwh: "",
  pdesignh_average_kw: "",
  pdesignh_warm_kw: "",
  pdesignh_cold_kw: "",
  pdh_average_kw: "",
  pdh_warm_kw: "",
  pdh_cold_kw: "",
  elbu_average_kw: "",
  elbu_warm_kw: "",
  elbu_cold_kw: "",

  our_price_eur: "",
  our_product_url: "",
  highlight_text: "",
};

function pumpToForm(p: HeatPump): FormState {
  const s = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  return {
    visible: p.visible,
    display_order: s(p.display_order),
    curation_status: p.curation_status,
    notes: p.notes || "",

    brand: p.brand || "",
    series: p.series || "",
    marketing_name: p.marketing_name || "",
    search_aliases: (p.search_aliases || []).join("\n"),
    model_identifier: p.model_identifier || "",
    model_indoor: p.model_indoor || "",
    model_outdoor: p.model_outdoor || "",
    eprel_registration_number: p.eprel_registration_number || "",
    eprel_url: p.eprel_url || "",
    fiche_pdf_url: p.fiche_pdf_url || "",
    thumbnail_url: p.thumbnail_url || "",
    market_since_date: p.market_since_date || "",

    sound_indoor_cooling_db: s(p.sound_indoor_cooling_db),
    sound_indoor_heating_db: s(p.sound_indoor_heating_db),
    sound_outdoor_cooling_db: s(p.sound_outdoor_cooling_db),
    sound_outdoor_heating_db: s(p.sound_outdoor_heating_db),

    refrigerant: p.refrigerant || "",
    refrigerant_gwp: s(p.refrigerant_gwp),

    seer: s(p.seer),
    energy_class_cooling: p.energy_class_cooling || "",
    annual_electricity_cooling_kwh: s(p.annual_electricity_cooling_kwh),
    pdesignc_kw: s(p.pdesignc_kw),

    scop_average: s(p.scop_average),
    scop_warm: s(p.scop_warm),
    scop_cold: s(p.scop_cold),
    energy_class_heating_average: p.energy_class_heating_average || "",
    energy_class_heating_warm: p.energy_class_heating_warm || "",
    energy_class_heating_cold: p.energy_class_heating_cold || "",
    annual_electricity_heating_average_kwh: s(p.annual_electricity_heating_average_kwh),
    annual_electricity_heating_warm_kwh: s(p.annual_electricity_heating_warm_kwh),
    annual_electricity_heating_cold_kwh: s(p.annual_electricity_heating_cold_kwh),
    pdesignh_average_kw: s(p.pdesignh_average_kw),
    pdesignh_warm_kw: s(p.pdesignh_warm_kw),
    pdesignh_cold_kw: s(p.pdesignh_cold_kw),
    pdh_average_kw: s(p.pdh_average_kw),
    pdh_warm_kw: s(p.pdh_warm_kw),
    pdh_cold_kw: s(p.pdh_cold_kw),
    elbu_average_kw: s(p.elbu_average_kw),
    elbu_warm_kw: s(p.elbu_warm_kw),
    elbu_cold_kw: s(p.elbu_cold_kw),

    our_price_eur: s(p.our_price_eur),
    our_product_url: p.our_product_url || "",
    highlight_text: p.highlight_text || "",
  };
}

function formToPayload(f: FormState): HeatPumpInput {
  const num = (v: string): number | null => {
    if (!v.trim()) return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const int = (v: string): number | null => {
    const n = num(v);
    return n == null ? null : Math.round(n);
  };
  const str = (v: string): string | null => {
    const t = v.trim();
    return t === "" ? null : t;
  };

  return {
    visible: f.visible,
    display_order: int(f.display_order) ?? 0,
    curation_status: f.curation_status,
    notes: str(f.notes),

    brand: f.brand.trim(),
    series: str(f.series),
    marketing_name: f.marketing_name.trim(),
    search_aliases: f.search_aliases
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    model_identifier: str(f.model_identifier),
    model_indoor: str(f.model_indoor),
    model_outdoor: str(f.model_outdoor),
    eprel_registration_number: str(f.eprel_registration_number),
    eprel_url: str(f.eprel_url),
    fiche_pdf_url: str(f.fiche_pdf_url),
    thumbnail_url: str(f.thumbnail_url),
    market_since_date: str(f.market_since_date),

    sound_indoor_cooling_db: num(f.sound_indoor_cooling_db),
    sound_indoor_heating_db: num(f.sound_indoor_heating_db),
    sound_outdoor_cooling_db: num(f.sound_outdoor_cooling_db),
    sound_outdoor_heating_db: num(f.sound_outdoor_heating_db),

    refrigerant: str(f.refrigerant),
    refrigerant_gwp: int(f.refrigerant_gwp),

    seer: num(f.seer),
    energy_class_cooling: str(f.energy_class_cooling),
    annual_electricity_cooling_kwh: int(f.annual_electricity_cooling_kwh),
    pdesignc_kw: num(f.pdesignc_kw),

    scop_average: num(f.scop_average),
    scop_warm: num(f.scop_warm),
    scop_cold: num(f.scop_cold),
    energy_class_heating_average: str(f.energy_class_heating_average),
    energy_class_heating_warm: str(f.energy_class_heating_warm),
    energy_class_heating_cold: str(f.energy_class_heating_cold),
    annual_electricity_heating_average_kwh: int(f.annual_electricity_heating_average_kwh),
    annual_electricity_heating_warm_kwh: int(f.annual_electricity_heating_warm_kwh),
    annual_electricity_heating_cold_kwh: int(f.annual_electricity_heating_cold_kwh),
    pdesignh_average_kw: num(f.pdesignh_average_kw),
    pdesignh_warm_kw: num(f.pdesignh_warm_kw),
    pdesignh_cold_kw: num(f.pdesignh_cold_kw),
    pdh_average_kw: num(f.pdh_average_kw),
    pdh_warm_kw: num(f.pdh_warm_kw),
    pdh_cold_kw: num(f.pdh_cold_kw),
    elbu_average_kw: num(f.elbu_average_kw),
    elbu_warm_kw: num(f.elbu_warm_kw),
    elbu_cold_kw: num(f.elbu_cold_kw),

    our_price_eur: int(f.our_price_eur),
    our_product_url: str(f.our_product_url),
    highlight_text: str(f.highlight_text),
  };
}

const labelCls = "block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1.5";

// ─── Field components ────────────────────────────────────────────────────────
function NumField({
  label,
  hint,
  unit,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} {unit && <span className="text-text-muted normal-case font-normal">({unit})</span>}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className={inputCls}
      />
    </label>
  );
}

function TextField({
  label,
  hint,
  required,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  hint?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date";
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className={inputCls}
        required={required}
      />
    </label>
  );
}

function Section({
  title,
  hint,
  children,
  defaultOpen = true,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-surface border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface-hover transition-colors"
      >
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {hint && <p className="text-[11px] text-text-muted mt-0.5">{hint}</p>}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-text-muted transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-border">{children}</div>}
    </section>
  );
}

// Heating-zone row: 2 NumField inputs (average / cold) — warm zone is intentionally
// omitted from the UI since Finnish buyers care only about Helsinki-cold-zone
// figures. The DB still keeps warm-zone columns in case the admin later wants
// to expose them.
function ZoneRow({
  label,
  unit,
  hint,
  avg,
  cold,
  onChangeAvg,
  onChangeCold,
}: {
  label: string;
  unit?: string;
  hint?: string;
  avg: string;
  cold: string;
  onChangeAvg: (v: string) => void;
  onChangeCold: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-3 items-end">
      <div className="col-span-12 sm:col-span-4 flex flex-col justify-end">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {(unit || hint) && (
          <span className="text-[11px] text-text-muted">
            {unit && <>({unit})</>}
            {hint && <> {hint}</>}
          </span>
        )}
      </div>
      <div className="col-span-6 sm:col-span-4">
        <NumField label="Keskim. (A)" value={avg} onChange={onChangeAvg} />
      </div>
      <div className="col-span-6 sm:col-span-4">
        <NumField label="Kylmä (C) — Suomi" value={cold} onChange={onChangeCold} />
      </div>
    </div>
  );
}

function ZoneRowText({
  label,
  hint,
  avg,
  cold,
  onChangeAvg,
  onChangeCold,
}: {
  label: string;
  hint?: string;
  avg: string;
  cold: string;
  onChangeAvg: (v: string) => void;
  onChangeCold: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-3 items-end">
      <div className="col-span-12 sm:col-span-4 flex flex-col justify-end">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
      </div>
      <div className="col-span-6 sm:col-span-4">
        <TextField label="Keskim. (A)" value={avg} onChange={onChangeAvg} hint="A+++" />
      </div>
      <div className="col-span-6 sm:col-span-4">
        <TextField label="Kylmä (C) — Suomi" value={cold} onChange={onChangeCold} hint="A+" />
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function IlmalampopumppuDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === "uusi";

  const { data: pump, isLoading } = useHeatPump(isNew ? undefined : id);
  const create = useCreateHeatPump();
  const update = useUpdateHeatPump();
  const remove = useDeleteHeatPump();
  const toast = useToast();
  const confirm = useConfirm();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_FORM);
      setLoaded(true);
    } else if (pump) {
      setForm(pumpToForm(pump));
      setLoaded(true);
    }
  }, [isNew, pump]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleRegNumberChange = (value: string) => {
    const cleaned = value.trim();
    set("eprel_registration_number", cleaned);
    if (cleaned && /^\d+$/.test(cleaned)) {
      if (!form.eprel_url) {
        set("eprel_url", `https://eprel.ec.europa.eu/screen/product/airconditioners/${cleaned}`);
      }
      if (!form.fiche_pdf_url) {
        set("fiche_pdf_url", `https://eprel.ec.europa.eu/fiches/airconditioners/Fiche_${cleaned}_FI.pdf`);
      }
    }
  };

  const handleEprelUrlChange = (value: string) => {
    set("eprel_url", value);
    const m = value.match(/\/(\d{5,9})(?:\/?|$)/);
    if (m && !form.eprel_registration_number) {
      set("eprel_registration_number", m[1]);
    }
  };

  const headerTitle = useMemo(() => {
    if (isNew) return "Uusi pumppu";
    if (!pump) return "Ladataan…";
    return `${pump.brand} ${pump.marketing_name}`;
  }, [isNew, pump]);

  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault();
    const payload = formToPayload(form);
    if (!payload.brand || !payload.marketing_name) {
      toast.error("Brändi ja markkinointinimi ovat pakollisia");
      return;
    }
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);
        toast.success("Pumppu lisätty");
        navigate(`/ilmalampopumput/${created.id}`, { replace: true });
      } else if (id) {
        await update.mutateAsync({ id, ...payload });
        toast.success("Tallennettu");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tallennus epäonnistui");
    }
  }

  async function handleDelete() {
    if (!id || isNew) return;
    const ok = await confirm({
      title: "Poistetaanko pumppu?",
      message: `Poistetaanko "${form.brand} ${form.marketing_name}" pysyvästi? Tätä ei voi peruuttaa.`,
      confirmLabel: "Poista",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(id);
      toast.success("Pumppu poistettu");
      navigate("/ilmalampopumput");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Poisto epäonnistui");
    }
  }

  if (isLoading || !loaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  const saving = create.isPending || update.isPending;

  return (
    <form onSubmit={handleSave} className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link
          to="/ilmalampopumput"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Snowflake className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary truncate">{headerTitle}</h1>
      </div>
      <p className="text-xs text-text-muted ml-10 mb-6">
        Kentät seuraavat suoraan EPREL Tuoteseloste -dokumentin (EU 626/2011) rakennetta. Älä lisää valmistajien
        esiteistä tulevia lukuja — vain fichessä esiintyvä data.
      </p>

      <div className="space-y-4">
        {/* ── Tunnistus ─────────────────────────────────────────────────── */}
        <Section title="Tunnistus" hint="Tavarantoimittaja, mallitunnisteet, EPREL-linkit" defaultOpen>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <TextField
              label="Tavarantoimittaja"
              required
              value={form.brand}
              onChange={(v) => set("brand", v)}
              hint="esim. Daikin, Mitsubishi Electric, Panasonic"
            />
            <TextField
              label="Sarja (oma luokittelu)"
              value={form.series}
              onChange={(v) => set("series", v)}
              hint="esim. Perfera N, Arctic — UI-grouppausta varten"
            />
            <div className="sm:col-span-2">
              <TextField
                label="Markkinointinimi"
                required
                value={form.marketing_name}
                onChange={(v) => set("marketing_name", v)}
                hint="Sivulla näytettävä nimi, esim. Toshiba Arctic White 25"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block">
                <span className={labelCls}>Muut myyntinimet (alias-haku)</span>
                <textarea
                  value={form.search_aliases}
                  onChange={(e) => set("search_aliases", e.target.value)}
                  rows={3}
                  className={inputCls}
                  placeholder={"yksi nimi per rivi, esim.\nToshiba Arctic Wood 25\nToshiba Polar Black 25"}
                />
                <span className="text-[11px] text-text-muted mt-1 block">
                  Jos sama tekninen rekisteröinti myydään useilla kosmeettisilla nimillä, lisää ne
                  tähän — vertailun haku löytää tämän rivin myös niillä nimillä, ja ne näytetään
                  detail-paneelissa &quot;Myydään myös nimillä&quot;.
                </span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <TextField
                label="Mallitunniste (combined)"
                value={form.model_identifier}
                onChange={(v) => set("model_identifier", v)}
                hint="fiche-kenttä, esim. RAS-25S4AVPG-ND + RAS-25S4KVPG-ND"
              />
            </div>
            <TextField
              label="Sisäyksikön mallitunniste"
              value={form.model_indoor}
              onChange={(v) => set("model_indoor", v)}
              hint="fichestä"
            />
            <TextField
              label="Ulkoyksikön mallitunniste"
              value={form.model_outdoor}
              onChange={(v) => set("model_outdoor", v)}
              hint="fichestä"
            />
            <TextField
              label="EPREL-rekisterinumero"
              value={form.eprel_registration_number}
              onChange={handleRegNumberChange}
              hint="esim. 2038486 — täyttää URL:t automaattisesti"
            />
            <TextField
              label="Markkinoille tulopäivä"
              type="date"
              value={form.market_since_date}
              onChange={(v) => set("market_since_date", v)}
              hint="fiche: Malli unionin markkinoilla alkaen"
            />
            <div className="flex gap-2 items-end sm:col-span-2">
              <div className="flex-1">
                <TextField
                  label="EPREL-tuotesivun URL"
                  value={form.eprel_url}
                  onChange={handleEprelUrlChange}
                  hint="https://eprel.ec.europa.eu/screen/product/airconditioners/…"
                />
              </div>
              {form.eprel_url && (
                <a
                  href={form.eprel_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-2.5 border border-border rounded-xl text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                  title="Avaa EPREL-sivu uudessa välilehdessä"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Avaa
                </a>
              )}
            </div>
            <div className="flex gap-2 items-end sm:col-span-2">
              <div className="flex-1">
                <TextField
                  label="Tuoteseloste (PDF)"
                  value={form.fiche_pdf_url}
                  onChange={(v) => set("fiche_pdf_url", v)}
                  hint="Suora linkki fichen PDF-tiedostoon"
                />
              </div>
              {form.fiche_pdf_url && (
                <a
                  href={form.fiche_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-2.5 border border-border rounded-xl text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Avaa
                </a>
              )}
            </div>
            <div className="sm:col-span-2">
              <TextField
                label="Tuotekuva (URL)"
                value={form.thumbnail_url}
                onChange={(v) => set("thumbnail_url", v)}
                hint="Valinnainen — ei fichen kenttä, käytetään listaussivulla"
              />
            </div>
          </div>
        </Section>

        {/* ── Äänitaso ─────────────────────────────────────────────────────── */}
        <Section title="Äänitaso (LWA)" hint="Fichen 4 äänitehoarvoa">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <NumField
              label="Sisällä, jäähdytys"
              unit="dB"
              value={form.sound_indoor_cooling_db}
              onChange={(v) => set("sound_indoor_cooling_db", v)}
            />
            <NumField
              label="Sisällä, lämmitys"
              unit="dB"
              value={form.sound_indoor_heating_db}
              onChange={(v) => set("sound_indoor_heating_db", v)}
            />
            <NumField
              label="Ulkona, jäähdytys"
              unit="dB"
              value={form.sound_outdoor_cooling_db}
              onChange={(v) => set("sound_outdoor_cooling_db", v)}
            />
            <NumField
              label="Ulkona, lämmitys"
              unit="dB"
              value={form.sound_outdoor_heating_db}
              onChange={(v) => set("sound_outdoor_heating_db", v)}
            />
          </div>
        </Section>

        {/* ── Kylmäaine ────────────────────────────────────────────────────── */}
        <Section title="Kylmäaine">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <TextField
              label="Kylmäaineen nimi"
              value={form.refrigerant}
              onChange={(v) => set("refrigerant", v)}
              hint="esim. R32, R290"
            />
            <NumField
              label="GWP-arvo"
              hint="Global Warming Potential"
              value={form.refrigerant_gwp}
              onChange={(v) => set("refrigerant_gwp", v)}
            />
          </div>
        </Section>

        {/* ── Jäähdytys ────────────────────────────────────────────────────── */}
        <Section title="Jäähdytystila" hint="SEER, energialuokka, vuotuinen sähkönkulutus, mitoituskuorma">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <NumField
              label="SEER"
              hint="Vuotuinen kylmäkerroin"
              value={form.seer}
              onChange={(v) => set("seer", v)}
            />
            <TextField
              label="Energialuokka"
              value={form.energy_class_cooling}
              onChange={(v) => set("energy_class_cooling", v)}
              hint="A+++"
            />
            <NumField
              label="Vuotuinen sähkönkulutus"
              unit="kWh/v"
              value={form.annual_electricity_cooling_kwh}
              onChange={(v) => set("annual_electricity_cooling_kwh", v)}
            />
            <NumField
              label="Mitoituskuorma (Pdesignc)"
              unit="kW"
              value={form.pdesignc_kw}
              onChange={(v) => set("pdesignc_kw", v)}
            />
          </div>
        </Section>

        {/* ── Lämmitys per ilmastovyöhyke ──────────────────────────────────── */}
        <Section
          title="Lämmitystila — ilmastovyöhykkeittäin"
          hint="Keskim. (Strasbourg) ja Kylmä (Helsinki, Suomi). Lämmin vyöhyke (Ateena) ei näy julkisessa vertailussa — Suomessa irrelevantti."
          defaultOpen
        >
          <div className="space-y-4 mt-4">
            <ZoneRow
              label="SCOP"
              hint="Lämmityskauden lämpökerroin"
              avg={form.scop_average}
              cold={form.scop_cold}
              onChangeAvg={(v) => set("scop_average", v)}
              onChangeCold={(v) => set("scop_cold", v)}
            />
            <ZoneRowText
              label="Energialuokka"
              avg={form.energy_class_heating_average}
              cold={form.energy_class_heating_cold}
              onChangeAvg={(v) => set("energy_class_heating_average", v)}
              onChangeCold={(v) => set("energy_class_heating_cold", v)}
            />
            <ZoneRow
              label="Vuotuinen sähkönkulutus"
              unit="kWh/v"
              avg={form.annual_electricity_heating_average_kwh}
              cold={form.annual_electricity_heating_cold_kwh}
              onChangeAvg={(v) => set("annual_electricity_heating_average_kwh", v)}
              onChangeCold={(v) => set("annual_electricity_heating_cold_kwh", v)}
            />
            <ZoneRow
              label="Mitoituskuorma"
              unit="kW"
              hint="Pdesignh"
              avg={form.pdesignh_average_kw}
              cold={form.pdesignh_cold_kw}
              onChangeAvg={(v) => set("pdesignh_average_kw", v)}
              onChangeCold={(v) => set("pdesignh_cold_kw", v)}
            />
            <ZoneRow
              label="Ilmoitettu teho"
              unit="kW"
              hint="Pdh — pumpun oma teho mitoituspisteessä"
              avg={form.pdh_average_kw}
              cold={form.pdh_cold_kw}
              onChangeAvg={(v) => set("pdh_average_kw", v)}
              onChangeCold={(v) => set("pdh_cold_kw", v)}
            />
            <ZoneRow
              label="Varalämmitysteho"
              unit="kW"
              hint="elbu — sähkövastuksen lisäteho jonka EU-malli olettaa"
              avg={form.elbu_average_kw}
              cold={form.elbu_cold_kw}
              onChangeAvg={(v) => set("elbu_average_kw", v)}
              onChangeCold={(v) => set("elbu_cold_kw", v)}
            />
          </div>
        </Section>

        {/* ── Lasikiilto-konteksti ────────────────────────────────────────── */}
        <Section title="Lasikiilto-tiedot" hint="Editorial/myyntitiedot — ei fichen dataa">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <NumField
              label="Hinta-arvio"
              unit="€"
              hint="Asennettuna, ilman senttejä"
              value={form.our_price_eur}
              onChange={(v) => set("our_price_eur", v)}
            />
            <div className="sm:col-span-2">
              <TextField
                label="Oma tuotesivu (URL)"
                value={form.our_product_url}
                onChange={(v) => set("our_product_url", v)}
                hint="https://lasikiilto.fi/…"
              />
            </div>
            <div className="sm:col-span-3">
              <TextField
                label="Korostusteksti"
                value={form.highlight_text}
                onChange={(v) => set("highlight_text", v)}
                hint="esim. Suosituin valinta, Premium, Paras hinta-laatusuhde"
              />
            </div>
          </div>
        </Section>

        {/* ── Asetukset ─────────────────────────────────────────────────── */}
        <Section title="Asetukset" hint="Näkyvyys, tila, järjestys, sisäiset muistiinpanot">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <label className="block">
              <span className={labelCls}>Tila</span>
              <select
                value={form.curation_status}
                onChange={(e) => set("curation_status", e.target.value as HeatPumpCurationStatus)}
                className={selectCls}
              >
                <option value="draft">Luonnos</option>
                <option value="verified">Vahvistettu</option>
                <option value="archived">Arkistoitu</option>
              </select>
            </label>
            <NumField
              label="Järjestys"
              hint="Pienempi = ylempänä listalla"
              value={form.display_order}
              onChange={(v) => set("display_order", v)}
            />
            <label className="flex items-center gap-2 mt-7">
              <input
                type="checkbox"
                checked={form.visible}
                onChange={(e) => set("visible", e.target.checked)}
                className="w-4 h-4 rounded border-border accent-accent"
              />
              <span className="text-sm text-text-primary">Näkyy julkisessa vertailussa</span>
            </label>
            <div className="sm:col-span-3">
              <label className="block">
                <span className={labelCls}>Sisäiset muistiinpanot</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  className={inputCls}
                  placeholder="Esim. tarkistettava EPREL-päivityksen jälkeen…"
                />
              </label>
            </div>
          </div>
        </Section>
      </div>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-border mt-6 -mx-4 sm:mx-0 sm:rounded-b-2xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 z-10">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isNew ? "Luo pumppu" : "Tallenna"}
        </button>
        <Link
          to="/ilmalampopumput"
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
        >
          Peruuta
        </Link>
        {!isNew && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={remove.isPending}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Poista
          </button>
        )}
      </div>
    </form>
  );
}
