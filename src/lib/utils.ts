import type { Profile } from "./types";

export function displayName(p?: Profile | null) {
  if (!p) return "Sin asignar";
  return p.full_name || p.email;
}

export function initials(p?: Profile | null) {
  const name = displayName(p);
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

// Posición entre dos vecinos para ordenar sin renumerar todo.
export function positionBetween(before?: number, after?: number) {
  if (before === undefined && after === undefined) return 1000;
  if (before === undefined) return after! - 1000;
  if (after === undefined) return before + 1000;
  return (before + after) / 2;
}

export function formatDue(date: string | null) {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const due = new Date(y!, m! - 1, d!);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  const label =
    diff === 0
      ? "Hoy"
      : diff === 1
        ? "Mañana"
        : diff === -1
          ? "Ayer"
          : due.toLocaleDateString("es", { day: "numeric", month: "short" });
  return { label, overdue: diff < 0, soon: diff >= 0 && diff <= 1 };
}

export function dueBucket(date: string | null): "vencidas" | "hoy" | "semana" | "despues" | "sin-fecha" {
  if (!date) return "sin-fecha";
  const [y, m, d] = date.split("-").map(Number);
  const due = new Date(y!, m! - 1, d!);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "vencidas";
  if (diff === 0) return "hoy";
  if (diff <= 7) return "semana";
  return "despues";
}
