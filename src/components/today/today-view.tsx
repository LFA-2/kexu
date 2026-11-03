"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { DayTimeline, timelineRange } from "@/components/day-timeline";
import { DayRail, type RailPin } from "@/components/today/day-rail";
import { WeekView } from "@/components/today/week-view";
import { zhTW } from "date-fns/locale";
import { BarChart, ProgressRing, SegmentBar, SERIES } from "@/components/charts";
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
  itemFraction,
  openWork,
  planAhead,
  planCompletion,
  planShortfalls,
  sortItems,
  unitBlockers,
  workItem,
  type LiveSources,
  type OpenAction,
} from "@/lib/planner";
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
  Trash2,
} from "lucide-react";

const CATEGORY_COLOR = {
  school: SERIES[0],
  chores: SERIES[1],
  workout: SERIES[2],
  todo: SERIES[3],
  other: SERIES[4],
} as const;

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
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [adding, setAdding] = useState(false);
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
  const planFor = (d: string): DayPlan | undefined =>
    d > todayKey || (d === todayKey && !life.plans?.[d]) ? ahead[d] : life.plans?.[d];
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
    if (readOnly || !loaded || meetings === null || life.plans?.[date] || date !== todayKey) return;
    if (autoDone.current.has(date)) return;
    autoDone.current.add(date);
    life.updatePlan(date, (prev) => prev ?? build());
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

  function commitMoves(updates: { id: string; start: string }[]) {
    if (updates.length === 0) return;
    const map = new Map(updates.map((u) => [u.id, u.start]));
    life.updatePlan(date, (prev) => {
      const base = prev ?? plan;
      if (!base) return prev;
      return {
        ...base,
        items: base.items.map((i) => (map.has(i.id) ? { ...i, start: map.get(i.id) ?? i.start, manual: true } : i)),
      };
    });
  }

  if (!loaded) return <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>;

  const daySchedule = sortSchedule(life.schedule?.[date] ?? []);
  const dateLabel = format(parseISO(date), "M 月 d 日 EEEE", { locale: zhTW });
  const isPast = date < todayKey;
  const settings = life.planSettings ?? DEFAULT_PLAN_SETTINGS;
  const adjusting = adjustingDate === date;
  const canAdjust = !readOnly && !isFuture && items.some((i) => i.start);

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

      <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
        <h3 className="font-display text-lg text-ink">行程</h3>
        {daySchedule.length === 0 && (
          <p className="mt-1 text-sm text-muted-foreground">這天沒有行程</p>
        )}
        <div className="mt-3">
          <DayTimeline items={daySchedule} color={color} range={timelineRange([daySchedule])} />
        </div>
      </section>

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
              <Button size="sm" className="gap-1" onClick={() => setAdding(true)}>
                <Plus className="size-3.5" />
                新增
              </Button>
            )}
          </div>
        </div>
        {adjusting && canAdjust && (
          <p className="text-xs text-muted-foreground">上下拖改時間，往旁邊拉可改順序。今明行程不會動。</p>
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
            date={date}
            items={items}
            pins={pins}
            adjusting={adjusting && canAdjust}
            readOnly={readOnly}
            future={isFuture}
            frac={frac}
            src={src}
            blockers={isFuture ? undefined : blockers}
            dayStart={toMinutes(settings.dayStart)}
            dayEnd={toMinutes(settings.dayEnd)}
            onProgress={setProgress}
            onEdit={setEditing}
            onCommit={commitMoves}
            onCancelPin={readOnly ? undefined : cancelPin}
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
        <ItemDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(i) => {
            saveItem({ ...i, manual: true });
            setEditing(null);
          }}
          onRemove={() => {
            removeItem(editing);
            setEditing(null);
          }}
        />
      )}
      {adding && (
        <AddDialog
          date={date}
          inPlan={new Set(items.flatMap((i) => (i.refId ? [i.refId] : [])))}
          onClose={() => setAdding(false)}
          onAdd={(i) => {
            saveItem({ ...i, manual: true });
            setAdding(false);
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


function ItemDialog({
  item,
  onClose,
  onSave,
  onRemove,
}: {
  item: PlanItem;
  onClose: () => void;
  onSave: (i: PlanItem) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [start, setStart] = useState(item.start);
  const [minutes, setMinutes] = useState<number | null>(item.minutes);
  const custom = item.kind === "custom";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>調整這一項</DialogTitle>
          <DialogDescription>改過的項目在「重新排」時會保留。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {custom ? (
            <div className="grid gap-2">
              <Label htmlFor="pi-title">名稱</Label>
              <Input id="pi-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
            </div>
          ) : (
            <p className="text-sm font-medium text-ink">{item.title}</p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="pi-start">開始時間</Label>
            <TimeField id="pi-start" value={start} onChange={setStart} />
          </div>
          <MinutesField id="pi-min" label="今天要花的時間" value={minutes} onChange={setMinutes} />
          {(item.kind === "homework" || item.kind === "unit") && (
            <p className="text-xs text-muted-foreground">
              改時間會同步調整「今天目標」：今天的目標進度會依時間比例變動。
            </p>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="size-3.5" />
            今天不做
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              disabled={!minutes || (custom && !title.trim()) || !!(start && !parseTime(start))}
              onClick={() => {
                const m = minutes ?? item.minutes;
                let share = item.share;
                if ((item.kind === "homework" || item.kind === "unit") && item.share !== undefined && item.minutes > 0) {
                  share = Math.min(100 - (item.base ?? 0), Math.round(((item.share * m) / item.minutes) * 10) / 10);
                }
                onSave({
                  ...item,
                  title: custom ? title.trim() : item.title,
                  start: parseTime(start) ?? "",
                  minutes: m,
                  share,
                });
              }}
            >
              儲存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({
  date,
  inPlan,
  onClose,
  onAdd,
}: {
  date: string;
  inPlan: Set<string>;
  onClose: () => void;
  onAdd: (i: PlanItem) => void;
}) {
  const school = useSchool();
  const [tab, setTab] = useState<"school" | "custom">("school");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
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
