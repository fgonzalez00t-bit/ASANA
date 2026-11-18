"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { labelClass, PROJECT_COLORS, projectLabels, ROLE_LABEL } from "@/lib/types";
import { displayName } from "@/lib/utils";
import { Avatar } from "./avatar";
import { useAllLabels } from "./project-labels";
import { useWorkspace } from "./workspace-provider";

const DEFAULT_SECTIONS = ["Pendiente", "En curso", "Hecho"];
const FILTER_KEY = "tareas.filtro-etiqueta";
const NO_LABEL = "__sin_etiqueta__";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, workspaces, workspace, role, isAdmin, projects, selectWorkspace, reload } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const allLabels = useAllLabels();

  useEffect(() => {
    try {
      setLabelFilter(localStorage.getItem(FILTER_KEY));
    } catch {}
  }, []);

  function chooseFilter(value: string | null) {
    const next = value === labelFilter ? null : value;
    setLabelFilter(next);
    try {
      if (next) localStorage.setItem(FILTER_KEY, next);
      else localStorage.removeItem(FILTER_KEY);
    } catch {}
  }

  // Si la etiqueta elegida ya no existe, se muestran todos.
  const activeFilter = labelFilter === NO_LABEL || (labelFilter && allLabels.includes(labelFilter)) ? labelFilter : null;
  const hasUnlabeled = projects.some((p) => projectLabels(p).length === 0);

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      const labels = projectLabels(p);
      if (activeFilter === NO_LABEL && labels.length > 0) return false;
      if (activeFilter && activeFilter !== NO_LABEL && !labels.includes(activeFilter)) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, activeFilter, search]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !newName.trim()) return;
    const supabase = createClient();
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    const { data, error } = await supabase
      .from("projects")
      .insert({ workspace_id: workspace.id, name: newName.trim(), color, created_by: me.id })
      .select()
      .single();
    if (error || !data) return alert(error?.message ?? "No se pudo crear el proyecto");
    await supabase.from("sections").insert(DEFAULT_SECTIONS.map((name, i) => ({ project_id: data.id, name, position: (i + 1) * 1000 })));
    setNewName("");
    setCreating(false);
    await reload();
    router.push(`/proyecto/${data.id}?participantes=1`);
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const navItem = (href: string, label: string) => (
    <Link
      href={href}
      onClick={() => setOpen(false)}
      className={`block rounded-md px-3 py-2 text-sm ${pathname === href ? "bg-white/15 font-medium text-white" : "text-slate-300 hover:bg-white/10"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 text-slate-100 transition-transform md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="border-b border-white/10 p-3">
          <select
            className="w-full rounded-md bg-white/10 px-2 py-2 text-sm font-medium text-white outline-none"
            value={workspace?.id}
            onChange={(e) => selectWorkspace(e.target.value)}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id} className="text-slate-900">
                {w.name}
              </option>
            ))}
          </select>
          {role && <p className="mt-1 px-1 text-xs text-slate-400">Tu rol: {ROLE_LABEL[role]}</p>}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItem("/mis-tareas", "Mis tareas")}
          {isAdmin && navItem("/panel", "Panel del equipo")}
          {navItem("/calendario", "Calendario")}
          {navItem("/equipo", "Equipo")}

          <div className="flex items-center justify-between px-3 pt-5 pb-1">
            <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Proyectos</span>
            {isAdmin && (
              <button className="text-lg leading-none text-slate-400 hover:text-white" title="Nuevo proyecto" onClick={() => setCreating(true)}>
                +
              </button>
            )}
          </div>
          {creating && (
            <form onSubmit={createProject} className="px-2 pb-2">
              <input
                autoFocus
                className="w-full rounded-md bg-white/10 px-2 py-1.5 text-sm text-white outline-none placeholder:text-slate-400"
                placeholder="Nombre del proyecto"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => !newName && setCreating(false)}
              />
            </form>
          )}
          {(allLabels.length > 0 || projects.length > 6) && (
            <div className="space-y-2 px-2 pb-2">
              {projects.length > 6 && (
                <input
                  className="w-full rounded-md bg-white/10 px-2 py-1.5 text-xs text-white outline-none placeholder:text-slate-400"
                  placeholder="Buscar proyecto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
              {allLabels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => chooseFilter(null)}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${!activeFilter ? "bg-white text-slate-900" : "bg-white/10 text-slate-300 hover:bg-white/20"}`}
                  >
                    Todos
                  </button>
                  {allLabels.map((l) => (
                    <button
                      key={l}
                      onClick={() => chooseFilter(l)}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${activeFilter === l ? `${labelClass(l)} ring-2 ring-white` : "bg-white/10 text-slate-300 hover:bg-white/20"}`}
                    >
                      {l}
                    </button>
                  ))}
                  {hasUnlabeled && (
                    <button
                      onClick={() => chooseFilter(NO_LABEL)}
                      className={`rounded-full px-2 py-0.5 text-[11px] ${activeFilter === NO_LABEL ? "bg-white text-slate-900" : "bg-white/10 text-slate-400 hover:bg-white/20"}`}
                    >
                      Sin etiqueta
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {visibleProjects.map((p) => (
            <Link
              key={p.id}
              href={`/proyecto/${p.id}`}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${pathname === `/proyecto/${p.id}` ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10"}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
            </Link>
          ))}
          {projects.length > 0 && visibleProjects.length === 0 && (
            <p className="px-3 text-xs text-slate-500">Ningún proyecto coincide con el filtro.</p>
          )}
          {projects.length === 0 && !creating && (
            <p className="px-3 text-xs text-slate-500">{isAdmin ? "Crea tu primer proyecto con +" : "Aún no hay proyectos."}</p>
          )}
        </nav>

        <div className="flex items-center gap-2 border-t border-white/10 p-3">
          <Avatar profile={me} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{displayName(me)}</p>
            <button onClick={signOut} className="text-xs text-slate-400 hover:text-white">
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          <button className="btn-ghost px-2" onClick={() => setOpen(true)} aria-label="Abrir menú">
            ☰
          </button>
          <span className="font-semibold">{workspace?.name}</span>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
