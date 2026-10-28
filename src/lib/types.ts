export type Category = "school" | "life" | "shared";

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
};

export type Exam = {
  id: string;
  courseId: string;
  title: string;
  date: string; // YYYY-MM-DD
  note: string;
  done: boolean;
  createdAt: string;
};

export type ProgressUnit = {
  id: string;
  courseId: string;
  title: string;
  completed: boolean;
  order: number;
  createdAt: string;
};

export type SchoolState = {
  courses: Course[];
  homework: Homework[];
  exams: Exam[];
  progress: ProgressUnit[];
};

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

export type SchoolView = "courses" | "progress" | "homework" | "exams";

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
