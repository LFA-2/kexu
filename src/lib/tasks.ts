import { supabase } from "@/lib/supabase";

export type Task = {
  id: number;
  created_by: string;
  assignee: string;
  title: string;
  note: string;
  reward: string;
  due_at: string;
  done_at: string | null;
  rewarded_at: string | null;
  created_at: string;
};

export type TaskFields = Pick<Task, "title" | "note" | "reward" | "due_at">;

const COLUMNS = "id, created_by, assignee, title, note, reward, due_at, done_at, rewarded_at, created_at";

export async function listTasks(): Promise<Task[] | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(COLUMNS)
    .order("due_at")
    .order("id")
    .limit(500);
  if (error) return null;
  return data as Task[];
}

export async function createTask(me: string, assignee: string, fields: TaskFields): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ created_by: me, assignee, ...fields })
    .select(COLUMNS)
    .single();
  if (error) return null;
  return data as Task;
}

export async function updateTask(
  id: number,
  patch: Partial<TaskFields> | { done_at: string | null } | { rewarded_at: string | null },
): Promise<Task | null> {
  const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select(COLUMNS).single();
  if (error) return null;
  return data as Task;
}

export async function deleteTask(id: number) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  return !error;
}

/** "2 天 3 小時", "45 分 08 秒": the larger units only, seconds once under an hour. */
export function formatSpan(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return h ? `${d} 天 ${h} 小時` : `${d} 天`;
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分 ${String(sec).padStart(2, "0")} 秒`;
}
