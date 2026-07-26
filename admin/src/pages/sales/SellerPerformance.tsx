import { useState, useMemo, type FC } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { BarChart3, Users, TrendingDown, Target, TrendingUp, Inbox, FileText, Trophy, Percent, Wallet, Phone } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { useSellerPerformance, useLossReasonStats, useLeadStageDistribution, useOppStageDistribution, usePipelineOverview } from "@/hooks/sales/useSellerPerformance";
import { useSalesDashboardStats } from "@/hooks/sales/useSalesDashboard";
import { PeriodSelector, getPeriodRange } from "@/components/sales/PeriodSelector";
import { SellerFilter } from "@/components/sales/SellerFilter";
import { LEAD_STATUS_LABELS } from "@/lib/sales-types";
import { PipelineBar } from "@/components/sales/PipelineBar";

const CHART_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export default function SellerPerformance() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("month");
  const [sellerFilter, setSellerFilter] = useState(searchParams.get("myyjä") || "");
  const { from, to } = useMemo(() => getPeriodRange(period), [period]);

  const { data: stats } = useSalesDashboardStats();
  const { data: sellers = [], isLoading } = useSellerPerformance(from, to);
  const { data: lossReasons = [] } = useLossReasonStats(from, to, sellerFilter || undefined);
  const { data: leadDist = [] } = useLeadStageDistribution(from, to);
  const { data: _oppDist = [] } = useOppStageDistribution(from, to);
  const { data: pipeline = [] } = usePipelineOverview(from, to, sellerFilter || undefined);

  // Filtered sellers
  const displaySellers = useMemo(() => {
    if (!sellerFilter) return sellers;
    return sellers.filter((s) => s.salesperson_id === sellerFilter);
  }, [sellers, sellerFilter]);

  // Comparison chart data
  const comparisonData = useMemo(() => {
    return displaySellers.map((s) => {
      const totalClosed = Number(s.won_leads) + Number(s.lost_leads) + Number(s.won_opportunities) + Number(s.lost_opportunities);
      const totalWon = Number(s.won_leads) + Number(s.won_opportunities);
      return {
        name: `${s.first_name} ${s.last_name?.[0] || ""}.`,
        fullName: `${s.first_name} ${s.last_name}`,
        liidit: Number(s.total_leads),
        inbound: Number(s.total_opportunities),
        voitettu: totalWon,
        klousaus: totalClosed > 0 ? Math.round((totalWon / totalClosed) * 100) : 0,
        pipeline: Number(s.pipeline_value || 0),
        provisiot: Number(s.total_commissions || 0),
      };
    });
  }, [displaySellers]);

  // Stage distribution data for stacked bar
  const stageData = useMemo(() => {
    const sellerMap = new Map<string, Record<string, number>>();
    const allStatuses = new Set<string>();

    for (const row of leadDist) {
      if (sellerFilter && row.salesperson_id !== sellerFilter) continue;
      const key = `${row.first_name} ${row.last_name?.[0] || ""}.`;
      if (!sellerMap.has(key)) sellerMap.set(key, {});
      const obj = sellerMap.get(key)!;
      const label = LEAD_STATUS_LABELS[row.status as keyof typeof LEAD_STATUS_LABELS] || row.status;
      obj[label] = (obj[label] || 0) + Number(row.lead_count || 0);
      allStatuses.add(label);
    }

    return {
      data: Array.from(sellerMap.entries()).map(([name, statuses]) => ({ name, ...statuses })),
      statuses: Array.from(allStatuses),
    };
  }, [leadDist, sellerFilter]);

  // Loss reason pie data
  const lossData = useMemo(() => {
    return lossReasons.map((r) => ({
      name: r.reason,
      value: Number(r.total_count),
    }));
  }, [lossReasons]);

  const totalCommissions = useMemo(
    () => sellers.reduce((s, r) => s + Number(r.total_commissions || 0), 0),
    [sellers]
  );
  const totalPipeline = useMemo(
    () => sellers.reduce((s, r) => s + Number(r.pipeline_value || 0), 0),
    [sellers]
  );

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Myynti</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 bg-muted/30 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Myynti</h1>
        </div>
        <div className="flex items-center gap-2">
          <SellerFilter value={sellerFilter} onChange={setSellerFilter} />
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Liidit yhteensä",   value: stats?.totalLeads ?? 0,          icon: Users,    color: "bg-blue-50 text-blue-600",    onClick: () => navigate("/myynti/liidit") },
          { label: "Inbound-liidit",     value: stats?.totalOpportunities ?? 0,  icon: Inbox,    color: "bg-cyan-50 text-cyan-600",    onClick: () => navigate("/myynti/inbound") },
          { label: "Avoimet tarjoukset", value: stats?.openOffers ?? 0,          icon: FileText, color: "bg-amber-50 text-amber-600",  onClick: undefined },
          { label: "Voitetut diilit",    value: stats?.wonDeals ?? 0,            icon: Trophy,   color: "bg-emerald-50 text-emerald-600", onClick: undefined },
          { label: "Konversio-%",        value: `${(stats?.conversionRate ?? 0).toFixed(1)} %`, icon: Percent, color: "bg-purple-50 text-purple-600", onClick: undefined },
          { label: "Pipeline-arvo",      value: `${totalPipeline.toFixed(0)} €`, icon: BarChart3, color: "bg-indigo-50 text-indigo-600", onClick: undefined },
          { label: "Provisiot yht.",     value: `${totalCommissions.toFixed(0)} €`, icon: Wallet, color: "bg-orange-50 text-orange-600", onClick: undefined },
          { label: "Myyjät",             value: sellers.length,                  icon: Phone,    color: "bg-sky-50 text-sky-600",      onClick: undefined },
        ].map(({ label, value, icon: Icon, color, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className={`text-left p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all ${onClick ? "cursor-pointer" : "cursor-default"}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{label}</span>
              <div className={`p-1.5 rounded-lg ${color}`}><Icon className="w-4 h-4" /></div>
            </div>
            <p className="text-2xl font-bold">{value}</p>
          </button>
        ))}
      </div>

      {/* Comparison Table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-text-muted" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Myyjävertailu
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Myyjä</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Liidit</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Kontaktoitu</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Kontakti-%</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Kvalifioitu</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Inbound</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Voitettu</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Hävitty</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Klousaus-%</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Pipeline</th>
                <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Provisiot</th>
              </tr>
            </thead>
            <tbody>
              {displaySellers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-text-muted">Ei dataa</td>
                </tr>
              ) : (
                displaySellers.map((s) => {
                  const totalClosed = Number(s.won_leads) + Number(s.lost_leads) + Number(s.won_opportunities) + Number(s.lost_opportunities);
                  const totalWon = Number(s.won_leads) + Number(s.won_opportunities);
                  const totalLost = Number(s.lost_leads) + Number(s.lost_opportunities);
                  const closeRate = totalClosed > 0 ? ((totalWon / totalClosed) * 100).toFixed(1) : "–";
                  const contactRate = Number(s.total_leads) > 0
                    ? ((Number(s.contacted_leads) / Number(s.total_leads)) * 100).toFixed(1)
                    : "–";

                  return (
                    <tr key={s.salesperson_id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{s.first_name} {s.last_name}</td>
                      <td className="px-4 py-2.5 text-right">{s.total_leads}</td>
                      <td className="px-4 py-2.5 text-right">{s.contacted_leads}</td>
                      <td className="px-4 py-2.5 text-right">
                        {contactRate !== "–" ? `${contactRate} %` : "–"}
                      </td>
                      <td className="px-4 py-2.5 text-right">{s.qualified_leads}</td>
                      <td className="px-4 py-2.5 text-right">{s.total_opportunities}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-accent">{totalWon}</td>
                      <td className="px-4 py-2.5 text-right text-red-500">{totalLost}</td>
                      <td className="px-4 py-2.5 text-right">
                        {closeRate !== "–" ? (
                          <span className={`font-semibold ${Number(closeRate) >= 20 ? "text-emerald-600" : Number(closeRate) >= 10 ? "text-amber-600" : "text-red-500"}`}>
                            {closeRate} %
                          </span>
                        ) : "–"}
                      </td>
                      <td className="px-4 py-2.5 text-right">{Number(s.pipeline_value || 0).toFixed(0)} €</td>
                      <td className="px-4 py-2.5 text-right">{Number(s.total_commissions || 0).toFixed(0)} €</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pipeline distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Soittoliidien putki {sellerFilter ? "— valittu myyjä" : "— kaikki"}
            </h2>
          </div>
          <PipelineBar rows={pipeline} type="lead" />
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Inbound-putki {sellerFilter ? "— valittu myyjä" : "— kaikki"}
            </h2>
          </div>
          <PipelineBar rows={pipeline} type="opportunity" />
        </div>
      </div>

      {/* Per-seller pipeline table */}
      {sellers.length > 1 && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Users className="w-4 h-4 text-text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Putki myyjittäin</h2>
          </div>
          <div className="divide-y divide-border">
            {displaySellers.map((s) => (
              <SellerPipelineRows key={s.salesperson_id} seller={s} from={from} to={to} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Klousaus comparison bar chart */}
        <div className="bg-surface border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Klousaus & voitetut</h2>
          </div>
          {comparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={comparisonData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid var(--color-border)" }}
                  formatter={(val, name) => {
                    if (name === "klousaus") return [`${val} %`, "Klousaus-%"];
                    return [val, name === "voitettu" ? "Voitettu" : name === "liidit" ? "Liidit" : "Inbound"];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="liidit" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Liidit" />
                <Bar dataKey="inbound" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Inbound" />
                <Bar dataKey="voitettu" fill="#22c55e" radius={[4, 4, 0, 0]} name="Voitettu" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-text-muted py-12 text-center">Ei dataa</p>
          )}
        </div>

        {/* Stage distribution stacked bar */}
        <div className="bg-surface border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Liidit vaiheittain</h2>
          </div>
          {stageData.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stageData.data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid var(--color-border)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {stageData.statuses.map((status, i) => (
                  <Bar
                    key={status}
                    dataKey={status}
                    stackId="a"
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    radius={i === stageData.statuses.length - 1 ? [4, 4, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-text-muted py-12 text-center">Ei dataa</p>
          )}
        </div>

        {/* Loss reasons pie chart */}
        <div className="bg-surface border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Häviösyyt</h2>
          </div>
          {lossData.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-1/2 flex-shrink-0">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={lossData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={2}
                  >
                    {lossData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid var(--color-border)" }} />
                </PieChart>
              </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 flex-1 w-full sm:w-auto">
                {lossData.map((r, i) => (
                  <div key={r.name} className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-xs truncate flex-1">{r.name}</span>
                    <span className="text-xs font-semibold">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-muted py-12 text-center">Ei häviösyitä</p>
          )}
        </div>

        {/* Klousaus % comparison */}
        <div className="bg-surface border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Klousaus-% vertailu</h2>
          </div>
          {comparisonData.length > 0 ? (
            <div className="space-y-3">
              {[...comparisonData]
                .sort((a, b) => b.klousaus - a.klousaus)
                .map((s) => (
                  <div key={s.fullName}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{s.fullName}</span>
                      <span className={`text-xs font-bold ${s.klousaus >= 20 ? "text-emerald-600" : s.klousaus >= 10 ? "text-amber-600" : "text-red-500"}`}>
                        {s.klousaus} %
                      </span>
                    </div>
                    <div className="w-full h-2 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${s.klousaus >= 20 ? "bg-emerald-500" : s.klousaus >= 10 ? "bg-amber-500" : "bg-red-400"}`}
                        style={{ width: `${Math.min(s.klousaus, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted py-12 text-center">Ei dataa</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Per-seller pipeline rows ─────────────────────────────────────────────────

const SellerPipelineRows: FC<{
  seller: { salesperson_id: string; first_name: string; last_name: string };
  from: string;
  to: string;
}> = ({ seller, from, to }) => {
  const { data: rows = [] } = usePipelineOverview(from, to, seller.salesperson_id);
  return (
    <div className="px-4 py-3 space-y-3">
      <p className="text-xs font-semibold">{seller.first_name} {seller.last_name}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-text-muted font-medium">Soittoliidit</p>
          <PipelineBar rows={rows} type="lead" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-text-muted font-medium">Inbound</p>
          <PipelineBar rows={rows} type="opportunity" />
        </div>
      </div>
    </div>
  );
};
