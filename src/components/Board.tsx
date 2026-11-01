"use client";

import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import type { Status, TodoDTO } from "@/types";
import { COLUMNS } from "@/lib/board";

interface Props {
  todos: TodoDTO[];
  /** 오늘(YYYY-MM-DD). 이보다 이전 날짜의 미완료 할 일은 날짜를 적색 굵게 표시한다 */
  today: string;
  onMove: (id: string, status: Status) => void;
  onEdit: (todo: TodoDTO) => void;
  onDelete: (todo: TodoDTO) => void;
}

function Card({ todo, today, onMove, onEdit, onDelete }: { todo: TodoDTO } & Omit<Props, "todos">) {
  const overdue = todo.status !== "done" && todo.date < today;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: todo.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid={`card-${todo.id}`}
      className={`rounded border bg-white p-2 text-sm shadow-sm ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button aria-label={`${todo.title} 이동`} className="cursor-grab select-none px-1 text-zinc-400" {...listeners} {...attributes}>
          ⠿
        </button>
        <div className="flex-1">
          <div className="font-medium">{todo.title}</div>
          <div className="text-xs text-zinc-500">
            <span data-testid={`date-${todo.id}`} className={overdue ? "font-bold text-red-600" : undefined} title={overdue ? "기한이 지난 미완료 할 일" : undefined}>
              {todo.date}
            </span>{" "}
            · {todo.weekTitle}
            {todo.goalTitle ? ` → ${todo.goalTitle}` : ""}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <select
          aria-label="상태 변경"
          className="rounded border px-1 py-0.5"
          value={todo.status}
          onChange={(e) => onMove(todo.id, e.target.value as Status)}
        >
          {COLUMNS.map((c) => (
            <option key={c.status} value={c.status}>
              {c.label}
            </option>
          ))}
        </select>
        <button className="underline" onClick={() => onEdit(todo)}>
          수정
        </button>
        <button className="text-red-700 underline" onClick={() => onDelete(todo)}>
          삭제
        </button>
      </div>
    </li>
  );
}

function Column({ status, label, todos, ...rest }: { status: Status; label: string; todos: TodoDTO[] } & Omit<Props, "todos">) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-testid={`column-${status}`}
      className={`min-h-48 flex-1 rounded border p-2 ${isOver ? "bg-emerald-50" : "bg-zinc-50"}`}
    >
      <h3 className="mb-2 text-sm font-semibold">
        {label} <span className="text-zinc-500">({todos.length})</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {todos.map((t) => (
          <Card key={t.id} todo={t} {...rest} />
        ))}
      </ul>
    </section>
  );
}

export function Board({ todos, ...rest }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over) rest.onMove(String(e.active.id), e.over.id as Status);
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3">
        {COLUMNS.map((c) => (
          <Column key={c.status} status={c.status} label={c.label} todos={todos.filter((t) => t.status === c.status)} {...rest} />
        ))}
      </div>
    </DndContext>
  );
}
