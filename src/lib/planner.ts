import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { formatShortDate, isoWeekday, toDateKey } from "@/lib/dates";
import { dayRoutines, routineMinutes, type Exercise, type FitnessState } from "@/lib/fitness";
import {
  DEFAULT_PLAN_SETTINGS,
  itemMinutes,
  toMinutes,
  type DayPlan,
  type LifeState,
  type PlanItem,
  type PlanItemKind,
} from "@/lib/life";
import type { MeetingAction } from "@/lib/meetings";
import {
  homeworkMinutes,
  unitDeadline,
  unitMinutes,
  type SchoolState,
} from "@/lib/types";
import { uid } from "@/lib/utils";

export const TODO_MINUTES = 30;
export const ACTION_MINUTES = 30;
export const EXAM_MINUTES = 90;
const MIN_CHUNK = 30;

export type OpenAction = { meetingId: number; meetingTitle: string; action: MeetingAction };

export type PlannerInput = {
  date: string; // YYYY-MM-DD
  school: SchoolState;
  life: LifeState;
  fitness: FitnessState | null;
  exercises: Exercise[];
  actions: OpenAction[];
  existing?: DayPlan;
  /** Minutes since midnight to start scheduling from (e.g. now, when planning today mid-day) */
  fromMinute?: number;
};

const round15 = (m: number) => Math.max(15, Math.ceil(m / 15) * 15);

function todoMinutes(todo: { time: string; end?: string }) {
  if (!todo.time || !todo.end) return TODO_MINUTES;
  const span = toMinutes(todo.end) - toMinutes(todo.time);
  return span > 0 ? span : TODO_MINUTES;
}
const hhmm = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

type Interval = [number, number];

/** Busy intervals for the day: classes and timed plans from 今明行程. */
export function busyIntervals(date: string, school: SchoolState, life: LifeState): Interval[] {
  const wd = isoWeekday(parseISO(date));
  const out: Interval[] = [];
  for (const t of school.timetable ?? []) {
    if (t.day === wd) out.push([toMinutes(t.start), toMinutes(t.end)]);
  }
  for (const s of life.schedule?.[date] ?? []) {
    if (s.kind === "span") out.push(itemMinutes(s));
  }
  return merge(out);
}

function merge(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function freeGaps(start: number, end: number, busy: Interval[]): Interval[] {
  const gaps: Interval[] = [];
  let cur = start;
  for (const [s, e] of merge(busy)) {
    if (e <= cur) continue;
    if (s >= end) break;
    if (s > cur) gaps.push([cur, Math.min(s, end)]);
    cur = Math.max(cur, e);
  }
  if (cur < end) gaps.push([cur, end]);
  return gaps;
}

type Work = {
  kind: "homework" | "unit";
  refId: string;
  title: string;
  detail: string;
  estimate: number;
  progress: number;
  remaining: number;
  deadline?: string;
  /** days available including today; Infinity when no deadline */
  workdays: number;
  order: number;
  /** Study units are read in order: the unit that must be finished before this one. */
  prev?: string;
  /** Course id shared by a chain of study units. */
  chain?: string;
};

/** Everything school-related that still needs work, most urgent first. */
export function openWork(date: string, school: SchoolState): Work[] {
  const courseName = new Map(school.courses.map((c) => [c.id, c.name]));
  const courseOrder = new Map(school.courses.map((c, i) => [c.id, i]));
  const days = (deadline?: string) =>
    deadline ? Math.max(1, differenceInCalendarDays(parseISO(deadline), parseISO(date))) : Infinity;
  const out: Work[] = [];
  for (const h of school.homework) {
    if (h.done) continue;
    const est = homeworkMinutes(h);
    const progress = h.progress ?? 0;
    out.push({
      kind: "homework",
      refId: h.id,
      title: h.title,
      detail: `${courseName.get(h.courseId) ?? ""}・作業・${formatShortDate(h.dueDate)} 截止`,
      estimate: est,
      progress,
      remaining: est * (1 - progress / 100),
      deadline: h.dueDate,
      workdays: days(h.dueDate),
      order: courseOrder.get(h.courseId) ?? 99,
    });
  }
  // Study units of a course are read one after another, so a unit must be done by the
  // earliest deadline of any unit after it.
  const units = school.progress
    .filter((u) => !u.completed)
    .sort((a, b) => a.courseId.localeCompare(b.courseId) || a.order - b.order);
  const effective = new Map<string, string | undefined>();
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    const own = unitDeadline(u, school.exams);
    const next = units[i + 1]?.courseId === u.courseId ? effective.get(units[i + 1].id) : undefined;
    effective.set(u.id, own && next ? (own < next ? own : next) : (own ?? next));
  }
  for (const [i, u] of units.entries()) {
    const deadline = unitDeadline(u, school.exams);
    const due = effective.get(u.id);
    const exam = u.dueDate
      ? undefined
      : school.exams
          .filter((e) => !e.done && e.scope?.includes(u.id) && e.date === deadline)
          .map((e) => e.title)[0];
    const est = unitMinutes(u);
    const progress = u.progress ?? 0;
    out.push({
      kind: "unit",
      refId: u.id,
      title: u.title,
      detail: `${courseName.get(u.courseId) ?? ""}・讀書${
        deadline ? `・${exam ? `${exam}範圍，` : ""}${formatShortDate(deadline)}${exam ? "考" : "前"}` : ""
      }`,
      estimate: est,
      progress,
      remaining: est * (1 - progress / 100),
      deadline: due,
      workdays: days(due),
      order: (courseOrder.get(u.courseId) ?? 99) * 1000 + u.order,
      chain: u.courseId,
      prev: units[i - 1]?.courseId === u.courseId ? units[i - 1].id : undefined,
    });
  }
  return out.sort(
    (a, b) =>
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.order - b.order,
  );
}

export function workItem(w: Work, minutes: number, id = uid("pi")): PlanItem {
  const covers = minutes >= w.remaining - 0.5;
  const share = covers ? 100 - w.progress : Math.min(100 - w.progress, (minutes / w.estimate) * 100);
  return {
    id,
    kind: w.kind,
    refId: w.refId,
    title: w.title,
    detail: w.detail,
    minutes: Math.round(minutes),
    start: "",
    progress: 0,
    base: w.progress,
    share: Math.round(share * 10) / 10,
  };
}

/** Stable ids for generated items, so re-planning keeps React keys and edits aligned. */
const autoId = (kind: PlanItemKind, refId: string) => `a:${kind}:${refId}`;

export function generatePlan(input: PlannerInput): DayPlan {
  const { date, school, life, fitness, exercises, actions, existing } = input;
  const settings = life.planSettings ?? DEFAULT_PLAN_SETTINGS;
  const wd = isoWeekday(parseISO(date));
  const isToday = date === toDateKey(new Date());
  const dismissed = new Set(existing?.dismissed ?? []);
  const kept = (existing?.items ?? []).filter((i) => i.manual);
  const keptRefs = new Set(kept.flatMap((i) => (i.refId ? [`${i.kind}:${i.refId}`] : [])));
  const skip = (kind: PlanItemKind, ref: string) =>
    dismissed.has(`${kind}:${ref}`) || keptRefs.has(`${kind}:${ref}`);

  const fixed: PlanItem[] = [];
  const add = (kind: PlanItemKind, refId: string, title: string, detail: string, minutes: number, start = "") => {
    if (skip(kind, refId)) return;
    fixed.push({ id: autoId(kind, refId), kind, refId, title, detail, minutes, start, progress: 0 });
  };

  // Exams today
  const courseName = new Map(school.courses.map((c) => [c.id, c.name]));
  for (const e of school.exams) {
    if (e.date === date && !e.done) add("exam", e.id, `考試：${e.title}`, courseName.get(e.courseId) ?? "", EXAM_MINUTES);
  }
  // Habits
  for (const h of life.habits ?? []) {
    if (h.days.includes(wd)) add("habit", h.id, `${h.icon} ${h.title}`, "家事", h.minutes, h.time);
  }
  // Todos for the day (and overdue ones when planning today)
  for (const t of life.todos) {
    if (t.done) continue;
    if (t.date === date || (isToday && t.date < date)) {
      add(
        "todo",
        t.id,
        t.title,
        t.date < date ? `待辦・原本 ${formatShortDate(t.date)}` : "待辦",
        todoMinutes(t),
        t.time,
      );
    }
  }
  // Workout
  const routines = fitness ? dayRoutines(fitness, wd) : [];
  if (routines.length) {
    add(
      "workout",
      routines.map((r) => r.id).join("+"),
      `運動：${routines.map((r) => r.name).join("、")}`,
      `${routines.reduce((a, r) => a + r.items.length, 0)} 個動作`,
      routines.reduce((a, r) => a + routineMinutes(r, exercises), 0),
    );
  }
  // Meeting actions
  for (const a of actions) {
    if (a.action.done) continue;
    if (a.action.due && a.action.due > date) continue;
    add(
      "action",
      `${a.meetingId}:${a.action.id}`,
      a.action.text,
      `會議・${a.meetingTitle}${a.action.due ? `・${formatShortDate(a.action.due)} 前` : ""}`,
      ACTION_MINUTES,
    );
  }

  // Time available for school work
  const dayStart = Math.max(toMinutes(settings.dayStart), input.fromMinute ?? 0);
  const dayEnd = toMinutes(settings.dayEnd);
  const busy = busyIntervals(date, school, life);
  const gaps = freeGaps(dayStart, dayEnd, busy);
  const free = gaps.reduce((a, [s, e]) => a + (e - s), 0);
  const fixedMinutes = [...fixed, ...kept].reduce((a, i) => a + i.minutes, 0);
  let budget = Math.max(0, Math.min(settings.studyBudget, free - fixedMinutes));

  const open = openWork(date, school).filter((w) => w.remaining > 0);
  const byRef = new Map(open.map((w) => [w.refId, w]));
  const work = open.filter((w) => !skip(w.kind, w.refId));
  const alloc = new Map<string, number>();
  // Units the user placed by hand count as planned for the chain.
  for (const i of kept) {
    if (i.kind === "unit" && i.refId) alloc.set(i.refId, (alloc.get(i.refId) ?? 0) + i.minutes);
  }
  const left = (w: Work) => w.remaining - (alloc.get(w.refId) ?? 0);
  /** A study unit can start only once the one before it is fully planned (or done). */
  const ready = (w: Work): boolean => {
    const p = w.prev ? byRef.get(w.prev) : undefined;
    return !p || left(p) <= 0.5;
  };
  const give = (w: Work, m: number) => {
    if (!ready(w)) return 0;
    const add = Math.min(m, left(w));
    if (add <= 0) return 0;
    alloc.set(w.refId, (alloc.get(w.refId) ?? 0) + add);
    return add;
  };
  /** Give minutes to a unit chain front to back, starting at w. */
  const giveChain = (w: Work, m: number) => {
    let total = 0;
    for (const u of work) {
      if (u.chain !== w.chain || u.kind !== "unit" || u.order < w.order) continue;
      if (m - total <= 0) break;
      const got = give(u, m - total);
      total += got;
      if (left(u) > 0.5) break;
    }
    return total;
  };

  // 1. Due today/tomorrow or overdue: finish them, even past the budget.
  for (const w of work) {
    if (w.workdays === 1) budget -= give(w, left(w));
  }
  // 2. Spread the rest evenly over the days left.
  const paced = new Set<string>();
  for (const w of work) {
    if (budget <= 0) break;
    if (w.workdays === 1 || !Number.isFinite(w.workdays)) continue;
    if (w.kind === "unit") {
      // One pace for the whole chain: enough that every later deadline is still met.
      if (!w.chain || paced.has(w.chain) || !ready(w)) continue;
      paced.add(w.chain);
      let cum = 0;
      let pace = 0;
      for (const u of work) {
        if (u.chain !== w.chain || u.kind !== "unit" || u.order < w.order) continue;
        cum += left(u);
        if (Number.isFinite(u.workdays)) pace = Math.max(pace, cum / u.workdays);
      }
      const share = Math.max(Math.min(left(w), MIN_CHUNK), round15(pace));
      const m = Math.min(share, budget);
      if (m >= 15 || m >= left(w)) budget -= giveChain(w, m);
      continue;
    }
    const share = Math.max(Math.min(w.remaining, MIN_CHUNK), round15(w.remaining / w.workdays));
    const m = Math.min(share, budget);
    if (m >= 15 || m >= w.remaining) budget -= give(w, m);
  }
  // 3. Spare time: get ahead on the nearest deadlines.
  for (const w of work) {
    if (budget < 15) break;
    if (!Number.isFinite(w.workdays)) continue;
    if (left(w) <= 0.5) continue;
    budget -= give(w, Math.min(budget, round15(left(w))));
  }
  // 4. Still spare: up to two units without any deadline.
  let extra = 0;
  for (const w of work) {
    if (budget < 15 || extra >= 2) break;
    if (Number.isFinite(w.workdays) || !ready(w) || left(w) <= 0.5) continue;
    const m = Math.min(budget, round15(left(w)));
    const got = give(w, m);
    budget -= got;
    // Finishing a unit lets the next one in its chain follow on the same day.
    if (!w.chain || left(w) > 0.5) extra++;
  }

  const schoolItems = work.flatMap((w) => {
    const m = alloc.get(w.refId);
    return m ? [workItem(w, m, autoId(w.kind, w.refId))] : [];
  });

  // Regenerating keeps what was already done today.
  const before = new Map(
    (existing?.items ?? []).filter((i) => !i.manual && i.refId).map((i) => [`${i.kind}:${i.refId}`, i]),
  );
  for (const item of [...fixed, ...schoolItems]) {
    const old = before.get(`${item.kind}:${item.refId}`);
    if (!old) continue;
    item.progress = old.progress;
    if (item.base !== undefined && old.base !== undefined && old.base < item.base) {
      item.share = Math.round((item.base + (item.share ?? 0) - old.base) * 10) / 10;
      item.base = old.base;
    }
  }
  // Things finished earlier today still count toward today.
  const present = new Set([...fixed, ...schoolItems].map((i) => `${i.kind}:${i.refId}`));
  for (const [key, old] of before) {
    if (present.has(key)) continue;
    const done =
      old.kind === "homework"
        ? school.homework.find((h) => h.id === old.refId)?.done
        : old.kind === "unit"
          ? school.progress.find((u) => u.id === old.refId)?.completed
          : old.kind === "todo"
            ? life.todos.find((t) => t.id === old.refId)?.done
            : old.kind === "exam"
              ? school.exams.find((e) => e.id === old.refId)?.done
              : old.progress >= 100;
    if (done) schoolItems.push({ ...old, progress: 100 });
  }

  const items = [...kept, ...fixed, ...schoolItems];
  assignTimes(items, gaps);
  return {
    generatedAt: new Date().toISOString(),
    items: sortItems(items),
    dismissed: existing?.dismissed,
  };
}

/** Give untimed items a start time inside free gaps, around the timed ones. */
export function assignTimes(items: PlanItem[], gaps: Interval[]) {
  const occupied: Interval[] = items
    .filter((i) => i.start)
    .map((i) => [toMinutes(i.start), toMinutes(i.start) + i.minutes]);
  let free = gaps.flatMap(([s, e]) => freeGaps(s, e, occupied));
  for (const item of items) {
    if (item.start || item.minutes <= 0) continue;
    let idx = free.findIndex(([s, e]) => e - s >= item.minutes);
    if (idx < 0) idx = free.findIndex(([s, e]) => e - s >= Math.min(item.minutes, 60));
    if (idx < 0) continue;
    const [s, e] = free[idx];
    item.start = hhmm(s);
    const end = Math.min(e, s + item.minutes);
    free = [...free.slice(0, idx), ...(end + 10 < e ? [[end + 10, e] as Interval] : []), ...free.slice(idx + 1)];
  }
}

export const sortItems = (items: PlanItem[]) =>
  [...items].sort((a, b) => (a.start || "99:99").localeCompare(b.start || "99:99"));

export type LiveSources = {
  school: SchoolState;
  life: LifeState;
  fitness: FitnessState | null;
  /** "meetingId:actionId" → done, for actions this viewer can see */
  actionDone: Map<string, boolean>;
  date: string;
};

/** Current overall progress (0–100) of the source behind a homework/unit item. */
export function sourceProgress(item: PlanItem, src: LiveSources): number | null {
  if (item.kind === "homework") {
    const h = src.school.homework.find((x) => x.id === item.refId);
    return h ? (h.done ? 100 : (h.progress ?? 0)) : null;
  }
  if (item.kind === "unit") {
    const u = src.school.progress.find((x) => x.id === item.refId);
    return u ? (u.completed ? 100 : (u.progress ?? 0)) : null;
  }
  return null;
}

/** 0–1: how much of today's portion of this item is done. */
export function itemFraction(item: PlanItem, src: LiveSources | null): number {
  if (!src) return item.progress / 100;
  if (item.kind === "homework" || item.kind === "unit") {
    const cur = sourceProgress(item, src);
    if (cur === null) return item.progress / 100;
    const base = item.base ?? 0;
    const share = item.share ?? 100 - base;
    if (share <= 0) return cur >= 100 ? 1 : 0;
    return Math.max(0, Math.min(1, (cur - base) / share));
  }
  if (item.kind === "habit" && src.life.habitLog?.[src.date]?.includes(item.refId ?? "")) return 1;
  if (item.kind === "todo" && src.life.todos.find((t) => t.id === item.refId)?.done) return 1;
  if (item.kind === "exam" && src.school.exams.find((e) => e.id === item.refId)?.done) return 1;
  if (item.kind === "workout" && src.fitness?.sessions.some((s) => s.date === src.date)) return 1;
  if (item.kind === "action" && item.refId && src.actionDone.get(item.refId)) return 1;
  return item.progress / 100;
}

/** Minutes-weighted completion (0–100) of a day's plan. */
export function planCompletion(items: PlanItem[], fraction: (i: PlanItem) => number) {
  const counted = items.filter((i) => i.minutes > 0);
  const total = counted.reduce((a, i) => a + i.minutes, 0);
  if (total === 0) return items.length ? (items.every((i) => fraction(i) >= 1) ? 100 : 0) : null;
  return (counted.reduce((a, i) => a + i.minutes * fraction(i), 0) / total) * 100;
}

export const CATEGORY_OF: Record<PlanItemKind, "school" | "chores" | "workout" | "todo" | "other"> = {
  homework: "school",
  unit: "school",
  exam: "school",
  habit: "chores",
  workout: "workout",
  todo: "todo",
  action: "todo",
  custom: "other",
};

export const CATEGORY_LABEL = {
  school: "學校",
  chores: "家事",
  workout: "運動",
  todo: "待辦・會議",
  other: "其他",
} as const;

/**
 * Plans every day from `from` through `to`, carrying work forward: each day
 * assumes the previous days' targets were met, so work is spread rather than
 * repeated. `stored` supplies the real plan for `from` (if any) and the hand
 * edits (manual items, dismissed refs) of later days.
 */
export function planAhead(
  base: Omit<PlannerInput, "date" | "existing">,
  from: string,
  to: string,
  stored: Record<string, DayPlan>,
): Record<string, DayPlan> {
  const out: Record<string, DayPlan> = {};
  let school: SchoolState = base.school;
  const usedActions = new Set<string>();
  for (let d = from; d <= to; d = toDateKey(addDays(parseISO(d), 1))) {
    const plan =
      d === from && stored[d]
        ? stored[d]
        : generatePlan({
            ...base,
            fromMinute: d === from ? base.fromMinute : undefined,
            date: d,
            school,
            actions: base.actions.filter((a) => !usedActions.has(`${a.meetingId}:${a.action.id}`)),
            existing: stored[d],
          });
    out[d] = plan;
    school = assumeDone(school, plan);
    for (const i of plan.items) if (i.kind === "action" && i.refId) usedActions.add(i.refId);
  }
  return out;
}

/** School state as if every homework/unit item in the plan reached its target. */
function assumeDone(school: SchoolState, plan: DayPlan): SchoolState {
  const target = new Map<string, number>();
  for (const i of plan.items) {
    if ((i.kind === "homework" || i.kind === "unit") && i.refId) {
      target.set(i.refId, Math.min(100, (i.base ?? 0) + (i.share ?? 0)));
    }
  }
  if (target.size === 0) return school;
  return {
    ...school,
    homework: school.homework.map((h) => {
      const t = target.get(h.id);
      if (t === undefined) return h;
      const p = Math.max(h.progress ?? 0, t);
      return { ...h, progress: p, done: h.done || p >= 99.5 };
    }),
    progress: school.progress.map((u) => {
      const t = target.get(u.id);
      if (t === undefined) return u;
      const p = Math.max(u.progress ?? 0, t);
      return { ...u, progress: p, completed: u.completed || p >= 99.5 };
    }),
  };
}
