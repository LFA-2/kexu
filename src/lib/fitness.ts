export type ExerciseKind = "strength" | "cardio";

export const MUSCLES = ["胸", "背", "腿", "臀", "肩", "手臂", "核心", "全身", "有氧"] as const;
export type Muscle = (typeof MUSCLES)[number];

export type Exercise = {
  id: string;
  name: string;
  kind: ExerciseKind;
  muscle: Muscle;
  /** Strength done with body weight; weight field means added load */
  bodyweight?: boolean;
  custom?: boolean;
};

export type RoutineItem = {
  exerciseId: string;
  /** strength */
  sets?: number;
  reps?: number;
  weight?: number;
  /** cardio */
  minutes?: number;
  distance?: number;
};

export type Routine = {
  id: string;
  name: string;
  color: string;
  items: RoutineItem[];
  note: string;
  createdAt: string;
};

export type SetLog = { weight: number; reps: number; done: boolean };

export type CardioLog = {
  minutes: number;
  distance?: number; // km
  calories?: number;
  avgHr?: number;
};

export type SessionEntry = {
  exerciseId: string;
  sets?: SetLog[];
  cardio?: CardioLog;
};

export type Session = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  routineId?: string;
  startedAt: string;
  durationMin: number;
  entries: SessionEntry[];
  note: string;
  /** perceived effort 1–10 */
  rpe?: number;
};

export type BodyLog = { weight?: number; fat?: number };

export type FitnessState = {
  exercises: Exercise[];
  routines: Routine[];
  /** "1".."7" (Mon..Sun) → routine id */
  weekPlan: Record<string, string>;
  sessions: Session[];
  body: Record<string, BodyLog>;
  restSec?: number;
};

export const EMPTY_FITNESS: FitnessState = {
  exercises: [],
  routines: [],
  weekPlan: {},
  sessions: [],
  body: {},
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function isFitnessState(value: unknown): value is FitnessState {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.exercises) &&
    Array.isArray(value.routines) &&
    isRecord(value.weekPlan) &&
    Array.isArray(value.sessions) &&
    isRecord(value.body)
  );
}

const s = (id: string, name: string, muscle: Muscle, bodyweight = false): Exercise => ({
  id: `bi_${id}`,
  name,
  kind: "strength",
  muscle,
  ...(bodyweight ? { bodyweight } : {}),
});
const c = (id: string, name: string): Exercise => ({
  id: `bi_${id}`,
  name,
  kind: "cardio",
  muscle: "有氧",
});

export const BUILTIN_EXERCISES: Exercise[] = [
  s("bench", "槓鈴臥推", "胸"),
  s("db_bench", "啞鈴臥推", "胸"),
  s("incline_bench", "上斜臥推", "胸"),
  s("db_fly", "啞鈴飛鳥", "胸"),
  s("pushup", "伏地挺身", "胸", true),
  s("dip", "雙槓撐體", "胸", true),
  s("deadlift", "硬舉", "背"),
  s("pullup", "引體向上", "背", true),
  s("lat_pulldown", "滑輪下拉", "背"),
  s("row", "槓鈴划船", "背"),
  s("db_row", "單臂啞鈴划船", "背"),
  s("cable_row", "坐姿划船", "背"),
  s("squat", "槓鈴深蹲", "腿"),
  s("front_squat", "前蹲舉", "腿"),
  s("leg_press", "腿推", "腿"),
  s("lunge", "弓箭步", "腿"),
  s("leg_curl", "腿後勾", "腿"),
  s("leg_ext", "腿伸展", "腿"),
  s("calf", "提踵", "腿"),
  s("rdl", "羅馬尼亞硬舉", "臀"),
  s("hip_thrust", "臀推", "臀"),
  s("ohp", "站姿肩推", "肩"),
  s("db_ohp", "啞鈴肩推", "肩"),
  s("lateral", "側平舉", "肩"),
  s("face_pull", "臉拉", "肩"),
  s("curl", "槓鈴彎舉", "手臂"),
  s("db_curl", "啞鈴彎舉", "手臂"),
  s("hammer", "錘式彎舉", "手臂"),
  s("pushdown", "三頭下壓", "手臂"),
  s("skull", "仰臥臂屈伸", "手臂"),
  s("plank", "棒式（秒）", "核心", true),
  s("crunch", "捲腹", "核心", true),
  s("leg_raise", "懸吊抬腿", "核心", true),
  s("burpee", "波比跳", "全身", true),
  s("kb_swing", "壺鈴擺盪", "全身"),
  c("run", "跑步"),
  c("treadmill", "跑步機"),
  c("walk", "快走"),
  c("bike", "騎腳踏車"),
  c("spin", "飛輪"),
  c("swim", "游泳"),
  c("rower", "划船機"),
  c("elliptical", "滑步機"),
  c("rope", "跳繩"),
  c("hike", "爬山"),
  c("stairs", "爬樓梯"),
];

export const ROUTINE_COLORS = ["#0F766E", "#1E3A5F", "#C2410C", "#9F1239", "#3F6212", "#4338CA"];

export type RoutineTemplate = { name: string; note: string; items: RoutineItem[] };

const st = (id: string, sets: number, reps: number): RoutineItem => ({
  exerciseId: `bi_${id}`,
  sets,
  reps,
});
const ca = (id: string, minutes: number, distance?: number): RoutineItem => ({
  exerciseId: `bi_${id}`,
  minutes,
  ...(distance ? { distance } : {}),
});

export const TEMPLATE_GROUPS: { name: string; desc: string; routines: RoutineTemplate[]; days: number[][] }[] = [
  {
    name: "推／拉／腿",
    desc: "一週三練，進階可以一週六練",
    routines: [
      {
        name: "推（胸肩三頭）",
        note: "",
        items: [st("bench", 4, 8), st("incline_bench", 3, 10), st("ohp", 3, 8), st("lateral", 3, 15), st("pushdown", 3, 12)],
      },
      {
        name: "拉（背二頭）",
        note: "",
        items: [st("deadlift", 3, 5), st("pullup", 3, 8), st("row", 3, 10), st("face_pull", 3, 15), st("curl", 3, 12)],
      },
      {
        name: "腿",
        note: "",
        items: [st("squat", 4, 8), st("rdl", 3, 10), st("leg_press", 3, 12), st("leg_curl", 3, 12), st("calf", 4, 15)],
      },
    ],
    days: [[1], [3], [5]],
  },
  {
    name: "全身入門 A／B",
    desc: "一週三次，A、B 交替，適合剛開始重訓",
    routines: [
      {
        name: "全身 A",
        note: "",
        items: [st("squat", 3, 8), st("bench", 3, 8), st("row", 3, 8), st("plank", 3, 45)],
      },
      {
        name: "全身 B",
        note: "",
        items: [st("deadlift", 3, 5), st("ohp", 3, 8), st("lat_pulldown", 3, 10), st("lunge", 3, 10)],
      },
    ],
    days: [[1, 5], [3]],
  },
  {
    name: "5K 跑步入門",
    desc: "一週三跑，搭配一次長距離",
    routines: [
      { name: "輕鬆跑", note: "能說話的速度", items: [ca("run", 30, 4)] },
      { name: "間歇跑", note: "快跑 1 分＋慢跑 2 分 × 8", items: [ca("run", 25, 3.5)] },
      { name: "長距離", note: "", items: [ca("run", 45, 6)] },
    ],
    days: [[2], [4], [7]],
  },
];

/** Epley estimated one-rep max. */
export const e1rm = (weight: number, reps: number) =>
  reps <= 0 ? 0 : reps === 1 ? weight : weight * (1 + reps / 30);

export const setVolume = (sets: SetLog[] | undefined) =>
  (sets ?? []).filter((x) => x.done).reduce((a, x) => a + x.weight * x.reps, 0);

export const sessionVolume = (s: Session) => s.entries.reduce((a, e) => a + setVolume(e.sets), 0);

export const sessionCardio = (s: Session) =>
  s.entries.reduce(
    (a, e) => ({
      minutes: a.minutes + (e.cardio?.minutes ?? 0),
      distance: a.distance + (e.cardio?.distance ?? 0),
    }),
    { minutes: 0, distance: 0 },
  );

/** Rough duration of a routine in minutes: ~2.5 min per set, cardio as given. */
export function routineMinutes(r: Routine, all: Exercise[]) {
  const map = new Map(all.map((e) => [e.id, e]));
  let total = 0;
  for (const it of r.items) {
    const ex = map.get(it.exerciseId);
    if (ex?.kind === "cardio") total += it.minutes ?? 30;
    else total += (it.sets ?? 3) * 2.5;
  }
  return Math.max(10, Math.round(total / 5) * 5);
}

export function formatPace(minutes: number, km: number) {
  if (!km) return "";
  const pace = minutes / km;
  const m = Math.floor(pace);
  const sec = Math.round((pace - m) * 60);
  return `${m}'${String(sec).padStart(2, "0")}"/km`;
}

export function formatKg(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
