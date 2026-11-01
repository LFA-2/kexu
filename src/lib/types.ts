export type Category = "today" | "school" | "life" | "fitness" | "shared";

export type Course = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

export type Homework = {
  id: string;
  courseId: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  note: string;
  done: boolean;
  createdAt: string;
  /** Expected total work time in minutes. */
  estimatedMinutes?: number;
  /** 0–100, partial progress made from the 今日 page. */
  progress?: number;
};

export type Exam = {
  id: string;
  courseId: string;
  title: string;
  date: string; // YYYY-MM-DD
  note: string;
  done: boolean;
  createdAt: string;
  /** Progress units this exam covers. */
  scope?: string[];
};

export type ProgressUnit = {
  id: string;
  courseId: string;
  title: string;
  completed: boolean;
  order: number;
  createdAt: string;
  estimatedMinutes?: number;
  dueDate?: string; // YYYY-MM-DD
  /** 0–100, partial progress made from the 今日 page. */
  progress?: number;
};

export type TimetableSlot = {
  id: string;
  /** 1 = Monday … 7 = Sunday */
  day: number;
  start: string; // HH:mm
  end: string; // HH:mm
  courseId: string | null;
  /** Shown when the slot is not tied to a course. */
  title: string;
  location: string;
};

export type SchoolState = {
  courses: Course[];
  homework: Homework[];
  exams: Exam[];
  progress: ProgressUnit[];
  /** Weekly class timetable (absent in data saved before this existed). */
  timetable?: TimetableSlot[];
};

export const DEFAULT_HOMEWORK_MINUTES = 60;
export const DEFAULT_UNIT_MINUTES = 45;

export const homeworkMinutes = (h: Homework) => h.estimatedMinutes ?? DEFAULT_HOMEWORK_MINUTES;
export const unitMinutes = (u: ProgressUnit) => u.estimatedMinutes ?? DEFAULT_UNIT_MINUTES;

/** Units without their own due date are due by the earliest open exam that covers them. */
export function unitDeadline(unit: ProgressUnit, exams: Exam[]): string | undefined {
  if (unit.dueDate) return unit.dueDate;
  let best: string | undefined;
  for (const e of exams) {
    if (e.done || !e.scope?.includes(unit.id)) continue;
    if (!best || e.date < best) best = e.date;
  }
  return best;
}

export function formatMinutes(min: number) {
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小時 ${m} 分` : `${h} 小時`;
}

export const COURSE_COLORS = [
  { name: "湖綠", value: "#0F766E" },
  { name: "午夜藍", value: "#1E3A5F" },
  { name: "琥珀", value: "#C2410C" },
  { name: "莓紅", value: "#9F1239" },
  { name: "橄欖", value: "#3F6212" },
  { name: "靛紫", value: "#4338CA" },
  { name: "石板", value: "#475569" },
  { name: "孔雀", value: "#0E7490" },
] as const;

export type SchoolView = "courses" | "timetable" | "progress" | "homework" | "exams";

export const EMPTY_STATE: SchoolState = {
  courses: [],
  homework: [],
  exams: [],
  progress: [],
};

export function isSchoolState(value: unknown): value is SchoolState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.courses) &&
    Array.isArray(v.homework) &&
    Array.isArray(v.exams) &&
    Array.isArray(v.progress)
  );
}
