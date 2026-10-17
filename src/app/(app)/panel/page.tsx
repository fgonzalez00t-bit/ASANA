"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { TaskPanel } from "@/components/task-panel";
import { CheckButton, DueBadge, PriorityBadge } from "@/components/task-fields";
import { useWorkspace } from "@/components/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Project, Task } from "@/lib/types";
import { displayName, dueBucket } from "@/lib/utils";

type PanelTask = Task & { project: Pick<Project, "id" | "name" | "color" | "workspace_id"> };
type Status = "pendientes" | "completadas" | "todas";

const UNASSIGNED = "sin-asignar";

export default function TeamPanelPage() {
  const supabase = useMemo(() => createClient(), []);
  const { workspace, members, isAdmin } = useWorkspace();
  const [tasks, setTasks] = useState<PanelTask[]>([]);
  const [status, setStatus] = useState<Status>("pendientes");
  const [person, setPerson] = useState<string>("todas");
  const [openTask, setOpenTask] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    let q = supabase
      .from("tasks")
      .select("*, project:projects!inner(id, name, color, workspace_id)")
      .eq("project.workspace_id", workspace.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("position");
    if (status === "pendientes") q = q.eq("completed", false);
    if (status === "completadas") q = q.eq("completed", true);
    const { data } = await q;
    setTasks((data as PanelTask[]) ?? []);
  }, [supabase, workspace, status]);

  useEffect(() => {
    void load();
  }, [load]);

  // Se actualiza solo cuando alguien del equipo cambia una tarea.
  useEffect(() => {
    const channel = supabase
      .channel("panel-equipo")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const groups = useMemo(() => {
    const people: { id: string; profile: Profile | null }[] = [
      ...members.map((m) => ({ id: m.user_id, profile: m.profile })),
      { id: UNASSIGNED, profile: null },
    ];
    return people
      .filter((p) => person === "todas" || p.id === person)
      .map((p) => {
        const list = tasks.filter((t) => (t.assignee_id ?? UNASSIGNED) === p.id);
        const pending = list.filter((t) => !t.completed);
        return {
          ...p,
          tasks: list,
          pending: pending.length,
          overdue: pending.filter((t) => dueBucket(t.due_date) === "vencidas").length,
        };
      })
      .filter((g) => g.tasks.length > 0 || (g.id !== UNASSIGNED && person !== "todas"));
  }, [members, tasks, person]);

  if (!isAdmin) {
    return <p className="p-6 text-sm text-slate-500">Este panel es solo para la dueña y las administradoras.</p>;
  }

  async function toggle(t: PanelTask) {
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)));
    await supabase.from("tasks").update({ completed: !t.completed }).eq("id", t.id);
  }

  const totalPending = tasks.filter((t) => !t.completed).length;
  const totalOverdue = tasks.filter((t) => !t.completed && dueBucket(t.due_date) === "vencidas").length;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="mb-1 text-2xl font-semibold">Panel del equipo</h1>
      <p className="mb-6 text-sm text-slate-500">Todas las tareas de tus colaboradoras, agrupadas por persona.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pendientes" value={totalPending} />
        <Stat label="Vencidas" value={totalOverdue} danger={totalOverdue > 0} />
        <Stat label="Colaboradoras" value={members.filter((m) => m.role !== "owner").length} />
        <Stat label="Sin asignar" value={tasks.filter((t) => !t.assignee_id && !t.completed).length} />
      </div>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <select className="input sm:w-64" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="todas">Todas las personas</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {displayName(m.profile)}
            </option>
          ))}
          <option value={UNASSIGNED}>Sin asignar</option>
        </select>
        <select className="input sm:w-48" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          <option value="pendientes">Pendientes</option>
          <option value="completadas">Completadas</option>
          <option value="todas">Todas</option>
        </select>
      </div>

      {groups.length === 0 && <p className="text-sm text-slate-400">No hay tareas para mostrar.</p>}

      {groups.map((g) => (
        <section key={g.id} className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Avatar profile={g.profile} size="sm" />
            {g.id === UNASSIGNED ? "Sin asignar" : displayName(g.profile)}
            <span className="font-normal text-slate-400">
              {g.pending} pendientes{g.overdue > 0 && <span className="text-rose-600"> · {g.overdue} vencidas</span>}
            </span>
          </h2>
          {g.tasks.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400">Sin tareas.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
              {g.tasks.map((t) => (
                <li key={t.id} onClick={() => setOpenTask(t.id)} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                  <CheckButton task={t} onToggle={() => toggle(t)} />
                  {t.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />}
                  <span className={`min-w-0 flex-1 truncate text-sm ${t.completed ? "text-slate-400 line-through" : ""}`}>
                    {t.parent_task_id && <span className="text-slate-400">↳ </span>}
                    {t.title}
                  </span>
                  <PriorityBadge priority={t.priority} />
                  <span className="hidden items-center gap-1 text-xs text-slate-500 sm:flex">
                    <span className="h-2 w-2 rounded-sm" style={{ background: t.project.color }} />
                    {t.project.name}
                  </span>
                  <DueBadge date={t.due_date} completed={t.completed} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {openTask && <TaskPanel taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold ${danger ? "text-rose-600" : ""}`}>{value}</p>
    </div>
  );
}
