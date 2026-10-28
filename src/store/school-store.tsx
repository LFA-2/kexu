"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  EMPTY_STATE,
  type Course,
  type Exam,
  type Homework,
  type SchoolState,
  type StoredState,
} from "@/lib/types";
import { uid } from "@/lib/utils";

const POLL_MS = 5000;

type SyncStatus = "loading" | "synced" | "saving" | "offline";

type Updater = (prev: SchoolState) => SchoolState;

type SchoolStore = SchoolState & {
  syncStatus: SyncStatus;
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
  courseProgress: (courseId: string) => { total: number; done: number; pct: number };
};

const SchoolContext = createContext<SchoolStore | null>(null);

async function fetchStored(): Promise<StoredState> {
  const res = await fetch("/api/state", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/state ${res.status}`);
  return res.json();
}

async function putStored(baseVersion: number, state: SchoolState) {
  const res = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseVersion, state }),
  });
  if (res.status !== 200 && res.status !== 409) {
    throw new Error(`PUT /api/state ${res.status}`);
  }
  return { conflict: res.status === 409, stored: (await res.json()) as StoredState };
}

export function SchoolProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SchoolState>(EMPTY_STATE);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");

  const serverRef = useRef<StoredState>({ version: -1, state: EMPTY_STATE });
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const adopt = useCallback((stored: StoredState) => {
    serverRef.current = stored;
    setState(stored.state);
  }, []);

  const refresh = useCallback(async () => {
    if (pendingRef.current > 0) return;
    try {
      const stored = await fetchStored();
      if (pendingRef.current > 0) return;
      if (stored.version !== serverRef.current.version) adopt(stored);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("offline");
    }
  }, [adopt]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  const mutate = useCallback(
    (updater: Updater) => {
      setState((prev) => updater(prev));
      pendingRef.current += 1;
      setSyncStatus("saving");

      // Re-apply the updater to the server's copy so concurrent edits from
      // other devices are merged instead of overwritten.
      queueRef.current = queueRef.current.then(async () => {
        try {
          let base = serverRef.current;
          for (let attempt = 0; attempt < 5; attempt++) {
            const { conflict, stored } = await putStored(
              base.version,
              updater(base.state),
            );
            serverRef.current = stored;
            if (!conflict) break;
            base = stored;
          }
          pendingRef.current -= 1;
          if (pendingRef.current === 0) {
            setState(serverRef.current.state);
            setSyncStatus("synced");
          }
        } catch {
          pendingRef.current -= 1;
          setSyncStatus("offline");
          if (pendingRef.current === 0) setState(serverRef.current.state);
        }
      });
    },
    [],
  );

  const addCourse = useCallback(
    (name: string, color: string) => {
      const course: Course = {
        id: uid("course"),
        name: name.trim(),
        color,
        createdAt: new Date().toISOString(),
      };
      mutate((prev) => ({ ...prev, courses: [...prev.courses, course] }));
    },
    [mutate],
  );

  const removeCourse = useCallback(
    (id: string) =>
      mutate((prev) => ({
        courses: prev.courses.filter((c) => c.id !== id),
        homework: prev.homework.filter((h) => h.courseId !== id),
        exams: prev.exams.filter((e) => e.courseId !== id),
        progress: prev.progress.filter((p) => p.courseId !== id),
      })),
    [mutate],
  );

  const addHomework = useCallback(
    (input: Omit<Homework, "id" | "createdAt" | "done">) => {
      const item: Homework = {
        ...input,
        id: uid("hw"),
        done: false,
        createdAt: new Date().toISOString(),
      };
      mutate((prev) => ({ ...prev, homework: [...prev.homework, item] }));
    },
    [mutate],
  );

  const toggleHomework = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        homework: prev.homework.map((h) => (h.id === id ? { ...h, done: !h.done } : h)),
      })),
    [mutate],
  );

  const removeHomework = useCallback(
    (id: string) =>
      mutate((prev) => ({ ...prev, homework: prev.homework.filter((h) => h.id !== id) })),
    [mutate],
  );

  const addExam = useCallback(
    (input: Omit<Exam, "id" | "createdAt" | "done">) => {
      const item: Exam = {
        ...input,
        id: uid("ex"),
        done: false,
        createdAt: new Date().toISOString(),
      };
      mutate((prev) => ({ ...prev, exams: [...prev.exams, item] }));
    },
    [mutate],
  );

  const toggleExam = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        exams: prev.exams.map((e) => (e.id === id ? { ...e, done: !e.done } : e)),
      })),
    [mutate],
  );

  const removeExam = useCallback(
    (id: string) =>
      mutate((prev) => ({ ...prev, exams: prev.exams.filter((e) => e.id !== id) })),
    [mutate],
  );

  const addProgressUnit = useCallback(
    (courseId: string, title: string) => {
      const id = uid("pu");
      const createdAt = new Date().toISOString();
      mutate((prev) => ({
        ...prev,
        progress: [
          ...prev.progress,
          {
            id,
            courseId,
            title: title.trim(),
            completed: false,
            order: prev.progress.filter((p) => p.courseId === courseId).length,
            createdAt,
          },
        ],
      }));
    },
    [mutate],
  );

  const toggleProgressUnit = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        progress: prev.progress.map((p) =>
          p.id === id ? { ...p, completed: !p.completed } : p,
        ),
      })),
    [mutate],
  );

  const removeProgressUnit = useCallback(
    (id: string) =>
      mutate((prev) => ({ ...prev, progress: prev.progress.filter((p) => p.id !== id) })),
    [mutate],
  );

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
    syncStatus,
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
    courseProgress,
  };

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchool must be used within SchoolProvider");
  return ctx;
}
