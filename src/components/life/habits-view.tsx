"use client";

import { useState } from "react";
import { addDays, startOfWeek, subDays } from "date-fns";
import { CheckButton } from "@/components/check-button";
import { MinutesField } from "@/components/minutes-field";
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
import { isoWeekday, toDateKey, WEEKDAYS } from "@/lib/dates";
import { HABIT_ICONS, HABIT_PRESETS, type Habit } from "@/lib/life";
import { useLife } from "@/store/life-store";
import { ArrowLeft, Check, Flame, Pencil, Plus, Trash2 } from "lucide-react";

/** Consecutive scheduled days done, counting back from today (today counts only if done). */
export function habitStreak(habit: Habit, log: Record<string, string[]>, today = new Date()) {
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = subDays(today, i);
    if (!habit.days.includes(isoWeekday(d))) continue;
    const done = log[toDateKey(d)]?.includes(habit.id);
    if (done) streak++;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

export function HabitsView({ color, onBack }: { color: string; onBack: () => void }) {
  const { habits = [], habitLog = {}, readOnly, setHabitDone } = useLife();
  const [editing, setEditing] = useState<Habit | "new" | null>(null);

  const now = new Date();
  const today = toDateKey(now);
  const todayWd = isoWeekday(now);
  const todays = habits
    .filter((h) => h.days.includes(todayWd))
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const doneToday = todays.filter((h) => habitLog[today]?.includes(h.id)).length;

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i)));
  let weekDue = 0;
  let weekDone = 0;
  weekDates.forEach((d, i) => {
    if (d > today) return;
    for (const h of habits) {
      if (!h.days.includes(i + 1)) continue;
      weekDue++;
      if (habitLog[d]?.includes(h.id)) weekDone++;
    }
  });

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回生活
      </Button>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">設定每週哪幾天要做哪些家事，當天會排進「今日」</p>
          <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">習慣</h2>
        </div>
        {!readOnly && (
          <Button className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus data-icon="inline-start" />
            新增習慣
          </Button>
        )}
      </header>

      {habits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-14 text-center">
          <p className="font-display text-xl text-ink">還沒有習慣</p>
          <p className="mt-2 text-sm text-muted-foreground">
            例如：週二、週五倒垃圾；週日洗衣服。
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="font-display text-lg text-ink">今天（星期{WEEKDAYS[todayWd - 1]}）</h3>
              <span className="text-xs text-muted-foreground">
                {todays.length ? `${doneToday}/${todays.length} 完成` : ""}
                {weekDue ? `・本週 ${Math.round((weekDone / weekDue) * 100)}%` : ""}
              </span>
            </div>
            {todays.length === 0 ? (
              <p className="text-sm text-muted-foreground">今天沒有排家事 🎉</p>
            ) : (
              <ul className="space-y-2">
                {todays.map((h) => {
                  const done = !!habitLog[today]?.includes(h.id);
                  const streak = habitStreak(h, habitLog);
                  return (
                    <li
                      key={h.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${done ? "border-border/50 bg-slate-50/60" : "border-border/70"}`}
                    >
                      <CheckButton
                        done={done}
                        color={color}
                        readOnly={readOnly}
                        onToggle={() => setHabitDone(today, h.id, !done)}
                      />
                      <span className="text-lg leading-none">{h.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-sm font-medium ${done ? "text-muted-foreground line-through" : "text-ink"}`}
                        >
                          {h.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {h.time ? `${h.time}・` : ""}約 {h.minutes} 分
                        </span>
                      </span>
                      {streak > 1 && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-700">
                          <Flame className="size-3.5" />
                          {streak}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="overflow-x-auto rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
            <h3 className="font-display mb-3 text-lg text-ink">每週安排</h3>
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pb-2 text-left font-normal">項目</th>
                  {WEEKDAYS.map((w, i) => (
                    <th
                      key={w}
                      className={`w-9 pb-2 text-center font-normal ${i + 1 === todayWd ? "font-medium text-ink" : ""}`}
                    >
                      {w}
                    </th>
                  ))}
                  {!readOnly && <th className="w-16" />}
                </tr>
              </thead>
              <tbody>
                {habits.map((h) => (
                  <tr key={h.id} className="border-t border-border/50">
                    <td className="py-2 pr-2">
                      <span className="mr-1.5">{h.icon}</span>
                      <span className="text-ink">{h.title}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        <Flame className="mb-0.5 inline size-3" />
                        {habitStreak(h, habitLog)}
                      </span>
                    </td>
                    {weekDates.map((d, i) => {
                      const scheduled = h.days.includes(i + 1);
                      const done = habitLog[d]?.includes(h.id);
                      const past = d < today;
                      return (
                        <td key={d} className="py-2 text-center">
                          {scheduled ? (
                            <button
                              type="button"
                              disabled={readOnly || d > today}
                              onClick={() => setHabitDone(d, h.id, !done)}
                              className={`mx-auto flex size-7 items-center justify-center rounded-full border transition-colors disabled:cursor-default ${
                                done
                                  ? "border-transparent text-white"
                                  : past
                                    ? "border-rose-300 bg-rose-50"
                                    : "border-border"
                              }`}
                              style={done ? { backgroundColor: color } : undefined}
                              aria-label={`${d} ${h.title}${done ? " 已完成" : ""}`}
                            >
                              {done && <Check className="size-3.5" />}
                            </button>
                          ) : (
                            <span className="text-slate-300">·</span>
                          )}
                        </td>
                      );
                    })}
                    {!readOnly && (
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground"
                          onClick={() => setEditing(h)}
                          aria-label="編輯"
                        >
                          <Pencil />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              圓圈是本週要做的日子；紅色代表已過但沒做。可以點過去的日子補勾。
            </p>
          </section>
        </>
      )}

      {editing && (
        <HabitDialog habit={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function HabitDialog({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const { addHabit, updateHabit, removeHabit } = useLife();
  const [title, setTitle] = useState(habit?.title ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? HABIT_ICONS[0]);
  const [days, setDays] = useState<number[]>(habit?.days ?? []);
  const [minutes, setMinutes] = useState<number | null>(habit?.minutes ?? 15);
  const [time, setTime] = useState(habit?.time ?? "");

  const valid = title.trim() && days.length > 0;

  function submit() {
    if (!valid) return;
    const fields = { title: title.trim(), icon, days, minutes: minutes ?? 15, time };
    if (habit) updateHabit(habit.id, fields);
    else addHabit(fields);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{habit ? "編輯習慣" : "新增習慣"}</DialogTitle>
          <DialogDescription>選一週中要做的日子，那幾天會自動出現在「今日」。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {!habit && (
            <div className="flex flex-wrap gap-1.5">
              {HABIT_PRESETS.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  onClick={() => {
                    setTitle(p.title);
                    setIcon(p.icon);
                    setMinutes(p.minutes);
                  }}
                  className="rounded-full border border-border/80 bg-white px-2.5 py-1 text-xs text-muted-foreground hover:text-ink"
                >
                  {p.icon} {p.title}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="habit-title">名稱</Label>
            <Input
              id="habit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：倒垃圾"
              maxLength={40}
            />
          </div>
          <div className="grid gap-2">
            <Label>圖示</Label>
            <div className="flex flex-wrap gap-1">
              {HABIT_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`flex size-9 items-center justify-center rounded-lg border text-lg ${
                    icon === i ? "border-ink bg-slate-100" : "border-transparent hover:bg-slate-50"
                  }`}
                  aria-pressed={icon === i}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>星期</Label>
              <div className="flex gap-1">
                <Button variant="ghost" size="xs" onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}>
                  每天
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setDays([1, 2, 3, 4, 5])}>
                  平日
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setDays([6, 7])}>
                  週末
                </Button>
              </div>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDays((ds) => (on ? ds.filter((x) => x !== d) : [...ds, d].sort()))
                    }
                    className={`flex-1 rounded-lg border py-1.5 text-sm transition-colors ${
                      on ? "border-ink bg-ink text-white" : "border-border bg-white text-muted-foreground"
                    }`}
                    aria-pressed={on}
                  >
                    {WEEKDAYS[d - 1]}
                  </button>
                );
              })}
            </div>
          </div>
          <MinutesField
            id="habit-minutes"
            label="大約需要"
            value={minutes}
            onChange={setMinutes}
            presets={[5, 10, 15, 30, 60]}
          />
          <div className="grid gap-2">
            <Label htmlFor="habit-time">習慣時間（選填）</Label>
            <Input id="habit-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {habit ? (
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm(`刪除「${habit.title}」？`)) {
                  removeHabit(habit.id);
                  onClose();
                }
              }}
            >
              <Trash2 className="size-3.5" />
              刪除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={submit} disabled={!valid}>
              {habit ? "儲存" : "新增"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
