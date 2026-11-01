export type MetricKey = "sleep" | "busy" | "stress" | "mood";

export const METRICS: {
  key: MetricKey;
  label: string;
  low: string;
  high: string;
  color: string;
}[] = [
  { key: "sleep", label: "睡眠品質", low: "很差", high: "很好", color: "#1E3A5F" },
  { key: "busy", label: "忙碌程度", low: "很閒", high: "很忙", color: "#C2410C" },
  { key: "stress", label: "壓力指數", low: "很輕鬆", high: "壓力很大", color: "#9F1239" },
  { key: "mood", label: "心情指數", low: "低落", high: "很好", color: "#0F766E" },
];

export type DayMetrics = Partial<Record<MetricKey, number>>;

export type Todo = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  /** Start HH:mm, or "". Kept as `time` so older saved todos still open. */
  time: string;
  /** End HH:mm, or omitted. Optional, like the start. */
  end?: string;
  done: boolean;
  createdAt: string;
};

/** How a todo's optional range should read. Start-only stays a single time. */
export function formatTodoTime(todo: Pick<Todo, "time" | "end">) {
  const start = todo.time || "";
  const end = todo.end || "";
  if (start && end) return `${start}–${end}`;
  if (end) return `–${end}`;
  return start;
}

export type ScheduleItem = {
  id: string;
  kind: "point" | "span";
  label: string;
  start: string; // HH:mm
  end?: string; // HH:mm, spans only; earlier than start means past midnight
};

export const POINT_PRESETS = ["起床", "出門", "回家"];
export const SPAN_PRESETS = ["上學", "開會", "家教"];

export type LifeState = {
  /** dateKey → that day's metrics */
  metrics: Record<string, DayMetrics>;
  todos: Todo[];
  /** dateKey → note for linked people */
  notes: Record<string, string>;
  /** dateKeys the user is free to meet */
  available: string[];
  /** dateKey → main plans for that day (absent in data saved before this existed) */
  schedule?: Record<string, ScheduleItem[]>;
  /** Weekly chores / habits */
  habits?: Habit[];
  /** dateKey → ids of habits done that day */
  habitLog?: Record<string, string[]>;
  /** dateKey → the 今日 plan for that day */
  plans?: Record<string, DayPlan>;
  planSettings?: PlanSettings;
};

export type Habit = {
  id: string;
  title: string;
  /** 1 = Monday … 7 = Sunday */
  days: number[];
  minutes: number;
  /** Preferred time HH:mm, or "" */
  time: string;
  icon: string;
  createdAt: string;
};

export const HABIT_ICONS = ["🗑️", "🧺", "🧹", "🍽️", "🪴", "🛏️", "🧽", "🐾", "🛒", "📚", "💊", "💧"];

export const HABIT_PRESETS: { title: string; icon: string; minutes: number }[] = [
  { title: "倒垃圾", icon: "🗑️", minutes: 10 },
  { title: "洗衣服", icon: "🧺", minutes: 20 },
  { title: "掃地拖地", icon: "🧹", minutes: 30 },
  { title: "洗碗", icon: "🍽️", minutes: 15 },
  { title: "澆花", icon: "🪴", minutes: 5 },
  { title: "換床單", icon: "🛏️", minutes: 15 },
  { title: "刷浴室", icon: "🧽", minutes: 30 },
  { title: "買菜", icon: "🛒", minutes: 40 },
];

export type PlanItemKind =
  | "homework"
  | "unit"
  | "exam"
  | "habit"
  | "todo"
  | "workout"
  | "action"
  | "custom";

export type PlanItem = {
  id: string;
  kind: PlanItemKind;
  /** Source id: homework/unit/exam/habit/todo/routine id, or "meetingId:actionId" */
  refId?: string;
  title: string;
  detail: string;
  minutes: number;
  /** HH:mm or "" */
  start: string;
  /** 0–100 progress of today's portion */
  progress: number;
  /** Source progress (0–100) when the plan was made; homework/unit only */
  base?: number;
  /** How many source progress points today's portion is worth; homework/unit only */
  share?: number;
  /** Added or edited by hand, kept when the plan is regenerated */
  manual?: boolean;
};

export type DayPlan = {
  generatedAt: string;
  items: PlanItem[];
  /** refIds the user removed, so regenerating does not bring them back */
  dismissed?: string[];
};

export type PlanSettings = {
  dayStart: string; // HH:mm
  dayEnd: string; // HH:mm
  /** Upper bound on school work per day, minutes */
  studyBudget: number;
};

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  dayStart: "08:00",
  dayEnd: "23:00",
  studyBudget: 240,
};

export function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Start and end in minutes from that day's midnight; end may exceed 24h. */
export function itemMinutes(item: ScheduleItem): [number, number] {
  const start = toMinutes(item.start);
  if (item.kind === "point" || !item.end) return [start, start];
  let end = toMinutes(item.end);
  if (end <= start) end += 24 * 60;
  return [start, end];
}

export const sortSchedule = (items: ScheduleItem[]) =>
  [...items].sort((a, b) => itemMinutes(a)[0] - itemMinutes(b)[0]);

export const EMPTY_LIFE: LifeState = { metrics: {}, todos: [], notes: {}, available: [] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function isLifeState(value: unknown): value is LifeState {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.metrics) &&
    Array.isArray(value.todos) &&
    isRecord(value.notes) &&
    Array.isArray(value.available)
  );
}

export const PERSON_COLORS = ["#0F766E", "#C2410C", "#4338CA", "#9F1239", "#3F6212", "#0E7490"];
