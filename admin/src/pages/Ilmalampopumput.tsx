import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Snowflake,
  Plus,
  ExternalLink,
  Eye,
  EyeOff,
  Search,
  CheckCircle2,
  Circle,
  Archive,
} from "lucide-react";
import { useHeatPumps } from "@/hooks/useHeatPumps";
import { inputCls, selectCls } from "@/lib/constants";
import type { HeatPump, HeatPumpCurationStatus } from "@/lib/types";

const STATUS_LABELS: Record<HeatPumpCurationStatus, string> = {
  draft: "Luonnos",
  verified: "Vahvistettu",
  archived: "Arkistoitu",
};

const STATUS_STYLES: Record<HeatPumpCurationStatus, string> = {
  draft: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  verified: "bg-green-50 text-green-700 border border-green-200",
  archived: "bg-gray-100 text-gray-600 border border-gray-200",
};

function StatusBadge({ status }: { status: HeatPumpCurationStatus }) {
  const Icon = status === "verified" ? CheckCircle2 : status === "archived" ? Archive : Circle;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[status]}`}
    >
      <Icon className="w-3 h-3" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function Ilmalampopumput() {
  const navigate = useNavigate();
  const { data: pumps, isLoading } = useHeatPumps();

  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | HeatPumpCurationStatus>("");
  const [visibleFilter, setVisibleFilter] = useState<"" | "visible" | "hidden">("");

  const brands = useMemo(() => {
    const set = new Set<string>();
    (pumps || []).forEach((p) => set.add(p.brand));
    return Array.from(set).sort();
  }, [pumps]);

  const filtered = useMemo(() => {
    if (!pumps) return [];
    const q = search.trim().toLowerCase();
    return pumps.filter((p) => {
      if (brandFilter && p.brand !== brandFilter) return false;
      if (statusFilter && p.curation_status !== statusFilter) return false;
      if (visibleFilter === "visible" && !p.visible) return false;
      if (visibleFilter === "hidden" && p.visible) return false;
      if (q) {
        const hay = [
          p.brand,
          p.series || "",
          p.marketing_name,
          p.model_indoor || "",
          p.model_outdoor || "",
          p.eprel_registration_number || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pumps, search, brandFilter, statusFilter, visibleFilter]);

  const summary = useMemo(() => {
    if (!pumps) return null;
    const visible = pumps.filter((p) => p.visible).length;
    const verified = pumps.filter((p) => p.curation_status === "verified").length;
    return { total: pumps.length, visible, verified };
  }, [pumps]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Snowflake className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Ilmalämpöpumput</h1>
        </div>
        <button
          onClick={() => navigate("/ilmalampopumput/uusi")}
          className="inline-flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Lisää pumppu</span>
        </button>
      </div>

      <p className="text-sm text-text-secondary mb-6 max-w-3xl">
        Kuratoitu lista vertailtavista pumpuista. Sisältää EPREL-spec-sheet&shy;tiedot ja
        suoran linkin EPREL-sivulle. Vain <strong>näkyvät</strong> rivit näytetään julkisessa
        vertailuwidgetissä; piilotetut/arkistoidut säilyvät tietokannassa myöhempää käyttöä varten.
      </p>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-6 max-w-md">
          <div className="bg-surface border border-border rounded-xl p-3">
            <p className="text-[11px] text-text-muted uppercase font-semibold tracking-wide">Yhteensä</p>
            <p className="text-lg font-bold text-text-primary">{summary.total}</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-3">
            <p className="text-[11px] text-text-muted uppercase font-semibold tracking-wide">Näkyvissä</p>
            <p className="text-lg font-bold text-text-primary">{summary.visible}</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-3">
            <p className="text-[11px] text-text-muted uppercase font-semibold tracking-wide">Vahvistettu</p>
            <p className="text-lg font-bold text-text-primary">{summary.verified}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hae brändi, malli, EPREL-numero…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className={`${selectCls} max-w-[180px]`}
        >
          <option value="">Kaikki brändit</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | HeatPumpCurationStatus)}
          className={`${selectCls} max-w-[160px]`}
        >
          <option value="">Kaikki tilat</option>
          <option value="draft">Luonnos</option>
          <option value="verified">Vahvistettu</option>
          <option value="archived">Arkistoitu</option>
        </select>
        <select
          value={visibleFilter}
          onChange={(e) => setVisibleFilter(e.target.value as "" | "visible" | "hidden")}
          className={`${selectCls} max-w-[160px]`}
        >
          <option value="">Näkyvyys: kaikki</option>
          <option value="visible">Vain näkyvät</option>
          <option value="hidden">Vain piilotetut</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-text-muted">Ladataan…</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-muted">
            {pumps && pumps.length === 0
              ? "Ei vielä yhtään pumppua. Lisää ensimmäinen yllä."
              : "Ei tuloksia hakuehdoilla."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-text-muted">
                <tr>
                  <th className="text-left font-semibold px-4 py-3 text-[11px] uppercase tracking-wider">Brändi</th>
                  <th className="text-left font-semibold px-4 py-3 text-[11px] uppercase tracking-wider">Malli</th>
                  <th className="text-right font-semibold px-4 py-3 text-[11px] uppercase tracking-wider whitespace-nowrap">SCOP&nbsp;C</th>
                  <th className="text-right font-semibold px-4 py-3 text-[11px] uppercase tracking-wider whitespace-nowrap">Pdh&nbsp;kylmä</th>
                  <th className="text-right font-semibold px-4 py-3 text-[11px] uppercase tracking-wider whitespace-nowrap">Pdesignh&nbsp;kylmä</th>
                  <th className="text-left font-semibold px-4 py-3 text-[11px] uppercase tracking-wider">Tila</th>
                  <th className="text-center font-semibold px-4 py-3 text-[11px] uppercase tracking-wider">Näkyvä</th>
                  <th className="text-left font-semibold px-4 py-3 text-[11px] uppercase tracking-wider">EPREL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <PumpRow key={p.id} pump={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PumpRow({ pump }: { pump: HeatPump }) {
  return (
    <tr className="hover:bg-surface-hover transition-colors">
      <td className="px-4 py-3 align-top">
        <Link
          to={`/ilmalampopumput/${pump.id}`}
          className="font-medium text-text-primary hover:text-accent"
        >
          {pump.brand}
        </Link>
        {pump.series && <p className="text-[11px] text-text-muted">{pump.series}</p>}
      </td>
      <td className="px-4 py-3 align-top">
        <Link
          to={`/ilmalampopumput/${pump.id}`}
          className="text-text-primary hover:text-accent"
        >
          {pump.marketing_name}
        </Link>
        {(pump.model_indoor || pump.model_outdoor) && (
          <p className="text-[11px] text-text-muted font-mono">
            {[pump.model_indoor, pump.model_outdoor].filter(Boolean).join(" / ")}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums align-top">
        {pump.scop_cold != null ? pump.scop_cold.toFixed(2) : <span className="text-text-muted">–</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums align-top">
        {pump.pdh_cold_kw != null ? (
          `${pump.pdh_cold_kw.toFixed(1)} kW`
        ) : (
          <span className="text-text-muted">–</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums align-top">
        {pump.pdesignh_cold_kw != null ? (
          `${pump.pdesignh_cold_kw.toFixed(1)} kW`
        ) : (
          <span className="text-text-muted">–</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <StatusBadge status={pump.curation_status} />
      </td>
      <td className="px-4 py-3 text-center align-top">
        {pump.visible ? (
          <Eye className="w-4 h-4 text-green-600 inline" />
        ) : (
          <EyeOff className="w-4 h-4 text-text-muted inline" />
        )}
      </td>
      <td className="px-4 py-3 align-top">
        {pump.eprel_url ? (
          <a
            href={pump.eprel_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-dark"
            onClick={(e) => e.stopPropagation()}
          >
            {pump.eprel_registration_number || "Avaa"}
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-text-muted text-xs">–</span>
        )}
      </td>
    </tr>
  );
}
