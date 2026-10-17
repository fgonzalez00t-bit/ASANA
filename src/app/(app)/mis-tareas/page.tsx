"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TaskPanel } from "@/components/task-panel";
import { CheckButton, DueBadge, PriorityBadge } from "@/components/task-fields";
import { useWorkspace } from "@/components/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import type { Project, Task } from "@/lib/types";
import { dueBucket, positionBetween } from "@/lib/utils";

type MyTask = Task & { project: Pick<Project, "id" | "name" | "color" | "workspace_id"> };

const GROUPS = [
  { key: "vencidas", label: "Vencidas" },
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Próximos 7 días" },
  { key: "despues", label: "Más adelante" },
  { key: "sin-fecha", label: "Sin fecha" },
] as const;

export default function MyTasksPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, workspace, projects } = useWorkspace();
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");

  const load = useCallback(async () => {
    if (!workspace) return;
    let q = supabase
      .from("tasks")
      .select("*, project:projects!inner(id, name, color, workspace_id)")
      .eq("assignee_id", me.id)
      .eq("project.workspace_id", workspace.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("position");
    if (!showCompleted) q = q.eq("completed", false);
    const { data } = await q;
    setTasks((data as MyTask[]) ?? []);
  }, [supabase, me.id, workspace, showCompleted]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects, projectId]);

  async function toggle(t: MyTask) {
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)));
    await supabase.from("tasks").update({ completed: !t.completed }).eq("id", t.id);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    const { data: first } = await supabase.from("sections").select("id").eq("project_id", projectId).order("position").limit(1);
    const { error } = await supabase.from("tasks").insert({
      project_id: projectId,
      section_id: first?.[0]?.id ?? null,
      title: title.trim(),
      assignee_id: me.id,
      created_by: me.id,
      position: positionBetween(),
    });
    if (error) return alert(error.message);
    setTitle("");
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mis tareas</h1>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
          Mostrar completadas
        </label>
      </div>

      {projects.length > 0 ? (
        <form onSubmit={add} className="mb-6 flex flex-col gap-2 sm:flex-row">
          <input className="input flex-1" placeholder="Nueva tarea para mí..." value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="input sm:w-48" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn-primary">Agregar</button>
        </form>
      ) : (
        <p className="mb-6 rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Todavía no hay proyectos. Crea uno desde el menú con el botón + junto a &quot;Proyectos&quot;.
        </p>
      )}

      {tasks.length === 0 && <p className="text-sm text-slate-400">No tienes tareas pendientes asignadas.</p>}

      {GROUPS.map((g) => {
        const list = tasks.filter((t) => dueBucket(t.due_date) === g.key);
        if (list.length === 0) return null;
        return (
          <section key={g.key} className="mb-6">
            <h2 className={`mb-2 text-sm font-semibold ${g.key === "vencidas" ? "text-rose-600" : "text-slate-600"}`}>
              {g.label} <span className="font-normal text-slate-400">{list.length}</span>
            </h2>
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
              {list.map((t) => (
                <li key={t.id} onClick={() => setOpenTask(t.id)} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                  <CheckButton task={t} onToggle={() => toggle(t)} />
                  <span className={`min-w-0 flex-1 truncate text-sm ${t.completed ? "text-slate-400 line-through" : ""}`}>{t.title}</span>
                  <PriorityBadge priority={t.priority} />
                  <Link
                    href={`/proyecto/${t.project.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hidden items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 sm:flex"
                  >
                    <span className="h-2 w-2 rounded-sm" style={{ background: t.project.color }} />
                    {t.project.name}
                  </Link>
                  <DueBadge date={t.due_date} completed={t.completed} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {openTask && <TaskPanel taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />}
    </div>
  );
}
