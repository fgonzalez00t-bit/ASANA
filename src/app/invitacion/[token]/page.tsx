"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Info = { workspace_name: string; email: string; accepted: boolean };

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data }, { data: auth }] = await Promise.all([supabase.rpc("invitation_info", { invite_token: token }), supabase.auth.getUser()]);
      setInfo((data as Info[] | null)?.[0] ?? null);
      setUserEmail(auth.user?.email ?? null);
    })();
  }, [supabase, token]);

  async function join() {
    setJoining(true);
    const { data, error } = await supabase.rpc("accept_invitation", { invite_token: token });
    setJoining(false);
    if (error) return setError(error.message);
    try {
      localStorage.setItem("tareas.workspace", data as string);
    } catch {}
    router.replace("/mis-tareas");
  }

  async function switchAccount() {
    await supabase.auth.signOut();
    setUserEmail(null);
  }

  const next = encodeURIComponent(`/invitacion/${token}`);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        {info === undefined && <p className="text-slate-400">Cargando...</p>}
        {info === null && <p>Esta invitación no existe o fue cancelada.</p>}
        {info && (
          <>
            <p className="text-sm text-slate-500">Te invitaron a</p>
            <h1 className="mb-4 text-xl font-semibold">{info.workspace_name}</h1>
            {!userEmail ? (
              <div className="space-y-2">
                <Link className="btn-primary w-full" href={`/login?modo=registro&email=${encodeURIComponent(info.email)}&next=${next}`}>
                  Crear mi cuenta
                </Link>
                <Link className="btn-ghost w-full" href={`/login?email=${encodeURIComponent(info.email)}&next=${next}`}>
                  Ya tengo cuenta
                </Link>
              </div>
            ) : userEmail.toLowerCase() !== info.email.toLowerCase() ? (
              <div className="space-y-2 text-sm">
                <p>
                  La invitación es para <b>{info.email}</b>, pero entraste como <b>{userEmail}</b>.
                </p>
                <button className="btn-primary w-full" onClick={switchAccount}>
                  Cambiar de cuenta
                </button>
              </div>
            ) : (
              <button className="btn-primary w-full" onClick={join} disabled={joining}>
                {info.accepted ? "Ir al espacio" : "Unirme"}
              </button>
            )}
            {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          </>
        )}
      </div>
    </main>
  );
}
