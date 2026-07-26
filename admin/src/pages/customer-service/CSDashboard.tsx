import { useCSDashboardStats } from "@/hooks/customer-service/useCSAnalytics";
import { useCSCategories } from "@/hooks/customer-service/useTickets";
import {
  BarChart3,
  Inbox,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_CHANNEL_LABELS,
} from "@/lib/cs-types";

function formatMinutes(min: number): string {
  if (min >= 1440) {
    const days = Math.floor(min / 1440);
    const hours = Math.floor((min % 1440) / 60);
    return hours > 0 ? `${days}pv ${hours}h` : `${days}pv`;
  }
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}min`;
  return `${min}min`;
}

export default function CSDashboard() {
  const { data: stats, isLoading } = useCSDashboardStats();
  const { data: categories } = useCSCategories();

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const catMap = new Map(categories?.map((c) => [c.id, c]) ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-gray-500 shrink-0" />
        <h1 className="text-xl sm:text-2xl font-bold">Asiakaspalvelun raportointi</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          icon={Inbox}
          label="Avoimet tiketit"
          value={stats.openTickets}
          color="text-blue-600 bg-blue-100"
        />
        <KPICard
          icon={Inbox}
          label="Uudet tiketit"
          value={stats.newTickets}
          color="text-indigo-600 bg-indigo-100"
        />
        <KPICard
          icon={CheckCircle2}
          label="Ratkaistu tänään"
          value={stats.resolvedToday}
          color="text-green-600 bg-green-100"
        />
        <KPICard
          icon={Clock}
          label="Keskim. vastausaika"
          value={
            stats.avgFirstResponseMin !== null
              ? formatMinutes(stats.avgFirstResponseMin)
              : "—"
          }
          color="text-amber-600 bg-amber-100"
        />
        <KPICard
          icon={Clock}
          label="Keskim. ratkaisuaika"
          value={
            stats.avgResolutionMin !== null
              ? formatMinutes(stats.avgResolutionMin)
              : "—"
          }
          color="text-purple-600 bg-purple-100"
        />
        <KPICard
          icon={AlertTriangle}
          label="SLA ylitetty"
          value={stats.slaBreachedCount}
          color="text-red-600 bg-red-100"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets by status */}
        <ChartCard title="Tiketit statuksen mukaan">
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <BarRow
              key={status}
              label={
                TICKET_STATUS_LABELS[
                  status as keyof typeof TICKET_STATUS_LABELS
                ] ?? status
              }
              value={count}
              max={Math.max(...Object.values(stats.byStatus))}
              color="bg-blue-500"
            />
          ))}
        </ChartCard>

        {/* Tickets by category */}
        <ChartCard title="Tiketit kategorioittain">
          {Object.entries(stats.byCategory).map(([catId, count]) => {
            const c = catMap.get(catId);
            return (
              <BarRow
                key={catId}
                label={c?.label ?? catId}
                value={count}
                max={Math.max(...Object.values(stats.byCategory))}
                color={c?.color ? `bg-[${c.color}]` : "bg-indigo-500"}
                style={c?.color ? { backgroundColor: c.color } : undefined}
              />
            );
          })}
        </ChartCard>

        {/* Tickets by priority */}
        <ChartCard title="Tiketit prioriteettien mukaan">
          {Object.entries(stats.byPriority).map(([priority, count]) => (
            <BarRow
              key={priority}
              label={
                TICKET_PRIORITY_LABELS[
                  priority as keyof typeof TICKET_PRIORITY_LABELS
                ] ?? priority
              }
              value={count}
              max={Math.max(...Object.values(stats.byPriority))}
              color={
                priority === "urgent"
                  ? "bg-red-500"
                  : priority === "high"
                    ? "bg-orange-500"
                    : priority === "normal"
                      ? "bg-blue-500"
                      : "bg-gray-400"
              }
            />
          ))}
        </ChartCard>

        {/* Tickets created last 7 days */}
        <ChartCard title="Uudet tiketit (7 päivää)">
          <div className="flex items-end gap-1 h-32">
            {stats.ticketsCreatedLast7Days.map((d) => {
              const maxCount = Math.max(
                ...stats.ticketsCreatedLast7Days.map((x) => x.count),
                1
              );
              const height = (d.count / maxCount) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <span className="text-[10px] text-gray-500">{d.count}</span>
                  <div
                    className="w-full bg-indigo-400 rounded-t"
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                  <span className="text-[10px] text-gray-400">
                    {new Date(d.date).toLocaleDateString("fi-FI", {
                      day: "numeric",
                      month: "numeric",
                      timeZone: "Europe/Helsinki",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      {/* Channel breakdown */}
      <ChartCard title="Tiketit kanavittain">
        <div className="flex flex-wrap gap-4">
          {Object.entries(stats.byChannel).map(([channel, count]) => (
            <div
              key={channel}
              className="flex items-center gap-2 text-sm text-gray-700"
            >
              <span className="font-medium">{count}</span>
              <span className="text-gray-500">
                {TICKET_CHANNEL_LABELS[
                  channel as keyof typeof TICKET_CHANNEL_LABELS
                ] ?? channel}
              </span>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}

function KPICard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Inbox;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className={`inline-flex p-2 rounded-lg ${color} mb-2`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
  style,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  style?: React.CSSProperties;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-20 sm:w-32 truncate shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%`, ...style }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 w-8 text-right">
        {value}
      </span>
    </div>
  );
}
