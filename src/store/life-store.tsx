"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { subDays } from "date-fns";
import { toDateKey } from "@/lib/dates";
import {
  EMPTY_LIFE,
  isLifeState,
  type DayPlan,
  type Habit,
  type LifeState,
  type MetricKey,
  type PlanSettings,
  type ScheduleItem,
  type Todo,
} from "@/lib/life";
import { scheduleNeedsSync, withTimetableClasses } from "@/lib/schedule-sync";
import type { SchoolState } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useCloudDoc, type SyncStatus } from "@/store/cloud-doc";

type LifeStore = LifeState & {
  readOnly: boolean;
  loaded: boolean;
  syncStatus: SyncStatus;
  setMetric: (date: string, key: MetricKey, value: number | null) => void;
  addTodo: (input: Pick<Todo, "title" | "date" | "time" | "end">) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  setNote: (date: string, text: string) => void;
  toggleAvailable: (date: string) => void;
  addScheduleItem: (date: string, item: Omit<ScheduleItem, "id">) => void;
  removeScheduleItem: (date: string, id: string) => void;
  /** Take a 今明行程 off this day. A class is skipped only for this date; anything else can be restored. */
  cancelScheduleItem: (date: string, item: ScheduleItem) => void;
  restoreScheduleItem: (date: string, item: ScheduleItem) => void;
  restoreClass: (date: string, slotId: string) => void;
  /** Write this week's classes into the given days' 今明行程. */
  syncTimetableDays: (dates: string[], school: SchoolState) => void;
  addHabit: (input: Omit<Habit, "id" | "createdAt">) => void;
  updateHabit: (id: string, patch: Partial<Omit<Habit, "id" | "createdAt">>) => void;
  removeHabit: (id: string) => void;
  setHabitDone: (date: string, id: string, done: boolean) => void;
  setTodoDone: (id: string, done: boolean) => void;
  /** Replace or edit one day's 今日 plan. */
  updatePlan: (date: string, updater: (prev: DayPlan | undefined) => DayPlan | undefined) => void;
  setPlanSettings: (settings: PlanSettings) => void;
};

const PLAN_KEEP_DAYS = 120;
const HABIT_LOG_KEEP_DAYS = 400;

const SCHEDULE_KEEP_DAYS = 14;

function keptDays<T>(map: Record<string, T> | undefined, cutoff: string) {
  return Object.fromEntries(Object.entries(map ?? {}).filter(([d]) => d >= cutoff));
}

const LifeContext = createContext<LifeStore | null>(null);

/** Mount with `key={ownerId}` so switching people starts from a clean slate. */
export function LifeProvider({
  ownerId,
  editable,
  children,
}: {
  ownerId: string;
  editable: boolean;
  children: ReactNode;
}) {
  const { state, loaded, syncStatus, mutate } = useCloudDoc<LifeState>({
    table: "life_data",
    rpc: "save_life_data",
    cacheKey: `kexu-cache-life-${ownerId}`,
    ownerId,
    editable,
    empty: EMPTY_LIFE,
    isValid: isLifeState,
  });

  const setMetric = useCallback(
    (date: string, key: MetricKey, value: number | null) =>
      mutate((prev) => {
        const day = { ...prev.metrics[date] };
        if (value === null) delete day[key];
        else day[key] = value;
        const metrics = { ...prev.metrics };
        if (Object.keys(day).length === 0) delete metrics[date];
        else metrics[date] = day;
        return { ...prev, metrics };
      }),
    [mutate],
  );

  const addTodo = useCallback(
    (input: Pick<Todo, "title" | "date" | "time" | "end">) => {
      const todo: Todo = {
        ...input,
        title: input.title.trim(),
        time: input.time,
        end: input.end || undefined,
        id: uid("todo"),
        done: false,
        createdAt: new Date().toISOString(),
      };
      mutate((prev) => ({ ...prev, todos: [...prev.todos, todo] }));
    },
    [mutate],
  );

  const toggleTodo = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        todos: prev.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      })),
    [mutate],
  );

  const removeTodo = useCallback(
    (id: string) => mutate((prev) => ({ ...prev, todos: prev.todos.filter((t) => t.id !== id) })),
    [mutate],
  );

  const setNote = useCallback(
    (date: string, text: string) =>
      mutate((prev) => {
        const notes = { ...prev.notes };
        const trimmed = text.trim();
        if (trimmed) notes[date] = trimmed.slice(0, 2000);
        else delete notes[date];
        return { ...prev, notes };
      }),
    [mutate],
  );

  const toggleAvailable = useCallback(
    (date: string) =>
      mutate((prev) => ({
        ...prev,
        available: prev.available.includes(date)
          ? prev.available.filter((d) => d !== date)
          : [...prev.available, date].sort(),
      })),
    [mutate],
  );

  const addScheduleItem = useCallback(
    (date: string, item: Omit<ScheduleItem, "id">) =>
      mutate((prev) => {
        const cutoff = toDateKey(subDays(new Date(), SCHEDULE_KEEP_DAYS));
        const schedule = Object.fromEntries(
          Object.entries(prev.schedule ?? {}).filter(([d]) => d >= cutoff),
        );
        schedule[date] = [
          ...(schedule[date] ?? []),
          { ...item, label: item.label.trim().slice(0, 40), id: uid("plan") },
        ];
        return { ...prev, schedule };
      }),
    [mutate],
  );

  const removeScheduleItem = useCallback(
    (date: string, id: string) =>
      mutate((prev) => {
        const schedule = { ...prev.schedule };
        const rest = (schedule[date] ?? []).filter((i) => i.id !== id);
        if (rest.length) schedule[date] = rest;
        else delete schedule[date];
        return { ...prev, schedule };
      }),
    [mutate],
  );

  const cancelScheduleItem = useCallback(
    (date: string, item: ScheduleItem) =>
      mutate((prev) => {
        const cutoff = toDateKey(subDays(new Date(), SCHEDULE_KEEP_DAYS));
        const schedule = keptDays(prev.schedule, cutoff);
        const rest = (schedule[date] ?? []).filter((i) => i.id !== item.id);
        if (rest.length) schedule[date] = rest;
        else delete schedule[date];
        if (item.fromTimetable) {
          const skippedClasses = keptDays(prev.skippedClasses, cutoff);
          const ids = new Set(skippedClasses[date] ?? []);
          ids.add(item.fromTimetable);
          skippedClasses[date] = [...ids];
          return { ...prev, schedule, skippedClasses };
        }
        const removedSchedule = keptDays(prev.removedSchedule, cutoff);
        const kept = (removedSchedule[date] ?? []).filter((i) => i.id !== item.id);
        removedSchedule[date] = [...kept, item].slice(-20);
        return { ...prev, schedule, removedSchedule };
      }),
    [mutate],
  );

  const restoreScheduleItem = useCallback(
    (date: string, item: ScheduleItem) =>
      mutate((prev) => {
        const removedSchedule = { ...(prev.removedSchedule ?? {}) };
        const rest = (removedSchedule[date] ?? []).filter((i) => i.id !== item.id);
        if (rest.length) removedSchedule[date] = rest;
        else delete removedSchedule[date];
        const schedule = { ...(prev.schedule ?? {}) };
        const day = schedule[date] ?? [];
        if (!day.some((i) => i.id === item.id)) schedule[date] = [...day, item];
        return { ...prev, schedule, removedSchedule };
      }),
    [mutate],
  );

  const restoreClass = useCallback(
    (date: string, slotId: string) =>
      mutate((prev) => {
        const skippedClasses = { ...(prev.skippedClasses ?? {}) };
        const rest = (skippedClasses[date] ?? []).filter((id) => id !== slotId);
        if (rest.length) skippedClasses[date] = rest;
        else delete skippedClasses[date];
        return { ...prev, skippedClasses };
      }),
    [mutate],
  );

  const syncTimetableDays = useCallback(
    (dates: string[], school: SchoolState) => {
      let changed = false;
      const cutoff = toDateKey(subDays(new Date(), SCHEDULE_KEEP_DAYS));
      const schedule = Object.fromEntries(
        Object.entries(state.schedule ?? {}).filter(([d]) => d >= cutoff),
      );
      for (const date of dates) {
        const next = withTimetableClasses(date, schedule[date], school, state.skippedClasses?.[date]);
        if (!scheduleNeedsSync(schedule[date], next)) continue;
        changed = true;
        if (next.length) schedule[date] = next;
        else delete schedule[date];
      }
      if (!changed) return;
      mutate((prev) => {
        const merged = { ...(prev.schedule ?? {}) };
        for (const date of dates) {
          const next = withTimetableClasses(date, merged[date], school, prev.skippedClasses?.[date]);
          if (next.length) merged[date] = next;
          else delete merged[date];
        }
        return { ...prev, schedule: merged };
      });
    },
    [mutate, state.schedule, state.skippedClasses],
  );

  const addHabit = useCallback(
    (input: Omit<Habit, "id" | "createdAt">) =>
      mutate((prev) => ({
        ...prev,
        habits: [
          ...(prev.habits ?? []),
          {
            ...input,
            title: input.title.trim().slice(0, 40),
            id: uid("habit"),
            createdAt: new Date().toISOString(),
          },
        ],
      })),
    [mutate],
  );

  const updateHabit = useCallback(
    (id: string, patch: Partial<Omit<Habit, "id" | "createdAt">>) =>
      mutate((prev) => ({
        ...prev,
        habits: (prev.habits ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)),
      })),
    [mutate],
  );

  const removeHabit = useCallback(
    (id: string) =>
      mutate((prev) => ({ ...prev, habits: (prev.habits ?? []).filter((h) => h.id !== id) })),
    [mutate],
  );

  const setHabitDone = useCallback(
    (date: string, id: string, done: boolean) =>
      mutate((prev) => {
        const cutoff = toDateKey(subDays(new Date(), HABIT_LOG_KEEP_DAYS));
        const log = Object.fromEntries(
          Object.entries(prev.habitLog ?? {}).filter(([d]) => d >= cutoff),
        );
        const day = new Set(log[date] ?? []);
        if (done) day.add(id);
        else day.delete(id);
        if (day.size) log[date] = [...day];
        else delete log[date];
        return { ...prev, habitLog: log };
      }),
    [mutate],
  );

  const setTodoDone = useCallback(
    (id: string, done: boolean) =>
      mutate((prev) => ({
        ...prev,
        todos: prev.todos.map((t) => (t.id === id ? { ...t, done } : t)),
      })),
    [mutate],
  );

  const updatePlan = useCallback(
    (date: string, updater: (prev: DayPlan | undefined) => DayPlan | undefined) =>
      mutate((prev) => {
        const cutoff = toDateKey(subDays(new Date(), PLAN_KEEP_DAYS));
        const plans = Object.fromEntries(
          Object.entries(prev.plans ?? {}).filter(([d]) => d >= cutoff),
        );
        const next = updater(plans[date]);
        if (next) plans[date] = next;
        else delete plans[date];
        return { ...prev, plans };
      }),
    [mutate],
  );

  const setPlanSettings = useCallback(
    (planSettings: PlanSettings) => mutate((prev) => ({ ...prev, planSettings })),
    [mutate],
  );

  const value: LifeStore = {
    ...state,
    readOnly: !editable,
    loaded,
    syncStatus,
    setMetric,
    addTodo,
    toggleTodo,
    removeTodo,
    setNote,
    toggleAvailable,
    addScheduleItem,
    removeScheduleItem,
    cancelScheduleItem,
    restoreScheduleItem,
    restoreClass,
    syncTimetableDays,
    addHabit,
    updateHabit,
    removeHabit,
    setHabitDone,
    setTodoDone,
    updatePlan,
    setPlanSettings,
  };

  return <LifeContext.Provider value={value}>{children}</LifeContext.Provider>;
}

export function useLife() {
  const ctx = useContext(LifeContext);
  if (!ctx) throw new Error("useLife must be used within LifeProvider");
  return ctx;
}
