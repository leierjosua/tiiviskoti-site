import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  FolderKanban,
  LayoutGrid,
  List,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Calendar,
  User,
} from "lucide-react";
import { useProjects, useProjectStats, type ProjectFilters } from "@/hooks/projects/useProjects";
import { useEmployees } from "@/hooks/useEmployees";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { ProjectStatus, ProjectPriority, ProjectCategory, Project } from "@/lib/project-types";

// ─── Labels & Colors ────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Suunnittelu",
  scheduled: "Aikataulutettu",
  in_progress: "Käynnissä",
  on_hold: "Pysäytetty",
  completed: "Valmis",
  cancelled: "Peruutettu",
};

const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "bg-slate-50 text-slate-700 border border-slate-200",
  scheduled: "bg-blue-50 text-blue-700 border border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  on_hold: "bg-orange-50 text-orange-600 border border-orange-200",
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
};

const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low: "Matala",
  normal: "Normaali",
  high: "Korkea",
  urgent: "Kiireellinen",
};

const PRIORITY_COLORS: Record<ProjectPriority, string> = {
  low: "text-slate-500",
  normal: "text-blue-600",
  high: "text-amber-600",
  urgent: "text-red-600",
};

const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  installation: "Asennus",
  maintenance: "Huolto",
  inspection: "Tarkastus",
  repair: "Korjaus",
  other: "Muu",
};

export { STATUS_LABELS as PROJECT_STATUS_LABELS, STATUS_COLORS as PROJECT_STATUS_COLORS, PRIORITY_LABELS as PROJECT_PRIORITY_LABELS, PRIORITY_COLORS as PROJECT_PRIORITY_COLORS, CATEGORY_LABELS as PROJECT_CATEGORY_LABELS };

// ─── Tabs ───────────────────────────────────────────────────────────────────

const statusTabs: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "Kaikki", value: "all" },
  { label: "Suunnittelu", value: "planning" },
  { label: "Käynnissä", value: "in_progress" },
  { label: "Aikataulutettu", value: "scheduled" },
  { label: "Pysäytetty", value: "on_hold" },
  { label: "Valmis", value: "completed" },
];

// ─── Kanban Column ──────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  projects,
  navigate,
}: {
  status: ProjectStatus;
  projects: Project[];
  navigate: (path: string) => void;
}) {
  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 mb-3">
        <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
        <span className="text-xs text-text-muted">{projects.length}</span>
      </div>
      <div className="space-y-2">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/projektit/${p.id}`)}
            className="w-full text-left bg-surface border border-border rounded-xl p-3 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-muted">#{p.project_number}</span>
              <span className={`text-xs font-medium ${PRIORITY_COLORS[p.priority]}`}>
                {PRIORITY_LABELS[p.priority]}
              </span>
            </div>
            <p className="text-sm font-medium text-text-primary line-clamp-2">{p.title}</p>
            {p.customers && (
              <p className="text-xs text-text-muted mt-1">
                {p.customers.first_name} {p.customers.last_name}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
              {p.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(p.due_date)}
                </span>
              )}
              {p.project_members && p.project_members.length > 0 && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {p.project_members.length}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ProjectList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ProjectStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"table" | "kanban">("table");
  const [memberFilter, setMemberFilter] = useState<string>("");

  const filters: ProjectFilters = {
    status: tab === "all" ? undefined : tab,
    search: search || undefined,
    memberId: memberFilter || undefined,
  };

  const { data: projects, isLoading } = useProjects(filters);
  const { data: employees } = useEmployees();
  const { active, overdue, completedThisWeek } = useProjectStats();

  const kanbanStatuses: ProjectStatus[] = ["planning", "scheduled", "in_progress", "on_hold", "completed"];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Projektit</h1>
        </div>
        <Link
          to="/projektit/uusi"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Uusi projekti
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">Aktiiviset</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{active}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-medium">Myöhässä</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{overdue}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-medium">Valmis tällä viikolla</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{completedThisWeek}</p>
        </div>
      </div>

      {/* Tabs + View toggle */}
      <div className="flex items-center justify-between gap-4 mb-4 min-w-0">
        <div className="flex gap-1 overflow-x-auto pb-1 min-w-0">
          {statusTabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.value
                  ? "bg-brand text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => setView("table")}
            className={`p-1.5 rounded ${view === "table" ? "bg-brand text-white" : "text-text-muted hover:text-text-primary"}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`p-1.5 rounded ${view === "kanban" ? "bg-brand text-white" : "text-text-muted hover:text-text-primary"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search + Member filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Hae projektin nimellä tai numerolla..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-sm pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>
        <select
          value={memberFilter}
          onChange={(e) => setMemberFilter(e.target.value)}
          className="px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        >
          <option value="">Kaikki tiimit</option>
          {employees?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.first_name} {e.last_name}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surface rounded-2xl" />
          ))}
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center">
          <FolderKanban className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">Ei projekteja</p>
        </div>
      ) : view === "kanban" ? (
        /* Kanban */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanStatuses.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              projects={projects.filter((p) => p.status === status)}
              navigate={navigate}
            />
          ))}
        </div>
      ) : (
        /* Table */
        <>
          {/* Desktop */}
          <div className="hidden lg:block bg-surface rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="p-4 font-medium">#</th>
                  <th className="p-4 font-medium">Projekti</th>
                  <th className="p-4 font-medium">Asiakas</th>
                  <th className="p-4 font-medium">Kategoria</th>
                  <th className="p-4 font-medium">Tila</th>
                  <th className="p-4 font-medium">Prioriteetti</th>
                  <th className="p-4 font-medium">Eräpäivä</th>
                  <th className="p-4 font-medium">Tiimi</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const isOverdue =
                    p.due_date &&
                    new Date(p.due_date) < new Date() &&
                    !["completed", "cancelled"].includes(p.status);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/projektit/${p.id}`)}
                      className="border-b border-border last:border-0 hover:bg-surface-hover cursor-pointer transition-colors"
                    >
                      <td className="p-4 text-text-muted">{p.project_number}</td>
                      <td className="p-4 font-medium text-text-primary">{p.title}</td>
                      <td className="p-4 text-text-secondary">
                        {p.customers
                          ? `${p.customers.first_name} ${p.customers.last_name}`
                          : "—"}
                      </td>
                      <td className="p-4 text-text-secondary">{CATEGORY_LABELS[p.category]}</td>
                      <td className="p-4">
                        <Badge className={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                      </td>
                      <td className="p-4">
                        <span className={`font-medium ${PRIORITY_COLORS[p.priority]}`}>
                          {PRIORITY_LABELS[p.priority]}
                        </span>
                      </td>
                      <td className={`p-4 ${isOverdue ? "text-red-600 font-medium" : "text-text-secondary"}`}>
                        {p.due_date ? formatDate(p.due_date) : "—"}
                      </td>
                      <td className="p-4 text-text-secondary">
                        {p.project_members?.length ?? 0} hlö
                      </td>
                      <td className="p-4">
                        <ArrowRight className="w-4 h-4 text-text-muted" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                to={`/projektit/${p.id}`}
                className="block bg-surface border border-border rounded-xl p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-muted">#{p.project_number}</span>
                  <Badge className={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                </div>
                <p className="font-medium text-text-primary mb-1">{p.title}</p>
                {p.customers && (
                  <p className="text-sm text-text-secondary">
                    {p.customers.first_name} {p.customers.last_name}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                  <span>{CATEGORY_LABELS[p.category]}</span>
                  {p.due_date && <span>{formatDate(p.due_date)}</span>}
                  <span className={PRIORITY_COLORS[p.priority]}>{PRIORITY_LABELS[p.priority]}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
