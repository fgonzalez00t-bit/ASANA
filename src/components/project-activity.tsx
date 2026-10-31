"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskActivity } from "@/lib/types";
import { describeActivity } from "@/lib/activity";
import { displayName } from "@/lib/utils";
import { Avatar } from "./avatar";
import { useWorkspace } from "./workspace-provider";

type Entry = {
  id: string;
  at: string;
  actorId: string | null;
  taskId: string;
  taskTitle: string;
  text: string;
  color?: string | null;
  comment?: string;
};

const LIMIT = 2000;

// Historial de todo el proyecto: cambios de tareas y comentarios, del más nuevo al más viejo.
// Cada persona solo recibe lo que puede ver (las reglas de la base filtran por proyecto).
export function ProjectActivity({ projectId, projectName, onOpenTask }: { projectId: string; projectName: string; onOpenTask: (taskId: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const { members } = useWorkspace();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [person, setPerson] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const profileOf = useCallback((id: string | null) => members.find((m) => m.user_id === id)?.profile ?? null, [members]);

  const load = useCallback(async () => {
    const [{ data: act }, { data: cs }] = await Promise.all([
      supabase
        .from("task_activity")
        .select("*, task:tasks!inner(title, project_id)")
        .eq("task.project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(LIMIT),
      supabase
        .from("comments")
        .select("id, task_id, user_id, body, created_at, task:tasks!inner(title, project_id)")
        .eq("task.project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(LIMIT),
    ]);
    type WithTask = { task: { title: string } | null };
    const changes: Entry[] = ((act ?? []) as (TaskActivity & WithTask)[]).map((a) => ({
      id: a.id,
      at: a.created_at,
      actorId: a.actor_id,
      taskId: a.task_id,
      taskTitle: a.task?.title ?? "",
      text: describeActivity(a, profileOf),
      color: a.action === "color" ? a.new_value : null,
    }));
    const comments: Entry[] = ((cs ?? []) as unknown as ({ id: string; task_id: string; user_id: string; body: string; created_at: string } & WithTask)[]).map((c) => ({
      id: c.id,
      at: c.created_at,
      actorId: c.user_id,
      taskId: c.task_id,
      taskTitle: c.task?.title ?? "",
      text: "comentó",
      comment: c.body,
    }));
    setEntries([...changes, ...comments].sort((a, b) => b.at.localeCompare(a.at)));
  }, [supabase, projectId, profileOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    return (entries ?? []).filter((e) => {
      if (person && e.actorId !== person) return false;
      const day = localDay(e.at);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [entries, person, from, to]);

  const byDay = useMemo(() => {
    const groups: { day: string; items: Entry[] }[] = [];
    for (const e of visible) {
      const day = localDay(e.at);
      if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
      groups.at(-1)!.items.push(e);
    }
    return groups;
  }, [visible]);

  function exportCsv() {
    const rows = [
      ["Fecha", "Hora", "Persona", "Tarea", "Qué hizo", "Comentario"],
      ...visible.map((e) => {
        const d = new Date(e.at);
        return [
          d.toLocaleDateString("es"),
          d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
          displayName(profileOf(e.actorId)),
          e.taskTitle,
          e.text,
          e.comment ?? "",
        ];
      }),
    ];
    // Punto y coma y BOM para que Excel en español lo abra con columnas y acentos bien.
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Actividad - ${projectName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-500">
            Persona
            <select className="input mt-1 py-1.5" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Todas</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {displayName(m.profile)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Desde
            <input type="date" className="input mt-1 py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">
            Hasta
            <input type="date" className="input mt-1 py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <span className="flex-1" />
          <button className="btn-primary" onClick={exportCsv} disabled={visible.length === 0}>
            Descargar Excel
          </button>
        </div>

        {entries === null ? (
          <p className="text-sm text-slate-400">Cargando...</p>
        ) : byDay.length === 0 ? (
          <p className="text-sm text-slate-400">No hay actividad para mostrar.</p>
        ) : (
          <div className="space-y-6">
            {byDay.map((g) => (
              <section key={g.day}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{dayLabel(g.day)}</h3>
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                  {g.items.map((e) => {
                    const actor = profileOf(e.actorId);
                    return (
                      <li key={e.id}>
                        <button className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-slate-50" onClick={() => onOpenTask(e.taskId)}>
                          <Avatar profile={actor} size="sm" />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-medium">{displayName(actor)}</span> {e.text}
                            {e.color && <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: e.color }} />}
                            <span className="block truncate text-xs text-slate-500">en «{e.taskTitle}»</span>
                            {e.comment && <span className="mt-1 block rounded bg-slate-50 px-2 py-1 text-xs break-words whitespace-pre-wrap text-slate-700">{e.comment}</span>}
                          </span>
                          <span className="shrink-0 text-xs text-slate-400">{new Date(e.at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {entries.length >= LIMIT && <p className="text-center text-xs text-slate-400">Se muestran los movimientos más recientes.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function localDay(at: string) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return date.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
