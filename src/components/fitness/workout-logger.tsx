"use client";

import { useEffect, useMemo, useState } from "react";
import { ExercisePicker } from "@/components/fitness/exercise-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toDateKey } from "@/lib/dates";
import {
  e1rm,
  formatKg,
  formatPace,
  type Routine,
  type Session,
  type SessionEntry,
} from "@/lib/fitness";
import { uid } from "@/lib/utils";
import { useFitness } from "@/store/fitness-store";
import { ArrowLeft, Check, Minus, Plus, Timer, Trash2, Trophy, X } from "lucide-react";

const draftKey = (owner: string) => `kexu-workout-draft-${owner}`;

export function readDraft(owner: string): Session | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(owner)) ?? "null");
    return d && Array.isArray(d.entries) ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(owner: string, s: Session | null) {
  try {
    if (s) localStorage.setItem(draftKey(owner), JSON.stringify(s));
    else localStorage.removeItem(draftKey(owner));
  } catch {
    // ignore
  }
}

export function newSession(
  routines: Routine[],
  lastSets: (exerciseId: string) => SessionEntry["sets"] | undefined,
  isCardio: (exerciseId: string) => boolean,
): Session {
  return {
    id: uid("ws"),
    date: toDateKey(new Date()),
    title: routines.length ? routines.map((r) => r.name).join("＋") : "自由訓練",
    routineId: routines[0]?.id,
    startedAt: new Date().toISOString(),
    durationMin: 0,
    note: "",
    entries: routines.flatMap((r) => r.items).map((it) => {
      if (isCardio(it.exerciseId)) {
        return {
          exerciseId: it.exerciseId,
          cardio: { minutes: it.minutes ?? 30, ...(it.distance ? { distance: it.distance } : {}) },
        };
      }
      const prev = lastSets(it.exerciseId);
      const n = it.sets ?? prev?.length ?? 3;
      return {
        exerciseId: it.exerciseId,
        sets: Array.from({ length: n }, (_, i) => ({
          weight: it.weight ?? prev?.[Math.min(i, prev.length - 1)]?.weight ?? 0,
          reps: it.reps ?? prev?.[Math.min(i, prev.length - 1)]?.reps ?? 10,
          done: false,
        })),
      };
    }),
  };
}

export function WorkoutLogger({
  owner,
  initial,
  onExit,
  onFinished,
}: {
  owner: string;
  initial: Session;
  onExit: () => void;
  onFinished: (session: Session, prs: string[]) => void;
}) {
  const { exerciseById, sessions, saveSession, restSec = 90, setRestSec } = useFitness();
  const [session, setSession] = useState<Session>(initial);
  const [picking, setPicking] = useState(false);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const editingExisting = sessions.some((s) => s.id === initial.id);

  useEffect(() => {
    if (!editingExisting) writeDraft(owner, session);
  }, [owner, session, editingExisting]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const restLeft = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0;
  useEffect(() => {
    if (restEnd && restLeft === 0) {
      navigator.vibrate?.([200, 100, 200]);
      const t = setTimeout(() => setRestEnd(null), 1500);
      return () => clearTimeout(t);
    }
  }, [restEnd, restLeft]);

  const history = useMemo(
    () => [...sessions].filter((s) => s.id !== session.id).sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, session.id],
  );
  const lastEntry = (exerciseId: string) =>
    history.flatMap((s) => s.entries.filter((e) => e.exerciseId === exerciseId))[0];

  const elapsed = editingExisting
    ? session.durationMin
    : Math.max(0, Math.round((now - new Date(session.startedAt).getTime()) / 60000));

  function patchEntry(i: number, fn: (e: SessionEntry) => SessionEntry) {
    setSession((s) => ({ ...s, entries: s.entries.map((e, k) => (k === i ? fn(e) : e)) }));
  }

  function addExercise(exerciseId: string) {
    const ex = exerciseById.get(exerciseId);
    const prev = lastEntry(exerciseId);
    setSession((s) => ({
      ...s,
      entries: [
        ...s.entries,
        ex?.kind === "cardio"
          ? { exerciseId, cardio: { minutes: prev?.cardio?.minutes ?? 30, distance: prev?.cardio?.distance } }
          : {
              exerciseId,
              sets: (prev?.sets?.length ? prev.sets : [{ weight: 0, reps: 10, done: false }]).map((x) => ({
                ...x,
                done: false,
              })),
            },
      ],
    }));
  }

  function finish() {
    const cleaned: Session = {
      ...session,
      durationMin: editingExisting ? session.durationMin : Math.max(1, elapsed),
      entries: session.entries
        .map((e) => (e.sets ? { ...e, sets: e.sets.filter((x) => x.done) } : e))
        .filter((e) => (e.sets ? e.sets.length > 0 : (e.cardio?.minutes ?? 0) > 0)),
    };
    if (cleaned.entries.length === 0) {
      alert("還沒有完成任何一組或有氧，先勾選完成的組數。");
      return;
    }
    const prs: string[] = [];
    for (const e of cleaned.entries) {
      if (!e.sets) continue;
      const best = Math.max(...e.sets.map((x) => e1rm(x.weight, x.reps)));
      const prevBest = Math.max(
        0,
        ...history.flatMap((s) =>
          s.entries.filter((p) => p.exerciseId === e.exerciseId).flatMap((p) => (p.sets ?? []).map((x) => e1rm(x.weight, x.reps))),
        ),
      );
      const hadBefore = history.some((s) => s.entries.some((p) => p.exerciseId === e.exerciseId));
      if (best > 0 && hadBefore && best > prevBest + 0.01) {
        prs.push(exerciseById.get(e.exerciseId)?.name ?? "");
      }
    }
    saveSession(cleaned);
    if (!editingExisting) writeDraft(owner, null);
    onFinished(cleaned, prs);
  }

  function discard() {
    if (!confirm(editingExisting ? "放棄這次的修改？" : "放棄這次訓練？已填的內容會被清除。")) return;
    if (!editingExisting) writeDraft(owner, null);
    onExit();
  }

  const doneSets = session.entries.reduce((a, e) => a + (e.sets?.filter((x) => x.done).length ?? 0), 0);
  const volume = session.entries.reduce(
    (a, e) => a + (e.sets ?? []).filter((x) => x.done).reduce((b, x) => b + x.weight * x.reps, 0),
    0,
  );

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onExit} className="gap-1.5 px-2">
          <ArrowLeft data-icon="inline-start" />
          {editingExisting ? "返回" : "先離開（會保留）"}
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={discard}>
          <X className="size-3.5" />
          放棄
        </Button>
      </div>

      <header className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
        <Input
          value={session.title}
          onChange={(e) => setSession((s) => ({ ...s, title: e.target.value.slice(0, 40) }))}
          className="font-display h-auto border-none px-0 text-2xl text-ink shadow-none focus-visible:ring-0 md:text-2xl"
          aria-label="訓練名稱"
        />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="時間" value={`${elapsed} 分`} />
          <Stat label="完成組數" value={String(doneSets)} />
          <Stat label="訓練量" value={`${Math.round(volume).toLocaleString()} kg`} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            日期
            <Input
              type="date"
              value={session.date}
              onChange={(e) => e.target.value && setSession((s) => ({ ...s, date: e.target.value }))}
              className="h-8 w-auto"
            />
          </label>
          {editingExisting && (
            <label className="flex items-center gap-2 text-muted-foreground">
              分鐘
              <Input
                type="number"
                min={1}
                value={session.durationMin}
                onChange={(e) => setSession((s) => ({ ...s, durationMin: Math.max(1, Number(e.target.value) || 1) }))}
                className="h-8 w-20"
              />
            </label>
          )}
        </div>
      </header>

      {session.entries.map((entry, i) => {
        const ex = exerciseById.get(entry.exerciseId);
        const prev = lastEntry(entry.exerciseId);
        return (
          <section key={`${entry.exerciseId}-${i}`} className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-medium text-ink">{ex?.name ?? "未知動作"}</h3>
                {prev && (
                  <p className="text-xs text-muted-foreground">
                    上次：
                    {prev.sets
                      ? prev.sets.map((x) => `${formatKg(x.weight)}×${x.reps}`).join("、")
                      : `${prev.cardio?.minutes ?? 0} 分${prev.cardio?.distance ? `・${prev.cardio.distance} km` : ""}`}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                onClick={() => setSession((s) => ({ ...s, entries: s.entries.filter((_, k) => k !== i) }))}
                aria-label="移除動作"
              >
                <Trash2 />
              </Button>
            </div>

            {entry.sets ? (
              <>
                <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 px-1 text-[11px] text-muted-foreground">
                  <span>組</span>
                  <span>{ex?.bodyweight ? "加重 kg" : "重量 kg"}</span>
                  <span>{ex?.name.includes("秒") ? "秒" : "次數"}</span>
                  <span className="text-center">完成</span>
                </div>
                <ul className="mt-1 space-y-1.5">
                  {entry.sets.map((set, k) => (
                    <li
                      key={k}
                      className={`grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 rounded-lg px-1 py-1 ${set.done ? "bg-accent" : ""}`}
                    >
                      <span className="text-center text-sm tabular-nums text-muted-foreground">{k + 1}</span>
                      <NumberInput
                        value={set.weight}
                        step={2.5}
                        onChange={(v) =>
                          patchEntry(i, (e) => ({ ...e, sets: e.sets!.map((x, j) => (j === k ? { ...x, weight: v } : x)) }))
                        }
                      />
                      <NumberInput
                        value={set.reps}
                        step={1}
                        onChange={(v) =>
                          patchEntry(i, (e) => ({
                            ...e,
                            sets: e.sets!.map((x, j) => (j === k ? { ...x, reps: Math.round(v) } : x)),
                          }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => {
                          patchEntry(i, (e) => ({
                            ...e,
                            sets: e.sets!.map((x, j) => (j === k ? { ...x, done: !x.done } : x)),
                          }));
                          if (!set.done) setRestEnd(Date.now() + restSec * 1000);
                        }}
                        className={`mx-auto flex size-8 items-center justify-center rounded-lg border transition-colors ${
                          set.done ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                        }`}
                        aria-pressed={set.done}
                        aria-label={`第 ${k + 1} 組完成`}
                      >
                        <Check className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() =>
                      patchEntry(i, (e) => {
                        const last = e.sets![e.sets!.length - 1] ?? { weight: 0, reps: 10 };
                        return { ...e, sets: [...e.sets!, { weight: last.weight, reps: last.reps, done: false }] };
                      })
                    }
                  >
                    <Plus className="size-3.5" />
                    加一組
                  </Button>
                  {entry.sets.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => patchEntry(i, (e) => ({ ...e, sets: e.sets!.slice(0, -1) }))}
                    >
                      <Minus className="size-3.5" />
                      減一組
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CardioField
                  label="分鐘"
                  value={entry.cardio?.minutes}
                  onChange={(v) => patchEntry(i, (e) => ({ ...e, cardio: { ...e.cardio!, minutes: v ?? 0 } }))}
                />
                <CardioField
                  label="距離 km"
                  value={entry.cardio?.distance}
                  step={0.1}
                  onChange={(v) => patchEntry(i, (e) => ({ ...e, cardio: { ...e.cardio!, distance: v } }))}
                />
                <CardioField
                  label="大卡"
                  value={entry.cardio?.calories}
                  onChange={(v) => patchEntry(i, (e) => ({ ...e, cardio: { ...e.cardio!, calories: v } }))}
                />
                <CardioField
                  label="平均心率"
                  value={entry.cardio?.avgHr}
                  onChange={(v) => patchEntry(i, (e) => ({ ...e, cardio: { ...e.cardio!, avgHr: v } }))}
                />
                {entry.cardio?.distance && entry.cardio.minutes ? (
                  <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
                    配速 {formatPace(entry.cardio.minutes, entry.cardio.distance)}
                  </p>
                ) : null}
              </div>
            )}
          </section>
        );
      })}

      <Button variant="outline" className="w-full gap-1.5" onClick={() => setPicking(true)}>
        <Plus data-icon="inline-start" />
        新增動作
      </Button>

      <div className="grid gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor="ws-note">心得（選填）</Label>
          <Textarea
            id="ws-note"
            rows={2}
            value={session.note}
            onChange={(e) => setSession((s) => ({ ...s, note: e.target.value.slice(0, 1000) }))}
            placeholder="狀況、感覺、下次調整…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>自覺強度 {session.rpe ? `${session.rpe}/10` : ""}</Label>
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSession((s) => ({ ...s, rpe: s.rpe === n ? undefined : n }))}
                className={`h-8 w-6 rounded text-xs ${
                  session.rpe && n <= session.rpe ? "bg-chip text-chip-foreground" : "bg-wash text-muted-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button className="h-11 w-full text-base" onClick={finish}>
        {editingExisting ? "儲存修改" : "完成訓練"}
      </Button>

      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={addExercise} />

      {restEnd && (
        <div className="fixed inset-x-0 bottom-20 z-40 px-4 sm:bottom-6">
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-chip px-4 py-3 text-chip-foreground shadow-lg">
            <Timer className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs opacity-70">{restLeft === 0 ? "休息結束！" : "組間休息"}</p>
              <p className="font-display text-2xl tabular-nums">
                {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg bg-chip-foreground/15 px-2 py-1 text-sm"
              onClick={() => setRestEnd((e) => (e ? Math.max(Date.now(), e - 15000) : e))}
            >
              −15
            </button>
            <button
              type="button"
              className="rounded-lg bg-chip-foreground/15 px-2 py-1 text-sm"
              onClick={() => setRestEnd((e) => (e ? e + 15000 : e))}
            >
              +15
            </button>
            <button type="button" className="rounded-lg bg-chip-foreground/15 px-2 py-1 text-sm" onClick={() => setRestEnd(null)}>
              跳過
            </button>
          </div>
          <div className="mx-auto mt-1 flex max-w-md justify-center gap-1">
            {[60, 90, 120, 180].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => {
                  setRestSec(sec);
                  setRestEnd(Date.now() + sec * 1000);
                }}
                className={`rounded-full px-2 py-0.5 text-[11px] shadow ${restSec === sec ? "bg-chip text-chip-foreground" : "bg-card text-muted-foreground"}`}
              >
                預設 {sec}s
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-soft px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-lg tabular-nums text-ink">{value}</p>
    </div>
  );
}

function NumberInput({
  value,
  step,
  onChange,
}: {
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : String(value);
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      min={0}
      value={shown}
      onFocus={() => {
        setText(String(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && n >= 0) onChange(n);
      }}
      className="h-9 text-center tabular-nums"
    />
  );
}

function CardioField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number | undefined;
  step?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(e.target.value === "" || !Number.isFinite(n) ? undefined : n);
        }}
        className="h-9 tabular-nums"
      />
    </label>
  );
}

export function FinishedCard({
  session,
  prs,
  onClose,
}: {
  session: Session;
  prs: string[];
  onClose: () => void;
}) {
  const { exerciseById } = useFitness();
  const sets = session.entries.reduce((a, e) => a + (e.sets?.length ?? 0), 0);
  const volume = session.entries.reduce(
    (a, e) => a + (e.sets ?? []).reduce((b, x) => b + x.weight * x.reps, 0),
    0,
  );
  const cardio = session.entries.reduce((a, e) => a + (e.cardio?.distance ?? 0), 0);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/70 bg-card p-6 text-center">
        <p className="text-4xl">💪</p>
        <h2 className="font-display mt-2 text-2xl text-ink">訓練完成</h2>
        <p className="mt-1 text-sm text-muted-foreground">{session.title}</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Stat label="時間" value={`${session.durationMin} 分`} />
          <Stat label="組數" value={String(sets)} />
          <Stat
            label={volume > 0 ? "訓練量" : "距離"}
            value={volume > 0 ? `${Math.round(volume).toLocaleString()} kg` : `${cardio.toFixed(1)} km`}
          />
        </div>
        {prs.length > 0 && (
          <div className="mt-5 rounded-xl bg-amber-50 p-3 text-left ring-1 ring-amber-200">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
              <Trophy className="size-4" />
              新紀錄！（估計 1RM 突破）
            </p>
            <p className="mt-1 text-sm text-amber-900">{prs.join("、")}</p>
          </div>
        )}
        <ul className="mt-5 space-y-1 text-left text-sm">
          {session.entries.map((e, i) => (
            <li key={i} className="flex justify-between gap-2 border-t border-border/50 pt-1">
              <span className="text-ink">{exerciseById.get(e.exerciseId)?.name}</span>
              <span className="text-muted-foreground">
                {e.sets
                  ? e.sets.map((x) => `${formatKg(x.weight)}×${x.reps}`).join("、")
                  : `${e.cardio?.minutes} 分${e.cardio?.distance ? `・${e.cardio.distance} km` : ""}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Button className="w-full" onClick={onClose}>
        回到運動
      </Button>
    </div>
  );
}
