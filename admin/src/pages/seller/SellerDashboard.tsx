import { TrendingUp, Users, Phone, Inbox, FileText, Trophy, Percent, CalendarPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/context/UserRoleContext";
import { useSalesDashboardStats } from "@/hooks/sales/useSalesDashboard";
import { KpiCard } from "@/components/KpiCard";

export default function SellerDashboard() {
  const { employee } = useUserRole();
  const { data: stats, isLoading } = useSalesDashboardStats(employee?.id);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold">Tervetuloa{employee ? `, ${employee.first_name}` : ""}!</h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
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
        <h1 className="text-lg font-bold">Tervetuloa{employee ? `, ${employee.first_name}` : ""}!</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          label="Liidit yhteensä"
          value={stats?.totalLeads ?? 0}
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          accent="border-l-blue-400"
          onClick={() => navigate("/myyja/kylmasoitot")}
        />
        <KpiCard
          label="Tämän viikon liidit"
          value={stats?.leadsThisWeek ?? 0}
          icon={Phone}
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
          accent="border-l-purple-400"
        />
        <KpiCard
          label="Inbound-liidit"
          value={stats?.totalOpportunities ?? 0}
          icon={Inbox}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-50"
          accent="border-l-cyan-400"
          onClick={() => navigate("/myyja/inbound")}
        />
        <KpiCard
          label="Avoimet tarjoukset"
          value={stats?.openOffers ?? 0}
          icon={FileText}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          accent="border-l-amber-400"
        />
        <KpiCard
          label="Voitetut diilit"
          value={stats?.wonDeals ?? 0}
          icon={Trophy}
          iconColor="text-accent-dark"
          iconBg="bg-accent-muted"
          accent="border-l-accent"
        />
        <KpiCard
          label="Konversio-%"
          value={`${(stats?.conversionRate ?? 0).toFixed(1)} %`}
          icon={Percent}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          accent="border-l-emerald-400"
        />
      </div>

      {/* Quick actions */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => navigate("/myyja/uusi-varaus")}
          className="flex items-center gap-3 p-4 bg-accent text-white rounded-2xl hover:bg-accent-dark transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-white/20">
            <CalendarPlus className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Uusi varaus</p>
            <p className="text-xs opacity-80">Luo varaus asiakkaalle</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/myyja/kylmasoitot")}
          className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-purple-50">
            <Phone className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Aloita soittaminen</p>
            <p className="text-xs text-text-muted">Kylmäsoitot & soittolista</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/myyja/inbound")}
          className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-cyan-50">
            <Inbox className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Inbound-liidit</p>
            <p className="text-xs text-text-muted">Myyntiputki</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/myyja/tarjoukset")}
          className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:shadow-sm transition-all text-left"
        >
          <div className="p-2 rounded-xl bg-amber-50">
            <FileText className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Tarjoukset</p>
            <p className="text-xs text-text-muted">Selaa ja luo tarjouksia</p>
          </div>
        </button>
      </div>
    </div>
  );
}
