"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Member, Profile, Project, Role, Workspace } from "@/lib/types";

type WorkspaceContextValue = {
  me: Profile;
  workspaces: Workspace[];
  workspace: Workspace | null;
  role: Role | null;
  isAdmin: boolean;
  members: Member[];
  projects: Project[];
  selectWorkspace: (id: string) => void;
  reload: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY = "tareas.workspace";

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace fuera de WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [me, setMe] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadWorkspaceData = useCallback(
    async (wsId: string) => {
      const [{ data: m }, { data: p }] = await Promise.all([
        supabase.from("workspace_members").select("user_id, role, profile:profiles(id, email, full_name)").eq("workspace_id", wsId),
        supabase.from("projects").select("*").eq("workspace_id", wsId).order("created_at"),
      ]);
      setMembers((m as unknown as Member[]) ?? []);
      setProjects(p ?? []);
    },
    [supabase],
  );

  const reload = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: profile }, { data: rows }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").eq("id", user.id).single(),
      supabase.from("workspace_members").select("role, workspace:workspaces(id, name, owner_id)").eq("user_id", user.id),
    ]);
    setMe(profile ?? { id: user.id, email: user.email ?? "", full_name: null });
    const list = ((rows as unknown as { role: Role; workspace: Workspace }[]) ?? []).filter((r) => r.workspace);
    setWorkspaces(list.map((r) => r.workspace));
    setRoles(Object.fromEntries(list.map((r) => [r.workspace.id, r.role])));

    let wanted = currentIdRef.current;
    if (!wanted) {
      try {
        wanted = localStorage.getItem(STORAGE_KEY);
      } catch {}
    }
    const chosen = list.find((r) => r.workspace.id === wanted)?.workspace.id ?? list[0]?.workspace.id ?? null;
    currentIdRef.current = chosen;
    setCurrentId(chosen);
    if (chosen) await loadWorkspaceData(chosen);
    setLoaded(true);
  }, [supabase, loadWorkspaceData]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectWorkspace = useCallback(
    (id: string) => {
      currentIdRef.current = id;
      setCurrentId(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {}
      void loadWorkspaceData(id);
    },
    [loadWorkspaceData],
  );

  if (!loaded || !me) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Cargando...</div>;
  }

  if (workspaces.length === 0) {
    return <CreateFirstWorkspace me={me} onCreated={reload} />;
  }

  const workspace = workspaces.find((w) => w.id === currentId) ?? null;
  const role = currentId ? (roles[currentId] ?? null) : null;

  return (
    <WorkspaceContext.Provider
      value={{
        me,
        workspaces,
        workspace,
        role,
        isAdmin: role === "owner" || role === "admin",
        members,
        projects,
        selectWorkspace,
        reload: async () => {
          await reload();
        },
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

function CreateFirstWorkspace({ me, onCreated }: { me: Profile; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("workspaces").insert({ name, owner_id: me.id });
    setSaving(false);
    if (error) return setError(error.message);
    await onCreated();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={create} className="w-full max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Crea tu espacio de trabajo</h1>
        <p className="text-sm text-slate-500">
          Es donde viven tus proyectos. Más adelante puedes invitar a tu equipo. Si te invitaron, abre el enlace de la invitación.
        </p>
        <input className="input" placeholder="Ej.: Mi negocio" value={name} onChange={(e) => setName(e.target.value)} required />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={saving}>
          Crear espacio
        </button>
      </form>
    </main>
  );
}
