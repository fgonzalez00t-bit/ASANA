"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Comment, Priority, Section, Task } from "@/lib/types";
import { PRIORITY_LABEL } from "@/lib/types";
import { displayName, positionBetween } from "@/lib/utils";
import { Avatar } from "./avatar";
import { TaskAttachments } from "./task-attachments";
import { CheckButton } from "./task-fields";
import { useWorkspace } from "./workspace-provider";

type Props = {
  taskId: string;
  sections?: Section[];
  onClose: () => void;
  onChanged: () => void;
};

export function TaskPanel({ taskId, sections, onClose, onChanged }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { me, members, isAdmin } = useWorkspace();
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");

  const load = useCallback(async () => {
    const [{ data: t }, { data: subs }, { data: cs }] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).single(),
      supabase.from("tasks").select("*").eq("parent_task_id", taskId).order("position"),
      supabase.from("comments").select("*").eq("task_id", taskId).order("created_at"),
    ]);
    setTask(t);
    setSubtasks(subs ?? []);
    setComments(cs ?? []);
  }, [supabase, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) {
    return <Drawer onClose={onClose}>{<p className="p-6 text-sm text-slate-400">Cargando...</p>}</Drawer>;
  }

  const canEdit = isAdmin || task.assignee_id === me.id || task.created_by === me.id;
  const profileOf = (id: string | null) => members.find((m) => m.user_id === id)?.profile ?? null;

  async function update(patch: Partial<Task>) {
    setTask((t) => (t ? { ...t, ...patch } : t));
    const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      await load();
    }
    onChanged();
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!newSub.trim() || !task) return;
    await supabase.from("tasks").insert({
      project_id: task.project_id,
      parent_task_id: task.id,
      title: newSub.trim(),
      created_by: me.id,
      position: positionBetween(subtasks.at(-1)?.position),
    });
    setNewSub("");
    await load();
    onChanged();
  }

  async function toggleSubtask(s: Task) {
    setSubtasks((list) => list.map((x) => (x.id === s.id ? { ...x, completed: !x.completed } : x)));
    await supabase.from("tasks").update({ completed: !s.completed }).eq("id", s.id);
    onChanged();
  }

  async function deleteSubtask(s: Task) {
    await supabase.from("tasks").delete().eq("id", s.id);
    await load();
    onChanged();
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    await supabase.from("comments").insert({ task_id: taskId, user_id: me.id, body: newComment.trim() });
    setNewComment("");
    await load();
  }

  async function deleteTask() {
    if (!confirm("¿Borrar esta tarea y sus subtareas?")) return;
    await supabase.from("tasks").delete().eq("id", taskId);
    onChanged();
    onClose();
  }

  return (
    <Drawer onClose={onClose}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button
          className={`btn border ${task.completed ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          disabled={!canEdit}
          onClick={() => update({ completed: !task.completed })}
        >
          ✓ {task.completed ? "Completada" : "Marcar como completada"}
        </button>
        <div className="flex items-center gap-1">
          {(isAdmin || task.created_by === me.id) && (
            <button className="btn-ghost text-rose-600" onClick={deleteTask}>
              Borrar
            </button>
          )}
          <button className="btn-ghost" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <textarea
          key={`title-${task.id}`}
          className="w-full resize-none rounded-md border border-transparent px-1 py-1 text-xl font-semibold outline-none hover:border-slate-200 focus:border-indigo-400"
          rows={2}
          defaultValue={task.title}
          disabled={!canEdit}
          onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && update({ title: e.target.value.trim() })}
        />

        <dl className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <dt className="text-slate-500">Responsable</dt>
          <dd className="flex items-center gap-2">
            <Avatar profile={profileOf(task.assignee_id)} size="sm" />
            <select
              className="input py-1"
              value={task.assignee_id ?? ""}
              disabled={!canEdit}
              onChange={(e) => update({ assignee_id: e.target.value || null })}
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {displayName(m.profile)}
                </option>
              ))}
            </select>
          </dd>

          <dt className="text-slate-500">Fecha límite</dt>
          <dd>
            <input
              type="date"
              className="input py-1"
              value={task.due_date ?? ""}
              disabled={!canEdit}
              onChange={(e) => update({ due_date: e.target.value || null })}
            />
          </dd>

          <dt className="text-slate-500">Prioridad</dt>
          <dd>
            <select
              className="input py-1"
              value={task.priority ?? ""}
              disabled={!canEdit}
              onChange={(e) => update({ priority: (e.target.value || null) as Priority | null })}
            >
              <option value="">Sin prioridad</option>
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </dd>

          {sections && sections.length > 0 && !task.parent_task_id && (
            <>
              <dt className="text-slate-500">Sección</dt>
              <dd>
                <select
                  className="input py-1"
                  value={task.section_id ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => update({ section_id: e.target.value || null })}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </dd>
            </>
          )}
        </dl>

        <div>
          <h3 className="mb-1 text-sm font-medium text-slate-700">Descripción</h3>
          <textarea
            key={`desc-${task.id}`}
            className="input min-h-24"
            placeholder="Agrega detalles..."
            defaultValue={task.description ?? ""}
            disabled={!canEdit}
            onBlur={(e) => e.target.value !== (task.description ?? "") && update({ description: e.target.value || null })}
          />
        </div>

        <TaskAttachments taskId={task.id} />

        {!task.parent_task_id && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              Subtareas {subtasks.length > 0 && <span className="text-slate-400">({subtasks.filter((s) => s.completed).length}/{subtasks.length})</span>}
            </h3>
            <ul className="space-y-1">
              {subtasks.map((s) => (
                <li key={s.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
                  <CheckButton task={s} onToggle={() => toggleSubtask(s)} />
                  <span className={`flex-1 text-sm ${s.completed ? "text-slate-400 line-through" : ""}`}>{s.title}</span>
                  <button className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600" onClick={() => deleteSubtask(s)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={addSubtask} className="mt-1">
              <input className="input py-1.5" placeholder="+ Agregar subtarea" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
            </form>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Comentarios</h3>
          <ul className="space-y-3">
            {comments.map((c) => {
              const author = profileOf(c.user_id);
              return (
                <li key={c.id} className="flex gap-2">
                  <Avatar profile={author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{displayName(author)}</span>{" "}
                      {new Date(c.created_at).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <form onSubmit={addComment} className="mt-3 flex gap-2">
            <input className="input" placeholder="Escribe un comentario" value={newComment} onChange={(e) => setNewComment(e.target.value)} />
            <button className="btn-primary" disabled={!newComment.trim()}>
              Enviar
            </button>
          </form>
        </div>
      </div>
    </Drawer>
  );
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-xl">{children}</div>
    </>
  );
}
