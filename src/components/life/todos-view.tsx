"use client";

import { useState, type FormEvent } from "react";
import { CheckButton } from "@/components/check-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatShortDate, relativeStatus, toDateKey } from "@/lib/dates";
import type { Todo } from "@/lib/life";
import { useLife } from "@/store/life-store";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const byWhen = (a: Todo, b: Todo) =>
  a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99");

export function TodosView({ color, onBack }: { color: string; onBack: () => void }) {
  const { todos, readOnly, addTodo, toggleTodo, removeTodo } = useLife();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [time, setTime] = useState("");

  const open = todos.filter((t) => !t.done).sort(byWhen);
  const done = todos
    .filter((t) => t.done)
    .sort((a, b) => byWhen(b, a))
    .slice(0, 30);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !date) return;
    addTodo({ title, date, time });
    setTitle("");
    setTime("");
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回生活
      </Button>

      <header>
        <p className="text-sm text-muted-foreground">依日期與時間排序</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">
          待做事項
        </h2>
      </header>

      {!readOnly && (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-2xl border border-border/70 bg-white p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end sm:p-5"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="todo-title">名稱</Label>
            <Input
              id="todo-title"
              placeholder="例如：繳電話費"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <div className="grid gap-1.5">
              <Label htmlFor="todo-date">日期</Label>
              <Input
                id="todo-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="todo-time">時間（選填）</Label>
              <Input
                id="todo-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" disabled={!title.trim() || !date} className="gap-1.5">
            <Plus data-icon="inline-start" />
            新增
          </Button>
        </form>
      )}

      <section className="space-y-2">
        {open.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
            沒有未完成的事項
          </p>
        ) : (
          <ul className="space-y-2">
            {open.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                color={color}
                readOnly={readOnly}
                onToggle={() => toggleTodo(t.id)}
                onRemove={() => removeTodo(t.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">已完成</h3>
          <ul className="space-y-2">
            {done.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                color={color}
                readOnly={readOnly}
                onToggle={() => toggleTodo(t.id)}
                onRemove={() => removeTodo(t.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  color,
  readOnly,
  onToggle,
  onRemove,
}: {
  todo: Todo;
  color: string;
  readOnly: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const status = relativeStatus(todo.date, todo.done);
  return (
    <li
      className={`flex items-start gap-3 rounded-xl border bg-white px-3 py-3 ${
        todo.done ? "border-border/50 opacity-70" : "border-border/70"
      }`}
    >
      <CheckButton
        done={todo.done}
        color={color}
        readOnly={readOnly}
        onToggle={onToggle}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-medium ${todo.done ? "text-muted-foreground line-through" : "text-ink"}`}
          >
            {todo.title}
          </span>
          {status === "overdue" && (
            <Badge className="bg-rose-700 text-white hover:bg-rose-700">已過期</Badge>
          )}
          {status === "today" && (
            <Badge className="bg-teal-700 text-white hover:bg-teal-700">今天</Badge>
          )}
          {status === "tomorrow" && <Badge variant="secondary">明天</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatShortDate(todo.date)}
          {todo.time ? ` ${todo.time}` : ""}
        </p>
      </div>
      {!readOnly && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={onRemove}
          aria-label="刪除事項"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}
