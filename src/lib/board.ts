import type { Status, TodoDTO } from "@/types";

export const COLUMNS: { status: Status; label: string }[] = [
  { status: "todo", label: "할 일" },
  { status: "doing", label: "진행 중" },
  { status: "done", label: "완료" },
];

export function isStatus(v: unknown): v is Status {
  return v === "todo" || v === "doing" || v === "done";
}

/**
 * 카드 이동이 실제 상태 변경인지 판단한다. 같은 컬럼이거나 대상 카드/상태가 올바르지 않으면 null (요청 불필요).
 */
export function planMove(
  todos: TodoDTO[],
  id: string,
  target: unknown,
): { previous: Status; target: Status } | null {
  if (!isStatus(target)) return null;
  const current = todos.find((t) => t.id === id);
  if (!current || current.status === target) return null;
  return { previous: current.status, target };
}

const withStatus = (id: string, status: Status) => (ts: TodoDTO[]) =>
  ts.map((t) => (t.id === id ? { ...t, status } : t));

/**
 * 낙관적 상태 변경을 저장한다. 실패하면 "해당 카드만" 이전 상태로 되돌린다
 * (다른 카드의 진행 중인 이동을 덮어쓰지 않도록 함수형 업데이트만 사용).
 * 성공 시 onSaved(진행률 재조회 등)를 호출한다.
 */
export async function persistMove(opts: {
  todos: TodoDTO[];
  id: string;
  target: unknown;
  save: (id: string, status: Status) => Promise<unknown>;
  update: (updater: (todos: TodoDTO[]) => TodoDTO[]) => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
}): Promise<boolean> {
  const move = planMove(opts.todos, opts.id, opts.target);
  if (!move) return false;
  const { previous, target } = move;
  opts.update(withStatus(opts.id, target));
  try {
    await opts.save(opts.id, target);
  } catch (e) {
    opts.update(withStatus(opts.id, previous));
    opts.onError(e instanceof Error ? e.message : "상태 변경에 실패했습니다");
    return false;
  }
  await opts.onSaved();
  return true;
}
