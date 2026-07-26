import { useState } from "react";
import {
  ListChecks,
  Plus,
  Search,
  Trash2,
  CheckSquare,
  Square,
} from "lucide-react";
import {
  useStandaloneTasks,
  useCreateStandaloneTask,
  useUpdateStandaloneTask,
  useDeleteStandaloneTask,
} from "@/hooks/projects/useStandaloneTasks";
import { useEmployees } from "@/hooks/useEmployees";
import { DatePicker } from "@/components/ui/DatePicker";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import TaskDrawer from "@/components/projects/TaskDrawer";
import type { TaskStatus, TaskPriority } from "@/lib/project-types";

// ─── Labels ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Tehtävä",
  in_progress: "Käynnissä",
  review: "Tarkistus",
  done: "Valmis",
  cancelled: "Peruutettu",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-slate-50 text-slate-700 border border-slate-200",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  review: "bg-blue-50 text-blue-700 border border-blue-200",
  done: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Matala",
  normal: "Normaali",
  high: "Korkea",
  urgent: "Kiireellinen",
};

const PRIORITY_DOTS: Record<TaskPriority, string> = {
  low: "bg-slate-300",
  normal: "bg-blue-400",
  high: "bg-amber-400",
  urgent: "bg-red-500",
};

const statusTabs: { label: string; value: TaskStatus | "all" }[] = [
  { label: "Kaikki", value: "all" },
  { label: "Tehtävä", value: "todo" },
  { label: "Käynnissä", value: "in_progress" },
  { label: "Tarkistus", value: "review" },
  { label: "Valmis", value: "done" },
];

export default function Tasks() {
  const [tab, setTab] = useState<TaskStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Quick add state
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [newDueDate, setNewDueDate] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const { data: tasks, isLoading } = useStandaloneTasks({
    status: tab === "all" ? undefined : tab,
    assigneeId: assigneeFilter || undefined,
    search: search || undefined,
  });
  const { data: employees } = useEmployees();
  const createTask = useCreateStandaloneTask();
  const updateTask = useUpdateStandaloneTask();
  const deleteTask = useDeleteStandaloneTask();

  const handleQuickAdd = () => {
    if (!newTitle.trim()) return;
    createTask.mutate({
      title: newTitle.trim(),
      assignee_id: newAssignee || undefined,
      priority: newPriority,
      due_date: newDueDate || undefined,
    } as Parameters<typeof createTask.mutate>[0]);
    setNewTitle("");
    setNewAssignee("");
    setNewPriority("normal");
    setNewDueDate("");
    setShowQuickAdd(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQuickAdd();
    }
    if (e.key === "Escape") {
      setShowQuickAdd(false);
      setNewTitle("");
    }
  };

  const toggleDone = (task: { id: string; status: TaskStatus }) => {
    updateTask.mutate({
      id: task.id,
      status: task.status === "done" ? "todo" : "done",
    });
  };

  // Stats
  const allTasks = tasks ?? [];
  const todoCount = allTasks.filter((t) => t.status === "todo").length;
  const inProgressCount = allTasks.filter((t) => t.status === "in_progress").length;
  const doneCount = allTasks.filter((t) => t.status === "done").length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-accent" />
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Tehtävät</h1>
          </div>
          <p className="text-sm text-text-muted mt-1 sm:mt-0 sm:ml-7">
            {todoCount} avointa · {inProgressCount} käynnissä · {doneCount} valmista
          </p>
        </div>
        <button
          onClick={() => setShowQuickAdd(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Uusi tehtävä
        </button>
      </div>

      {/* Quick add */}
      {showQuickAdd && (
        <div className="bg-surface border border-accent/30 rounded-xl p-4 mb-4 space-y-3">
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tehtävän nimi... (Enter tallentaa, Esc peruuttaa)"
            className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              className="px-2 py-1.5 text-sm border border-border rounded-lg bg-surface focus:outline-none"
            >
              <option value="">Ei vastuuhenkilöä</option>
              {employees?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </option>
              ))}
            </select>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
              className="px-2 py-1.5 text-sm border border-border rounded-lg bg-surface focus:outline-none"
            >
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <DatePicker
              value={newDueDate}
              onChange={setNewDueDate}
              placeholder="Eräpäivä"
            />
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => {
                  setShowQuickAdd(false);
                  setNewTitle("");
                }}
                className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
              >
                Peruuta
              </button>
              <button
                onClick={handleQuickAdd}
                disabled={!newTitle.trim()}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-brand text-white hover:bg-brand-light disabled:opacity-50"
              >
                Lisää
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto mb-4 pb-1">
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Hae tehtäviä..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-sm pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none"
        >
          <option value="">Kaikki henkilöt</option>
          {employees?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.first_name} {e.last_name}
            </option>
          ))}
        </select>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-surface rounded-xl" />
          ))}
        </div>
      ) : !allTasks.length ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center">
          <ListChecks className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">Ei tehtäviä</p>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="mt-3 text-sm text-accent hover:underline"
          >
            Lisää ensimmäinen tehtävä
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {allTasks.map((task) => {
            const isOverdue =
              task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";
            const checklistTotal = task.checklist?.length ?? 0;
            const checklistDone = task.checklist?.filter((c) => c.checked).length ?? 0;

            return (
              <div
                key={task.id}
                className="flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-xl hover:shadow-sm transition-shadow group min-w-0"
              >
                {/* Done toggle */}
                <button
                  onClick={() => toggleDone(task)}
                  className="flex-shrink-0"
                >
                  {task.status === "done" ? (
                    <CheckSquare className="w-5 h-5 text-accent" />
                  ) : (
                    <Square className="w-5 h-5 text-text-muted hover:text-accent transition-colors" />
                  )}
                </button>

                {/* Priority dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOTS[task.priority]}`} />

                {/* Title (clickable to open drawer) */}
                <button
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`flex-1 text-left text-sm truncate min-w-0 ${
                    task.status === "done"
                      ? "line-through text-text-muted"
                      : "text-text-primary hover:text-accent"
                  }`}
                >
                  {task.title}
                </button>

                {/* Checklist progress */}
                {checklistTotal > 0 && (
                  <span className="text-xs text-text-muted flex-shrink-0">
                    {checklistDone}/{checklistTotal}
                  </span>
                )}

                {/* Assignee */}
                {task.assignee && (
                  <span className="hidden sm:inline text-xs text-text-muted flex-shrink-0">
                    {task.assignee.first_name} {task.assignee.last_name?.[0]}.
                  </span>
                )}

                {/* Due date */}
                {task.due_date && (
                  <span
                    className={`hidden sm:inline text-xs flex-shrink-0 ${
                      isOverdue ? "text-red-600 font-medium" : "text-text-muted"
                    }`}
                  >
                    {formatDate(task.due_date)}
                  </span>
                )}

                {/* Status badge (if not todo/done, since those are shown by checkbox) */}
                {task.status !== "todo" && task.status !== "done" && (
                  <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[task.status]}`}>
                    {STATUS_LABELS[task.status]}
                  </Badge>
                )}

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTask.mutate(task.id);
                  }}
                  className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Task drawer for detail view */}
      {selectedTaskId && (
        <TaskDrawer
          taskId={selectedTaskId}
          projectId=""
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
