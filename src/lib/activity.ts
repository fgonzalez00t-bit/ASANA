import type { Priority, Profile, TaskActivity } from "./types";
import { PRIORITY_LABEL } from "./types";
import { displayName } from "./utils";

export function formatWhen(at: string) {
  return new Date(at).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: string | null) {
  if (!date) return "sin fecha";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("es", { day: "numeric", month: "long" });
}

export function describeActivity(a: TaskActivity, profileOf: (id: string | null) => Profile | null) {
  switch (a.action) {
    case "creada":
      return "creó la tarea";
    case "titulo":
      return `cambió el nombre a "${a.new_value}"`;
    case "responsable":
      if (!a.new_value) return "dejó la tarea sin asignar";
      return `${a.old_value ? "le pasó la tarea a" : "asignó la tarea a"} ${displayName(profileOf(a.new_value))}`;
    case "fecha":
      return a.new_value ? `cambió la fecha a ${formatDate(a.new_value)}` : "quitó la fecha";
    case "completada":
      return "marcó la tarea como completada";
    case "reabierta":
      return "volvió a abrir la tarea";
    case "prioridad":
      return a.new_value ? `cambió la prioridad a ${PRIORITY_LABEL[a.new_value as Priority] ?? a.new_value}` : "quitó la prioridad";
    case "descripcion":
      return "editó la descripción";
    case "seccion":
      return `movió la tarea a ${a.new_value ?? "Sin sección"}`;
    case "color":
      return a.new_value ? "cambió el color" : "quitó el color";
    default:
      return a.action;
  }
}
