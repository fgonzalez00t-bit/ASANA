"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { useWorkspace } from "@/components/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { displayName } from "@/lib/utils";

type Invitation = { id: string; email: string; role: Role; token: string; accepted_at: string | null; created_at: string };

export default function TeamPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, workspace, role, isAdmin, members, reload } = useWorkspace();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [copied, setCopied] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    if (!workspace || !isAdmin) return;
    const { data } = await supabase
      .from("invitations")
      .select("*")
      .eq("workspace_id", workspace.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    setInvitations(data ?? []);
  }, [supabase, workspace, isAdmin]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  if (!workspace) return null;

  const linkFor = (token: string) => `${window.location.origin}/invitacion/${token}`;

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt("Copia este enlace:", linkFor(token));
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase
      .from("invitations")
      .insert({ workspace_id: workspace!.id, email: email.trim().toLowerCase(), role: inviteRole, invited_by: me.id })
      .select()
      .single();
    if (error) return alert(error.message);
    setEmail("");
    await loadInvitations();
    if (data) await copy(data.token);
  }

  async function changeRole(userId: string, newRole: Role) {
    const { error } = await supabase.from("workspace_members").update({ role: newRole }).eq("workspace_id", workspace!.id).eq("user_id", userId);
    if (error) alert(error.message);
    await reload();
  }

  async function remove(userId: string, name: string) {
    const leaving = userId === me.id;
    if (!confirm(leaving ? "¿Salir de este espacio de trabajo?" : `¿Quitar a ${name} del espacio? Sus tareas se quedan.`)) return;
    const { error } = await supabase.from("workspace_members").delete().eq("workspace_id", workspace!.id).eq("user_id", userId);
    if (error) return alert(error.message);
    await reload();
  }

  async function cancelInvitation(id: string) {
    await supabase.from("invitations").delete().eq("id", id);
    await loadInvitations();
  }

  async function renameWorkspace() {
    const name = prompt("Nombre del espacio de trabajo", workspace!.name);
    if (!name?.trim()) return;
    await supabase.from("workspaces").update({ name: name.trim() }).eq("id", workspace!.id);
    await reload();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Equipo de {workspace.name}</h1>
        {role === "owner" && (
          <button className="btn-ghost text-xs" onClick={renameWorkspace}>
            Renombrar
          </button>
        )}
      </div>

      {isAdmin && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-1 font-semibold">Invitar a alguien</h2>
          <p className="mb-3 text-sm text-slate-500">
            Se crea un enlace de invitación y se copia. Mándaselo por WhatsApp o email; la persona entra con ese mismo email.
          </p>
          <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row">
            <input className="input flex-1" type="email" placeholder="email@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <select className="input sm:w-44" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
              <option value="member">{ROLE_LABEL.member}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </select>
            <button className="btn-primary">Crear invitación</button>
          </form>

          {invitations.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1">
                    {i.email} <span className="text-slate-400">· {ROLE_LABEL[i.role]} · pendiente</span>
                  </span>
                  <button className="btn-ghost text-xs" onClick={() => copy(i.token)}>
                    {copied === i.token ? "¡Copiado!" : "Copiar enlace"}
                  </button>
                  <button className="btn-ghost text-xs text-rose-600" onClick={() => cancelInvitation(i.id)}>
                    Cancelar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Miembros ({members.length})</h2>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar profile={m.profile} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {displayName(m.profile)} {m.user_id === me.id && <span className="text-slate-400">(tú)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{m.profile.email}</p>
              </div>
              {isAdmin && m.role !== "owner" && m.user_id !== me.id ? (
                <select className="input w-40 py-1" value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value as Role)}>
                  <option value="member">{ROLE_LABEL.member}</option>
                  <option value="admin">{ROLE_LABEL.admin}</option>
                </select>
              ) : (
                <span className="text-sm text-slate-500">{ROLE_LABEL[m.role]}</span>
              )}
              {m.role !== "owner" && (isAdmin || m.user_id === me.id) && (
                <button className="btn-ghost text-xs text-rose-600" onClick={() => remove(m.user_id, displayName(m.profile))}>
                  {m.user_id === me.id ? "Salir" : "Quitar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="text-sm text-slate-500">
        <h2 className="mb-1 font-semibold text-slate-700">Qué puede hacer cada rol</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Dueña:</b> todo, incluido renombrar el espacio.
          </li>
          <li>
            <b>Administradora:</b> crear y borrar proyectos y secciones, editar cualquier tarea, invitar y quitar miembros.
          </li>
          <li>
            <b>Miembro:</b> ver todos los proyectos, crear tareas, editar y completar las suyas (asignadas o creadas por ella) y comentar.
          </li>
        </ul>
      </section>
    </div>
  );
}
