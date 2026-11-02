"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { zhTW } from "date-fns/locale";
import type { Person } from "@/components/shared-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTask, deleteTask, formatSpan, listTasks, updateTask, type Task, type TaskFields } from "@/lib/tasks";
import { ArrowLeft, Check, Gift, Pencil, Plus, Trash2, Undo2 } from "lucide-react";

const POLL_MS = 15000;
const DAY_MS = 86400000;
const URGENT = "#f59e0b";
const OVERDUE = "var(--destructive)";
const CALM = "#1baf7a";

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const formatDue = (iso: string) => format(new Date(iso), "M/d（EEE）HH:mm", { locale: zhTW });

export function TasksView({ people, onBack }: { people: Person[]; onBack: () => void }) {
  const me = people.find((p) => p.isMe)!;
  const others = people.filter((p) => !p.isMe);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"mine" | "assigned">("mine");
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const now = useNow(1000);

  const refresh = useCallback(async () => {
    const list = await listTasks();
    if (list) {
      setTasks(list);
      setError(false);
    } else setError(true);
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const replace = (t: Task | null) => {
    if (!t) {
      alert("儲存失敗，請確認網路，以及你們仍然是連結狀態。");
      return;
    }
    setTasks((list) => (list ?? []).map((x) => (x.id === t.id ? t : x)));
  };

  const mine = (tasks ?? []).filter((t) => t.assignee === me.userId);
  const assigned = (tasks ?? []).filter((t) => t.created_by === me.userId);
  const shown = tab === "mine" ? mine : assigned;
  const open = shown.filter((t) => !t.done_at);
  const done = shown
    .filter((t) => t.done_at)
    .sort((a, b) => b.done_at!.localeCompare(a.done_at!));
  const person = (id: string) => people.find((p) => p.userId === id);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回共同
      </Button>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">給連結的人下任務，設定期限和獎勵</p>
          <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">指派任務</h2>
        </div>
        <Button className="gap-1.5 self-start sm:self-auto" onClick={() => setEditing("new")} disabled={!others.length}>
          <Plus data-icon="inline-start" />
          指派任務
        </Button>
      </header>

      <div className="flex gap-2">
        {(
          [
            ["mine", "我收到的", mine],
            ["assigned", "我指派的", assigned],
          ] as const
        ).map(([key, label, list]) => {
          const count = list.filter((t) => !t.done_at).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                tab === key
                  ? "border-chip bg-chip text-chip-foreground"
                  : "border-border/80 bg-card text-muted-foreground hover:text-ink"
              }`}
            >
              {label}
              {count > 0 && <span className="ml-1 tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">讀取失敗，請確認網路。</p>}
      {tasks === null ? (
        <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          {tab === "mine" ? "還沒有人指派任務給你" : "按「指派任務」給連結的人下一個任務"}
        </p>
      ) : (
        <div className="space-y-6">
          {open.length > 0 && (
            <ul className="space-y-3">
              {open.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  now={now}
                  isAssignee={t.assignee === me.userId}
                  other={person(t.assignee === me.userId ? t.created_by : t.assignee)}
                  onDone={async () => replace(await updateTask(t.id, { done_at: new Date().toISOString() }))}
                  onEdit={() => setEditing(t)}
                  onDelete={async () => {
                    if (!confirm(`刪除任務「${t.title}」？`)) return;
                    if (await deleteTask(t.id)) setTasks((list) => (list ?? []).filter((x) => x.id !== t.id));
                    else alert("刪除失敗，請確認網路。");
                  }}
                />
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">已完成</h3>
              <ul className="space-y-3">
                {done.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    now={now}
                    isAssignee={t.assignee === me.userId}
                    other={person(t.assignee === me.userId ? t.created_by : t.assignee)}
                    onUndo={async () => replace(await updateTask(t.id, { done_at: null }))}
                    onReward={async () => replace(await updateTask(t.id, { rewarded_at: new Date().toISOString() }))}
                    onDelete={async () => {
                      if (!confirm(`刪除任務「${t.title}」？`)) return;
                      if (await deleteTask(t.id)) setTasks((list) => (list ?? []).filter((x) => x.id !== t.id));
                      else alert("刪除失敗，請確認網路。");
                    }}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {editing && (
        <TaskDialog
          task={editing === "new" ? null : editing}
          others={others}
          onClose={() => setEditing(null)}
          onSave={async (assignee, fields) => {
            if (editing === "new") {
              const t = await createTask(me.userId, assignee, fields);
              if (!t) return "建立失敗，請確認網路，以及你們仍然是連結狀態。";
              setTasks((list) => [...(list ?? []), t].sort((a, b) => a.due_at.localeCompare(b.due_at)));
              setTab("assigned");
            } else {
              const t = await updateTask(editing.id, fields);
              if (!t) return "儲存失敗，請確認網路。";
              replace(t);
            }
            setEditing(null);
            return null;
          }}
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  now,
  isAssignee,
  other,
  onDone,
  onUndo,
  onReward,
  onEdit,
  onDelete,
}: {
  task: Task;
  now: number;
  isAssignee: boolean;
  other: Person | undefined;
  onDone?: () => void;
  onUndo?: () => void;
  onReward?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const due = new Date(task.due_at).getTime();
  const start = new Date(task.created_at).getTime();
  const doneAt = task.done_at ? new Date(task.done_at).getTime() : null;
  const at = doneAt ?? now;
  const left = due - at;
  const total = Math.max(1, due - start);
  const pct = Math.max(0, Math.min(1, left / total));
  const overdue = left < 0;
  const color = doneAt ? (overdue ? URGENT : CALM) : overdue ? OVERDUE : left < DAY_MS || pct < 0.25 ? URGENT : CALM;
  const status = doneAt
    ? overdue
      ? `完成・逾期 ${formatSpan(-left)}`
      : `完成・提早 ${formatSpan(left)}`
    : overdue
      ? `已逾期 ${formatSpan(-left)}`
      : `剩 ${formatSpan(left)}`;
  const name = other?.name ?? "已取消連結";

  return (
    <li
      className={`rounded-2xl border bg-card p-4 ${doneAt ? "border-border/50" : "border-border/70"}`}
      style={{ borderLeft: `4px solid ${other?.color ?? "var(--border)"}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`font-medium ${doneAt ? "text-muted-foreground line-through" : "text-ink"}`}>{task.title}</p>
          <p className="text-xs text-muted-foreground">
            {isAssignee ? `${name} 指派給你` : `指派給 ${name}`}・{formatDue(task.due_at)} 截止
          </p>
        </div>
        {!isAssignee && (
          <div className="flex shrink-0 gap-0.5">
            {onEdit && (
              <Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={onEdit} aria-label="編輯任務">
                <Pencil />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label="刪除任務"
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {task.note && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{task.note}</p>}

      {task.reward && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-900 ring-1 ring-amber-300/80">
          <Gift className="size-3.5" />
          獎勵：{task.reward}
          {task.rewarded_at && <span className="font-medium">・已兌現</span>}
        </p>
      )}

      <div className="mt-3">
        <div
          className="h-2 overflow-hidden rounded-full bg-wash"
          role="progressbar"
          aria-label="剩餘時間"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 100)}
        >
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${overdue && !doneAt ? 100 : pct * 100}%`, backgroundColor: color }}
          />
        </div>
        <p className="mt-1 text-sm font-medium tabular-nums" style={{ color }}>
          {status}
        </p>
      </div>

      {(onDone || onUndo || onReward) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {isAssignee && !doneAt && onDone && (
            <Button size="sm" className="gap-1" onClick={onDone}>
              <Check className="size-3.5" />
              完成
            </Button>
          )}
          {isAssignee && doneAt && !task.rewarded_at && onUndo && (
            <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={onUndo}>
              <Undo2 className="size-3.5" />
              取消完成
            </Button>
          )}
          {!isAssignee && doneAt && task.reward && !task.rewarded_at && onReward && (
            <Button size="sm" className="gap-1" onClick={onReward}>
              <Gift className="size-3.5" />
              獎勵給了
            </Button>
          )}
          {isAssignee && doneAt && task.reward && !task.rewarded_at && (
            <span className="self-center text-xs text-muted-foreground">等 {name} 給獎勵</span>
          )}
        </div>
      )}
    </li>
  );
}

function TaskDialog({
  task,
  others,
  onClose,
  onSave,
}: {
  task: Task | null;
  others: Person[];
  onClose: () => void;
  onSave: (assignee: string, fields: TaskFields) => Promise<string | null>;
}) {
  const initialDue = task ? new Date(task.due_at) : null;
  const [assignee, setAssignee] = useState(task?.assignee ?? others[0]?.userId ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [reward, setReward] = useState(task?.reward ?? "");
  const [date, setDate] = useState(format(initialDue ?? addDays(new Date(), 1), "yyyy-MM-dd"));
  const [time, setTime] = useState(initialDue ? format(initialDue, "HH:mm") : "23:59");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = others.find((p) => p.userId === assignee);

  async function save() {
    const due = new Date(`${date}T${time}`);
    if (Number.isNaN(due.getTime())) return setError("請填期限的日期和時間。");
    if (!task && due.getTime() <= Date.now()) return setError("期限要在現在之後。");
    setBusy(true);
    setError(null);
    const message = await onSave(assignee, {
      title: title.trim(),
      note: note.trim(),
      reward: reward.trim(),
      due_at: due.toISOString(),
    });
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "編輯任務" : "指派任務"}</DialogTitle>
          <DialogDescription>
            {task ? "修改後對方會看到新的內容和期限。" : `${target ? `給 ${target.name}` : ""}一個任務，對方完成後會標記完成。`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {!task && others.length > 1 && (
            <div className="grid gap-2">
              <Label htmlFor="task-assignee">給誰</Label>
              <select
                id="task-assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
              >
                {others.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="task-title">任務</Label>
            <Input
              id="task-title"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：把房間整理乾淨"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-note">說明（選填）</Label>
            <Textarea id="task-note" value={note} maxLength={2000} rows={2} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="task-date">期限日期</Label>
              <Input id="task-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-time">時間</Label>
              <Input id="task-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-reward">獎勵（選填）</Label>
            <Input
              id="task-reward"
              value={reward}
              maxLength={200}
              onChange={(e) => setReward(e.target.value)}
              placeholder="例如：請喝一杯珍奶"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || !title.trim() || !date || !time || !assignee} onClick={save}>
            {task ? "儲存" : "指派"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
