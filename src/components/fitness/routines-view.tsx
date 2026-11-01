"use client";

import { useState } from "react";
import { ExercisePicker } from "@/components/fitness/exercise-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoWeekday, WEEKDAYS } from "@/lib/dates";
import {
  dayRoutineIds,
  MODULE_TEMPLATES,
  MUSCLE_COLORS,
  MUSCLES,
  ROUTINE_COLORS,
  routineMinutes,
  TEMPLATE_GROUPS,
  type Muscle,
  type Routine,
  type RoutineItem,
} from "@/lib/fitness";
import { useFitness } from "@/store/fitness-store";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Pencil, Play, Plus, Trash2 } from "lucide-react";

export function RoutinesView({
  onBack,
  onStart,
}: {
  onBack: () => void;
  onStart: (routine: Routine) => void;
}) {
  const { routines, weekPlan, readOnly, toggleWeekPlan, importTemplate, allExercises, exerciseById } =
    useFitness();
  const [editing, setEditing] = useState<{ routine: Routine | null; preset?: Muscle } | null>(null);

  if (editing) {
    return (
      <RoutineEditor
        key={editing.routine?.id ?? `new-${editing.preset ?? ""}`}
        routine={editing.routine}
        preset={editing.preset}
        onDone={() => setEditing(null)}
      />
    );
  }

  const todayWd = isoWeekday(new Date());
  const daysOf = (id: string) =>
    [1, 2, 3, 4, 5, 6, 7].filter((d) => dayRoutineIds(weekPlan, d).includes(id));
  const byMuscle = (m: Muscle) => routines.filter((r) => r.muscle === m);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回運動
      </Button>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">每個部位一個菜單，一天可以排好幾個</p>
          <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">課表</h2>
        </div>
        {!readOnly && (
          <Button className="gap-1.5" onClick={() => setEditing({ routine: null })}>
            <Plus data-icon="inline-start" />
            新增菜單
          </Button>
        )}
      </header>

      {!readOnly && (
        <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
          <h3 className="font-display text-lg text-ink">依部位建立菜單</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            點一個部位，會先帶入常見動作，你可以再自己增減、調整組數。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MUSCLES.map((m) => {
              const have = byMuscle(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEditing({ routine: null, preset: m })}
                  className="flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1.5 text-sm text-ink hover:bg-soft"
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: MUSCLE_COLORS[m] }} />
                  {m}
                  {have.length > 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      <Check className="inline size-3" />
                      {have.length > 1 ? have.length : ""}
                    </span>
                  ) : (
                    <Plus className="size-3 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
        <h3 className="font-display text-lg text-ink">每週課表</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {readOnly ? "每天排了哪些菜單" : "每天可以點選多個菜單，例如週一：胸＋肩＋背。沒選就是休息日。"}
        </p>
        <ul className="mt-2 divide-y divide-border/50">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const ids = dayRoutineIds(weekPlan, d);
            const chosen = ids.flatMap((id) => routines.filter((x) => x.id === id));
            const mins = chosen.reduce((a, r) => a + routineMinutes(r, allExercises), 0);
            return (
              <li key={d} className="flex items-start gap-3 py-2.5">
                <span
                  className={`w-12 shrink-0 pt-1 text-sm ${d === todayWd ? "font-medium text-ink" : "text-muted-foreground"}`}
                >
                  週{WEEKDAYS[d - 1]}
                  {d === todayWd && <span className="ml-0.5 text-[10px]">今</span>}
                </span>
                <div className="min-w-0 flex-1">
                  {readOnly || routines.length === 0 ? (
                    <p className="pt-1 text-sm text-ink">
                      {chosen.length ? chosen.map((r) => r.name).join("＋") : "休息"}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {routines.map((r) => {
                        const on = ids.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleWeekPlan(d, r.id)}
                            className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors ${
                              on ? "text-white" : "border-border/80 bg-card text-muted-foreground hover:text-ink"
                            }`}
                            style={on ? { backgroundColor: r.color, borderColor: r.color } : undefined}
                          >
                            {on && <Check className="mr-0.5 inline size-3" />}
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <span className="shrink-0 pt-1 text-xs tabular-nums text-muted-foreground">
                  {chosen.length ? `約 ${mins} 分` : "休息"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg text-ink">訓練菜單</h3>
        {routines.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            還沒有菜單，可以從上面挑部位建立，或從下方範本開始
          </p>
        )}
        {routines.map((r) => (
          <div
            key={r.id}
            className="overflow-hidden rounded-2xl border border-border/70 bg-card"
          >
            <div className="h-1.5" style={{ backgroundColor: r.color }} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-display flex flex-wrap items-center gap-2 text-lg text-ink">
                    {r.name}
                    {r.muscle && r.muscle !== r.name && (
                      <span className="rounded-full bg-wash px-2 py-0.5 font-sans text-[11px] text-muted-foreground">
                        {r.muscle}
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {r.items.length} 個動作・約 {routineMinutes(r, allExercises)} 分
                    {daysOf(r.id).length > 0 &&
                      `・每週${daysOf(r.id).map((d) => WEEKDAYS[d - 1]).join("、")}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  {!readOnly && (
                    <>
                      <Button size="sm" className="gap-1" onClick={() => onStart(r)}>
                        <Play className="size-3.5" />
                        開始
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        onClick={() => setEditing({ routine: r })}
                        aria-label="編輯菜單"
                      >
                        <Pencil />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <ul className="mt-2 space-y-0.5 text-sm">
                {r.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="text-ink">{exerciseById.get(it.exerciseId)?.name ?? "?"}</span>
                    <span className="text-muted-foreground">{itemSummary(it, exerciseById.get(it.exerciseId)?.kind)}</span>
                  </li>
                ))}
              </ul>
              {r.note && <p className="mt-2 text-xs text-muted-foreground">{r.note}</p>}
            </div>
          </div>
        ))}
      </section>

      {!readOnly && (
        <section className="space-y-3">
          <h3 className="font-display text-lg text-ink">範本</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {TEMPLATE_GROUPS.map((g, i) => (
              <div key={g.name} className="rounded-2xl border border-border/70 bg-card p-4">
                <h4 className="font-medium text-ink">{g.name}</h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{g.desc}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {g.routines.map((r, k) => `${r.name}（${g.days[k].map((d) => `週${WEEKDAYS[d - 1]}`).join("、")}）`).join("・")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                    if (confirm(`加入「${g.name}」的菜單並排進每週課表？（會加在那幾天原本的安排後面）`))
                      importTemplate(i);
                  }}
                >
                  套用
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function itemSummary(it: RoutineItem, kind: "strength" | "cardio" | undefined) {
  if (kind === "cardio") return `${it.minutes ?? 30} 分${it.distance ? `・${it.distance} km` : ""}`;
  return `${it.sets ?? 3} × ${it.reps ?? 10}${it.weight ? `・${it.weight} kg` : ""}`;
}

function RoutineEditor({
  routine,
  preset,
  onDone,
}: {
  routine: Routine | null;
  preset?: Muscle;
  onDone: () => void;
}) {
  const { saveRoutine, removeRoutine, exerciseById, routines } = useFitness();
  const [name, setName] = useState(routine?.name ?? preset ?? "");
  const [muscle, setMuscle] = useState<Muscle | "">(routine?.muscle ?? preset ?? "");
  const [color, setColor] = useState(
    routine?.color ??
      (preset ? MUSCLE_COLORS[preset] : ROUTINE_COLORS[routines.length % ROUTINE_COLORS.length]),
  );
  const [note, setNote] = useState(routine?.note ?? "");
  const [items, setItems] = useState<RoutineItem[]>(
    routine?.items ?? (preset ? MODULE_TEMPLATES[preset].map((x) => ({ ...x })) : []),
  );
  const colors = [...new Set([...ROUTINE_COLORS, ...Object.values(MUSCLE_COLORS)])];
  const [picking, setPicking] = useState(false);

  const patch = (i: number, p: Partial<RoutineItem>) =>
    setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  function save() {
    if (!name.trim()) return;
    saveRoutine({
      id: routine?.id,
      name: name.trim().slice(0, 40),
      color,
      ...(muscle ? { muscle } : {}),
      note: note.trim(),
      items,
    });
    onDone();
  }

  const num = (v: string) => (v === "" ? undefined : Math.max(0, Number(v)) || undefined);

  return (
    <div className="space-y-5">
      <Button variant="ghost" onClick={onDone} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回課表
      </Button>
      <h2 className="font-display text-2xl tracking-tight text-ink">
        {routine ? "編輯菜單" : preset ? `新增「${preset}」菜單` : "新增菜單"}
      </h2>

      <div className="grid gap-4 rounded-2xl border border-border/70 bg-card p-4">
        <div className="grid gap-2">
          <Label htmlFor="rt-name">名稱</Label>
          <Input id="rt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：胸、背、有氧" maxLength={40} />
        </div>
        <div className="grid gap-2">
          <Label>部位</Label>
          <div className="flex flex-wrap gap-1.5">
            {(["", ...MUSCLES] as const).map((m) => (
              <button
                key={m || "none"}
                type="button"
                onClick={() => {
                  setMuscle(m);
                  if (m && !routine) setColor(MUSCLE_COLORS[m]);
                }}
                className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${
                  muscle === m ? "border-chip bg-chip text-chip-foreground" : "border-border/80 text-muted-foreground"
                }`}
              >
                {m || "不分"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`size-7 rounded-full ring-offset-2 ${color === c ? "ring-2 ring-ink" : ""}`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rt-note">備註（選填）</Label>
          <Input id="rt-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((it, i) => {
          const ex = exerciseById.get(it.exerciseId);
          const cardio = ex?.kind === "cardio";
          return (
            <li key={i} className="rounded-xl border border-border/70 bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">{ex?.name ?? "?"}</span>
                <div className="flex">
                  <Button variant="ghost" size="icon-xs" onClick={() => move(i, -1)} aria-label="上移">
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => move(i, 1)} aria-label="下移">
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))}
                    aria-label="移除"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {cardio ? (
                  <>
                    <Field label="分鐘" value={it.minutes} onChange={(v) => patch(i, { minutes: num(v) })} />
                    <Field label="距離 km" value={it.distance} onChange={(v) => patch(i, { distance: num(v) })} />
                  </>
                ) : (
                  <>
                    <Field label="組數" value={it.sets} onChange={(v) => patch(i, { sets: num(v) })} />
                    <Field label="次數" value={it.reps} onChange={(v) => patch(i, { reps: num(v) })} />
                    <Field label="重量 kg（選填）" value={it.weight} onChange={(v) => patch(i, { weight: num(v) })} />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Button variant="outline" className="w-full gap-1.5" onClick={() => setPicking(true)}>
        <Plus data-icon="inline-start" />
        加入動作
      </Button>

      <div className="flex flex-wrap justify-between gap-2">
        {routine ? (
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (confirm(`刪除「${routine.name}」？過去的訓練紀錄會保留。`)) {
                removeRoutine(routine.id);
                onDone();
              }
            }}
          >
            <Trash2 className="size-3.5" />
            刪除菜單
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={!name.trim()}>
          儲存
        </Button>
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          const cardio = exerciseById.get(id)?.kind === "cardio";
          setItems((xs) => [...xs, cardio ? { exerciseId: id, minutes: 30 } : { exerciseId: id, sets: 3, reps: 10 }]);
        }}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label className="grid gap-1 text-[11px] text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 tabular-nums"
      />
    </label>
  );
}
