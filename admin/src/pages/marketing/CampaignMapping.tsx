import { useState, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { finnishNow } from "@/lib/utils";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { Megaphone, ChevronDown, ChevronRight, Check, Loader2 } from "lucide-react";
import {
  useMarketingCampaigns,
  useUpdateCampaignMapping,
  type CampaignWithSpend,
} from "@/hooks/marketing/useMarketingCampaigns";
import { useServices } from "@/hooks/useServices";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ── Period helpers ──────────────────────────────────────────────────────────

type PeriodKey = "this_month" | "prev_month" | "3months" | "this_year" | "all";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "Tämä kuukausi" },
  { key: "3months", label: "3 kk" },
  { key: "this_year", label: "Tämä vuosi" },
  { key: "all", label: "Kaikki" },
];

function getRange(key: PeriodKey): { from: string; to: string } {
  const today = finnishNow();
  const y = today.getFullYear();
  const m = today.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const lastDay = (yr: number, mo: number) => new Date(yr, mo + 1, 0).getDate();

  switch (key) {
    case "this_month":
      return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}` };
    case "3months": {
      const d = new Date(y, m - 2, 1);
      return { from: fmt(d), to: `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}` };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "all":
    default:
      return { from: "2024-01-01", to: `${y}-12-31` };
  }
}

const TABS = [
  { to: "/analytiikka/markkinointi", label: "Yhteenveto" },
  { to: "/analytiikka/markkinointi/kampanjat", label: "Kampanjat" },
  { to: "/analytiikka/markkinointi/aluekannattavuus", label: "Aluekannattavuus" },
  { to: "/analytiikka/markkinointi/kohdistukset", label: "Kohdistukset", end: true },
  { to: "/analytiikka/markkinointi/provisio", label: "Provisio" },
];

// ── Hook: all service areas (not per-employee) ──────────────────────────────

function useAllRegions() {
  return useQuery({
    queryKey: ["marketing-regions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_regions")
        .select("id, name")
        .eq("active", true)
        .order("position");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CampaignMapping() {
  const [dateRange, setDateRange] = useState<DateRange>(() => getRange("this_month"));
  const { from, to } = dateRange;
  const handlePresetPeriod = useCallback((key: PeriodKey) => { setDateRange(getRange(key)); }, []);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: campaigns, isLoading } = useMarketingCampaigns(from, to);
  const { data: regions } = useAllRegions();
  const { data: services } = useServices();
  const updateMapping = useUpdateCampaignMapping();

  // Group campaigns by platform
  const grouped = useMemo(() => {
    if (!campaigns) return { google_ads: [], meta_ads: [] };
    return {
      google_ads: campaigns.filter((c) => c.platform === "google_ads"),
      meta_ads: campaigns.filter((c) => c.platform === "meta_ads"),
    };
  }, [campaigns]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Megaphone className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Markkinointi</h1>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 max-w-full mb-4 overflow-x-auto">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Date range picker + quick presets */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="flex flex-nowrap gap-1 overflow-x-auto">
          {PERIOD_OPTIONS.map((opt) => (
            <button key={opt.key} onClick={() => handlePresetPeriod(opt.key)} className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-text-muted mb-4">
        Kohdista kampanjat ja mainosryhmät palvelualueisiin ja palveluihin. Mainosryhmän kohdistus yliajaa kampanjan kohdistuksen.
      </p>

      {/* Loading */}
      {isLoading && (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-surface rounded-xl" />
          ))}
        </div>
      )}

      {/* Content */}
      {!isLoading && campaigns && (
        <div className="space-y-6">
          {(["google_ads", "meta_ads"] as const).map((platform) => {
            const items = grouped[platform];
            if (items.length === 0) return null;

            return (
              <div key={platform} className="bg-surface rounded-2xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="font-semibold text-text-primary text-sm">
                    {platform === "google_ads" ? "Google Ads" : "Meta Ads"} ({items.length})
                  </h3>
                </div>

                <div className="divide-y divide-border">
                  {items.map((c) => (
                    <MappingRow
                      key={c.id}
                      campaign={c}
                      regions={regions || []}
                      services={(services || []) as { id: string; name: string }[]}
                      expanded={expandedId === c.id}
                      onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      onUpdate={(params) => updateMapping.mutate(params)}
                      isUpdating={updateMapping.isPending}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && (!campaigns || campaigns.length === 0) && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center text-text-muted">
          Ei kampanjoita. Synkronoi data ensin.
        </div>
      )}
    </div>
  );
}

function MappingRow({
  campaign: c,
  regions,
  services,
  expanded,
  onToggle,
  onUpdate,
  isUpdating,
}: {
  campaign: CampaignWithSpend;
  regions: { id: string; name: string }[];
  services: { id: string; name: string }[];
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (params: {
    table: "marketing_campaigns" | "marketing_ad_groups";
    id: string;
    region_id: string | null;
    service_id: string | null;
  }) => void;
  isUpdating: boolean;
}) {
  const hasAdGroups = c.marketing_ad_groups.length > 0;

  return (
    <div>
      <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Campaign name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasAdGroups ? (
            <button onClick={onToggle} className="flex-shrink-0">
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
              )}
            </button>
          ) : (
            <span className="w-3.5 flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-text-primary truncate">{c.name}</span>
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0 ml-6 sm:ml-0">
          <select
            value={c.region_id || ""}
            onChange={(e) =>
              onUpdate({
                table: "marketing_campaigns",
                id: c.id,
                region_id: e.target.value || null,
                service_id: c.service_id,
              })
            }
            className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white text-text-primary min-w-[140px]"
          >
            <option value="">Ei aluetta (auto-map)</option>
            {regions.map((sa) => (
              <option key={sa.id} value={sa.id}>
                {sa.name}
              </option>
            ))}
          </select>

          <select
            value={c.service_id || ""}
            onChange={(e) =>
              onUpdate({
                table: "marketing_campaigns",
                id: c.id,
                region_id: c.region_id,
                service_id: e.target.value || null,
              })
            }
            className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white text-text-primary min-w-[140px]"
          >
            <option value="">Ei palvelua</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {isUpdating ? (
            <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />
          ) : c.region_id ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : null}
        </div>
      </div>

      {/* Expanded ad groups */}
      {expanded && hasAdGroups && (
        <div className="bg-surface-hover/50 border-t border-border">
          {c.marketing_ad_groups.map((ag) => (
            <div
              key={ag.id}
              className="px-5 py-2.5 pl-14 flex flex-col sm:flex-row sm:items-center gap-2 border-b border-border/50 last:border-0"
            >
              <span className="text-sm text-text-primary flex-1 min-w-0 truncate">
                {ag.name}
              </span>

              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                <select
                  value={ag.region_id || ""}
                  onChange={(e) =>
                    onUpdate({
                      table: "marketing_ad_groups",
                      id: ag.id,
                      region_id: e.target.value || null,
                      service_id: ag.service_id,
                    })
                  }
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white text-text-primary min-w-[140px]"
                >
                  <option value="">Kampanjan alue</option>
                  {regions.map((sa) => (
                    <option key={sa.id} value={sa.id}>
                      {sa.name}
                    </option>
                  ))}
                </select>

                <select
                  value={ag.service_id || ""}
                  onChange={(e) =>
                    onUpdate({
                      table: "marketing_ad_groups",
                      id: ag.id,
                      region_id: ag.region_id,
                      service_id: e.target.value || null,
                    })
                  }
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white text-text-primary min-w-[140px]"
                >
                  <option value="">Kampanjan palvelu</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
