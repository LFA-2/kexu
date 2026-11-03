import { addDays, parseISO } from "date-fns";
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
/** Longer study blocks are split so there is a break in between. */
const MAX_BLOCK = 90;
/** Daily cap for units without any deadline, so they never crowd out real deadlines. */
const NO_DEADLINE_MINUTES = 60;
const REVIEW_SHARE = 0.15;
const REVIEW_MIN = 30;
const REVIEW_MAX = 120;
/** How far ahead capacity is counted when pacing toward a deadline. */
const HORIZON_DAYS = 180;

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
const shiftDay = (key: string, n: number) => toDateKey(addDays(parseISO(key), n));
const atLeast = (key: string, min: string) => (key < min ? min : key);

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
  const skipped = new Set(life.skippedClasses?.[date] ?? []);
  const out: Interval[] = [];
  for (const t of school.timetable ?? []) {
    if (t.day === wd && !skipped.has(t.id)) out.push([toMinutes(t.start), toMinutes(t.end)]);
  }
  for (const s of life.schedule?.[date] ?? []) {
    // Classes already come from the timetable; synced copies must not double-count.
    if (s.kind === "span" && !s.fromTimetable) out.push(itemMinutes(s));
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
  /** Last day to work on it so it is finished a little early. Undefined: no deadline. */
  target?: string;
  /** Last day it can still be worked on at all. */
  latest?: string;
  /** What the deadline belongs to, for warnings. */
  label: string;
  order: number;
  /** Study units are read in order: the unit that must be finished before this one. */
  prev?: string;
  /** Course id shared by a chain of study units. */
  chain?: string;
};

/** Incomplete units of a course except the first one. They can't be started yet. */
export function blockedUnitIds(school: SchoolState): Set<string> {
  return new Set(unitBlockers(school).keys());
}

/** Locked unit id → title of the unit that has to be finished first. */
export function unitBlockers(school: SchoolState): Map<string, string> {
  const open = new Map<string, { id: string; title: string; order: number }[]>();
  for (const unit of school.progress) {
    if (unit.completed) continue;
    const list = open.get(unit.courseId) ?? [];
    list.push(unit);
    open.set(unit.courseId, list);
  }
  const out = new Map<string, string>();
  for (const list of open.values()) {
    list.sort((a, b) => a.order - b.order);
    for (const unit of list.slice(1)) out.set(unit.id, list[0].title);
  }
  return out;
}

/** Everything school-related that still needs work, most urgent first. */
export function openWork(date: string, school: SchoolState): Work[] {
  const courseName = new Map(school.courses.map((c) => [c.id, c.name]));
  const courseOrder = new Map(school.courses.map((c, i) => [c.id, i]));
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
      target: atLeast(shiftDay(h.dueDate, -1), date),
      latest: atLeast(h.dueDate, date),
      label: h.title,
      order: courseOrder.get(h.courseId) ?? 99,
    });
  }
  // Study units of a course are read one after another, so a unit must be done before
  // any later unit's deadline too.
  const units = school.progress
    .filter((u) => !u.completed)
    .sort((a, b) => a.courseId.localeCompare(b.courseId) || a.order - b.order);
  type Due = { target: string; latest: string; label: string };
  const effective = new Map<string, Due | undefined>();
  const examOf = new Map<string, string>();
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    const deadline = unitDeadline(u, school.exams);
    let own: Due | undefined;
    if (deadline && u.dueDate) {
      own = { target: shiftDay(deadline, -1), latest: deadline, label: u.title };
    } else if (deadline) {
      const exam = school.exams.find((e) => !e.done && e.scope?.includes(u.id) && e.date === deadline)?.title ?? "";
      if (exam) examOf.set(u.id, exam);
      own = { target: shiftDay(deadline, -2), latest: shiftDay(deadline, -1), label: exam ? `${exam}範圍` : u.title };
    }
    const next = units[i + 1]?.courseId === u.courseId ? effective.get(units[i + 1].id) : undefined;
    if (own && next) {
      effective.set(u.id, {
        target: next.target < own.target ? next.target : own.target,
        latest: next.latest < own.latest ? next.latest : own.latest,
        label: next.target < own.target ? next.label : own.label,
      });
    } else effective.set(u.id, own ?? next);
  }
  for (const [i, u] of units.entries()) {
    const deadline = unitDeadline(u, school.exams);
    const due = effective.get(u.id);
    const exam = examOf.get(u.id);
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
      target: due && atLeast(due.target, date),
      latest: due && atLeast(due.latest, date),
      label: due?.label ?? u.title,
      order: (courseOrder.get(u.courseId) ?? 99) * 1000 + u.order,
      chain: u.courseId,
      prev: units[i - 1]?.courseId === u.courseId ? units[i - 1].id : undefined,
    });
  }
  return out.sort(
    (a, b) => (a.target ?? "9999").localeCompare(b.target ?? "9999") || a.order - b.order,
  );
}

export function workItem(w: Work, minutes: number, id = uid("pi")): PlanItem {
  return workPart(w, minutes, w.progress, minutes >= w.remaining - 0.5, id, w.title);
}

function workPart(w: Work, minutes: number, base: number, last: boolean, id: string, title: string): PlanItem {
  const share = last ? 100 - base : Math.min(100 - base, (minutes / w.estimate) * 100);
  return {
    id,
    kind: w.kind,
    refId: w.refId,
    title,
    detail: w.detail,
    minutes: Math.round(minutes),
    start: "",
    progress: 0,
    base,
    share: Math.round(share * 10) / 10,
  };
}

/** Long blocks become parts of at most MAX_BLOCK minutes, with a break between them. */
function workItems(w: Work, minutes: number): PlanItem[] {
  const parts = Math.ceil(minutes / MAX_BLOCK);
  const id = autoId(w.kind, w.refId);
  if (parts <= 1) return [workItem(w, minutes, id)];
  const size = round15(minutes / parts);
  const out: PlanItem[] = [];
  let base = w.progress;
  let given = 0;
  for (let p = 0; p < parts; p++) {
    const m = p === parts - 1 ? minutes - given : Math.min(size, minutes - given);
    if (m <= 0) break;
    given += m;
    const item = workPart(
      w,
      m,
      base,
      p === parts - 1 && given >= w.remaining - 0.5,
      p === 0 ? id : `${id}#${p + 1}`,
      `${w.title}（${p + 1}/${parts}）`,
    );
    base = Math.min(100, base + (item.share ?? 0));
    out.push(item);
  }
  return out;
}

/** Stable ids for generated items, so re-planning keeps React keys and edits aligned. */
const autoId = (kind: PlanItemKind, refId: string) => `a:${kind}:${refId}`;

/** A deadline that can't be met even when every free study minute goes to it. */
export type Shortfall = { label: string; date: string; minutes: number };

type DayContext = Pick<PlannerInput, "school" | "life" | "fitness" | "exercises">;

function dayStudyRoom(date: string, ctx: DayContext) {
  const settings = ctx.life.planSettings ?? DEFAULT_PLAN_SETTINGS;
  const wd = isoWeekday(parseISO(date));
  const gaps = freeGaps(toMinutes(settings.dayStart), toMinutes(settings.dayEnd), busyIntervals(date, ctx.school, ctx.life));
  const free = gaps.reduce((a, [s, e]) => a + (e - s), 0);
  let fixed = 0;
  for (const e of ctx.school.exams) {
    if (e.done) continue;
    if (e.date === date) fixed += EXAM_MINUTES;
    if (e.date === shiftDay(date, 1)) fixed += reviewMinutes(ctx.school, e.scope);
  }
  for (const h of ctx.life.habits ?? []) if (h.days.includes(wd)) fixed += h.minutes;
  for (const t of ctx.life.todos) if (!t.done && t.date === date) fixed += todoMinutes(t);
  const routines = ctx.fitness ? dayRoutines(ctx.fitness, wd) : [];
  for (const r of routines) fixed += routineMinutes(r, ctx.exercises);
  return Math.max(0, Math.min(settings.studyBudget, free - fixed));
}

function reviewMinutes(school: SchoolState, scope: string[] | undefined) {
  if (!scope?.length) return 0;
  const units = school.progress.filter((u) => scope.includes(u.id));
  if (!units.length) return 0;
  const total = units.reduce((a, u) => a + unitMinutes(u), 0);
  return Math.min(REVIEW_MAX, Math.max(REVIEW_MIN, round15(total * REVIEW_SHARE)));
}

/**
 * Prefix check over deadlines sorted by `key`: work due by day k vs. study capacity
 * from today through day k. Returns the pace needed today and any shortfalls.
 */
function outlook(
  date: string,
  work: Work[],
  left: (w: Work) => number,
  key: "target" | "latest",
  today: number,
  room: (d: string) => number,
) {
  const horizon = shiftDay(date, HORIZON_DAYS);
  const dated = work
    .filter((w) => w[key] && left(w) > 0.5)
    .map((w) => ({ w, k: (w[key]! > horizon ? horizon : w[key]!) }))
    .sort((a, b) => a.k.localeCompare(b.k) || a.w.order - b.w.order);
  let need = 0;
  let cap = today;
  let day = date;
  let pace = 0;
  let worst = 0;
  const shortfalls: Shortfall[] = [];
  for (let i = 0; i < dated.length; i++) {
    need += left(dated[i].w);
    const k = dated[i].k;
    if (dated[i + 1]?.k === k) continue;
    while (day < k) {
      day = shiftDay(day, 1);
      cap += room(day);
    }
    pace = Math.max(pace, cap > 0 ? (need * today) / cap : need > 0 ? Infinity : 0);
    // A deficit carries over to every later deadline; only report where it grows.
    if (need - cap > worst + 0.5) {
      shortfalls.push({ label: dated[i].w.label, date: k, minutes: need - cap - worst });
      worst = need - cap;
    }
  }
  return { pace, shortfalls };
}

function buildDay(input: PlannerInput): { plan: DayPlan; shortfalls: Shortfall[] } {
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

  const courseName = new Map(school.courses.map((c) => [c.id, c.name]));
  const tomorrow = shiftDay(date, 1);
  for (const e of school.exams) {
    if (e.done) continue;
    if (e.date === date) add("exam", e.id, `考試：${e.title}`, courseName.get(e.courseId) ?? "", EXAM_MINUTES);
    const review = e.date === tomorrow ? reviewMinutes(school, e.scope) : 0;
    if (review) add("review", e.id, `複習：${e.title}`, `${courseName.get(e.courseId) ?? ""}・明天考試`, review);
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

  // Time available for school work today
  const dayStart = Math.max(toMinutes(settings.dayStart), input.fromMinute ?? 0);
  const dayEnd = toMinutes(settings.dayEnd);
  const gaps = freeGaps(dayStart, dayEnd, busyIntervals(date, school, life));
  const free = gaps.reduce((a, [s, e]) => a + (e - s), 0);
  const fixedMinutes = [...fixed, ...kept].reduce((a, i) => a + i.minutes, 0);
  const capacity = Math.max(0, Math.min(settings.studyBudget, free - fixedMinutes));

  const open = openWork(date, school).filter((w) => w.remaining > 0);
  const byRef = new Map(open.map((w) => [w.refId, w]));
  const work = open.filter((w) => !skip(w.kind, w.refId));
  const alloc = new Map<string, number>();
  // School work the user placed by hand counts as planned.
  for (const i of kept) {
    if ((i.kind === "unit" || i.kind === "homework") && i.refId) {
      alloc.set(i.refId, (alloc.get(i.refId) ?? 0) + i.minutes);
    }
  }
  const left = (w: Work) => w.remaining - (alloc.get(w.refId) ?? 0);
  /** The next unit of a course can follow once today's plan finishes the previous one. */
  const ready = (w: Work): boolean => {
    const prev = w.prev ? byRef.get(w.prev) : undefined;
    return !prev || left(prev) <= 0.5;
  };
  const give = (w: Work, m: number) => {
    const add = Math.min(m, left(w));
    if (add <= 0) return 0;
    alloc.set(w.refId, (alloc.get(w.refId) ?? 0) + add);
    return add;
  };

  const roomCache = new Map<string, number>();
  const room = (d: string) => {
    const cached = roomCache.get(d);
    if (cached !== undefined) return cached;
    const r = dayStudyRoom(d, input);
    roomCache.set(d, r);
    return r;
  };
  // Aim to finish a little early; fall back to the real deadlines when that can't work.
  const early = outlook(date, work, left, "target", capacity, room);
  const strict = outlook(date, work, left, "latest", capacity, room);
  const key: "target" | "latest" = early.shortfalls.length ? "latest" : "target";
  const pace = key === "target" ? early.pace : strict.pace;

  // 1. Last chance today (due today, tomorrow's exam, overdue): finish in full.
  let used = 0;
  const urgent = work
    .filter((w) => w.latest === date)
    .sort((a, b) => a.order - b.order);
  for (let changed = true; changed; ) {
    changed = false;
    for (const w of urgent) {
      if (left(w) > 0.5 && ready(w)) {
        used += give(w, left(w));
        changed = true;
      }
    }
  }
  // 2. Today's share of the remaining deadline work, in proportion to today's free time.
  const dated = work
    .filter((w) => w[key])
    .sort((a, b) => a[key]!.localeCompare(b[key]!) || a.order - b.order);
  const due = dated.reduce((a, w) => a + Math.max(0, left(w)), 0);
  let target = 0;
  if (due > 0.5 && capacity > 0) {
    target = Math.min(capacity, Math.max(Math.min(pace, capacity), Math.min(MIN_CHUNK, capacity, due)));
    target = Math.min(Math.ceil(target / 15) * 15, Math.max(capacity, used));
  }
  let budget = Math.max(0, target - used);
  for (const w of dated) {
    if (budget < 1) break;
    if (!ready(w)) continue;
    const want = left(w);
    if (want <= 0.5) continue;
    const m = Math.min(want, budget);
    if (m < want && m < MIN_CHUNK) break;
    budget -= give(w, m);
  }
  // 3. Units without any deadline: a little each day when there is room.
  const planned = Math.max(used, target - budget);
  let spare = Math.min(NO_DEADLINE_MINUTES, Math.max(0, capacity - planned));
  let extra = 0;
  for (const w of work) {
    if (spare < 15 || extra >= 2) break;
    if (w.target || !ready(w) || left(w) <= 0.5) continue;
    const m = Math.min(spare, round15(left(w)));
    if (m < left(w) - 0.5 && m < MIN_CHUNK) break;
    spare -= give(w, m);
    extra++;
  }

  const schoolItems = work.flatMap((w) => {
    const m = alloc.get(w.refId);
    return m ? workItems(w, m) : [];
  });

  // Regenerating keeps what was already done today.
  const before = new Map(
    (existing?.items ?? []).filter((i) => !i.manual && i.refId).map((i) => [i.id, i]),
  );
  for (const item of [...fixed, ...schoolItems]) {
    const old = before.get(item.id);
    if (!old) continue;
    item.progress = old.progress;
    if (item.base !== undefined && old.base !== undefined && old.base < item.base) {
      item.share = Math.round((item.base + (item.share ?? 0) - old.base) * 10) / 10;
      item.base = old.base;
    }
  }
  // Things finished earlier today still count toward today.
  const present = new Set([...fixed, ...schoolItems].map((i) => i.id));
  for (const [id, old] of before) {
    if (present.has(id)) continue;
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

  const isReview = (i: PlanItem) => i.kind === "review";
  const items = [...kept, ...fixed.filter((i) => !isReview(i)), ...schoolItems, ...fixed.filter(isReview)];
  const chainOf = new Map(open.map((w) => [w.refId, w.chain ?? w.refId]));
  assignTimes(items, gaps, (i) => (i.refId && (i.kind === "unit" || i.kind === "homework") ? chainOf.get(i.refId) : undefined));
  return {
    plan: {
      generatedAt: new Date().toISOString(),
      items: sortItems(items),
      dismissed: existing?.dismissed,
    },
    shortfalls: strict.shortfalls,
  };
}

export function generatePlan(input: PlannerInput): DayPlan {
  return buildDay(input).plan;
}

/** Deadlines that can't be met at the current study budget, earliest first. */
export function planShortfalls(input: PlannerInput): Shortfall[] {
  return buildDay(input).shortfalls;
}

/**
 * Give untimed items a start time inside free gaps, around the timed ones. Items that
 * share a `group` (parts of one task, units of one course) keep their order in the day.
 */
export function assignTimes(items: PlanItem[], gaps: Interval[], group?: (i: PlanItem) => string | undefined) {
  const occupied: Interval[] = items
    .filter((i) => i.start)
    .map((i) => [toMinutes(i.start), toMinutes(i.start) + i.minutes]);
  let free = gaps.flatMap(([s, e]) => freeGaps(s, e, occupied));
  const after = new Map<string, number>();
  for (const item of items) {
    if (item.start || item.minutes <= 0) continue;
    const g = group?.(item);
    const from = g ? (after.get(g) ?? 0) : 0;
    const fits = (need: number) => free.findIndex(([s, e]) => e - Math.max(s, from) >= need);
    let idx = fits(item.minutes);
    if (idx < 0) idx = fits(Math.min(item.minutes, 60));
    if (idx < 0) continue;
    const [gs, e] = free[idx];
    const s = Math.max(gs, from);
    item.start = hhmm(s);
    const end = Math.min(e, s + item.minutes);
    if (g) after.set(g, end);
    free = [
      ...free.slice(0, idx),
      ...(s > gs ? [[gs, s] as Interval] : []),
      ...(end + 10 < e ? [[end + 10, e] as Interval] : []),
      ...free.slice(idx + 1),
    ];
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
  review: "school",
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
      const t = Math.min(100, (i.base ?? 0) + (i.share ?? 0));
      target.set(i.refId, Math.max(t, target.get(i.refId) ?? 0));
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
