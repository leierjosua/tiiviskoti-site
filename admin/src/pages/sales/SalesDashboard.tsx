import { TrendingUp, Users, Inbox, FileText, Phone, Trophy, Percent, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSalesDashboardStats } from "@/hooks/sales/useSalesDashboard";

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

export default function SalesDashboard() {
  const { data: stats, isLoading } = useSalesDashboardStats();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Myyntipaneeli</h1>
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
    <div>
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Myyntipaneeli</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Liidit yhteensä"
          value={stats?.totalLeads ?? 0}
          icon={Users}
          color="bg-blue-50 text-blue-600"
          onClick={() => navigate("/myynti/liidit")}
        />
        <StatCard
          label="Liidit tällä viikolla"
          value={stats?.leadsThisWeek ?? 0}
          icon={Phone}
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="Inbound-liidit"
          value={stats?.totalOpportunities ?? 0}
          icon={Inbox}
          color="bg-cyan-50 text-cyan-600"
          onClick={() => navigate("/myynti/inbound")}
        />
        <StatCard
          label="Inbound tällä vk"
          value={stats?.opportunitiesThisWeek ?? 0}
          icon={Inbox}
          color="bg-sky-50 text-sky-600"
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
          label="Provisiot yht."
          value={`${(stats?.totalCommissions ?? 0).toFixed(0)} €`}
          icon={Wallet}
          color="bg-orange-50 text-orange-600"
        />
      </div>

      {/* Quick links */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => navigate("/myynti/liidit")}
          className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-purple-50">
            <Phone className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Kylmäsoitot</p>
            <p className="text-xs text-text-muted">Soittolista ja CRM</p>
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
            <p className="text-sm font-semibold">Inbound-liidit</p>
            <p className="text-xs text-text-muted">Kanban-näkymä</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/myynti/asetukset")}
          className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-gray-50">
            <TrendingUp className="w-5 h-5 text-gray-600" />
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
