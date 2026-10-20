"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL, type Member } from "@/lib/types";
import { displayName } from "@/lib/utils";
import { Avatar } from "./avatar";
import { useWorkspace } from "./workspace-provider";

// Personas que pueden recibir tareas de un proyecto: sus participantes, más la
// dueña y las administradoras, que tienen acceso a todo.
export function useProjectPeople(projectId: string | null | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const { members } = useWorkspace();
  const [participantIds, setParticipantIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("project_members").select("user_id").eq("project_id", projectId);
    setParticipantIds((data ?? []).map((r) => r.user_id as string));
  }, [supabase, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const people = members.filter((m) => m.role !== "member" || participantIds.includes(m.user_id));
  const participants = members.filter((m) => m.role === "member" && participantIds.includes(m.user_id));
  return { people, participants, participantIds, reload: load };
}

export function ProjectMembersDialog({ projectId, onClose, onChanged }: { projectId: string; onClose: () => void; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const { me, members } = useWorkspace();
  const { participantIds, reload } = useProjectPeople(projectId);
  const [saving, setSaving] = useState<string | null>(null);

  const admins = members.filter((m) => m.role !== "member");
  const collaborators = members.filter((m) => m.role === "member");

  async function toggle(m: Member) {
    setSaving(m.user_id);
    const inProject = participantIds.includes(m.user_id);
    const { error } = inProject
      ? await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", m.user_id)
      : await supabase.from("project_members").insert({ project_id: projectId, user_id: m.user_id, added_by: me.id });
    setSaving(null);
    if (error) alert(error.message);
    await reload();
    onChanged();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Participantes del proyecto</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Las participantes ven todo este proyecto y se pueden pasar las tareas entre ellas. Solo a ellas se les pueden asignar tareas. Las demás colaboradoras no lo ven.
        </p>

        {collaborators.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">
            Todavía no hay colaboradoras. Invitalas desde <b>Equipo</b> y después sumalas acá.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {collaborators.map((m) => (
              <li key={m.user_id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                  <input type="checkbox" checked={participantIds.includes(m.user_id)} disabled={saving === m.user_id} onChange={() => toggle(m)} />
                  <Avatar profile={m.profile} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{displayName(m.profile)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {admins.length > 0 && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            Siempre tienen acceso:
            {admins.map((m) => (
              <span key={m.user_id} className="flex items-center gap-1">
                <Avatar profile={m.profile} size="xs" />
                {displayName(m.profile)} ({ROLE_LABEL[m.role]})
              </span>
            ))}
          </p>
        )}

        <button className="btn-primary mt-5 w-full" onClick={onClose}>
          Listo
        </button>
      </div>
    </>
  );
}
