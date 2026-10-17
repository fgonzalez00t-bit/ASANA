import type { Metadata, Viewport } from "next";
import "./globals.css";

// Todo depende de la sesión de Supabase: nada se genera al compilar.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tareas",
  description: "Organiza proyectos y tareas con tu equipo",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
