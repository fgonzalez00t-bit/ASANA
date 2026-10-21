"use client";

import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { TaskPanel } from "@/components/task-panel";
import { useProjectPeople } from "@/components/project-people";
import { CheckButton, PriorityBadge } from "@/components/task-fields";
import { useWorkspace } from "@/components/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Project, Task } from "@/lib/types";
import { displayName, positionBetween } from "@/lib/utils";

type CalTask = Task & { project: Pick<Project, "id" | "name" | "color" | "workspace_id"> };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Días visibles: semanas completas de lunes a domingo que cubren el mes.
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const end = new Date(year, month, last.getDate() + 6 - ((last.getDay() + 6) % 7));
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  return days;
}

// Calendario del mes. Con projectId muestra solo las tareas de ese proyecto.
export function MonthCalendar({ projectId: fixedProject }: { projectId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { me, workspace, projects, members } = useWorkspace();
  const today = iso(new Date());
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [selected, setSelected] = useState<string>(today);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [quickAdd, setQuickAdd] = useState(false);
  const { people } = useProjectPeople(projectId);
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const days = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const from = iso(days[0]!);
  const to = iso(days[days.length - 1]!);

  const load = useCallback(async () => {
    if (!workspace) return;
    let q = supabase
      .from("tasks")
      .select("*, project:projects!inner(id, name, color, workspace_id)")
      .eq("project.workspace_id", workspace.id)
      .gte("due_date", from)
      .lte("due_date", to)
      .order("position");
    if (fixedProject) q = q.eq("project_id", fixedProject);
    if (onlyMine) q = q.eq("assignee_id", me.id);
    if (!showCompleted) q = q.eq("completed", false);
    const { data } = await q;
    setTasks((data as CalTask[]) ?? []);
  }, [supabase, workspace, from, to, onlyMine, showCompleted, me.id, fixedProject]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (fixedProject) setProjectId(fixedProject);
    else if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects, projectId, fixedProject]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalTask[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const list = map.get(t.due_date) ?? [];
      list.push(t);
      map.set(t.due_date, list);
    }
    return map;
  }, [tasks]);

  const profileOf = (id: string | null) => members.find((m) => m.user_id === id)?.profile ?? null;

  function move(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToday() {
    const n = new Date();
    setCursor({ year: n.getFullYear(), month: n.getMonth() });
    setSelected(today);
  }

  async function toggle(t: CalTask) {
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
      due_date: selected,
      assignee_id: assigneeId || null,
      created_by: me.id,
      position: positionBetween(),
    });
    if (error) return alert(error.message);
    setTitle("");
    setQuickAdd(false);
    await load();
  }

  // Arrastrar una tarea a otro día le cambia la fecha.
  async function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const task = tasks.find((t) => t.id === active.id);
    const day = over ? String(over.id) : null;
    if (!task || !day || task.due_date === day) return;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, due_date: day } : t)));
    const { error } = await supabase.from("tasks").update({ due_date: day }).eq("id", task.id);
    if (error) {
      alert("No se pudo cambiar la fecha: " + error.message);
      await load();
    }
  }

  function openQuickAdd(day: string) {
    setSelected(day);
    setTitle("");
    setAssigneeId(me.id);
    setQuickAdd(true);
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  const [sy, sm, sd] = selected.split("-").map(Number);
  const selectedLabel = new Date(sy!, sm! - 1, sd!).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const selectedTasks = byDay.get(selected) ?? [];
  const draggingTask = dragging ? tasks.find((t) => t.id === dragging) : undefined;

  return (
    <div className={fixedProject ? "p-4" : "mx-auto max-w-6xl p-4 md:p-8"}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className={`mr-auto font-semibold capitalize ${fixedProject ? "text-lg" : "text-2xl"}`}>{monthLabel}</h1>
        <button className="btn-ghost" onClick={() => move(-1)} aria-label="Mes anterior">
          ‹
        </button>
        <button className="btn-ghost" onClick={goToday}>
          Hoy
        </button>
        <button className="btn-ghost" onClick={() => move(1)} aria-label="Mes siguiente">
          ›
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Solo mis tareas
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
          Mostrar completadas
        </label>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-500">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <DndContext sensors={sensors} onDragStart={(e) => setDragging(String(e.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = iso(d);
            const list = byDay.get(key) ?? [];
            const inMonth = d.getMonth() === cursor.month;
            const isToday = key === today;
            const isSelected = key === selected;
            return (
              <DayCell
                key={key}
                id={key}
                onClick={() => openQuickAdd(key)}
                className={`min-h-16 cursor-pointer border-r border-b border-slate-100 p-1 md:min-h-28 ${inMonth ? "" : "bg-slate-50/70"} ${isSelected ? "ring-2 ring-indigo-400 ring-inset" : "hover:bg-slate-50"}`}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-indigo-600 font-semibold text-white" : inMonth ? "text-slate-700" : "text-slate-400"}`}
                  >
                    {d.getDate()}
                  </span>
                </div>
                {/* Celular: la cara de cada responsable. Computadora: tarjeta con responsable y nombre. */}
                <div className="flex flex-wrap gap-0.5 md:hidden">
                  {list.slice(0, 2).map((t) => (
                    <Draggable key={t.id} id={t.id}>
                      <span className={t.completed ? "opacity-40" : ""}>
                        <Avatar profile={profileOf(t.assignee_id)} size="xs" />
                      </span>
                    </Draggable>
                  ))}
                  {list.length > 2 && <span className="text-[10px] text-slate-500">+{list.length - 2}</span>}
                </div>
                <div className="hidden space-y-1 md:block">
                  {list.slice(0, 3).map((t) => (
                    <Draggable key={t.id} id={t.id}>
                      <TaskCard task={t} assignee={profileOf(t.assignee_id)} onOpen={() => setOpenTask(t.id)} />
                    </Draggable>
                  ))}
                  {list.length > 3 && <p className="px-1 text-xs text-slate-500">+{list.length - 3} más</p>}
                </div>
              </DayCell>
            );
          })}
        </div>
          <DragOverlay>
            {draggingTask && (
              <div className="w-40 rotate-2 cursor-grabbing shadow-lg">
                <TaskCard task={draggingTask} assignee={profileOf(draggingTask.assignee_id)} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-600 first-letter:uppercase">
          {selectedLabel} <span className="font-normal text-slate-400">{selectedTasks.length}</span>
        </h2>
        {selectedTasks.length > 0 ? (
          <ul className="mb-3 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
            {selectedTasks.map((t) => (
              <li key={t.id} onClick={() => setOpenTask(t.id)} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                <CheckButton task={t} onToggle={() => toggle(t)} />
                {t.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />}
                <span className={`min-w-0 flex-1 truncate text-sm ${t.completed ? "text-slate-400 line-through" : ""}`}>{t.title}</span>
                <PriorityBadge priority={t.priority} />
                <span className="hidden items-center gap-1 text-xs text-slate-500 sm:flex">
                  <span className="h-2 w-2 rounded-sm" style={{ background: t.project.color }} />
                  {t.project.name}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Avatar profile={profileOf(t.assignee_id)} size="sm" />
                  <span className="hidden max-w-28 truncate sm:inline">{displayName(profileOf(t.assignee_id))}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-slate-400">No hay tareas para este día.</p>
        )}

        {projects.length > 0 && (
          <button className="btn-ghost text-indigo-700" onClick={() => openQuickAdd(selected)}>
            + Nueva tarea para este día
          </button>
        )}
      </section>

      {quickAdd && projects.length > 0 && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setQuickAdd(false)} />
          <form onSubmit={add} className="fixed inset-x-4 top-24 z-50 mx-auto max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold first-letter:uppercase">Nueva tarea · {selectedLabel}</h2>
              <button type="button" className="btn-ghost" onClick={() => setQuickAdd(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <input autoFocus className="input" placeholder="Nombre de la tarea" value={title} onChange={(e) => setTitle(e.target.value)} />
            {!fixedProject && (
              <label className="block text-sm text-slate-500">
                Proyecto
                <select className="input mt-1" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm text-slate-500">
              Responsable
              <select className="input mt-1" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Sin asignar</option>
                {people.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === me.id ? `${displayName(m.profile)} (yo)` : displayName(m.profile)}
                  </option>
                ))}
              </select>
            </label>
            {selectedTasks.length > 0 && (
              <p className="text-xs text-slate-500">
                Ese día ya hay: {selectedTasks.map((t) => t.title).join(", ")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setQuickAdd(false)}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={!title.trim()}>
                Crear tarea
              </button>
            </div>
          </form>
        </>
      )}

      {openTask && <TaskPanel taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />}
    </div>
  );
}

function DayCell({ id, className, onClick, children }: { id: string; className: string; onClick: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} onClick={onClick} title="Tocá para crear una tarea este día" className={`${className} ${isOver ? "bg-indigo-50" : ""}`}>
      {children}
    </div>
  );
}

function Draggable({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`touch-manipulation ${isDragging ? "opacity-30" : ""}`}>
      {children}
    </div>
  );
}

function TaskCard({ task: t, assignee, onOpen }: { task: CalTask; assignee: Profile | null; onOpen?: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
      className={`flex w-full cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-white shadow-sm hover:brightness-110 ${t.completed ? "opacity-50" : ""}`}
      style={{ background: t.color ?? t.project.color }}
      title={`${t.title} · ${displayName(assignee)} · ${t.project.name}. Arrastrala a otro día para cambiar la fecha.`}
    >
      {t.completed ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/30 font-bold">✓</span>
      ) : (
        <span className="shrink-0 rounded-full ring-1 ring-white/80">
          <Avatar profile={assignee} size="xs" />
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate font-medium ${t.completed ? "line-through" : ""}`}>{t.title}</span>
    </button>
  );
}
