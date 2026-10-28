"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import {
  EMPTY_STATE,
  isSchoolState,
  type Course,
  type Exam,
  type Homework,
  type SchoolState,
} from "@/lib/types";
import { uid } from "@/lib/utils";
import { useCloudDoc, type SyncStatus } from "@/store/cloud-doc";

export type { SyncStatus };

const LEGACY_KEY = "kexu-school-v1";

type SchoolStore = SchoolState & {
  readOnly: boolean;
  loaded: boolean;
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
  replaceAll: (state: SchoolState) => void;
  courseProgress: (courseId: string) => { total: number; done: number; pct: number };
};

const SchoolContext = createContext<SchoolStore | null>(null);

function isEmpty(state: SchoolState) {
  return (
    state.courses.length === 0 &&
    state.homework.length === 0 &&
    state.exams.length === 0 &&
    state.progress.length === 0
  );
}

/** One-time upload of data kept on this device before accounts existed. */
function takeLegacyLocalData(serverState: SchoolState): SchoolState | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
    if (!isSchoolState(parsed) || parsed.courses.length === 0 || !isEmpty(serverState)) {
      return null;
    }
    localStorage.setItem(`${LEGACY_KEY}-uploaded`, localStorage.getItem(LEGACY_KEY) ?? "");
    localStorage.removeItem(LEGACY_KEY);
    return parsed;
  } catch {
    return null;
  }
}

/** Mount with `key={ownerId}` so switching people starts from a clean slate. */
export function SchoolProvider({
  ownerId,
  editable,
  children,
}: {
  ownerId: string;
  editable: boolean;
  children: ReactNode;
}) {
  const { state, loaded, syncStatus, mutate } = useCloudDoc<SchoolState>({
    table: "school_data",
    rpc: "save_school_data",
    cacheKey: `kexu-cache-${ownerId}`,
    ownerId,
    editable,
    empty: EMPTY_STATE,
    isValid: isSchoolState,
    onFirstSync: takeLegacyLocalData,
  });

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

  const replaceAll = useCallback((next: SchoolState) => mutate(() => next), [mutate]);

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
    readOnly: !editable,
    loaded,
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
