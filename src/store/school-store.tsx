"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  EMPTY_STATE,
  isSchoolState,
  type Course,
  type Exam,
  type Homework,
  type SchoolState,
} from "@/lib/types";
import { uid } from "@/lib/utils";

const STORAGE_KEY = "kexu-school-v1";

type Updater = (prev: SchoolState) => SchoolState;

type SchoolStore = SchoolState & {
  hydrated: boolean;
  addCourse: (name: string, color: string) => void;
  removeCourse: (id: string) => void;
  addHomework: (input: Omit<Homework, "id" | "createdAt" | "done">) => void;
  toggleHomework: (id: string) => void;
  removeHomework: (id: string) => void;
  addExam: (input: Omit<Exam, "id" | "createdAt" | "done">) => void;
  toggleExam: (id: string) => void;
  removeExam: (id: string) => void;
  addProgressUnit: (courseId: string, title: string) => void;
  toggleProgressUnit: (id: string) => void;
  removeProgressUnit: (id: string) => void;
  replaceAll: (state: SchoolState) => void;
  courseProgress: (courseId: string) => { total: number; done: number; pct: number };
};

const SchoolContext = createContext<SchoolStore | null>(null);

let cache: SchoolState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readStorage(): SchoolState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isSchoolState(parsed)) return parsed;
    }
  } catch {
    // corrupted or unavailable storage: start empty
  }
  return EMPTY_STATE;
}

function getSnapshot() {
  cache ??= readStorage();
  return cache;
}

function getServerSnapshot() {
  return EMPTY_STATE;
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  cache = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function writeState(next: SchoolState) {
  cache = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emit();
}

function mutate(updater: Updater) {
  writeState(updater(getSnapshot()));
}

const noopSubscribe = () => () => {};

export function SchoolProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    // Ask Safari not to evict this origin's storage under pressure.
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const addCourse = useCallback((name: string, color: string) => {
    const course: Course = {
      id: uid("course"),
      name: name.trim(),
      color,
      createdAt: new Date().toISOString(),
    };
    mutate((prev) => ({ ...prev, courses: [...prev.courses, course] }));
  }, []);

  const removeCourse = useCallback(
    (id: string) =>
      mutate((prev) => ({
        courses: prev.courses.filter((c) => c.id !== id),
        homework: prev.homework.filter((h) => h.courseId !== id),
        exams: prev.exams.filter((e) => e.courseId !== id),
        progress: prev.progress.filter((p) => p.courseId !== id),
      })),
    [],
  );

  const addHomework = useCallback((input: Omit<Homework, "id" | "createdAt" | "done">) => {
    const item: Homework = {
      ...input,
      id: uid("hw"),
      done: false,
      createdAt: new Date().toISOString(),
    };
    mutate((prev) => ({ ...prev, homework: [...prev.homework, item] }));
  }, []);

  const toggleHomework = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        homework: prev.homework.map((h) => (h.id === id ? { ...h, done: !h.done } : h)),
      })),
    [],
  );

  const removeHomework = useCallback(
    (id: string) =>
      mutate((prev) => ({ ...prev, homework: prev.homework.filter((h) => h.id !== id) })),
    [],
  );

  const addExam = useCallback((input: Omit<Exam, "id" | "createdAt" | "done">) => {
    const item: Exam = {
      ...input,
      id: uid("ex"),
      done: false,
      createdAt: new Date().toISOString(),
    };
    mutate((prev) => ({ ...prev, exams: [...prev.exams, item] }));
  }, []);

  const toggleExam = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        exams: prev.exams.map((e) => (e.id === id ? { ...e, done: !e.done } : e)),
      })),
    [],
  );

  const removeExam = useCallback(
    (id: string) =>
      mutate((prev) => ({ ...prev, exams: prev.exams.filter((e) => e.id !== id) })),
    [],
  );

  const addProgressUnit = useCallback((courseId: string, title: string) => {
    mutate((prev) => ({
      ...prev,
      progress: [
        ...prev.progress,
        {
          id: uid("pu"),
          courseId,
          title: title.trim(),
          completed: false,
          order: prev.progress.filter((p) => p.courseId === courseId).length,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
  }, []);

  const toggleProgressUnit = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        progress: prev.progress.map((p) =>
          p.id === id ? { ...p, completed: !p.completed } : p,
        ),
      })),
    [],
  );

  const removeProgressUnit = useCallback(
    (id: string) =>
      mutate((prev) => ({ ...prev, progress: prev.progress.filter((p) => p.id !== id) })),
    [],
  );

  const replaceAll = useCallback((next: SchoolState) => writeState(next), []);

  const courseProgress = useCallback(
    (courseId: string) => {
      const units = state.progress.filter((p) => p.courseId === courseId);
      const total = units.length;
      const done = units.filter((p) => p.completed).length;
      return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
    },
    [state.progress],
  );

  const value: SchoolStore = {
    ...state,
    hydrated,
    addCourse,
    removeCourse,
    addHomework,
    toggleHomework,
    removeHomework,
    addExam,
    toggleExam,
    removeExam,
    addProgressUnit,
    toggleProgressUnit,
    removeProgressUnit,
    replaceAll,
    courseProgress,
  };

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchool must be used within SchoolProvider");
  return ctx;
}
