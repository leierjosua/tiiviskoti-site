import { useState } from "react";
import {
  X,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Clock,
  User,
  Calendar,
  Send,
  MessageSquare,
} from "lucide-react";
import { useTaskDetail, useUpdateTask, useToggleChecklistItem, useAddChecklistItem, useDeleteChecklistItem, useAddTaskComment } from "@/hooks/projects/useProjectTasks";
import { DatePicker } from "@/components/ui/DatePicker";
import { useEmployees } from "@/hooks/useEmployees";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TaskStatus, TaskPriority } from "@/lib/project-types";

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

interface TaskDrawerProps {
  taskId: string;
  projectId?: string | null;
  onClose: () => void;
}

export default function TaskDrawer({ taskId, projectId, onClose }: TaskDrawerProps) {
  const { data: task, isLoading } = useTaskDetail(taskId);
  const { data: employees } = useEmployees();
  const updateTask = useUpdateTask();
  const toggleChecklist = useToggleChecklistItem();
  const addChecklistItem = useAddChecklistItem();
  const deleteChecklistItem = useDeleteChecklistItem();
  const addComment = useAddTaskComment();

  const [newCheckItem, setNewCheckItem] = useState("");
  const [newComment, setNewComment] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");

  if (isLoading || !task) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative w-full max-w-[100vw] sm:max-w-lg bg-surface h-full shadow-xl p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-surface rounded w-2/3" />
            <div className="h-4 bg-surface rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  const handleStatusChange = (status: TaskStatus) => {
    updateTask.mutate({ id: taskId, project_id: projectId || null, status });
  };

  const handleAssigneeChange = (assignee_id: string) => {
    updateTask.mutate({
      id: taskId,
      project_id: projectId || null,
      assignee_id: assignee_id || null,
    });
  };

  const handlePriorityChange = (priority: TaskPriority) => {
    updateTask.mutate({ id: taskId, project_id: projectId || null, priority });
  };

  const handleDueDateChange = (due_date: string) => {
    updateTask.mutate({
      id: taskId,
      project_id: projectId || null,
      due_date: due_date || null,
    });
  };

  const handleTitleSave = () => {
    if (titleValue.trim() && titleValue !== task.title) {
      updateTask.mutate({ id: taskId, project_id: projectId || null, title: titleValue.trim() });
    }
    setEditingTitle(false);
  };

  const handleAddCheckItem = () => {
    if (!newCheckItem.trim()) return;
    addChecklistItem.mutate({ taskId, label: newCheckItem.trim() });
    setNewCheckItem("");
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    addComment.mutate({ taskId, content: newComment.trim() });
    setNewComment("");
  };

  const checklist = task.checklist ?? [];
  const comments = task.comments ?? [];
  const checkedCount = checklist.filter((c) => c.checked).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[100vw] sm:max-w-lg bg-surface h-full shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-center justify-between">
          <Badge className={STATUS_COLORS[task.status]}>{STATUS_LABELS[task.status]}</Badge>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Title */}
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
              className="w-full text-lg font-semibold text-text-primary px-2 py-1 border border-accent rounded-lg focus:outline-none"
            />
          ) : (
            <h2
              onClick={() => {
                setTitleValue(task.title);
                setEditingTitle(true);
              }}
              className="text-lg font-semibold text-text-primary cursor-pointer hover:text-accent"
            >
              {task.title}
            </h2>
          )}

          {/* Description */}
          {task.description && (
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{task.description}</p>
          )}

          {/* Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Tila</label>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">Prioriteetti</label>
              <select
                value={task.priority}
                onChange={(e) => handlePriorityChange(e.target.value as TaskPriority)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 flex items-center gap-1">
                <User className="w-3 h-3" />
                Vastuuhenkilö
              </label>
              <select
                value={task.assignee_id ?? ""}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="">Ei valittu</option>
                {employees?.filter((e) => e.active !== false).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Eräpäivä
              </label>
              <DatePicker
                value={task.due_date ?? ""}
                onChange={handleDueDateChange}
                placeholder="Valitse päivä"
                className="w-full"
              />
            </div>
          </div>

          {/* Time tracking */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Arvio: {task.estimated_hours ?? "—"} h</span>
            </div>
            <div>Toteutunut: {task.actual_hours ?? 0} h</div>
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4" />
                Tarkistuslista
                {checklist.length > 0 && (
                  <span className="text-xs text-text-muted font-normal">
                    ({checkedCount}/{checklist.length})
                  </span>
                )}
              </h3>
            </div>

            {/* Progress bar */}
            {checklist.length > 0 && (
              <div className="w-full h-1.5 bg-border rounded-full mb-3">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${(checkedCount / checklist.length) * 100}%` }}
                />
              </div>
            )}

            <div className="space-y-1">
              {[...checklist]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() =>
                        toggleChecklist.mutate({ id: item.id, checked: !item.checked, taskId })
                      }
                      className="flex-shrink-0"
                    >
                      {item.checked ? (
                        <CheckSquare className="w-4 h-4 text-accent" />
                      ) : (
                        <Square className="w-4 h-4 text-text-muted" />
                      )}
                    </button>
                    <span
                      className={`text-sm flex-1 ${item.checked ? "line-through text-text-muted" : "text-text-primary"}`}
                    >
                      {item.label}
                    </span>
                    <button
                      onClick={() => deleteChecklistItem.mutate({ id: item.id, taskId })}
                      className="opacity-0 group-hover:opacity-100 p-0.5"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                ))}
            </div>

            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCheckItem()}
                placeholder="Lisää kohta..."
                className="flex-1 px-2 py-1.5 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <button
                onClick={handleAddCheckItem}
                disabled={!newCheckItem.trim()}
                className="p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Comments */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 mb-3">
              <MessageSquare className="w-4 h-4" />
              Kommentit ({comments.length})
            </h3>

            <div className="space-y-3 mb-3">
              {comments.map((c) => (
                <div key={c.id} className="bg-surface rounded-lg p-3">
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{c.content}</p>
                  <p className="text-xs text-text-muted mt-1">{formatDateTime(c.created_at)}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Kirjoita kommentti..."
                rows={2}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim() || addComment.isPending}
                className="self-end p-2 rounded-lg bg-brand text-white hover:bg-brand-light disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
