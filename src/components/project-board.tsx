"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Section, Task } from "@/lib/types";
import { Avatar } from "./avatar";
import { CheckButton, DueBadge, PriorityBadge } from "./task-fields";
import { useWorkspace } from "./workspace-provider";

export const NO_SECTION = "sin-seccion";

export type Column = { id: string; name: string; section: Section | null; tasks: Task[] };

type ViewProps = {
  layout: "lista" | "tablero";
  columns: Column[];
  subtaskCount: Record<string, { done: number; total: number }>;
  onOpen: (task: Task) => void;
  onToggle: (task: Task) => void;
  onMove: (task: Task, columnId: string, index: number) => void;
  onAddTask: (columnId: string, title: string) => void;
  onRenameSection: (section: Section, name: string) => void;
  onDeleteSection: (section: Section) => void;
};

export function ProjectBoard(props: ViewProps) {
  const { layout, columns, onMove } = props;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const task = columns.flatMap((c) => c.tasks).find((t) => t.id === active.id);
    if (!task) return;
    const overColumn = columns.find((c) => c.id === over.id) ?? columns.find((c) => c.tasks.some((t) => t.id === over.id));
    if (!overColumn) return;
    const rest = overColumn.tasks.filter((t) => t.id !== task.id);
    const overIndex = rest.findIndex((t) => t.id === over.id);
    const sourceColumn = columns.find((c) => c.tasks.some((t) => t.id === task.id));
    let index = overIndex === -1 ? rest.length : overIndex;
    // Bajando dentro de la misma columna, la tarea queda después de la que está debajo.
    if (sourceColumn?.id === overColumn.id && overIndex !== -1) {
      const from = overColumn.tasks.findIndex((t) => t.id === task.id);
      const to = overColumn.tasks.findIndex((t) => t.id === over.id);
      if (from < to) index = overIndex + 1;
    }
    if (sourceColumn?.id === overColumn.id && overColumn.tasks.findIndex((t) => t.id === task.id) === index) return;
    onMove(task, overColumn.id, index);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className={layout === "tablero" ? "flex items-start gap-4 overflow-x-auto p-4" : "space-y-6 p-4"}>
        {columns.map((c) => (
          <ColumnView key={c.id} column={c} {...props} />
        ))}
      </div>
    </DndContext>
  );
}

function ColumnView({ column, layout, subtaskCount, onOpen, onToggle, onAddTask, onRenameSection, onDeleteSection }: ViewProps & { column: Column }) {
  const { isAdmin } = useWorkspace();
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const board = layout === "tablero";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim()) onAddTask(column.id, title.trim());
    setTitle("");
  }

  return (
    <section className={board ? "flex w-72 shrink-0 flex-col rounded-lg bg-slate-100 p-2" : ""}>
      <header className="group mb-2 flex items-center gap-2 px-1">
        {column.section && isAdmin ? (
          <input
            key={column.section.name}
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 font-semibold outline-none hover:border-slate-300 focus:border-indigo-400 focus:bg-white"
            defaultValue={column.name}
            onBlur={(e) => e.target.value.trim() && e.target.value !== column.name && onRenameSection(column.section!, e.target.value.trim())}
          />
        ) : (
          <h2 className="flex-1 px-1 font-semibold">{column.name}</h2>
        )}
        <span className="text-xs text-slate-400">{column.tasks.length}</span>
        {column.section && isAdmin && (
          <button
            className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600"
            title="Borrar sección"
            onClick={() => onDeleteSection(column.section!)}
          >
            ✕
          </button>
        )}
      </header>

      <SortableContext id={column.id} items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={`min-h-10 rounded-md transition ${board ? "space-y-2" : "divide-y divide-slate-100 border border-slate-200 bg-white"} ${isOver ? "ring-2 ring-indigo-200" : ""}`}
        >
          {column.tasks.map((t) => (
            <TaskItem key={t.id} task={t} board={board} sub={subtaskCount[t.id]} onOpen={onOpen} onToggle={onToggle} />
          ))}
          {!board && column.tasks.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Sin tareas</li>}
        </ul>
      </SortableContext>

      {adding ? (
        <form onSubmit={submit} className="mt-2">
          <input
            autoFocus
            className="input"
            placeholder="Nombre de la tarea y Enter"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title && setAdding(false)}
          />
        </form>
      ) : (
        <button className="btn-ghost mt-1 w-full justify-start" onClick={() => setAdding(true)}>
          + Agregar tarea
        </button>
      )}
    </section>
  );
}

function TaskItem({
  task,
  board,
  sub,
  onOpen,
  onToggle,
}: {
  task: Task;
  board: boolean;
  sub?: { done: number; total: number };
  onOpen: (t: Task) => void;
  onToggle: (t: Task) => void;
}) {
  const { members } = useWorkspace();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const assignee = members.find((m) => m.user_id === task.assignee_id)?.profile ?? null;
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const title = <span className={`min-w-0 flex-1 text-sm ${task.completed ? "text-slate-400 line-through" : ""}`}>{task.title}</span>;
  const subBadge = sub && sub.total > 0 && (
    <span className="text-xs text-slate-400">
      {sub.done}/{sub.total}
    </span>
  );

  if (board) {
    return (
      <li
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => onOpen(task)}
        className="cursor-pointer rounded-md border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300"
      >
        <div className="flex items-start gap-2">
          <CheckButton task={task} onToggle={() => onToggle(task)} />
          {title}
        </div>
        <div className="mt-2 flex items-center gap-2 pl-7">
          <PriorityBadge priority={task.priority} />
          <DueBadge date={task.due_date} completed={task.completed} />
          {subBadge}
          <span className="flex-1" />
          {task.assignee_id && <Avatar profile={assignee} size="sm" />}
        </div>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      className="flex cursor-pointer items-center gap-3 bg-white px-3 py-2 hover:bg-slate-50"
    >
      <CheckButton task={task} onToggle={() => onToggle(task)} />
      {title}
      {subBadge}
      <PriorityBadge priority={task.priority} />
      <span className="w-16 text-right">
        <DueBadge date={task.due_date} completed={task.completed} />
      </span>
      <Avatar profile={assignee} size="sm" />
    </li>
  );
}
