"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

// Traduce los errores de Supabase a mensajes claros.
function explainError(error: { message?: string; code?: string; status?: number }): string {
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed"))
    return "Tu correo todavía no está confirmado. Busca el email de confirmación (revisa también Spam) o pide a la dueña que te habilite.";
  if (code === "invalid_credentials" || msg.includes("invalid login credentials"))
    return "Email o contraseña incorrectos. Si aún no tienes cuenta, toca \"Regístrate\".";
  if (code === "over_email_send_rate_limit" || msg.includes("rate limit"))
    return "Se enviaron demasiados emails en poco tiempo. Espera un rato y vuelve a intentar.";
  if (code === "email_address_not_authorized" || msg.includes("not authorized"))
    return "Por ahora no se pueden enviar emails de confirmación a este correo. Avisa a la dueña de la app.";
  if (code === "signup_disabled" || msg.includes("signups not allowed"))
    return "El registro de cuentas nuevas está desactivado. Avisa a la dueña de la app.";
  if (code === "user_already_exists" || msg.includes("already registered"))
    return "Ese correo ya tiene cuenta. Toca \"Inicia sesión\".";
  if (code === "weak_password" || msg.includes("password"))
    return "La contraseña no es válida. Usa al menos 6 caracteres.";
  if (code === "email_address_invalid" || msg.includes("invalid"))
    return "Ese correo no es válido. Revísalo.";
  return error.message || "Algo salió mal. Intenta de nuevo.";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<"entrar" | "registro">(params.get("modo") === "registro" ? "registro" : "entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setError(explainError(error));
      router.replace(next);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) return setError(explainError(error));
    // Supabase devuelve un usuario sin identidades cuando el correo ya estaba registrado.
    if (data.user && data.user.identities?.length === 0) {
      setMode("entrar");
      return setError("Ese correo ya tiene cuenta. Escribe tu contraseña y toca Entrar.");
    }
    if (data.session) {
      router.replace(next);
      router.refresh();
    } else {
      setInfo("Te enviamos un email para confirmar tu cuenta (revisa también Spam). Ábrelo y vuelve a entrar.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <h1 className="text-xl font-semibold">Tareas</h1>
        </div>
        <h2 className="mb-4 text-lg font-medium">{mode === "entrar" ? "Iniciar sesión" : "Crear cuenta"}</h2>
        <form onSubmit={submit} className="space-y-3">
          {mode === "registro" && (
            <input className="input" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} required />
          )}
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className="input"
            type="password"
            placeholder="Contraseña (mínimo 6 caracteres)"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Un momento..." : mode === "entrar" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
        <button
          className="mt-4 w-full text-center text-sm text-indigo-600 hover:underline"
          onClick={() => setMode(mode === "entrar" ? "registro" : "entrar")}
        >
          {mode === "entrar" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </main>
  );
}
