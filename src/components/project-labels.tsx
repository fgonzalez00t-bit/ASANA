"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { labelClass, projectLabels, type Project } from "@/lib/types";
import { useWorkspace } from "./workspace-provider";

export function LabelChip({ label, onRemove, small }: { label: string; onRemove?: () => void; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${small ? "px-1.5 text-[10px]" : "px-2 py-0.5 text-xs"} ${labelClass(label)}`}>
      {label}
      {onRemove && (
        <button type="button" className="opacity-60 hover:opacity-100" title={`Quitar "${label}"`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

// Todas las etiquetas que se usan en los proyectos visibles, en orden alfabético.
export function useAllLabels() {
  const { projects } = useWorkspace();
  return useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of projects) for (const l of projectLabels(p)) if (!seen.has(l.toLowerCase())) seen.set(l.toLowerCase(), l);
    return [...seen.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [projects]);
}

const MISSING_COLUMN_HELP =
  "No se pudo guardar la etiqueta. Si es la primera vez, falta pegar el archivo pegar-en-supabase-etiquetas.sql en Supabase (SQL Editor) y apretar Run.";

export function ProjectLabelsEditor({ project }: { project: Project }) {
  const { isAdmin, reload } = useWorkspace();
  const allLabels = useAllLabels();
  const labels = projectLabels(project);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  async function save(next: string[]) {
    const { error } = await createClient().from("projects").update({ labels: next }).eq("id", project.id);
    if (error) alert(MISSING_COLUMN_HELP);
    await reload();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const raw = text.trim().replace(/\s+/g, " ");
    setText("");
    setAdding(false);
    if (!raw || labels.some((l) => l.toLowerCase() === raw.toLowerCase())) return;
    // Si ya existe con otra forma de escribirla, se usa la misma.
    const existing = allLabels.find((l) => l.toLowerCase() === raw.toLowerCase());
    await save([...labels, existing ?? raw]);
  }

  if (!isAdmin && labels.length === 0) return null;

  const suggestions = allLabels.filter((l) => !labels.some((x) => x.toLowerCase() === l.toLowerCase()));

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {labels.map((l) => (
        <LabelChip key={l} label={l} onRemove={isAdmin ? () => void save(labels.filter((x) => x !== l)) : undefined} />
      ))}
      {isAdmin &&
        (adding ? (
          <form onSubmit={add} className="flex items-center gap-1">
            <input
              autoFocus
              list="etiquetas-existentes"
              className="w-40 rounded-full border border-slate-300 px-2 py-0.5 text-xs outline-none focus:border-indigo-500"
              placeholder="Ej.: Clientes"
              value={text}
              maxLength={30}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => !text && setAdding(false)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            />
            <datalist id="etiquetas-existentes">
              {suggestions.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            <button className="text-xs text-indigo-700 hover:underline">Agregar</button>
          </form>
        ) : (
          <button
            type="button"
            className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
            onClick={() => setAdding(true)}
          >
            + Etiqueta
          </button>
        ))}
    </div>
  );
}
