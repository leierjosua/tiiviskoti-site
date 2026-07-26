// ─── Project Types ───────────────────────────────────────────────────────────

// ─── Enums ──────────────────────────────────────────────────────────────────

export type ProjectStatus = "planning" | "scheduled" | "in_progress" | "on_hold" | "completed" | "cancelled";
export type ProjectPriority = "low" | "normal" | "high" | "urgent";
export type ProjectCategory = "installation" | "maintenance" | "inspection" | "repair" | "other";
export type ProjectMemberRole = "lead" | "member" | "observer";
export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

// ─── Core Entities ──────────────────────────────────────────────────────────

export interface Project {
  id: string;
  project_number: number;
  title: string;
  description: string | null;
  customer_id: string | null;
  booking_id: string | null;
  opportunity_id: string | null;
  contract_id: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  category: ProjectCategory;
  budget_cents: number | null;
  actual_cost_cents: number;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  customers?: { id: string; first_name: string; last_name: string; email: string };
  project_members?: ProjectMember[];
  project_tasks?: ProjectTask[];
  projects_tags?: { tag_id: string; project_tags: ProjectTag }[];
}

export interface ProjectMember {
  id: string;
  project_id: string;
  employee_id: string;
  role: ProjectMemberRole;
  created_at: string;
  employees?: { id: string; first_name: string; last_name: string; email: string };
}

export interface ProjectTask {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  reporter_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  parent_task_id: string | null;
  estimated_hours: number | null;
  actual_hours: number;
  created_at: string;
  updated_at: string;
  // Relations
  assignee?: { id: string; first_name: string; last_name: string };
  reporter?: { id: string; first_name: string; last_name: string };
  checklist?: TaskChecklistItem[];
  comments?: TaskComment[];
  subtasks?: ProjectTask[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  label: string;
  checked: boolean;
  sort_order: number;
}

export interface ProjectNote {
  id: string;
  project_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface ProjectActivityLog {
  id: string;
  project_id: string;
  task_id: string | null;
  action: string;
  actor_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  task_id: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  category: ProjectCategory;
  default_tasks: {
    title: string;
    description?: string;
    checklist?: string[];
    estimated_hours?: number;
  }[];
  created_at: string;
}

export interface ProjectTag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}
