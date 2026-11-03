"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { CATEGORY_COLOR, DayRail, type RailPin } from "@/components/today/day-rail";
import { DayStrip } from "@/components/today/day-strip";
import { ItemPanel } from "@/components/today/item-panel";
import { WeekView } from "@/components/today/week-view";
import { zhTW } from "date-fns/locale";
import { BarChart, ProgressRing, SegmentBar } from "@/components/charts";
import { MinutesField } from "@/components/minutes-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeField, parseTime } from "@/components/time-field";
import { isoWeekday, toDateKey } from "@/lib/dates";
import {
  DEFAULT_PLAN_SETTINGS,
  sortSchedule,
  toMinutes,
  type DayPlan,
  type PlanItem,
  type PlanSettings,
} from "@/lib/life";
import { listMeetings, saveMeeting, type Meeting } from "@/lib/meetings";
import {
  CATEGORY_LABEL,
  CATEGORY_OF,
  generatePlan,
  isDraftPlan,
  itemFraction,
  openWork,
  planAhead,
  planCompletion,
  planShortfalls,
  sortItems,
  sourceProgress,
  unitBlockers,
  workItem,
  type LiveSources,
  type OpenAction,
} from "@/lib/planner";
import { hhmm, reflow, type Interval } from "@/lib/reflow";
import { formatMinutes } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useFitness } from "@/store/fitness-store";
import { useLife } from "@/store/life-store";
import { useLinks } from "@/store/links-store";
import { usePeopleData } from "@/store/people-data";
import { useSchool } from "@/store/school-store";
import {
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Settings2,
} from "lucide-react";

const LAST_START = 23 * 60 + 55;
const minuteNow = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

export function TodayView({ me, isMine, color }: { me: string; isMine: boolean; color: string }) {
  const school = useSchool();
  const life = useLife();
  const fitness = useFitness();
  const readOnly = !isMine;
  const loaded = school.loaded && life.loaded && fitness.loaded;

  const todayKey = toDateKey(new Date());
  const { linked } = useLinks();
  const { data: peopleLife } = usePeopleData(
    isMine ? linked.map((p) => p.userId) : [me, ...linked.map((p) => p.userId)],
  );
  const myAvailable = isMine ? life.available : (peopleLife[me]?.life?.available ?? []);
  const freeWith = linked.filter((p) => peopleLife[p.userId]?.life?.available?.includes(todayKey));
  const dateBadge =
    myAvailable.includes(todayKey) && freeWith.length > 0 ? (
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-900 ring-1 ring-amber-300/80">
        <CalendarHeart className="size-4" />
        今日可約會
        <span className="font-normal text-amber-800/80">和{freeWith.map((p) => p.name).join("、")}</span>
      </p>
    ) : null;
  const [date, setDate] = useState(todayKey);
  const [meetings, setMeetings] = useState<Meeting[] | null>(isMine ? null : []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ start?: string } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [clock, setClock] = useState(minuteNow);
  useEffect(() => {
    const t = setInterval(() => setClock(minuteNow()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<"day" | "week">("day");
  const [adjustingDate, setAdjustingDate] = useState<string | null>(null);

  const refreshMeetings = useCallback(async () => {
    if (!isMine) return;
    setMeetings((await listMeetings()) ?? []);
  }, [isMine]);
  useEffect(() => {
    const t = setTimeout(refreshMeetings, 0);
    return () => clearTimeout(t);
  }, [refreshMeetings]);

  const actions = useMemo<OpenAction[]>(
    () =>
      (meetings ?? []).flatMap((m) =>
        m.actions
          .filter((a) => a.assignee === me)
          .map((a) => ({ meetingId: m.id, meetingTitle: m.title || "會議", action: a })),
      ),
    [meetings, me],
  );

  const sources = useCallback(
    (d: string): LiveSources => ({
      school,
      life,
      fitness,
      date: d,
      actionDone: new Map(actions.map((a) => [`${a.meetingId}:${a.action.id}`, a.action.done])),
    }),
    [school, life, fitness, actions],
  );
  const src = useMemo(() => sources(date), [sources, date]);

  // Days after today are planned live (carrying work forward); only hand edits are stored.
  const weekStartKey = toDateKey(startOfWeek(parseISO(date), { weekStartsOn: 1 }));
  const weekEndKey = toDateKey(addDays(parseISO(weekStartKey), 6));
  const aheadTo = weekEndKey > date ? weekEndKey : date;
  const [nowMinute] = useState(() => {
    const now = new Date();
    return Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
  });
  const ahead: Record<string, DayPlan> =
    aheadTo <= todayKey || !loaded || meetings === null
      ? {}
      : planAhead(
      {
        school,
        life,
        fitness,
        exercises: fitness.allExercises,
        actions: actions.filter((a) => !a.action.done),
        fromMinute: nowMinute,
      },
      todayKey,
      aheadTo,
        life.plans ?? {},
      );
  // A plan stored ahead of its day only holds hand edits until that day is planned.
  const planFor = (d: string): DayPlan | undefined => {
    const stored = life.plans?.[d];
    return d > todayKey || (d === todayKey && (!stored || isDraftPlan(d, stored))) ? ahead[d] : stored;
  };
  const isFuture = date > todayKey;
  const plan = planFor(date);
  const items = sortItems(plan?.items ?? []);
  const frac = useCallback((i: PlanItem) => itemFraction(i, src), [src]);

  const build = useCallback(
    (existing?: DayPlan): DayPlan => {
      const now = new Date();
      return generatePlan({
        date,
        school,
        life,
        fitness,
        exercises: fitness.allExercises,
        actions: actions.filter((a) => !a.action.done),
        existing,
        fromMinute:
          date === toDateKey(now) ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15 : undefined,
      });
    },
    [date, school, life, fitness, actions],
  );

  // First visit to a day (today or later): make a plan automatically.
  const autoDone = useRef(new Set<string>());
  useEffect(() => {
    const stored = life.plans?.[date];
    if (readOnly || !loaded || meetings === null || date !== todayKey) return;
    if (stored && !isDraftPlan(date, stored)) return;
    if (autoDone.current.has(date)) return;
    autoDone.current.add(date);
    life.updatePlan(date, (prev) => (prev && !isDraftPlan(date, prev) ? prev : build(prev)));
  }, [readOnly, loaded, meetings, date, todayKey, life, build]);

  const shortfalls = useMemo(
    () =>
      !loaded || meetings === null
        ? []
        : planShortfalls({
            date: todayKey,
            school,
            life,
            fitness,
            exercises: fitness.allExercises,
            actions: actions.filter((a) => !a.action.done),
            existing: life.plans?.[todayKey],
            fromMinute: nowMinute,
          }),
    [loaded, meetings, todayKey, school, life, fitness, actions, nowMinute],
  );
  const blockers = useMemo(() => unitBlockers(school), [school]);

  // Keep the stored snapshot in line with the sources, so past days chart correctly.
  useEffect(() => {
    if (readOnly || !loaded || !plan || !life.plans?.[date] || date > todayKey) return;
    const stale = plan.items.some((i) => Math.abs(Math.round(frac(i) * 100) - i.progress) > 0);
    if (!stale) return;
    life.updatePlan(date, (prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) => ({ ...i, progress: Math.round(itemFraction(i, src) * 100) })),
          }
        : prev,
    );
  }, [readOnly, loaded, plan, date, todayKey, frac, life, src]);

  const completion = planCompletion(items, frac);
  const totalMin = items.reduce((a, i) => a + i.minutes, 0);
  const doneMin = items.reduce((a, i) => a + i.minutes * frac(i), 0);
  const doneCount = items.filter((i) => frac(i) >= 1).length;

  const week = (() => {
    const start = startOfWeek(parseISO(date), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, k) => {
      const d = toDateKey(addDays(start, k));
      const p = planFor(d);
      const f = d === date || d === todayKey ? (i: PlanItem) => itemFraction(i, sources(d)) : (i: PlanItem) => i.progress / 100;
      const pct = p && d <= todayKey ? planCompletion(p.items, f) : null;
      const minutes = p?.items.reduce((a, i) => a + i.minutes, 0) ?? 0;
      const done = p?.items.reduce((a, i) => a + i.minutes * f(i), 0) ?? 0;
      return { key: d, label: format(parseISO(d), "EEEEE", { locale: zhTW }), pct, minutes, done, current: d === date };
    });
  })();
  const weekCounted = week.filter((w) => w.pct !== null);
  const weekMinutes = weekCounted.reduce((a, w) => a + w.minutes, 0);
  const weekPct = weekMinutes
    ? (weekCounted.reduce((a, w) => a + w.done, 0) / weekMinutes) * 100
    : weekCounted.length
      ? weekCounted.reduce((a, w) => a + (w.pct ?? 0), 0) / weekCounted.length
      : 0;

  const byCategory = (() => {
    const sum: Record<string, number> = {};
    for (const i of items) {
      const c = CATEGORY_OF[i.kind];
      sum[c] = (sum[c] ?? 0) + i.minutes;
    }
    return (Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((k) => ({
      key: k,
      label: CATEGORY_LABEL[k],
      value: sum[k] ?? 0,
      color: CATEGORY_COLOR[k],
    }));
  })();

  // Sync today's and tomorrow's classes into 今明行程 (once; skipped when already in sync).
  useEffect(() => {
    if (readOnly || !loaded || !school.loaded) return;
    const tomorrow = toDateKey(addDays(parseISO(todayKey), 1));
    life.syncTimetableDays([...new Set([todayKey, tomorrow, date])], school);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync when the timetable changes
  }, [readOnly, loaded, school.loaded, school.timetable, school.courses, todayKey, date, life.syncTimetableDays]);

  // 今明行程 (including classes synced from the timetable). Not counted in the %.
  const pins = useMemo((): RailPin[] => {
    const slots = new Map((school.timetable ?? []).map((t) => [t.id, t]));
    const courses = new Map(school.courses.map((c) => [c.id, c]));
    return sortSchedule(life.schedule?.[date] ?? []).map((s) => {
      const slot = s.fromTimetable ? slots.get(s.fromTimetable) : undefined;
      const course = slot?.courseId ? courses.get(slot.courseId) : undefined;
      return {
        id: s.id,
        prefix: s.fromTimetable ? "上課" : "行程",
        start: s.start,
        end: s.kind === "span" ? s.end : undefined,
        title: s.label,
        color: course?.color ?? "#475569",
        point: s.kind === "point",
      };
    });
  }, [school.timetable, school.courses, life.schedule, date]);

  const held = useMemo(() => {
    const weekday = isoWeekday(parseISO(date));
    const slots = new Map((school.timetable ?? []).map((t) => [t.id, t]));
    const courses = new Map(school.courses.map((c) => [c.id, c]));
    const classes = (life.skippedClasses?.[date] ?? []).flatMap((id) => {
      const slot = slots.get(id);
      if (!slot || slot.day !== weekday) return [];
      const course = slot.courseId ? courses.get(slot.courseId) : undefined;
      const name = course?.name || slot.title || "上課";
      return [{ key: `class:${id}`, kind: "上課" as const, label: name, time: `${slot.start}–${slot.end}`, restore: () => life.restoreClass(date, id) }];
    });
    const plans = (life.removedSchedule?.[date] ?? []).map((item) => ({
      key: item.id,
      kind: "行程" as const,
      label: item.label,
      time: item.kind === "span" && item.end ? `${item.start}–${item.end}` : item.start,
      restore: () => life.restoreScheduleItem(date, item),
    }));
    return [...classes, ...plans];
  }, [date, school.timetable, school.courses, life]);

  function cancelPin(id: string) {
    const item = (life.schedule?.[date] ?? []).find((s) => s.id === id);
    if (item) life.cancelScheduleItem(date, item);
  }

  function setProgress(item: PlanItem, pct: number) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const done = p >= 100;
    // pct is the overall % for school work, today's % for everything else
    if ((item.kind === "homework" || item.kind === "unit") && item.refId) {
      school.setWorkProgress(item.kind === "homework" ? "homework" : "unit", item.refId, p);
    } else if (item.kind === "habit" && item.refId) {
      life.setHabitDone(date, item.refId, done);
    } else if (item.kind === "todo" && item.refId) {
      life.setTodoDone(item.refId, done);
    } else if (item.kind === "exam" && item.refId) {
      school.updateExam(item.refId, { done });
    } else if (item.kind === "action" && item.refId) {
      const [mid, aid] = item.refId.split(":");
      const m = meetings?.find((x) => String(x.id) === mid);
      const was = m?.actions.find((a) => a.id === aid)?.done;
      if (m && was !== done) {
        setMeetings((ms) =>
          (ms ?? []).map((x) =>
            x.id === m.id ? { ...x, actions: x.actions.map((a) => (a.id === aid ? { ...a, done } : a)) } : x,
          ),
        );
        saveMeeting(m, (latest) => ({
          actions: latest.actions.map((a) => (a.id === aid ? { ...a, done } : a)),
        })).then((r) => r && setMeetings((ms) => (ms ?? []).map((x) => (x.id === r.id ? r : x))));
      }
    }
    const todayPct =
      item.kind === "homework" || item.kind === "unit"
        ? Math.round(
            Math.max(0, Math.min(1, item.share ? (p - (item.base ?? 0)) / item.share : done ? 1 : 0)) * 100,
          )
        : p;
    life.updatePlan(date, (prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === item.id ? { ...i, progress: todayPct } : i)) } : prev,
    );
  }

  function regenerate() {
    life.updatePlan(date, (prev) => build(prev));
    refreshMeetings();
  }

  function removeItem(item: PlanItem) {
    life.updatePlan(date, (stored) => {
      const prev = stored ?? { generatedAt: new Date().toISOString(), items: [] };
      return {
        ...prev,
        items: prev.items.filter((i) => i.id !== item.id),
        dismissed: item.refId
          ? [...new Set([...(prev.dismissed ?? []), `${item.kind}:${item.refId}`])]
          : prev.dismissed,
      };
    });
  }

  function saveItem(item: PlanItem) {
    life.updatePlan(date, (prev) => {
      const base = prev ?? { generatedAt: new Date().toISOString(), items: [] };
      const exists = base.items.some((i) => i.id === item.id);
      return {
        ...base,
        items: exists ? base.items.map((i) => (i.id === item.id ? item : i)) : [...base.items, item],
        dismissed: (base.dismissed ?? []).filter((d) => d !== `${item.kind}:${item.refId}`),
      };
    });
  }

  // ---- Order first, times follow ----
  const isToday = date === todayKey;
  const canFlow = !readOnly && !isFuture;
  const flowNow = isToday ? clock : null;
  const dayStartMin = toMinutes((life.planSettings ?? DEFAULT_PLAN_SETTINGS).dayStart);
  /** Items that keep their time: pinned, finished, or being done right now. */
  const lockedItem = (i: PlanItem) =>
    !!i.pinned ||
    frac(i) >= 1 ||
    (flowNow !== null && !!i.start && toMinutes(i.start) <= flowNow && flowNow < toMinutes(i.start) + i.minutes);
  const movableOf = (list: PlanItem[]) => sortItems(list).filter((i) => !lockedItem(i)).map((i) => i.id);
  const movableOrder = canFlow ? movableOf(items) : [];

  function timesFor(list: PlanItem[], order: string[], fill = false) {
    const blocked: Interval[] = [
      ...pins
        .filter((p) => !p.point && p.end)
        .map((p): Interval => {
          const a = toMinutes(p.start);
          let b = toMinutes(p.end ?? p.start);
          if (b <= a) b += 24 * 60;
          return [a, b];
        }),
      ...list
        .filter((i) => i.start && lockedItem(i) && frac(i) < 1)
        .map((i): Interval => [toMinutes(i.start), toMinutes(i.start) + i.minutes]),
    ];
    const byId = new Map(list.map((i) => [i.id, i]));
    const flow = order.flatMap((id) => {
      const it = byId.get(id);
      return it ? [{ id, dur: it.minutes }] : [];
    });
    return reflow(flow, blocked, Math.max(dayStartMin, flowNow ?? 0), fill);
  }

  /** Change the day's items, then lay the movable ones out again from now. */
  function flowPlan(change: (list: PlanItem[]) => { items: PlanItem[]; order?: string[]; fill?: boolean }) {
    life.updatePlan(date, (prev) => {
      const base = prev && !(isToday && isDraftPlan(date, prev)) ? prev : plan;
      if (!base) return prev;
      const r = change(base.items);
      const map = timesFor(r.items, r.order ?? movableOf(r.items), r.fill);
      return {
        ...base,
        items: r.items.map((i) => {
          const m = map.get(i.id);
          return m === undefined ? i : { ...i, start: hhmm(Math.min(m, LAST_START)), manual: true };
        }),
      };
    });
  }

  function saveFromPanel(before: PlanItem, next: PlanItem, follow: boolean) {
    const timing =
      follow || next.start !== before.start || next.minutes !== before.minutes || !!next.pinned !== !!before.pinned;
    if (!canFlow || !timing) {
      saveItem({ ...next, manual: true });
      return;
    }
    flowPlan((list) => {
      const updated = list.map((i) => (i.id === next.id ? { ...next, manual: true } : i));
      // Following keeps its place in the order; otherwise the new time decides it.
      return { items: updated, order: follow ? movableOf(list).filter((id) => updated.some((u) => u.id === id && !u.pinned)) : undefined };
    });
  }

  function moveToTomorrow(item: PlanItem) {
    const tomorrow = toDateKey(addDays(parseISO(todayKey), 1));
    const carried: PlanItem = { ...item, id: uid("pi"), start: "", progress: 0, pinned: false, manual: true };
    if ((item.kind === "homework" || item.kind === "unit") && item.share !== undefined) {
      const now = sourceProgress(item, src) ?? item.base ?? 0;
      const goal = Math.min(100, (item.base ?? 0) + item.share);
      carried.base = now;
      carried.share = Math.round(Math.min(100 - now, Math.max(goal - now, 0) || item.share) * 10) / 10;
    }
    life.updatePlan(tomorrow, (prev) => {
      const base = prev ?? { generatedAt: new Date().toISOString(), items: [] };
      const same = (i: PlanItem) => !!item.refId && i.kind === item.kind && i.refId === item.refId;
      return {
        ...base,
        items: [...base.items.filter((i) => !same(i)), carried],
        dismissed: (base.dismissed ?? []).filter((d) => d !== `${item.kind}:${item.refId}`),
      };
    });
    removeItem(item);
  }

  function pick(id: string) {
    setFlashId(id);
    document.querySelector(`[data-task-id="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600);
  }

  if (!loaded) return <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>;

  const dateLabel = format(parseISO(date), "M 月 d 日 EEEE", { locale: zhTW });
  const isPast = date < todayKey;
  const settings = life.planSettings ?? DEFAULT_PLAN_SETTINGS;
  const adjusting = adjustingDate === date;
  const canAdjust = canFlow && movableOrder.length > 0;
  const editing = editingId ? items.find((i) => i.id === editingId) ?? null : null;

  const modeToggle = (
    <div className="flex rounded-xl border border-border/80 bg-card p-0.5 shadow-sm">
      {(["day", "week"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`rounded-lg px-3 py-1 text-sm font-medium ${mode === m ? "bg-chip text-chip-foreground" : "text-muted-foreground hover:text-ink"}`}
          aria-pressed={mode === m}
        >
          {m === "day" ? "今日" : "本週"}
        </button>
      ))}
    </div>
  );

  if (mode === "week") {
    const days = Array.from({ length: 7 }, (_, k) => toDateKey(addDays(parseISO(weekStartKey), k)));
    return (
      <WeekView
        days={days}
        todayKey={todayKey}
        readOnly={readOnly}
        planFor={planFor}
        sources={sources}
        toggle={modeToggle}
        notice={dateBadge}
        onShiftWeek={(n) => setDate(toDateKey(addDays(parseISO(date), n * 7)))}
        onThisWeek={() => setDate(todayKey)}
        onOpenDay={(d) => {
          setDate(d);
          setMode("day");
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {date === todayKey
              ? "依截止日、預估時間和課表空檔自動排好，可以自己再調整"
              : isPast
                ? "回顧這天的完成狀況"
                : "預先排好的安排，會隨你的進度自動更新"}
          </p>
          <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">
            {date === todayKey ? "今日" : date === toDateKey(addDays(new Date(), 1)) ? "明天" : dateLabel}
          </h2>
          {dateBadge}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {modeToggle}
          <div className="flex items-center rounded-xl border border-border/80 bg-card p-0.5 shadow-sm">
            <Button variant="ghost" size="icon-sm" onClick={() => setDate(toDateKey(addDays(parseISO(date), -1)))} aria-label="前一天">
              <ChevronLeft />
            </Button>
            <button
              type="button"
              onClick={() => setDate(todayKey)}
              className="px-2 text-sm tabular-nums text-ink"
            >
              {format(parseISO(date), "M/d（EEEEE）", { locale: zhTW })}
            </button>
            <Button variant="ghost" size="icon-sm" onClick={() => setDate(toDateKey(addDays(parseISO(date), 1)))} aria-label="後一天">
              <ChevronRight />
            </Button>
          </div>
          {!readOnly && date === todayKey && (
            <Button variant="outline" size="sm" className="gap-1" onClick={regenerate}>
              <RefreshCw className="size-3.5" />
              重新排
            </Button>
          )}
          {!readOnly && (
            <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(true)} aria-label="排程設定">
              <Settings2 />
            </Button>
          )}
        </div>
      </header>

      {(items.some((i) => i.start) || pins.length > 0) && (
        <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="font-display text-lg text-ink">時間條</h3>
            <p className="text-[11px] text-muted-foreground">粗線是行程・細線是要做的事，點一下跳過去</p>
          </div>
          <DayStrip
            items={items}
            pins={pins}
            color={color}
            colors={CATEGORY_COLOR}
            frac={frac}
            dayStart={toMinutes(settings.dayStart)}
            dayEnd={toMinutes(settings.dayEnd)}
            now={isToday && clock >= 0 ? clock : null}
            onPick={pick}
          />
        </section>
      )}

      <section className="grid gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:grid-cols-[auto_1fr] sm:p-5">
        <div className="flex items-center gap-4 sm:flex-col sm:items-center">
          <ProgressRing pct={completion ?? 0} label={date === todayKey ? "今日完成" : "當日完成"} />
          <div className="text-sm sm:text-center">
            <p className="text-ink">
              {doneCount}/{items.length} 項完成
            </p>
            <p className="text-xs text-muted-foreground">
              {formatMinutes(Math.round(doneMin))} / {formatMinutes(totalMin)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">依每項的預估時間加權</p>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-ink">本週每日完成率</h3>
            <span className="text-sm text-muted-foreground">
              本週 <span className="font-display text-xl tabular-nums text-ink">{Math.round(weekPct)}</span>%
            </span>
          </div>
          <BarChart
            data={week.map((w) => ({
              key: w.key,
              label: w.label,
              value: w.pct,
              highlight: w.current,
              tip: w.pct === null ? (w.key > todayKey ? "還沒到" : "沒有計畫") : `${Math.round(w.pct)}%・${formatMinutes(Math.round(w.done))}`,
            }))}
            max={100}
            height={120}
            unit="%"
          />
          {byCategory.some((c) => c.value > 0) && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-ink">時間分配</h3>
              <SegmentBar segments={byCategory} format={(v) => formatMinutes(v)} />
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg text-ink">要做的事</h3>
          <div className="flex items-center gap-2">
            {canAdjust && (
              <Button
                size="sm"
                variant={adjusting ? "default" : "outline"}
                aria-pressed={adjusting}
                onClick={() => setAdjustingDate(adjusting ? null : date)}
              >
                {adjusting ? "完成" : "調整"}
              </Button>
            )}
            {!readOnly && (
              <Button size="sm" className="gap-1" onClick={() => setAdding({})}>
                <Plus className="size-3.5" />
                新增
              </Button>
            )}
          </div>
        </div>
        {adjusting && canAdjust && (
          <p className="rounded-lg bg-soft px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            按住右邊的 ⋮⋮ 拖，或按 ↑↓ 換順序。時間會{isToday ? "從現在開始" : ""}自動一件接一件往下排，避開上課和行程；
            📌 固定時間、已完成的事不會動。點一件事可以改時間長度或固定時間。
          </p>
        )}
        {!readOnly && date === todayKey && shortfalls.length > 0 && (
          <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-300/80">
            {shortfalls.slice(0, 2).map((s) => (
              <p key={`${s.label}${s.date}`}>
                「{s.label}」排不完，大約差 {formatMinutes(Math.round(s.minutes / 5) * 5 || 5)}
              </p>
            ))}
            <p className="mt-1 text-xs text-amber-800/80">可以在排程設定（齒輪）提高「每天讀書／寫作業最多」，或調整預估時間。</p>
          </div>
        )}
        {!plan ? (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            {readOnly || isPast ? "這天沒有計畫" : "正在排…"}
          </p>
        ) : items.length === 0 && pins.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            這天沒有需要做的事 🎉 可以按「新增」加入自己的安排
          </p>
        ) : (
          <DayRail
            items={items}
            pins={pins}
            adjusting={adjusting && canAdjust}
            readOnly={readOnly}
            frac={frac}
            blockers={isFuture ? undefined : blockers}
            dayEnd={toMinutes(settings.dayEnd)}
            now={flowNow}
            order={movableOrder}
            preview={(order) => timesFor(items, order)}
            gapActions={canFlow}
            flashId={flashId}
            onReorder={(order) => flowPlan((list) => ({ items: list, order }))}
            onOpen={(i) => setEditingId(i.id)}
            onCancelPin={readOnly ? undefined : cancelPin}
            onFillGaps={canFlow ? () => flowPlan((list) => ({ items: list, fill: true })) : undefined}
            onAddAt={readOnly || isPast ? undefined : (start) => setAdding({ start })}
          />
        )}
        {!readOnly && held.length > 0 && (
          <div className="rounded-xl border border-dashed border-border/80 bg-card px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              今天不上
              {held.some((h) => h.kind === "上課") && "・課程只拿掉這一天，下週會自己加回來"}
            </p>
            <ul className="mt-2 space-y-1.5">
              {held.map((h) => (
                <li key={h.key} className="flex items-center gap-2 text-sm">
                  <span className="shrink-0 text-xs text-muted-foreground">{h.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {h.label}
                    <span className="ml-1.5 tabular-nums text-muted-foreground">{h.time}</span>
                  </span>
                  <button type="button" className="shrink-0 text-xs text-ink" onClick={h.restore}>
                    恢復
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {editing && (
        <ItemPanel
          key={editing.id}
          item={editing}
          color={CATEGORY_COLOR[CATEGORY_OF[editing.kind]]}
          fraction={frac(editing)}
          overall={sourceProgress(editing, src)}
          workoutLogged={editing.kind === "workout" && !!fitness.sessions.some((s) => s.date === date)}
          waitFor={!isFuture && editing.kind === "unit" && editing.refId ? blockers.get(editing.refId) : undefined}
          readOnly={readOnly}
          future={isFuture}
          canMove={canFlow}
          onProgress={(p) => setProgress(editing, p)}
          onSave={(next, follow) => {
            saveFromPanel(editing, next, follow);
            setEditingId(null);
          }}
          onRemove={() => {
            removeItem(editing);
            setEditingId(null);
          }}
          onMoveTomorrow={
            !readOnly && isToday
              ? () => {
                  moveToTomorrow(editing);
                  setEditingId(null);
                }
              : undefined
          }
          onClose={() => setEditingId(null)}
        />
      )}
      {adding && (
        <AddDialog
          date={date}
          initialStart={adding.start}
          inPlan={new Set(items.flatMap((i) => (i.refId ? [i.refId] : [])))}
          onClose={() => setAdding(null)}
          onAdd={(i) => {
            saveItem({ ...i, manual: true, pinned: !!i.start || undefined });
            setAdding(null);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          value={life.planSettings ?? DEFAULT_PLAN_SETTINGS}
          onClose={() => setSettingsOpen(false)}
          onSave={(s) => {
            life.setPlanSettings(s);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}


function AddDialog({
  date,
  initialStart,
  inPlan,
  onClose,
  onAdd,
}: {
  date: string;
  initialStart?: string;
  inPlan: Set<string>;
  onClose: () => void;
  onAdd: (i: PlanItem) => void;
}) {
  const school = useSchool();
  const [tab, setTab] = useState<"school" | "custom">("school");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(initialStart ?? "");
  const [minutes, setMinutes] = useState<number | null>(30);
  const all = openWork(date, school);
  const openRefs = new Set(all.map((w) => w.refId));
  // Only the next unit in line: the previous one is finished or already planned for the day.
  const work = all.filter(
    (w) => !inPlan.has(w.refId) && (!w.prev || !openRefs.has(w.prev) || inPlan.has(w.prev)),
  );
  const [pick, setPick] = useState<string | null>(null);
  const picked = work.find((w) => w.refId === pick);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新增到這天</DialogTitle>
          <DialogDescription>從學校的作業／讀書進度挑。同一門課照順序讀，前一個單元做完或已排進這天，才會列出下一個。</DialogDescription>
        </DialogHeader>
        <div className="flex rounded-lg border border-border/80 p-0.5">
          {(["school", "custom"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1 text-sm ${tab === t ? "bg-chip text-chip-foreground" : "text-muted-foreground"}`}
            >
              {t === "school" ? "作業・讀書" : "自訂"}
            </button>
          ))}
        </div>
        {tab === "school" ? (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {work.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">沒有其他未完成的作業或讀書進度</li>
            )}
            {work.map((w) => (
              <li key={w.refId}>
                <button
                  type="button"
                  onClick={() => {
                    setPick(w.refId);
                    setMinutes(Math.min(Math.round(w.remaining / 15) * 15 || 15, 120));
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left ${pick === w.refId ? "bg-wash ring-1 ring-ink" : "hover:bg-soft"}`}
                >
                  <span className="block text-sm text-ink">{w.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {w.detail}・還需 {formatMinutes(Math.round(w.remaining))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="add-title">名稱</Label>
            <Input id="add-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：整理房間" maxLength={60} />
          </div>
        )}
        {(tab === "custom" || picked) && (
          <div className="grid gap-3">
            <MinutesField id="add-min" label="要花的時間" value={minutes} onChange={setMinutes} />
            <div className="grid gap-2">
              <Label htmlFor="add-start">開始時間（選填）</Label>
              <TimeField id="add-start" value={start} onChange={setStart} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!minutes || (tab === "custom" ? !title.trim() : !picked) || !!(start && !parseTime(start))}
            onClick={() => {
              const m = minutes ?? 30;
              const startOk = parseTime(start) ?? "";
              if (tab === "school" && picked) onAdd({ ...workItem(picked, m), start: startOk });
              else
                onAdd({
                  id: uid("pi"),
                  kind: "custom",
                  title: title.trim(),
                  detail: "",
                  minutes: m,
                  start: startOk,
                  progress: 0,
                });
            }}
          >
            新增
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  value,
  onClose,
  onSave,
}: {
  value: PlanSettings;
  onClose: () => void;
  onSave: (s: PlanSettings) => void;
}) {
  const [s, setS] = useState(value);
  const [budget, setBudget] = useState<number | null>(value.studyBudget);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>排程設定</DialogTitle>
          <DialogDescription>自動排程只會用到這段時間，並避開課表和「今明行程」裡的時段。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ps-start">一天從</Label>
              <TimeField id="ps-start" value={s.dayStart} onChange={(dayStart) => setS({ ...s, dayStart })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ps-end">到</Label>
              <TimeField id="ps-end" value={s.dayEnd} onChange={(dayEnd) => setS({ ...s, dayEnd })} />
            </div>
          </div>
          <MinutesField
            id="ps-budget"
            label="每天讀書／寫作業最多"
            value={budget}
            onChange={setBudget}
            placeholder={`例如 ${DEFAULT_PLAN_SETTINGS.studyBudget}`}
            presets={[120, 180, 240, 300, 360, 480]}
          />
          <p className="text-xs text-muted-foreground">
            明天截止、或已經過期的作業會排滿，不受這個上限限制。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={
              !budget ||
              !parseTime(s.dayStart) ||
              !parseTime(s.dayEnd) ||
              toMinutes(parseTime(s.dayEnd)!) <= toMinutes(parseTime(s.dayStart)!)
            }
            onClick={() => {
              const dayStart = parseTime(s.dayStart);
              const dayEnd = parseTime(s.dayEnd);
              if (budget && dayStart && dayEnd) onSave({ dayStart, dayEnd, studyBudget: budget });
            }}
          >
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
