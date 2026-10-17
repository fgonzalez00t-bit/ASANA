import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino del enlace de confirmación de email que envía Supabase.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
