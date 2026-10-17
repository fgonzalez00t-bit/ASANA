export type Role = "owner" | "admin" | "member";
export type Priority = "baja" | "media" | "alta";

export type Profile = { id: string; email: string; full_name: string | null };

export type Workspace = { id: string; name: string; owner_id: string };

export type Member = { user_id: string; role: Role; profile: Profile };

export type Project = { id: string; workspace_id: string; name: string; color: string };

export type Section = { id: string; project_id: string; name: string; position: number };

export type Task = {
  id: string;
  project_id: string;
  section_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: Priority | null;
  completed: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
};

export type Comment = {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Dueña",
  admin: "Administradora",
  member: "Miembro",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export const PRIORITY_CLASS: Record<Priority, string> = {
  baja: "bg-sky-100 text-sky-800",
  media: "bg-amber-100 text-amber-800",
  alta: "bg-rose-100 text-rose-800",
};

export const PROJECT_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ef4444", "#64748b"];

export type Attachment = {
  id: string;
  task_id: string;
  uploaded_by: string | null;
  file_name: string;
  path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};
