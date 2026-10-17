import type { Priority, Task } from "@/lib/types";
import { PRIORITY_CLASS, PRIORITY_LABEL, PROJECT_COLORS } from "@/lib/types";
import { formatDue } from "@/lib/utils";

export function DueBadge({ date, completed }: { date: string | null; completed?: boolean }) {
  const due = formatDue(date);
  if (!due) return null;
  const color = completed ? "text-slate-400" : due.overdue ? "text-rose-600" : due.soon ? "text-emerald-600" : "text-slate-500";
  return <span className={`text-xs whitespace-nowrap ${color}`}>{due.label}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) return null;
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${PRIORITY_CLASS[priority]}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function CheckButton({ task, onToggle, disabled }: { task: Pick<Task, "completed">; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={task.completed ? "Marcar como pendiente" : "Marcar como completada"}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] transition ${
        task.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500"
      }`}
    >
      ✓
    </button>
  );
}

export function ColorPicker({ value, onChange, allowNone, disabled }: { value: string | null; onChange: (c: string | null) => void; allowNone?: boolean; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowNone && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          title="Sin color"
          className={`h-6 w-6 rounded-full border border-dashed border-slate-300 text-[10px] text-slate-400 ${value === null ? "ring-2 ring-slate-400 ring-offset-1" : ""}`}
        >
          ✕
        </button>
      )}
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          className={`h-6 w-6 rounded-full ${value === c ? "ring-2 ring-slate-500 ring-offset-1" : ""}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
