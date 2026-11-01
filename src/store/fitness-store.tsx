"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  BUILTIN_EXERCISES,
  dayRoutineIds,
  EMPTY_FITNESS,
  isFitnessState,
  ROUTINE_COLORS,
  TEMPLATE_GROUPS,
  type BodyLog,
  type Exercise,
  type FitnessState,
  type Routine,
  type Session,
} from "@/lib/fitness";
import { uid } from "@/lib/utils";
import { useCloudDoc, type SyncStatus } from "@/store/cloud-doc";

type FitnessStore = FitnessState & {
  readOnly: boolean;
  loaded: boolean;
  syncStatus: SyncStatus;
  /** Built-in plus custom exercises */
  allExercises: Exercise[];
  exerciseById: Map<string, Exercise>;
  addExercise: (input: Omit<Exercise, "id" | "custom">) => string;
  removeExercise: (id: string) => void;
  saveRoutine: (routine: Omit<Routine, "id" | "createdAt"> & { id?: string }) => void;
  removeRoutine: (id: string) => void;
  /** Add or remove one routine from a weekday. */
  toggleWeekPlan: (day: number, routineId: string) => void;
  importTemplate: (index: number) => void;
  saveSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setBody: (date: string, log: BodyLog | null) => void;
  setRestSec: (sec: number) => void;
};

const FitnessContext = createContext<FitnessStore | null>(null);

/** Mount with `key={ownerId}` so switching people starts from a clean slate. */
export function FitnessProvider({
  ownerId,
  editable,
  children,
}: {
  ownerId: string;
  editable: boolean;
  children: ReactNode;
}) {
  const { state, loaded, syncStatus, mutate } = useCloudDoc<FitnessState>({
    table: "fitness_data",
    rpc: "save_fitness_data",
    cacheKey: `kexu-cache-fitness-${ownerId}`,
    ownerId,
    editable,
    empty: EMPTY_FITNESS,
    isValid: isFitnessState,
  });

  const allExercises = useMemo(
    () => [...BUILTIN_EXERCISES, ...state.exercises],
    [state.exercises],
  );
  const exerciseById = useMemo(
    () => new Map(allExercises.map((e) => [e.id, e])),
    [allExercises],
  );

  const addExercise = useCallback(
    (input: Omit<Exercise, "id" | "custom">) => {
      const ex: Exercise = { ...input, name: input.name.trim().slice(0, 40), id: uid("ex"), custom: true };
      mutate((prev) => ({ ...prev, exercises: [...prev.exercises, ex] }));
      return ex.id;
    },
    [mutate],
  );

  const removeExercise = useCallback(
    (id: string) =>
      mutate((prev) => ({ ...prev, exercises: prev.exercises.filter((e) => e.id !== id) })),
    [mutate],
  );

  const saveRoutine = useCallback(
    (routine: Omit<Routine, "id" | "createdAt"> & { id?: string }) =>
      mutate((prev) => {
        if (routine.id && prev.routines.some((r) => r.id === routine.id)) {
          return {
            ...prev,
            routines: prev.routines.map((r) =>
              r.id === routine.id ? { ...r, ...routine, id: r.id } : r,
            ),
          };
        }
        const created: Routine = {
          ...routine,
          id: uid("rt"),
          createdAt: new Date().toISOString(),
        };
        return { ...prev, routines: [...prev.routines, created] };
      }),
    [mutate],
  );

  const removeRoutine = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        routines: prev.routines.filter((r) => r.id !== id),
        weekPlan: Object.fromEntries(
          [1, 2, 3, 4, 5, 6, 7].flatMap((d) => {
            const ids = dayRoutineIds(prev.weekPlan, d).filter((x) => x !== id);
            return ids.length ? [[String(d), ids]] : [];
          }),
        ),
      })),
    [mutate],
  );

  const toggleWeekPlan = useCallback(
    (day: number, routineId: string) =>
      mutate((prev) => {
        const weekPlan = { ...prev.weekPlan };
        const ids = dayRoutineIds(prev.weekPlan, day);
        const next = ids.includes(routineId) ? ids.filter((x) => x !== routineId) : [...ids, routineId];
        if (next.length) weekPlan[String(day)] = next;
        else delete weekPlan[String(day)];
        return { ...prev, weekPlan };
      }),
    [mutate],
  );

  const importTemplate = useCallback(
    (index: number) => {
      const group = TEMPLATE_GROUPS[index];
      if (!group) return;
      mutate((prev) => {
        const weekPlan = { ...prev.weekPlan };
        const created = group.routines.map((t, i) => {
          const r: Routine = {
            ...t,
            id: uid("rt"),
            color: ROUTINE_COLORS[(prev.routines.length + i) % ROUTINE_COLORS.length],
            createdAt: new Date().toISOString(),
          };
          for (const d of group.days[i] ?? []) {
            weekPlan[String(d)] = [...dayRoutineIds(weekPlan, d), r.id];
          }
          return r;
        });
        return { ...prev, routines: [...prev.routines, ...created], weekPlan };
      });
    },
    [mutate],
  );

  const saveSession = useCallback(
    (session: Session) =>
      mutate((prev) => ({
        ...prev,
        sessions: prev.sessions.some((x) => x.id === session.id)
          ? prev.sessions.map((x) => (x.id === session.id ? session : x))
          : [...prev.sessions, session],
      })),
    [mutate],
  );

  const removeSession = useCallback(
    (id: string) =>
      mutate((prev) => ({ ...prev, sessions: prev.sessions.filter((x) => x.id !== id) })),
    [mutate],
  );

  const setBody = useCallback(
    (date: string, log: BodyLog | null) =>
      mutate((prev) => {
        const body = { ...prev.body };
        if (!log || (log.weight === undefined && log.fat === undefined)) delete body[date];
        else body[date] = log;
        return { ...prev, body };
      }),
    [mutate],
  );

  const setRestSec = useCallback(
    (restSec: number) => mutate((prev) => ({ ...prev, restSec })),
    [mutate],
  );

  const value: FitnessStore = {
    ...state,
    readOnly: !editable,
    loaded,
    syncStatus,
    allExercises,
    exerciseById,
    addExercise,
    removeExercise,
    saveRoutine,
    removeRoutine,
    toggleWeekPlan,
    importTemplate,
    saveSession,
    removeSession,
    setBody,
    setRestSec,
  };

  return <FitnessContext.Provider value={value}>{children}</FitnessContext.Provider>;
}

export function useFitness() {
  const ctx = useContext(FitnessContext);
  if (!ctx) throw new Error("useFitness must be used within FitnessProvider");
  return ctx;
}
