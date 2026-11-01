"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
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
import { isoWeekday, toDateKey } from "@/lib/dates";
import {
  DEFAULT_PLAN_SETTINGS,
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
  sortItems,
  sourceProgress,
  workItem,
  type LiveSources,
  type OpenAction,
} from "@/lib/planner";
import { formatMinutes } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useFitness } from "@/store/fitness-store";
import { useLife } from "@/store/life-store";
import { useSchool } from "@/store/school-store";
import {
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  GraduationCap,
  ListTodo,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";

const KIND_ICON: Record<PlanItem["kind"], LucideIcon> = {
  homework: ClipboardList,
  unit: BookOpen,
  exam: GraduationCap,
  habit: Sparkles,
  todo: ListTodo,
  workout: Dumbbell,
  action: NotebookPen,
  custom: CalendarClock,
};

const CATEGORY_COLOR = {
  school: SERIES[0],
  chores: SERIES[1],
  workout: SERIES[2],
  todo: SERIES[3],
  other: SERIES[4],
} as const;

export function TodayView({ me, isMine }: { me: string; isMine: boolean }) {
  const school = useSchool();
  const life = useLife();
  const fitness = useFitness();
  const readOnly = !isMine;
  const loaded = school.loaded && life.loaded && fitness.loaded;

  const todayKey = toDateKey(new Date());
  const [date, setDate] = useState(todayKey);
  const [meetings, setMeetings] = useState<Meeting[] | null>(isMine ? null : []);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<"day" | "week">("day");

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

  // Classes on this day, shown in the timeline (not part of the % ).
  const classes = useMemo(() => {
    const wd = isoWeekday(parseISO(date));
    const name = new Map(school.courses.map((c) => [c.id, c]));
    return (school.timetable ?? [])
      .filter((t) => t.day === wd)
      .map((t) => ({
        start: t.start,
        end: t.end,
        title: (t.courseId && name.get(t.courseId)?.name) || t.title || "上課",
        location: t.location,
        color: (t.courseId && name.get(t.courseId)?.color) || "#64748b",
      }));
  }, [school.timetable, school.courses, date]);

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

  if (!loaded) return <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>;

  const dateLabel = format(parseISO(date), "M 月 d 日 EEEE", { locale: zhTW });
  const isPast = date < todayKey;

  const modeToggle = (
    <div className="flex rounded-xl border border-border/80 bg-white p-0.5 shadow-sm">
      {(["day", "week"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`rounded-lg px-3 py-1 text-sm font-medium ${mode === m ? "bg-ink text-white" : "text-muted-foreground hover:text-ink"}`}
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {modeToggle}
          <div className="flex items-center rounded-xl border border-border/80 bg-white p-0.5 shadow-sm">
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

      <section className="grid gap-4 rounded-2xl border border-border/70 bg-white p-4 sm:grid-cols-[auto_1fr] sm:p-5">
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
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-ink">要做的事</h3>
          {!readOnly && (
            <Button size="sm" className="gap-1" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              新增
            </Button>
          )}
        </div>
        {!plan ? (
          <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
            {readOnly || isPast ? "這天沒有計畫" : "正在排…"}
          </p>
        ) : items.length === 0 && classes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
            這天沒有需要做的事 🎉 可以按「新增」加入自己的安排
          </p>
        ) : (
          <Timeline
            items={items}
            classes={classes}
            readOnly={readOnly}
            future={isFuture}
            frac={frac}
            src={src}
            onProgress={setProgress}
            onEdit={setEditing}
          />
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

type ClassRow = { start: string; end: string; title: string; location: string; color: string };

function Timeline({
  items,
  classes,
  readOnly,
  future,
  frac,
  src,
  onProgress,
  onEdit,
}: {
  items: PlanItem[];
  classes: ClassRow[];
  readOnly: boolean;
  future: boolean;
  frac: (i: PlanItem) => number;
  src: LiveSources;
  onProgress: (i: PlanItem, pct: number) => void;
  onEdit: (i: PlanItem) => void;
}) {
  const rows = [
    ...items.map((i) => ({ type: "item" as const, start: i.start || "99:99", item: i })),
    ...classes.map((c) => ({ type: "class" as const, start: c.start, cls: c })),
  ].sort((a, b) => a.start.localeCompare(b.start) || (a.type === "class" ? -1 : 1));

  return (
    <ul className="space-y-2">
      {rows.map((r, k) =>
        r.type === "class" ? (
          <li
            key={`c${k}`}
            className="flex items-center gap-3 rounded-xl border border-dashed border-border/80 bg-slate-50/70 px-3 py-2 text-sm"
          >
            <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{r.cls.start}</span>
            <span className="h-6 w-1 rounded-full" style={{ backgroundColor: r.cls.color }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              上課・{r.cls.title}
              {r.cls.location ? `（${r.cls.location}）` : ""}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">~{r.cls.end}</span>
          </li>
        ) : (
          <ItemRow
            key={r.item.id}
            item={r.item}
            readOnly={readOnly}
            future={future}
            fraction={frac(r.item)}
            overall={sourceProgress(r.item, src)}
            workoutLogged={r.item.kind === "workout" && !!src.fitness?.sessions.some((s) => s.date === src.date)}
            onProgress={(p) => onProgress(r.item, p)}
            onEdit={() => onEdit(r.item)}
          />
        ),
      )}
    </ul>
  );
}

function ItemRow({
  item,
  readOnly,
  future,
  fraction,
  overall,
  workoutLogged,
  onProgress,
  onEdit,
}: {
  item: PlanItem;
  readOnly: boolean;
  future: boolean;
  fraction: number;
  /** overall % of the source for school work, else null */
  overall: number | null;
  workoutLogged: boolean;
  onProgress: (pct: number) => void;
  onEdit: () => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const color = CATEGORY_COLOR[CATEGORY_OF[item.kind]];
  const isWork = overall !== null;
  const value = isWork ? overall : Math.round(fraction * 100);
  const target = isWork ? Math.min(100, Math.round((item.base ?? 0) + (item.share ?? 0))) : null;
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = draft ?? value;
  const done = fraction >= 1;
  const locked = readOnly || future || (item.kind === "workout" && workoutLogged);

  function change(v: number) {
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onProgress(v);
      setDraft(null);
    }, 350);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const end = item.start ? toMinutes(item.start) + item.minutes : null;

  return (
    <li
      className={`rounded-xl border bg-white px-3 py-3 transition-colors ${done ? "border-border/50 bg-slate-50/60" : "border-border/70"}`}
    >
      <div className="flex items-start gap-3">
        <span className="w-11 shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">
          {item.start || "—"}
        </span>
        <span
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: color }}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : "text-ink"}`}>
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.detail && `${item.detail}・`}
                {formatMinutes(item.minutes)}
                {end !== null && `・到 ${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`}
              </p>
            </div>
            {!readOnly && (
              <Button variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground" onClick={onEdit} aria-label="調整">
                <Pencil />
              </Button>
            )}
          </div>

          <div className="mt-2 flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={shown}
                disabled={locked}
                onChange={(e) => change(Number(e.target.value))}
                className="progress-range w-full"
                style={{ "--fill": `${shown}%`, "--accent": color } as React.CSSProperties}
                aria-label={`${item.title} 進度`}
              />
              {target !== null && target < 100 && (
                <span
                  className="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-ink"
                  style={{ left: `calc(${target}% - 1px)` }}
                  title={`今天目標 ${target}%`}
                />
              )}
            </div>
            <span className="w-11 shrink-0 text-right text-sm tabular-nums text-ink">{shown}%</span>
          </div>
          {isWork ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              整體進度・{future ? "這天目標" : "今天目標"} {target}%{target === 100 ? "（做完）" : ""}
              {fraction >= 1 && " ✓"}
            </p>
          ) : item.kind === "workout" ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {workoutLogged ? "已在「運動」記錄今天的訓練 ✓" : "到「運動」完成訓練會自動打勾"}
            </p>
          ) : null}
        </div>
      </div>
    </li>
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
            <Input id="pi-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
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
              disabled={!minutes || (custom && !title.trim())}
              onClick={() => {
                const m = minutes ?? item.minutes;
                let share = item.share;
                if ((item.kind === "homework" || item.kind === "unit") && item.share !== undefined && item.minutes > 0) {
                  share = Math.min(100 - (item.base ?? 0), Math.round(((item.share * m) / item.minutes) * 10) / 10);
                }
                onSave({ ...item, title: custom ? title.trim() : item.title, start, minutes: m, share });
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
  // Study units go in order: only offer the next one of each course.
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
          <DialogDescription>從學校的作業／讀書進度挑（讀書依章節順序，只列下一個），或自己加一項。</DialogDescription>
        </DialogHeader>
        <div className="flex rounded-lg border border-border/80 p-0.5">
          {(["school", "custom"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1 text-sm ${tab === t ? "bg-ink text-white" : "text-muted-foreground"}`}
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
                  className={`w-full rounded-lg px-3 py-2 text-left ${pick === w.refId ? "bg-slate-100 ring-1 ring-ink" : "hover:bg-slate-50"}`}
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
              <Input id="add-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!minutes || (tab === "custom" ? !title.trim() : !picked)}
            onClick={() => {
              const m = minutes ?? 30;
              if (tab === "school" && picked) onAdd({ ...workItem(picked, m), start });
              else
                onAdd({
                  id: uid("pi"),
                  kind: "custom",
                  title: title.trim(),
                  detail: "",
                  minutes: m,
                  start,
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
              <Input id="ps-start" type="time" value={s.dayStart} onChange={(e) => setS({ ...s, dayStart: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ps-end">到</Label>
              <Input id="ps-end" type="time" value={s.dayEnd} onChange={(e) => setS({ ...s, dayEnd: e.target.value })} />
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
            disabled={!budget || !s.dayStart || !s.dayEnd || toMinutes(s.dayEnd) <= toMinutes(s.dayStart)}
            onClick={() => budget && onSave({ ...s, studyBudget: budget })}
          >
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
