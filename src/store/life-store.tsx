"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { EMPTY_LIFE, isLifeState, type LifeState, type MetricKey, type Todo } from "@/lib/life";
import { uid } from "@/lib/utils";
import { useCloudDoc, type SyncStatus } from "@/store/cloud-doc";

type LifeStore = LifeState & {
  readOnly: boolean;
  loaded: boolean;
  syncStatus: SyncStatus;
  setMetric: (date: string, key: MetricKey, value: number | null) => void;
  addTodo: (input: Pick<Todo, "title" | "date" | "time">) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  setNote: (date: string, text: string) => void;
  toggleAvailable: (date: string) => void;
};

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
    (input: Pick<Todo, "title" | "date" | "time">) => {
      const todo: Todo = {
        ...input,
        title: input.title.trim(),
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
  };

  return <LifeContext.Provider value={value}>{children}</LifeContext.Provider>;
}

export function useLife() {
  const ctx = useContext(LifeContext);
  if (!ctx) throw new Error("useLife must be used within LifeProvider");
  return ctx;
}
