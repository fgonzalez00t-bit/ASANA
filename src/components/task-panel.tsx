"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Comment, Priority, Section, Task, TaskActivity } from "@/lib/types";
import { PRIORITY_LABEL } from "@/lib/types";
import { describeActivity, formatWhen } from "@/lib/activity";
import { displayName, positionBetween } from "@/lib/utils";
import { Avatar } from "./avatar";
import { TaskAttachments } from "./task-attachments";
import { Linkify, extractLinks } from "./linkify";
import { useProjectPeople } from "./project-people";
import { CheckButton, ColorPicker } from "./task-fields";
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
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");
  const [handoffTo, setHandoffTo] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [handingOff, setHandingOff] = useState(false);
  const { people } = useProjectPeople(task?.project_id);
  // Solo se puede asignar a participantes del proyecto (y a la dueña o administradoras).
  const assignable = people;

  const load = useCallback(async () => {
    const [{ data: t }, { data: subs }, { data: cs }, { data: act }] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).single(),
      supabase.from("tasks").select("*").eq("parent_task_id", taskId).order("position"),
      supabase.from("comments").select("*").eq("task_id", taskId).order("created_at"),
      supabase.from("task_activity").select("*").eq("task_id", taskId).order("created_at"),
    ]);
    setActivity(act ?? []);
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

  const profileOf = (id: string | null) => members.find((m) => m.user_id === id)?.profile ?? null;
  const timeline: TimelineItem[] = [
    ...comments.map((entry) => ({ kind: "comentario" as const, at: entry.created_at, entry })),
    ...activity.map((entry) => ({ kind: "cambio" as const, at: entry.created_at, entry })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  async function update(patch: Partial<Task>) {
    setTask((t) => (t ? { ...t, ...patch } : t));
    const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
    if (error) alert("No se pudo guardar: " + error.message);
    await load();
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

  async function passTo(toUser: string | null, note: string) {
    const { error } = await supabase.rpc("pass_task", { task: taskId, to_user: toUser, note });
    if (error) return alert("No se pudo pasar la tarea: " + error.message);
    setHandoffTo("");
    setHandoffNote("");
    setHandingOff(false);
    onChanged();
    await load();
  }

  async function handOff(e: React.FormEvent) {
    e.preventDefault();
    if (handoffTo) await passTo(handoffTo, handoffNote);
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
          onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && update({ title: e.target.value.trim() })}
        />

        <dl className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <dt className="text-slate-500">Responsable</dt>
          <dd className="flex items-center gap-2">
            <Avatar profile={profileOf(task.assignee_id)} size="sm" />
            <select
              className="input py-1"
              value={task.assignee_id ?? ""}
              onChange={(e) => passTo(e.target.value || null, "")}
            >
              <option value="">Sin asignar</option>
              {assignable.map((m) => (
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
              onChange={(e) => update({ due_date: e.target.value || null })}
            />
          </dd>

          <dt className="text-slate-500">Prioridad</dt>
          <dd>
            <select
              className="input py-1"
              value={task.priority ?? ""}
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

          <dt className="text-slate-500">Color</dt>
          <dd>
            <ColorPicker value={task.color} allowNone onChange={(color) => update({ color })} />
          </dd>

          {sections && sections.length > 0 && !task.parent_task_id && (
            <>
              <dt className="text-slate-500">Sección</dt>
              <dd>
                <select
                  className="input py-1"
                  value={task.section_id ?? ""}
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

        {handingOff ? (
          <form onSubmit={handOff} className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-3">
            <h3 className="text-sm font-medium text-slate-700">Pasar la tarea</h3>
            <select className="input" value={handoffTo} onChange={(e) => setHandoffTo(e.target.value)} required>
              <option value="">¿A quién se la pasás?</option>
              {assignable
                .filter((m) => m.user_id !== task.assignee_id)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {displayName(m.profile)}
                  </option>
                ))}
            </select>
            <textarea
              className="input min-h-16"
              placeholder="Comentario: qué hiciste y qué falta (opcional)"
              value={handoffNote}
              onChange={(e) => setHandoffNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setHandingOff(false)}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={!handoffTo}>
                Pasar tarea
              </button>
            </div>
          </form>
        ) : (
          <button className="btn border border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setHandingOff(true)}>
            ↪ Pasar a otra persona
          </button>
        )}

        <div>
          <h3 className="mb-1 text-sm font-medium text-slate-700">Descripción</h3>
          <textarea
            key={`desc-${task.id}`}
            className="input min-h-24"
            placeholder="Agrega detalles..."
            defaultValue={task.description ?? ""}
            onBlur={(e) => e.target.value !== (task.description ?? "") && update({ description: e.target.value || null })}
          />
          {task.description && extractLinks(task.description).length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm">
              {extractLinks(task.description).map((l) => (
                <li key={l}>
                  🔗 <Linkify text={l} />
                </li>
              ))}
            </ul>
          )}
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
          <h3 className="mb-2 text-sm font-medium text-slate-700">Comentarios e historial</h3>
          <ul className="space-y-3">
            {timeline.map((item) => {
              if (item.kind === "cambio") {
                const a = item.entry;
                return (
                  <li key={a.id} className="flex items-start gap-2 pl-1 text-xs text-slate-500">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <span>
                      <span className="font-medium text-slate-600">{displayName(profileOf(a.actor_id))}</span> {describeActivity(a, profileOf)}
                      {a.action === "color" && a.new_value && <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: a.new_value }} />}
                      {" · "}
                      {formatWhen(a.created_at)}
                    </span>
                  </li>
                );
              }
              const c = item.entry;
              const author = profileOf(c.user_id);
              return (
                <li key={c.id} className="flex gap-2">
                  <Avatar profile={author} size="sm" />
                  <div className="min-w-0 flex-1 rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{displayName(author)}</span> {formatWhen(c.created_at)}
                    </p>
                    <p className="text-sm break-words whitespace-pre-wrap">
                      <Linkify text={c.body} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <form onSubmit={addComment} className="mt-3 flex gap-2">
            <textarea
              className="input min-h-10"
              rows={2}
              placeholder="Deja un comentario o registro de cambios..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <button className="btn-primary self-end" disabled={!newComment.trim()}>
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

type TimelineItem = { kind: "comentario"; at: string; entry: Comment } | { kind: "cambio"; at: string; entry: TaskActivity };
