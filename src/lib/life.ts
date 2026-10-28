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
  time: string; // HH:mm or ""
  done: boolean;
  createdAt: string;
};

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
