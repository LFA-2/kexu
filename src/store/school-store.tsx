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
import { supabase } from "@/lib/supabase";
import {
  EMPTY_STATE,
  isSchoolState,
  type Course,
  type Exam,
  type Homework,
  type SchoolState,
} from "@/lib/types";
import { uid } from "@/lib/utils";

const POLL_MS = 30000;
const LEGACY_KEY = "kexu-school-v1";

export type SyncStatus = "loading" | "synced" | "saving" | "offline";

type Stored = { version: number; state: SchoolState };
type Updater = (prev: SchoolState) => SchoolState;

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

const cacheKey = (ownerId: string) => `kexu-cache-${ownerId}`;

function readCache(ownerId: string): Stored | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey(ownerId)) ?? "null");
    if (parsed && typeof parsed.version === "number" && isSchoolState(parsed.state)) return parsed;
  } catch {
    // ignore unreadable cache
  }
  return null;
}

function writeCache(ownerId: string, stored: Stored) {
  try {
    localStorage.setItem(cacheKey(ownerId), JSON.stringify(stored));
  } catch {
    // storage full or unavailable: the cloud copy is authoritative anyway
  }
}

function readLegacyLocalData(): SchoolState | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
    if (isSchoolState(parsed) && parsed.courses.length > 0) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function isEmpty(state: SchoolState) {
  return (
    state.courses.length === 0 &&
    state.homework.length === 0 &&
    state.exams.length === 0 &&
    state.progress.length === 0
  );
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
  const [initial] = useState(() => readCache(ownerId));
  const [state, setState] = useState<SchoolState>(initial?.state ?? EMPTY_STATE);
  const [loaded, setLoaded] = useState(initial !== null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");

  const serverRef = useRef<Stored>(initial ?? { version: -1, state: EMPTY_STATE });
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const migrationCheckedRef = useRef(false);

  const adopt = useCallback(
    (stored: Stored) => {
      serverRef.current = stored;
      writeCache(ownerId, stored);
      setState(stored.state);
      setLoaded(true);
    },
    [ownerId],
  );

  const commit = useCallback(
    (updater: Updater) => {
      pendingRef.current += 1;
      setSyncStatus("saving");

      // On conflict, re-apply the updater to the latest server copy so edits
      // made on another device are merged rather than overwritten.
      queueRef.current = queueRef.current.then(async () => {
        try {
          let base = serverRef.current;
          for (let attempt = 0; attempt < 5; attempt++) {
            const { data, error } = await supabase.rpc("save_school_data", {
              base_version: base.version,
              new_state: updater(base.state),
            });
            if (error) throw error;
            const result = data as { ok: boolean } & Stored;
            serverRef.current = { version: result.version, state: result.state };
            if (result.ok) break;
            base = serverRef.current;
          }
          writeCache(ownerId, serverRef.current);
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
    [ownerId],
  );

  const refresh = useCallback(async () => {
    if (pendingRef.current > 0) return;
    const { data, error } = await supabase
      .from("school_data")
      .select("version, state")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (pendingRef.current > 0) return;
    if (error || !data) {
      setSyncStatus("offline");
      return;
    }
    const stored = data as Stored;
    if (stored.version !== serverRef.current.version) adopt(stored);
    else setLoaded(true);
    setSyncStatus("synced");

    // One-time upload of data kept on this device before accounts existed.
    if (editable && !migrationCheckedRef.current) {
      migrationCheckedRef.current = true;
      const legacy = readLegacyLocalData();
      if (legacy && isEmpty(stored.state)) {
        setState(legacy);
        commit(() => legacy);
        localStorage.setItem(`${LEGACY_KEY}-uploaded`, localStorage.getItem(LEGACY_KEY) ?? "");
        localStorage.removeItem(LEGACY_KEY);
      }
    }
  }, [ownerId, editable, adopt, commit]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  const mutate = useCallback(
    (updater: Updater) => {
      if (!editable) return;
      setState((prev) => updater(prev));
      commit(updater);
    },
    [editable, commit],
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
