"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NO_SECTION, ProjectBoard, type Column } from "@/components/project-board";
import { Avatar } from "@/components/avatar";
import { MonthCalendar } from "@/components/month-calendar";
import { ProjectMembersDialog, useProjectPeople } from "@/components/project-people";
import { TaskPanel } from "@/components/task-panel";
import { useWorkspace } from "@/components/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import { ColorPicker } from "@/components/task-fields";
import type { Section, Task } from "@/lib/types";
import { positionBetween } from "@/lib/utils";

type Layout = "lista" | "tablero" | "calendario";
const LAYOUT_KEY = "tareas.vista";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { me, projects, isAdmin, reload } = useWorkspace();
  const project = projects.find((p) => p.id === id);

  const [sections, setSections] = useState<Section[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Pick<Task, "parent_task_id" | "completed">[]>([]);
  const [layout, setLayout] = useState<Layout>("lista");
  const [showCompleted, setShowCompleted] = useState(true);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [pickingColor, setPickingColor] = useState(false);
  const [editingMembers, setEditingMembers] = useState(false);
  const { participants, reload: reloadPeople } = useProjectPeople(id);

  // Al crear un proyecto se abre directo la elección de participantes.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("participantes") === "1") {
      setEditingMembers(true);
      router.replace(`/proyecto/${id}`);
    }
  }, [id, router]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved === "lista" || saved === "tablero" || saved === "calendario") setLayout(saved);
    } catch {}
  }, []);

  function changeLayout(l: Layout) {
    setLayout(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {}
  }

  const load = useCallback(async () => {
    const [{ data: s }, { data: t }, { data: st }] = await Promise.all([
      supabase.from("sections").select("*").eq("project_id", id).order("position"),
      supabase.from("tasks").select("*").eq("project_id", id).is("parent_task_id", null).order("position"),
      supabase.from("tasks").select("parent_task_id, completed").eq("project_id", id).not("parent_task_id", "is", null),
    ]);
    setSections(s ?? []);
    setTasks(t ?? []);
    setSubtasks(st ?? []);
  }, [supabase, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Cambios de otras personas en este proyecto se ven al instante.
  useEffect(() => {
    const channel = supabase
      .channel(`proyecto-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "sections", filter: `project_id=eq.${id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, id, load]);

  const subtaskCount = useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const s of subtasks) {
      const k = s.parent_task_id!;
      out[k] ??= { done: 0, total: 0 };
      out[k].total++;
      if (s.completed) out[k].done++;
    }
    return out;
  }, [subtasks]);

  const columns: Column[] = useMemo(() => {
    const visible = showCompleted ? tasks : tasks.filter((t) => !t.completed);
    const cols: Column[] = sections.map((s) => ({ id: s.id, name: s.name, section: s, tasks: visible.filter((t) => t.section_id === s.id) }));
    const orphan = visible.filter((t) => !t.section_id || !sections.some((s) => s.id === t.section_id));
    if (orphan.length > 0 || sections.length === 0) cols.unshift({ id: NO_SECTION, name: "Sin sección", section: null, tasks: orphan });
    return cols;
  }, [sections, tasks, showCompleted]);

  if (!project) {
    return <p className="p-6 text-sm text-slate-500">Proyecto no encontrado.</p>;
  }

  async function addTask(columnId: string, title: string) {
    const col = columns.find((c) => c.id === columnId);
    const { error } = await supabase.from("tasks").insert({
      project_id: id,
      section_id: columnId === NO_SECTION ? null : columnId,
      title,
      created_by: me.id,
      assignee_id: me.id,
      position: positionBetween(col?.tasks.at(-1)?.position),
    });
    if (error) alert(error.message);
    await load();
  }

  async function toggle(task: Task) {
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)));
    const { error } = await supabase.from("tasks").update({ completed: !task.completed }).eq("id", task.id);
    if (error) {
      alert("Solo la responsable, quien la creó o una administradora pueden cambiar esta tarea.");
      await load();
    }
  }

  async function move(task: Task, columnId: string, index: number) {
    const col = columns.find((c) => c.id === columnId);
    const rest = (col?.tasks ?? []).filter((t) => t.id !== task.id);
    const before = index > 0 ? rest.at(index - 1)?.position : undefined;
    const after = index < rest.length ? rest.at(index)?.position : undefined;
    const pos = positionBetween(before, after);
    const section_id = columnId === NO_SECTION ? null : columnId;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, section_id, position: pos } : t)).sort((a, b) => a.position - b.position));
    const { error } = await supabase.from("tasks").update({ section_id, position: pos }).eq("id", task.id);
    if (error) {
      alert("No tienes permiso para mover esta tarea.");
      await load();
    }
  }

  async function addSection() {
    const name = prompt("Nombre de la nueva sección");
    if (!name?.trim()) return;
    await supabase.from("sections").insert({ project_id: id, name: name.trim(), position: positionBetween(sections.at(-1)?.position) });
    await load();
  }

  async function renameSection(section: Section, name: string) {
    await supabase.from("sections").update({ name }).eq("id", section.id);
    await load();
  }

  async function deleteSection(section: Section) {
    if (!confirm(`¿Borrar la sección "${section.name}"? Sus tareas quedan en "Sin sección".`)) return;
    await supabase.from("sections").delete().eq("id", section.id);
    await load();
  }

  async function renameProject() {
    const name = prompt("Nuevo nombre del proyecto", project!.name);
    if (!name?.trim()) return;
    await supabase.from("projects").update({ name: name.trim() }).eq("id", id);
    await reload();
  }

  async function recolorProject(color: string | null) {
    setPickingColor(false);
    if (!color) return;
    await supabase.from("projects").update({ color }).eq("id", id);
    await reload();
  }

  async function deleteProject() {
    if (!confirm(`¿Borrar el proyecto "${project!.name}" con todas sus tareas? No se puede deshacer.`)) return;
    await supabase.from("projects").delete().eq("id", id);
    await reload();
    router.replace("/mis-tareas");
  }

  const tab = (l: Layout, label: string) => (
    <button
      onClick={() => changeLayout(l)}
      className={`border-b-2 px-1 pb-2 text-sm ${layout === l ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              className="block h-4 w-4 rounded"
              style={{ background: project.color }}
              title={isAdmin ? "Cambiar color" : undefined}
              onClick={() => isAdmin && setPickingColor((v) => !v)}
            />
            {pickingColor && (
              <div className="absolute top-6 left-0 z-20 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                <ColorPicker value={project.color} onChange={recolorProject} />
              </div>
            )}
          </div>
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <button
            className="ml-2 flex items-center gap-1 rounded-full px-1 py-0.5 hover:bg-slate-100"
            title={isAdmin ? "Elegir participantes" : "Participantes"}
            onClick={() => isAdmin && setEditingMembers(true)}
          >
            <span className="flex -space-x-1.5">
              {participants.slice(0, 5).map((m) => (
                <span key={m.user_id} className="rounded-full ring-2 ring-white">
                  <Avatar profile={m.profile} size="xs" />
                </span>
              ))}
            </span>
            {participants.length > 5 && <span className="text-xs text-slate-500">+{participants.length - 5}</span>}
            {isAdmin && <span className="px-1 text-xs text-slate-500">{participants.length === 0 ? "+ Participantes" : "Editar"}</span>}
          </button>
          {isAdmin && (
            <>
              <button className="btn-ghost text-xs" onClick={renameProject}>
                Renombrar
              </button>
              <button className="btn-ghost text-xs text-rose-600" onClick={deleteProject}>
                Borrar
              </button>
            </>
          )}
        </div>
        <div className="mt-3 flex items-center gap-4">
          {tab("lista", "Lista")}
          {tab("tablero", "Tablero")}
          {tab("calendario", "Calendario")}
          <span className="flex-1" />
          <label className={`flex items-center gap-1 pb-2 text-xs text-slate-500 ${layout === "calendario" ? "hidden" : ""}`}>
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
            Mostrar completadas
          </label>
          {isAdmin && layout !== "calendario" && (
            <button className="btn-ghost mb-1 text-xs" onClick={addSection}>
              + Sección
            </button>
          )}
        </div>
      </div>

      {layout === "calendario" ? (
        <MonthCalendar key={id} projectId={id} />
      ) : (
        <ProjectBoard
          layout={layout}
          columns={columns}
          subtaskCount={subtaskCount}
          onOpen={(t) => setOpenTask(t.id)}
          onToggle={toggle}
          onMove={move}
          onAddTask={addTask}
          onRenameSection={renameSection}
          onDeleteSection={deleteSection}
        />
      )}

      {editingMembers && <ProjectMembersDialog projectId={id} onClose={() => setEditingMembers(false)} onChanged={() => void reloadPeople()} />}
      {openTask && <TaskPanel taskId={openTask} sections={sections} onClose={() => setOpenTask(null)} onChanged={load} />}
    </div>
  );
}
