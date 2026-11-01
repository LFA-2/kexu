"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";
import { BarChart, ProgressRing, SegmentBar, SERIES } from "@/components/charts";
import { Button } from "@/components/ui/button";
import type { DayPlan, PlanItem } from "@/lib/life";
import {
  CATEGORY_LABEL,
  CATEGORY_OF,
  itemFraction,
  sortItems,
  type LiveSources,
} from "@/lib/planner";
import { formatMinutes, homeworkMinutes, unitDeadline, unitMinutes } from "@/lib/types";
import { useSchool } from "@/store/school-store";
import { ChevronLeft, ChevronRight } from "lucide-react";

const CATEGORY_COLOR = {
  school: SERIES[0],
  chores: SERIES[1],
  workout: SERIES[2],
  todo: SERIES[3],
  other: SERIES[4],
} as const;

type Deadline = {
  key: string;
  kind: "homework" | "unit" | "exam";
  id: string;
  title: string;
  detail: string;
  date: string;
  pct: number;
  minutes: number;
  color: string;
};

export function WeekView({
  days,
  todayKey,
  readOnly,
  planFor,
  sources,
  toggle,
  onShiftWeek,
  onThisWeek,
  onOpenDay,
}: {
  days: string[];
  todayKey: string;
  readOnly: boolean;
  planFor: (d: string) => DayPlan | undefined;
  sources: (d: string) => LiveSources;
  toggle: ReactNode;
  onShiftWeek: (n: number) => void;
  onThisWeek: () => void;
  onOpenDay: (d: string) => void;
}) {
  const school = useSchool();

  const perDay = useMemo(
    () =>
      days.map((d) => {
        const plan = planFor(d);
        const items = sortItems(plan?.items ?? []);
        const src = d === todayKey ? sources(d) : null;
        const frac = (i: PlanItem) => (d > todayKey ? 0 : src ? itemFraction(i, src) : i.progress / 100);
        const minutes = items.reduce((a, i) => a + i.minutes, 0);
        const done = items.reduce((a, i) => a + i.minutes * frac(i), 0);
        return { date: d, items, minutes, done, frac, hasPlan: !!plan };
      }),
    [days, planFor, sources, todayKey],
  );

  const total = perDay.reduce((a, d) => a + d.minutes, 0);
  const done = perDay.reduce((a, d) => a + d.done, 0);
  const soFar = perDay.filter((d) => d.date <= todayKey);
  const soFarTotal = soFar.reduce((a, d) => a + d.minutes, 0);
  const soFarDone = soFar.reduce((a, d) => a + d.done, 0);
  const weekPct = total ? (done / total) * 100 : 0;
  const isThisWeek = days.includes(todayKey);

  const byCategory = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const d of perDay) for (const i of d.items) sum[CATEGORY_OF[i.kind]] = (sum[CATEGORY_OF[i.kind]] ?? 0) + i.minutes;
    return (Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((k) => ({
      key: k,
      label: CATEGORY_LABEL[k],
      value: sum[k] ?? 0,
      color: CATEGORY_COLOR[k],
    }));
  }, [perDay]);

  const deadlines = useMemo<Deadline[]>(() => {
    const from = days[0];
    const to = days[6];
    const course = new Map(school.courses.map((c) => [c.id, c]));
    const out: Deadline[] = [];
    for (const h of school.homework) {
      if (h.dueDate < from || h.dueDate > to) continue;
      out.push({
        key: `h${h.id}`,
        kind: "homework",
        id: h.id,
        title: h.title,
        detail: `${course.get(h.courseId)?.name ?? ""}・作業`,
        date: h.dueDate,
        pct: h.done ? 100 : (h.progress ?? 0),
        minutes: homeworkMinutes(h),
        color: course.get(h.courseId)?.color ?? SERIES[0],
      });
    }
    for (const u of school.progress) {
      const dl = unitDeadline(u, school.exams);
      if (!dl || dl < from || dl > to) continue;
      out.push({
        key: `u${u.id}`,
        kind: "unit",
        id: u.id,
        title: u.title,
        detail: `${course.get(u.courseId)?.name ?? ""}・讀書`,
        date: dl,
        pct: u.completed ? 100 : (u.progress ?? 0),
        minutes: unitMinutes(u),
        color: course.get(u.courseId)?.color ?? SERIES[0],
      });
    }
    for (const e of school.exams) {
      if (e.date < from || e.date > to) continue;
      out.push({
        key: `e${e.id}`,
        kind: "exam",
        id: e.id,
        title: `考試：${e.title}`,
        detail: course.get(e.courseId)?.name ?? "",
        date: e.date,
        pct: e.done ? 100 : 0,
        minutes: 0,
        color: course.get(e.courseId)?.color ?? SERIES[0],
      });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  }, [days, school.courses, school.homework, school.progress, school.exams]);

  const deadlinesDone = deadlines.filter((d) => d.pct >= 100).length;

  function commit(d: Deadline, pct: number) {
    if (d.kind === "exam") school.updateExam(d.id, { done: pct >= 100 });
    else school.setWorkProgress(d.kind, d.id, pct);
  }

  const rangeLabel = `${format(parseISO(days[0]), "M/d")} – ${format(parseISO(days[6]), "M/d")}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            一路排到週日，每天都假設前一天有照計畫做完
          </p>
          <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">
            {isThisWeek ? "本週" : rangeLabel}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toggle}
          <div className="flex items-center rounded-xl border border-border/80 bg-white p-0.5 shadow-sm">
            <Button variant="ghost" size="icon-sm" onClick={() => onShiftWeek(-1)} aria-label="上一週">
              <ChevronLeft />
            </Button>
            <button type="button" onClick={onThisWeek} className="px-2 text-sm tabular-nums text-ink">
              {rangeLabel}
            </button>
            <Button variant="ghost" size="icon-sm" onClick={() => onShiftWeek(1)} aria-label="下一週">
              <ChevronRight />
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 rounded-2xl border border-border/70 bg-white p-4 sm:grid-cols-[auto_1fr] sm:p-5">
        <div className="flex items-center gap-4 sm:flex-col sm:items-center">
          <ProgressRing pct={weekPct} label="本週完成" />
          <div className="text-sm sm:text-center">
            <p className="text-ink">
              {formatMinutes(Math.round(done))} / {formatMinutes(total)}
            </p>
            {isThisWeek && soFarTotal > 0 && (
              <p className="text-xs text-muted-foreground">
                到今天為止 {Math.round((soFarDone / soFarTotal) * 100)}%
              </p>
            )}
            {deadlines.length > 0 && (
              <p className="text-xs text-muted-foreground">
                本週截止 {deadlinesDone}/{deadlines.length} 完成
              </p>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-ink">每日進度</h3>
            <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES[0] }} />
                已完成
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES[0], opacity: 0.2 }} />
                排定時間
              </span>
            </span>
          </div>
          <BarChart
            data={perDay.map((d) => ({
              key: d.date,
              label: format(parseISO(d.date), "EEEEE", { locale: zhTW }),
              value: d.date > todayKey ? 0 : d.done,
              total: d.minutes,
              highlight: d.date === todayKey,
              tip: d.minutes
                ? `${formatMinutes(Math.round(d.done))} / ${formatMinutes(d.minutes)}・${Math.round((d.done / d.minutes) * 100)}%`
                : d.hasPlan
                  ? "沒有排事情"
                  : "沒有計畫",
            }))}
            height={140}
          />
          {byCategory.some((c) => c.value > 0) && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-ink">本週時間分配</h3>
              <SegmentBar segments={byCategory} format={(v) => formatMinutes(v)} />
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-display text-lg text-ink">本週要完成</h3>
          <span className="text-xs text-muted-foreground">這週截止的作業、讀書與考試</span>
        </div>
        {deadlines.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground">
            這週沒有截止的東西
          </p>
        ) : (
          <ul className="space-y-2">
            {deadlines.map((d) => (
              <li
                key={d.key}
                className={`rounded-xl border bg-white px-3 py-3 ${d.pct >= 100 ? "border-border/50 bg-slate-50/60" : "border-border/70"}`}
              >
                <div className="flex items-start gap-3">
                  <span className="w-12 shrink-0 text-center">
                    <span className="block text-sm tabular-nums text-ink">{format(parseISO(d.date), "M/d")}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {format(parseISO(d.date), "EEE", { locale: zhTW })}
                    </span>
                  </span>
                  <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${d.pct >= 100 ? "text-muted-foreground line-through" : "text-ink"}`}>
                      {d.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.detail}
                      {d.minutes > 0 && `・約 ${formatMinutes(d.minutes)}`}
                      {d.date < todayKey && d.pct < 100 && <span className="text-rose-700">・已過期</span>}
                    </p>
                    <ProgressSlider
                      value={d.pct}
                      color={SERIES[0]}
                      disabled={readOnly}
                      step={d.kind === "exam" ? 100 : 5}
                      label={`${d.title} 進度`}
                      onCommit={(v) => commit(d, v)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-display mb-2 text-lg text-ink">每天的安排</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {perDay.map((d) => {
            const pct = d.minutes ? Math.round((d.done / d.minutes) * 100) : 0;
            const shown = d.items.slice(0, 6);
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onOpenDay(d.date)}
                className={`rounded-2xl border bg-white p-4 text-left transition-colors hover:border-slate-300 ${
                  d.date === todayKey ? "border-ink/60 ring-1 ring-ink/20" : "border-border/70"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">
                    {format(parseISO(d.date), "EEEE M/d", { locale: zhTW })}
                    {d.date === todayKey && <span className="ml-1.5 text-xs text-teal-800">今天</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.minutes ? formatMinutes(d.minutes) : ""}
                    {d.date <= todayKey && d.minutes > 0 && `・${pct}%`}
                  </span>
                </div>
                {d.date <= todayKey && d.minutes > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: SERIES[0] }} />
                  </div>
                )}
                {shown.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {d.hasPlan ? "沒有排事情" : d.date < todayKey ? "沒有留下計畫" : "沒有計畫"}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {shown.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 text-xs">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLOR[CATEGORY_OF[i.kind]] }}
                        />
                        <span
                          className={`min-w-0 flex-1 truncate ${d.frac(i) >= 1 ? "text-muted-foreground line-through" : "text-ink"}`}
                        >
                          {i.title}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{formatMinutes(i.minutes)}</span>
                      </li>
                    ))}
                    {d.items.length > shown.length && (
                      <li className="text-xs text-muted-foreground">還有 {d.items.length - shown.length} 項…</li>
                    )}
                  </ul>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProgressSlider({
  value,
  color,
  disabled,
  step,
  label,
  onCommit,
}: {
  value: number;
  color: string;
  disabled: boolean;
  step: number;
  label: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const shown = draft ?? value;
  return (
    <div className="mt-1 flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={step}
        value={shown}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDraft(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            onCommit(v);
            setDraft(null);
          }, 350);
        }}
        className="progress-range min-w-0 flex-1"
        style={{ "--fill": `${shown}%`, "--accent": color } as React.CSSProperties}
        aria-label={label}
      />
      <span className="w-11 shrink-0 text-right text-sm tabular-nums text-ink">{Math.round(shown)}%</span>
    </div>
  );
}
