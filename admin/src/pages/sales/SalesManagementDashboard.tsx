import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, Users, Inbox, FileText, Phone, Trophy, Percent, Wallet,
  BarChart3, SlidersHorizontal, ArrowRight,
} from "lucide-react";
import { useSalesDashboardStats } from "@/hooks/sales/useSalesDashboard";
import { useExpiringOffers } from "@/hooks/sales/useSalesOffers";
import { useSellerPerformance, usePipelineOverview } from "@/hooks/sales/useSellerPerformance";
import { PeriodSelector, getPeriodRange } from "@/components/sales/PeriodSelector";
import { ActivityFeed } from "@/components/sales/ActivityFeed";
import { PipelineBar } from "@/components/sales/PipelineBar";

function StatCard({ label, value, icon: Icon, color, onClick }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{label}</span>
        <div className={`p-1.5 rounded-lg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </button>
  );
}

export default function SalesManagementDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("month");
  const { from, to } = useMemo(() => getPeriodRange(period), [period]);

  const { data: stats, isLoading: statsLoading } = useSalesDashboardStats();
  const { data: sellers = [], isLoading: sellersLoading } = useSellerPerformance(from, to);
  const { data: pipeline = [] } = usePipelineOverview(from, to);
  const { data: expiringOffers = [] } = useExpiringOffers();

  const totals = useMemo(() => {
    const totalPipeline = sellers.reduce((s, r) => s + Number(r.pipeline_value || 0), 0);
    const totalComm = sellers.reduce((s, r) => s + Number(r.total_commissions || 0), 0);
    return { totalPipeline, totalComm };
  }, [sellers]);

  const isLoading = statsLoading || sellersLoading;

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Myyntien hallinta</h1>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted/30 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Myyntien hallinta</h1>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Liidit yhteensä"
          value={stats?.totalLeads ?? 0}
          icon={Users}
          color="bg-blue-50 text-blue-600"
          onClick={() => navigate("/myynti/liidit")}
        />
        <StatCard
          label="Inbound-liidit"
          value={stats?.totalOpportunities ?? 0}
          icon={Inbox}
          color="bg-cyan-50 text-cyan-600"
          onClick={() => navigate("/myynti/inbound")}
        />
        <StatCard
          label="Avoimet tarjoukset"
          value={stats?.openOffers ?? 0}
          icon={FileText}
          color="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Voitetut diilit"
          value={stats?.wonDeals ?? 0}
          icon={Trophy}
          color="bg-accent-muted text-accent-dark"
        />
        <StatCard
          label="Konversio-%"
          value={`${(stats?.conversionRate ?? 0).toFixed(1)} %`}
          icon={Percent}
          color="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Pipeline-arvo"
          value={`${totals.totalPipeline.toFixed(0)} €`}
          icon={BarChart3}
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="Provisiot yht."
          value={`${(stats?.totalCommissions ?? 0).toFixed(0)} €`}
          icon={Wallet}
          color="bg-orange-50 text-orange-600"
        />
        <StatCard
          label="Myyjät"
          value={sellers.length}
          icon={Users}
          color="bg-sky-50 text-sky-600"
          onClick={() => navigate("/myynti/suorituskyky")}
        />
      </div>

      {/* Pipeline overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Soittoliidien putki</h2>
          </div>
          <PipelineBar rows={pipeline} type="lead" />
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Inbound-putki</h2>
          </div>
          <PipelineBar rows={pipeline} type="opportunity" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Seller summary table */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Myyjät</h2>
            <button
              onClick={() => navigate("/myynti/suorituskyky")}
              className="text-[11px] text-accent font-medium flex items-center gap-1 hover:underline"
            >
              Tarkemmat tilastot <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Myyjä</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Liidit</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Inbound</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Voitettu</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Klousaus-%</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Pipeline</th>
                </tr>
              </thead>
              <tbody>
                {sellers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-muted">Ei myyjiä</td>
                  </tr>
                ) : (
                  sellers.map((s) => {
                    const totalDeals = Number(s.won_leads) + Number(s.lost_leads) + Number(s.won_opportunities) + Number(s.lost_opportunities);
                    const wonTotal = Number(s.won_leads) + Number(s.won_opportunities);
                    const closeRate = totalDeals > 0 ? ((wonTotal / totalDeals) * 100).toFixed(1) : "–";
                    return (
                      <tr
                        key={s.salesperson_id}
                        onClick={() => navigate(`/myynti/suorituskyky?myyjä=${s.salesperson_id}`)}
                        className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 font-medium">{s.first_name} {s.last_name}</td>
                        <td className="px-4 py-2.5 text-right">{s.total_leads}</td>
                        <td className="px-4 py-2.5 text-right">{s.total_opportunities}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-accent">{wonTotal}</td>
                        <td className="px-4 py-2.5 text-right">
                          {closeRate !== "–" ? (
                            <span className={Number(closeRate) >= 20 ? "text-emerald-600 font-semibold" : ""}>
                              {closeRate} %
                            </span>
                          ) : "–"}
                        </td>
                        <td className="px-4 py-2.5 text-right">{Number(s.pipeline_value || 0).toFixed(0)} €</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity feed */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Viimeaikainen aktiviteetti</h2>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <ActivityFeed limit={20} />
          </div>
        </div>
      </div>

      {/* Expiring offers */}
      {expiringOffers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">Vanhentuvat tarjoukset ({expiringOffers.length})</h3>
          </div>
          <div className="space-y-2">
            {expiringOffers.map((o) => (
              <button
                key={o.id}
                onClick={() => o.opportunity_id && navigate(`/myynti/diili/${o.opportunity_id}`)}
                className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-amber-100 hover:border-amber-300 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{o.customer_name || "Tuntematon"}</p>
                  <p className="text-[10px] text-text-muted">
                    {o.offer_number ? `#${o.offer_number}` : ""} {o.title || ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-700">{o.daysLeft} pv</p>
                  <p className="text-[10px] text-text-muted">{Number(o.total).toLocaleString("fi-FI")} &euro;</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => navigate("/myynti/liidit")}
          className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-purple-50">
            <Phone className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Liidien hallinta</p>
            <p className="text-xs text-text-muted">Soittoliidit & siirrot</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/myynti/inbound")}
          className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-cyan-50">
            <Inbox className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Inbound-hallinta</p>
            <p className="text-xs text-text-muted">Pipeline & uudet diilit</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/myynti/suorituskyky")}
          className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-emerald-50">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Suorituskyky</p>
            <p className="text-xs text-text-muted">Myyjien tilastot</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/myynti/asetukset")}
          className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-gray-50">
            <SlidersHorizontal className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Myyntiasetukset</p>
            <p className="text-xs text-text-muted">Pipeline, tagit, skriptit</p>
          </div>
        </button>
      </div>
    </div>
  );
}
