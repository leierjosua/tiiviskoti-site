import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  FolderKanban,
  Plus,
  UserPlus,
  FileUp,
  Trash2,
  Calendar,
  DollarSign,
  MessageSquare,
  Activity,
  Paperclip,
  ListTodo,
  X,
  Save,
} from "lucide-react";
import { useProjectDetail, useUpdateProject } from "@/hooks/projects/useProjectDetail";
import { useDeleteProject } from "@/hooks/projects/useProjects";
import { useConfirm } from "@/context/ConfirmContext";
import { useProjectTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/projects/useProjectTasks";
import { useAddProjectMember, useRemoveProjectMember } from "@/hooks/projects/useProjectMembers";
import { useProjectActivity, useProjectNotes, useAddProjectNote } from "@/hooks/projects/useProjectActivity";
import { useProjectFiles, useUploadProjectFile, useDeleteProjectFile } from "@/hooks/projects/useProjectFiles";
import { useEmployees } from "@/hooks/useEmployees";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatCents } from "@/lib/utils";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_PRIORITY_COLORS,
  PROJECT_CATEGORY_LABELS,
} from "./ProjectList";
import TaskDrawer from "@/components/projects/TaskDrawer";
import type { ProjectStatus, ProjectPriority, TaskStatus } from "@/lib/project-types";

// ─── Task Status Labels ─────────────────────────────────────────────────────

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Tehtävä",
  in_progress: "Käynnissä",
  review: "Tarkistus",
  done: "Valmis",
  cancelled: "Peruutettu",
};

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-slate-50 text-slate-700 border border-slate-200",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  review: "bg-blue-50 text-blue-700 border border-blue-200",
  done: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
};

// ─── Activity Labels ────────────────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  created: "Projekti luotu",
  status_changed: "Tila muuttui",
  task_status_changed: "Tehtävän tila muuttui",
  task_created: "Tehtävä luotu",
  member_added: "Jäsen lisätty",
  note_added: "Muistiinpano lisätty",
  file_added: "Tiedosto lisätty",
};

// ─── Status progression ─────────────────────────────────────────────────────

const STATUS_STEPS: ProjectStatus[] = ["planning", "scheduled", "in_progress", "completed"];

// ─── Tabs ───────────────────────────────────────────────────────────────────

type Tab = "tasks" | "activity" | "notes" | "files";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: project, isLoading } = useProjectDetail(id);
  const { data: tasks } = useProjectTasks(id);
  const { data: activity } = useProjectActivity(id);
  const { data: notes } = useProjectNotes(id);
  const { data: files } = useProjectFiles(id);
  const { data: employees } = useEmployees();

  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const confirm = useConfirm();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const addMember = useAddProjectMember();
  const removeMember = useRemoveProjectMember();
  const addNote = useAddProjectNote();
  const uploadFile = useUploadProjectFile();
  const deleteFile = useDeleteProjectFile();

  const [tab, setTab] = useState<Tab>("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [taskViewMode, setTaskViewMode] = useState<"list" | "kanban">("list");

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-surface rounded w-1/3" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Projektia ei löydy</p>
        <Link to="/projektit" className="text-accent hover:underline text-sm mt-2 inline-block">
          Takaisin projekteihin
        </Link>
      </div>
    );
  }

  const members = project.project_members ?? [];
  const existingMemberIds = members.map((m) => m.employee_id);
  const availableEmployees = employees?.filter((e) => e.active !== false && !existingMemberIds.includes(e.id)) ?? [];

  const handleAddTask = () => {
    if (!newTaskTitle.trim() || !id) return;
    createTask.mutate({ project_id: id, title: newTaskTitle.trim() });
    setNewTaskTitle("");
  };

  const handleAddNote = () => {
    if (!noteText.trim() || !id) return;
    addNote.mutate({ projectId: id, content: noteText.trim() });
    setNoteText("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    uploadFile.mutate({ projectId: id, file });
    e.target.value = "";
  };

  const handleDeleteProject = async () => {
    const ok = await confirm({
      title: "Poista projekti",
      message: `Haluatko varmasti poistaa projektin "${project.title}"? Kaikki tehtävät, muistiinpanot ja tiedostot poistetaan pysyvästi.`,
      confirmLabel: "Poista",
      variant: "danger",
    });
    if (!ok) return;
    await deleteProject.mutateAsync(project.id);
    navigate("/projektit");
  };

  const handleSaveEdit = () => {
    updateProject.mutate({
      id: project.id,
      title: editTitle,
      description: editDescription || null,
    });
    setEditing(false);
  };

  const currentStepIndex = STATUS_STEPS.indexOf(project.status);

  // Group tasks by status for kanban
  const tasksByStatus: Record<TaskStatus, typeof tasks> = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
    cancelled: [],
  };
  tasks?.forEach((t) => {
    if (!t.parent_task_id) tasksByStatus[t.status]?.push(t);
  });

  const tabItems: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "tasks", label: "Tehtävät", icon: ListTodo, count: tasks?.length },
    { key: "activity", label: "Aikajana", icon: Activity, count: activity?.length },
    { key: "notes", label: "Muistiinpanot", icon: MessageSquare, count: notes?.length },
    { key: "files", label: "Tiedostot", icon: Paperclip, count: files?.length },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 min-w-0">
        <button
          onClick={() => navigate("/projektit")}
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </button>
        <FolderKanban className="w-5 h-5 text-accent flex-shrink-0" />
        <span className="text-sm text-text-muted flex-shrink-0">#{project.project_number}</span>
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-xl font-bold text-text-primary flex-1 px-2 py-1 border border-accent rounded-lg focus:outline-none"
            />
            <button onClick={handleSaveEdit} className="p-1.5 rounded-lg bg-accent text-white">
              <Save className="w-4 h-4" />
            </button>
            <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg hover:bg-surface-hover">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        ) : (
          <>
            <h1
              className="text-xl font-bold text-text-primary cursor-pointer hover:text-accent flex-1 truncate min-w-0"
              onClick={() => {
                setEditTitle(project.title);
                setEditDescription(project.description ?? "");
                setEditing(true);
              }}
            >
              {project.title}
            </h1>
            <button
              onClick={handleDeleteProject}
              className="ml-auto p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
              title="Poista projekti"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left Column ─────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Status progression */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">Eteneminen</h3>
            <div className="flex items-center gap-1 mb-4">
              {STATUS_STEPS.map((s, i) => (
                <button
                  key={s}
                  onClick={() => updateProject.mutate({ id: project.id, status: s })}
                  className={`flex-1 h-2 rounded-full transition-colors ${
                    i <= currentStepIndex ? "bg-accent" : "bg-border"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                {PROJECT_STATUS_LABELS[project.status]}
              </Badge>
              <select
                value={project.status}
                onChange={(e) =>
                  updateProject.mutate({ id: project.id, status: e.target.value as ProjectStatus })
                }
                className="text-xs px-2 py-1 border border-border rounded-lg bg-surface focus:outline-none"
              >
                {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Details */}
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-text-muted uppercase">Tiedot</h3>

            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Kategoria</span>
              <span className="text-text-primary">{PROJECT_CATEGORY_LABELS[project.category]}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Prioriteetti</span>
              <select
                value={project.priority}
                onChange={(e) =>
                  updateProject.mutate({ id: project.id, priority: e.target.value as ProjectPriority })
                }
                className={`text-sm font-medium px-2 py-0.5 rounded border-0 bg-transparent focus:outline-none ${PROJECT_PRIORITY_COLORS[project.priority]}`}
              >
                {Object.entries(PROJECT_PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {project.customers && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Asiakas</span>
                <Link to={`/asiakkaat/${project.customer_id}`} className="text-accent hover:underline">
                  {project.customers.first_name} {project.customers.last_name}
                </Link>
              </div>
            )}

            {project.start_date && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Alkupäivä
                </span>
                <span className="text-text-primary">{formatDate(project.start_date)}</span>
              </div>
            )}

            {project.due_date && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Eräpäivä
                </span>
                <span
                  className={
                    new Date(project.due_date) < new Date() && !["completed", "cancelled"].includes(project.status)
                      ? "text-red-600 font-medium"
                      : "text-text-primary"
                  }
                >
                  {formatDate(project.due_date)}
                </span>
              </div>
            )}

            {project.budget_cents != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Budjetti
                </span>
                <span className="text-text-primary">{formatCents(project.budget_cents)}</span>
              </div>
            )}

            {project.description && (
              <div className="pt-2 border-t border-border">
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{project.description}</p>
              </div>
            )}
          </div>

          {/* Team */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-text-muted uppercase">Tiimi</h3>
              <button
                onClick={() => setShowAddMember(!showAddMember)}
                className="p-1 rounded hover:bg-surface-hover"
              >
                <UserPlus className="w-4 h-4 text-accent" />
              </button>
            </div>

            {showAddMember && availableEmployees.length > 0 && (
              <div className="mb-3 max-h-32 overflow-y-auto border border-border rounded-lg">
                {availableEmployees.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      addMember.mutate({ projectId: project.id, employeeId: e.id });
                      setShowAddMember(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-hover"
                  >
                    {e.first_name} {e.last_name}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-bold">
                      {m.employees?.first_name?.[0]}
                      {m.employees?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm text-text-primary">
                        {m.employees?.first_name} {m.employees?.last_name}
                      </p>
                      <p className="text-xs text-text-muted capitalize">{m.role === "lead" ? "Vetäjä" : m.role === "observer" ? "Tarkkailija" : "Jäsen"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeMember.mutate({ id: m.id, projectId: project.id })}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50"
                  >
                    <X className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))}
              {members.length === 0 && <p className="text-xs text-text-muted">Ei jäseniä</p>}
            </div>
          </div>

          {/* Tags */}
          {project.projects_tags && project.projects_tags.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Tagit</h3>
              <div className="flex flex-wrap gap-1.5">
                {project.projects_tags.map((pt) => (
                  <span
                    key={pt.tag_id}
                    className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: pt.project_tags.color }}
                  >
                    {pt.project_tags.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Right Column ────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
            {tabItems.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? "border-accent text-accent"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="text-xs bg-surface-hover rounded-full px-1.5">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* ─── Tasks Tab ─────────────────────────────────────────────── */}
          {tab === "tasks" && (
            <div>
              {/* Add task */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                  placeholder="Uusi tehtävä..."
                  className="flex-1 px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                <button
                  onClick={handleAddTask}
                  disabled={!newTaskTitle.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* View mode toggle */}
              <div className="flex justify-end mb-3">
                <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
                  <button
                    onClick={() => setTaskViewMode("list")}
                    className={`px-2 py-1 text-xs rounded ${taskViewMode === "list" ? "bg-brand text-white" : "text-text-muted"}`}
                  >
                    Lista
                  </button>
                  <button
                    onClick={() => setTaskViewMode("kanban")}
                    className={`px-2 py-1 text-xs rounded ${taskViewMode === "kanban" ? "bg-brand text-white" : "text-text-muted"}`}
                  >
                    Kanban
                  </button>
                </div>
              </div>

              {taskViewMode === "list" ? (
                /* List view */
                <div className="space-y-1">
                  {tasks && tasks.length > 0 ? (
                    tasks
                      .filter((t) => !t.parent_task_id)
                      .map((task) => (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          className="flex items-center gap-3 p-3 bg-surface border border-border rounded-xl hover:shadow-sm cursor-pointer transition-shadow min-w-0"
                        >
                          <select
                            value={task.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateTask.mutate({
                                id: task.id,
                                project_id: project.id,
                                status: e.target.value as TaskStatus,
                              });
                            }}
                            className="text-xs px-1.5 py-0.5 border border-border rounded bg-surface focus:outline-none"
                          >
                            {Object.entries(TASK_STATUS_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>

                          <span className="flex-1 text-sm text-text-primary truncate min-w-0">{task.title}</span>

                          {task.assignee && (
                            <span className="text-xs text-text-muted">
                              {task.assignee.first_name} {task.assignee.last_name?.[0]}.
                            </span>
                          )}

                          {task.due_date && (
                            <span
                              className={`text-xs ${
                                new Date(task.due_date) < new Date() && task.status !== "done"
                                  ? "text-red-600"
                                  : "text-text-muted"
                              }`}
                            >
                              {formatDate(task.due_date)}
                            </span>
                          )}

                          {task.checklist && task.checklist.length > 0 && (
                            <span className="text-xs text-text-muted">
                              {task.checklist.filter((c) => c.checked).length}/{task.checklist.length}
                            </span>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTask.mutate({ id: task.id, project_id: project.id });
                            }}
                            className="p-1 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-8 text-text-muted text-sm">
                      Ei tehtäviä. Lisää ensimmäinen tehtävä yllä.
                    </div>
                  )}
                </div>
              ) : (
                /* Kanban view */
                <div className="flex gap-3 overflow-x-auto pb-4">
                  {(["todo", "in_progress", "review", "done"] as TaskStatus[]).map((status) => (
                    <div key={status} className="flex-shrink-0 w-60">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={TASK_STATUS_COLORS[status]}>
                          {TASK_STATUS_LABELS[status]}
                        </Badge>
                        <span className="text-xs text-text-muted">{tasksByStatus[status]?.length ?? 0}</span>
                      </div>
                      <div className="space-y-2">
                        {tasksByStatus[status]?.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            className="w-full text-left bg-surface border border-border rounded-lg p-2.5 hover:shadow-sm transition-shadow"
                          >
                            <p className="text-sm text-text-primary">{task.title}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {task.assignee && (
                                <span className="text-xs text-text-muted">
                                  {task.assignee.first_name} {task.assignee.last_name?.[0]}.
                                </span>
                              )}
                              {task.due_date && (
                                <span className="text-xs text-text-muted">{formatDate(task.due_date)}</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Activity Tab ──────────────────────────────────────────── */}
          {tab === "activity" && (
            <div className="space-y-3">
              {activity && activity.length > 0 ? (
                activity.map((a) => (
                  <div key={a.id} className="flex gap-3 items-start">
                    <div className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-text-primary">
                        {ACTIVITY_LABELS[a.action] ?? a.action}
                        {!!a.details?.task_title && (
                          <span className="text-text-muted"> — {String(a.details.task_title)}</span>
                        )}
                        {!!a.details?.old_status && !!a.details?.new_status && (
                          <span className="text-text-muted">
                            {" "}
                            ({String(a.details.old_status)} → {String(a.details.new_status)})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-text-muted">{formatDateTime(a.created_at)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-muted text-center py-8">Ei aktiviteettia vielä</p>
              )}
            </div>
          )}

          {/* ─── Notes Tab ─────────────────────────────────────────────── */}
          {tab === "notes" && (
            <div>
              <div className="flex gap-2 mb-4">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Kirjoita muistiinpano..."
                  rows={3}
                  className="flex-1 px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                />
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || addNote.isPending}
                  className="self-end px-4 py-2 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light disabled:opacity-50"
                >
                  Lisää
                </button>
              </div>
              <div className="space-y-3">
                {notes && notes.length > 0 ? (
                  notes.map((n) => (
                    <div key={n.id} className="bg-surface border border-border rounded-xl p-4">
                      <p className="text-sm text-text-primary whitespace-pre-wrap">{n.content}</p>
                      <p className="text-xs text-text-muted mt-2">{formatDateTime(n.created_at)}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-muted text-center py-8">Ei muistiinpanoja</p>
                )}
              </div>
            </div>
          )}

          {/* ─── Files Tab ─────────────────────────────────────────────── */}
          {tab === "files" && (
            <div>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors mb-4">
                <FileUp className="w-4 h-4" />
                Lataa tiedosto
                <input type="file" onChange={handleFileUpload} className="hidden" />
              </label>

              <div className="space-y-2">
                {files && files.length > 0 ? (
                  files.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between bg-surface border border-border rounded-xl p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Paperclip className="w-4 h-4 text-text-muted" />
                        <div>
                          <p className="text-sm text-text-primary">{f.file_name}</p>
                          <p className="text-xs text-text-muted">
                            {f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ""} —{" "}
                            {formatDateTime(f.created_at)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          deleteFile.mutate({
                            id: f.id,
                            projectId: project.id,
                            filePath: f.file_path,
                          })
                        }
                        className="p-1 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-muted text-center py-8">Ei tiedostoja</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Task Drawer */}
      {selectedTaskId && (
        <TaskDrawer
          taskId={selectedTaskId}
          projectId={project.id}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
