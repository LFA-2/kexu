"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import {
  EMPTY_STATE,
  isSchoolState,
  unitMinutes,
  type Course,
  type Exam,
  type Homework,
  type ProgressUnit,
  type SchoolState,
  type TimetableSlot,
} from "@/lib/types";
import { uid } from "@/lib/utils";
import { useCloudDoc, type SyncStatus } from "@/store/cloud-doc";

export type { SyncStatus };

const LEGACY_KEY = "kexu-school-v1";

type SchoolStore = SchoolState & {
  readOnly: boolean;
  loaded: boolean;
  syncStatus: SyncStatus;
  addCourse: (name: string, color: string) => string;
  removeCourse: (id: string) => void;
  addHomework: (input: Omit<Homework, "id" | "createdAt" | "done">) => void;
  toggleHomework: (id: string) => void;
  removeHomework: (id: string) => void;
  addExam: (input: Omit<Exam, "id" | "createdAt" | "done">) => void;
  toggleExam: (id: string) => void;
  removeExam: (id: string) => void;
  addProgressUnit: (
    courseId: string,
    title: string,
    extra?: Pick<ProgressUnit, "estimatedMinutes" | "dueDate">,
  ) => void;
  toggleProgressUnit: (id: string) => void;
  removeProgressUnit: (id: string) => void;
  updateHomework: (id: string, patch: Partial<Omit<Homework, "id" | "courseId">>) => void;
  updateExam: (id: string, patch: Partial<Omit<Exam, "id" | "courseId">>) => void;
  updateProgressUnit: (id: string, patch: Partial<Omit<ProgressUnit, "id" | "courseId">>) => void;
  /** Sets 0–100 progress; 100 marks the item done, anything lower un-marks it. */
  setWorkProgress: (kind: "homework" | "unit", id: string, pct: number) => void;
  addTimetableSlot: (slot: Omit<TimetableSlot, "id">) => void;
  updateTimetableSlot: (id: string, patch: Partial<Omit<TimetableSlot, "id">>) => void;
  removeTimetableSlot: (id: string) => void;
  replaceAll: (state: SchoolState) => void;
  courseProgress: (courseId: string) => { total: number; done: number; pct: number };
};

const undoneProgress = (p: number | undefined) => (p === undefined || p >= 100 ? 0 : p);

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
      return course.id;
    },
    [mutate],
  );

  const removeCourse = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        courses: prev.courses.filter((c) => c.id !== id),
        homework: prev.homework.filter((h) => h.courseId !== id),
        exams: prev.exams.filter((e) => e.courseId !== id),
        progress: prev.progress.filter((p) => p.courseId !== id),
        timetable: (prev.timetable ?? []).map((t) =>
          t.courseId === id ? { ...t, courseId: null } : t,
        ),
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
        homework: prev.homework.map((h) =>
          h.id === id ? { ...h, done: !h.done, progress: h.done ? undoneProgress(h.progress) : 100 } : h,
        ),
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
    (
      courseId: string,
      title: string,
      extra?: Pick<ProgressUnit, "estimatedMinutes" | "dueDate">,
    ) => {
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
            ...extra,
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
          p.id === id
            ? { ...p, completed: !p.completed, progress: p.completed ? undoneProgress(p.progress) : 100 }
            : p,
        ),
      })),
    [mutate],
  );

  const removeProgressUnit = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        progress: prev.progress.filter((p) => p.id !== id),
        exams: prev.exams.map((e) =>
          e.scope?.includes(id) ? { ...e, scope: e.scope.filter((s) => s !== id) } : e,
        ),
      })),
    [mutate],
  );

  const updateHomework = useCallback(
    (id: string, patch: Partial<Omit<Homework, "id" | "courseId">>) =>
      mutate((prev) => ({
        ...prev,
        homework: prev.homework.map((h) => (h.id === id ? { ...h, ...patch } : h)),
      })),
    [mutate],
  );

  const updateExam = useCallback(
    (id: string, patch: Partial<Omit<Exam, "id" | "courseId">>) =>
      mutate((prev) => ({
        ...prev,
        exams: prev.exams.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      })),
    [mutate],
  );

  const updateProgressUnit = useCallback(
    (id: string, patch: Partial<Omit<ProgressUnit, "id" | "courseId">>) =>
      mutate((prev) => ({
        ...prev,
        progress: prev.progress.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),
    [mutate],
  );

  const setWorkProgress = useCallback(
    (kind: "homework" | "unit", id: string, pct: number) => {
      const progress = Math.max(0, Math.min(100, Math.round(pct)));
      const done = progress >= 100;
      mutate((prev) =>
        kind === "homework"
          ? {
              ...prev,
              homework: prev.homework.map((h) => (h.id === id ? { ...h, progress, done } : h)),
            }
          : {
              ...prev,
              progress: prev.progress.map((p) =>
                p.id === id ? { ...p, progress, completed: done } : p,
              ),
            },
      );
    },
    [mutate],
  );

  const addTimetableSlot = useCallback(
    (slot: Omit<TimetableSlot, "id">) =>
      mutate((prev) => ({
        ...prev,
        timetable: [...(prev.timetable ?? []), { ...slot, id: uid("tt") }],
      })),
    [mutate],
  );

  const updateTimetableSlot = useCallback(
    (id: string, patch: Partial<Omit<TimetableSlot, "id">>) =>
      mutate((prev) => ({
        ...prev,
        timetable: (prev.timetable ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),
    [mutate],
  );

  const removeTimetableSlot = useCallback(
    (id: string) =>
      mutate((prev) => ({
        ...prev,
        timetable: (prev.timetable ?? []).filter((t) => t.id !== id),
      })),
    [mutate],
  );

  const replaceAll = useCallback((next: SchoolState) => mutate(() => next), [mutate]);

  const courseProgress = useCallback(
    (courseId: string) => {
      const units = state.progress.filter((p) => p.courseId === courseId);
      const total = units.length;
      const done = units.filter((p) => p.completed).length;
      // Weighted by estimated time, counting partial progress.
      const weight = units.reduce((a, u) => a + unitMinutes(u), 0);
      const got = units.reduce(
        (a, u) => a + unitMinutes(u) * (u.completed ? 1 : (u.progress ?? 0) / 100),
        0,
      );
      return { total, done, pct: weight === 0 ? 0 : Math.round((got / weight) * 100) };
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
    updateHomework,
    updateExam,
    updateProgressUnit,
    setWorkProgress,
    addTimetableSlot,
    updateTimetableSlot,
    removeTimetableSlot,
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
