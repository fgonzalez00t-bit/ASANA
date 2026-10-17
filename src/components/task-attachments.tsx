"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Attachment } from "@/lib/types";
import { useWorkspace } from "./workspace-provider";

const BUCKET = "adjuntos";
const MAX_BYTES = 10 * 1024 * 1024;

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeName(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
}

export function TaskAttachments({ taskId }: { taskId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { me, workspace, isAdmin } = useWorkspace();
  const [items, setItems] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("attachments").select("*").eq("task_id", taskId).order("created_at");
    const list = data ?? [];
    setItems(list);
    if (list.length === 0) return setUrls({});
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(
      list.map((a) => a.path),
      60 * 60,
    );
    setUrls(Object.fromEntries((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])));
  }, [supabase, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files || !workspace) return;
    setUploading(true);
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        errors.push(`${file.name}: pesa más de 10 MB`);
        continue;
      }
      const path = `${workspace.id}/${taskId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (upErr) {
        errors.push(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { error: rowErr } = await supabase.from("attachments").insert({
        task_id: taskId,
        uploaded_by: me.id,
        file_name: file.name,
        path,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
      if (rowErr) {
        errors.push(`${file.name}: ${rowErr.message}`);
        await supabase.storage.from(BUCKET).remove([path]);
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (errors.length) alert("No se pudieron subir algunos archivos:\n" + errors.join("\n"));
    await load();
  }

  async function remove(a: Attachment) {
    if (!confirm(`¿Borrar "${a.file_name}"?`)) return;
    await supabase.storage.from(BUCKET).remove([a.path]);
    await supabase.from("attachments").delete().eq("id", a.id);
    await load();
  }

  const images = items.filter((a) => a.mime_type?.startsWith("image/"));
  const others = items.filter((a) => !a.mime_type?.startsWith("image/"));
  const canDelete = (a: Attachment) => isAdmin || a.uploaded_by === me.id;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">
          Adjuntos {items.length > 0 && <span className="text-slate-400">({items.length})</span>}
        </h3>
        <button className="btn-ghost text-xs" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Subiendo..." : "+ Adjuntar"}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>

      {images.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          {images.map((a) => (
            <div key={a.id} className="group relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50">
              {urls[a.path] && (
                <a href={urls[a.path]} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[a.path]} alt={a.file_name} className="h-full w-full object-cover" />
                </a>
              )}
              {canDelete(a) && (
                <button
                  className="absolute top-1 right-1 rounded bg-black/60 px-1.5 text-xs text-white opacity-0 group-hover:opacity-100"
                  onClick={() => remove(a)}
                  aria-label={`Borrar ${a.file_name}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <ul className="space-y-1">
          {others.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
              <span aria-hidden>📎</span>
              <a href={urls[a.path]} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-indigo-700 hover:underline">
                {a.file_name}
              </a>
              <span className="text-xs text-slate-400">{formatSize(a.size_bytes)}</span>
              {canDelete(a) && (
                <button className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600" onClick={() => remove(a)}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <button
          className="w-full rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-400 hover:border-indigo-400 hover:text-indigo-600"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          Agrega fotos o archivos (hasta 10 MB cada uno)
        </button>
      )}
    </div>
  );
}
