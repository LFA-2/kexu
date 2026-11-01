"use client";

import { useMemo, useState, type ReactNode } from "react";
import { addDays, format, parseISO, startOfWeek, subDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Heatmap } from "@/components/charts";
import { RoutinesView, itemSummary } from "@/components/fitness/routines-view";
import { BodyView, StatsView } from "@/components/fitness/stats-view";
import {
  FinishedCard,
  newSession,
  readDraft,
  WorkoutLogger,
} from "@/components/fitness/workout-logger";
import { Button } from "@/components/ui/button";
import { formatShortDate, isoWeekday, toDateKey } from "@/lib/dates";
import {
  dayRoutineIds,
  dayRoutines,
  formatKg,
  formatPace,
  routineMinutes,
  sessionCardio,
  sessionVolume,
  type Routine,
  type Session,
} from "@/lib/fitness";
import { useFitness } from "@/store/fitness-store";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Flame,
  History,
  Play,
  Scale,
  Trash2,
} from "lucide-react";

type Screen =
  | { type: "home" }
  | { type: "log"; session: Session }
  | { type: "finished"; session: Session; prs: string[] }
  | { type: "routines" }
  | { type: "history" }
  | { type: "session"; id: string }
  | { type: "stats" }
  | { type: "body" };

export function FitnessView({ owner }: { owner: string }) {
  const fitness = useFitness();
  const { routines, weekPlan, readOnly, sessions, exerciseById, allExercises } = fitness;
  const [screen, setScreen] = useState<Screen>({ type: "home" });
  const [draft, setDraft] = useState(() => (readOnly ? null : readDraft(owner)));

  const go = (s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0 });
  };
  const home = () => {
    setDraft(readOnly ? null : readDraft(owner));
    go({ type: "home" });
  };

  const lastSets = (exerciseId: string) =>
    [...sessions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .flatMap((s) => s.entries.filter((e) => e.exerciseId === exerciseId && e.sets?.length))[0]?.sets;
  const isCardio = (id: string) => exerciseById.get(id)?.kind === "cardio";

  function start(list: Routine[]) {
    if (draft && !confirm("有一個還沒完成的訓練，要放棄它並開始新的嗎？")) return;
    go({ type: "log", session: newSession(list, lastSets, isCardio) });
  }

  switch (screen.type) {
    case "log":
      return (
        <WorkoutLogger
          owner={owner}
          initial={screen.session}
          onExit={home}
          onFinished={(session, prs) => {
            setDraft(null);
            go({ type: "finished", session, prs });
          }}
        />
      );
    case "finished":
      return <FinishedCard session={screen.session} prs={screen.prs} onClose={home} />;
    case "routines":
      return <RoutinesView onBack={home} onStart={(r) => start([r])} />;
    case "history":
      return <HistoryView onBack={home} onOpen={(id) => go({ type: "session", id })} />;
    case "session":
      return (
        <SessionDetail
          id={screen.id}
          onBack={() => go({ type: "history" })}
          onEdit={(s) => go({ type: "log", session: s })}
        />
      );
    case "stats":
      return <StatsView onBack={home} />;
    case "body":
      return <BodyView onBack={home} />;
  }

  const now = new Date();
  const today = toDateKey(now);
  const todayRoutines = dayRoutines(fitness, isoWeekday(now));
  const plannedDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => dayRoutineIds(weekPlan, d).length > 0).length;
  const doneToday = sessions.filter((s) => s.date === today);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">重訓、有氧和身體數據，一週一週累積</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">運動</h2>
      </header>

      {draft && !readOnly && (
        <button
          type="button"
          onClick={() => go({ type: "log", session: draft })}
          className="flex w-full items-center gap-3 rounded-2xl bg-ink p-4 text-left text-white"
        >
          <Activity className="size-5 shrink-0 animate-pulse" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">繼續訓練：{draft.title}</span>
            <span className="text-xs opacity-75">
              {format(parseISO(draft.startedAt), "HH:mm")} 開始・
              {draft.entries.reduce((a, e) => a + (e.sets?.filter((x) => x.done).length ?? 0), 0)} 組完成
            </span>
          </span>
          <ChevronRight className="size-4" />
        </button>
      )}

      <TodayCard
        routines={todayRoutines}
        done={doneToday}
        readOnly={readOnly}
        onStart={start}
        summary={(r) => `${r.items.length} 個動作・約 ${routineMinutes(r, allExercises)} 分`}
        detail={(r) =>
          r.items
            .slice(0, 6)
            .map((it) => `${exerciseById.get(it.exerciseId)?.name ?? "?"} ${itemSummary(it, exerciseById.get(it.exerciseId)?.kind)}`)
        }
      />

      <WeekSummary />

      <div className="grid gap-3 sm:grid-cols-2">
        <Entry icon={<ClipboardList className="size-5" />} title="課表" summary={routines.length ? `${routines.length} 份菜單・每週 ${plannedDays} 天有排` : "建立菜單、排進每週"} onClick={() => go({ type: "routines" })} />
        <Entry icon={<History className="size-5" />} title="紀錄" summary={sessions.length ? `共 ${sessions.length} 次訓練` : "還沒有紀錄"} onClick={() => go({ type: "history" })} />
        <Entry icon={<BarChart3 className="size-5" />} title="分析" summary="每週趨勢、動作進步、個人紀錄" onClick={() => go({ type: "stats" })} />
        <Entry icon={<Scale className="size-5" />} title="身體數據" summary={latestWeight(fitness.body)} onClick={() => go({ type: "body" })} />
      </div>
    </div>
  );
}

function latestWeight(body: Record<string, { weight?: number }>) {
  const e = Object.entries(body)
    .filter(([, v]) => v.weight !== undefined)
    .sort((a, b) => b[0].localeCompare(a[0]))[0];
  return e ? `${e[1].weight} kg（${formatShortDate(e[0])}）` : "記錄體重、體脂";
}

function TodayCard({
  routines,
  done,
  readOnly,
  onStart,
  summary,
  detail,
}: {
  routines: Routine[];
  done: Session[];
  readOnly: boolean;
  onStart: (r: Routine[]) => void;
  summary: (r: Routine) => string;
  detail: (r: Routine) => string[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-white">
      {routines.length > 0 && (
        <div className="flex h-1.5">
          {routines.map((r) => (
            <div key={r.id} className="flex-1" style={{ backgroundColor: r.color }} />
          ))}
        </div>
      )}
      <div className="p-4 sm:p-5">
        <p className="text-xs text-muted-foreground">今天的課表</p>
        {routines.length > 0 ? (
          <>
            <h3 className="font-display mt-0.5 text-xl text-ink">{routines.map((r) => r.name).join("＋")}</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {routines.map((r) => (
                <div key={r.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.name}
                    </span>
                    {!readOnly && routines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onStart([r])}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-ink hover:underline"
                      >
                        只練這個
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{summary(r)}</p>
                  <ul className="mt-1 text-xs text-ink">
                    {detail(r).map((d) => (
                      <li key={d}>・{d}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <h3 className="font-display mt-0.5 text-xl text-ink">休息日</h3>
        )}
        {done.length > 0 && (
          <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
            ✓ 今天已完成：{done.map((s) => s.title).join("、")}
          </p>
        )}
        {!readOnly && (
          <div className="mt-4 flex flex-wrap gap-2">
            {routines.length > 0 && (
              <Button className="gap-1.5" onClick={() => onStart(routines)}>
                <Play data-icon="inline-start" />
                {routines.length > 1 ? "全部開始" : "開始訓練"}
              </Button>
            )}
            <Button variant="outline" className="gap-1.5" onClick={() => onStart([])}>
              <Dumbbell data-icon="inline-start" />
              自由訓練
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function WeekSummary() {
  const { sessions } = useFitness();
  const stats = useMemo(() => {
    const ws = toDateKey(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const week = sessions.filter((s) => s.date >= ws);
    const counts: Record<string, number> = {};
    for (const s of sessions) counts[s.date] = (counts[s.date] ?? 0) + 1;
    // Streak: consecutive weeks (ending this or last week) with at least one session
    let streak = 0;
    let wk = startOfWeek(new Date(), { weekStartsOn: 1 });
    const has = (start: Date) => {
      const a = toDateKey(start);
      const b = toDateKey(addDays(start, 6));
      return sessions.some((s) => s.date >= a && s.date <= b);
    };
    if (!has(wk)) wk = subDays(wk, 7);
    while (has(wk) && streak < 520) {
      streak++;
      wk = subDays(wk, 7);
    }
    return {
      count: week.length,
      minutes: week.reduce((a, s) => a + s.durationMin, 0),
      volume: week.reduce((a, s) => a + sessionVolume(s), 0),
      km: week.reduce((a, s) => a + sessionCardio(s).distance, 0),
      counts,
      streak,
    };
  }, [sessions]);

  return (
    <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg text-ink">本週</h3>
        {stats.streak > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-700">
            <Flame className="size-3.5" />
            連續 {stats.streak} 週有運動
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="訓練" value={`${stats.count} 次`} />
        <Tile label="時間" value={`${stats.minutes} 分`} />
        <Tile label="訓練量" value={`${Math.round(stats.volume).toLocaleString()} kg`} />
        <Tile label="有氧距離" value={`${stats.km.toFixed(1)} km`} />
      </div>
      <p className="mb-2 mt-4 text-xs text-muted-foreground">近 16 週</p>
      <Heatmap
        counts={stats.counts}
        label={(d, n) => `${formatShortDate(d)}：${n ? `${n} 次訓練` : "沒有訓練"}`}
      />
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-lg tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Entry({
  icon,
  title,
  summary,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  summary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white p-4 text-left transition-colors hover:border-slate-300"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display block text-lg text-ink">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{summary}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function HistoryView({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const { sessions } = useFitness();
  const groups = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt),
    );
    const out: { month: string; items: Session[] }[] = [];
    for (const s of sorted) {
      const m = format(parseISO(s.date), "yyyy 年 M 月");
      if (out[out.length - 1]?.month !== m) out.push({ month: m, items: [] });
      out[out.length - 1].items.push(s);
    }
    return out;
  }, [sessions]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回運動
      </Button>
      <header>
        <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">訓練紀錄</h2>
      </header>
      {groups.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
          還沒有紀錄
        </p>
      )}
      {groups.map((g) => (
        <section key={g.month}>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {g.month}・{g.items.length} 次
          </h3>
          <ul className="space-y-2">
            {g.items.map((s) => {
              const vol = sessionVolume(s);
              const c = sessionCardio(s);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(s.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-white px-3 py-3 text-left hover:border-slate-300"
                  >
                    <span className="w-14 shrink-0 text-center">
                      <span className="block font-display text-xl text-ink">{format(parseISO(s.date), "d")}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {format(parseISO(s.date), "EEE", { locale: zhTW })}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{s.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.durationMin} 分・{s.entries.length} 個動作
                        {vol > 0 && `・${Math.round(vol).toLocaleString()} kg`}
                        {c.distance > 0 && `・${c.distance.toFixed(1)} km`}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SessionDetail({
  id,
  onBack,
  onEdit,
}: {
  id: string;
  onBack: () => void;
  onEdit: (s: Session) => void;
}) {
  const { sessions, exerciseById, readOnly, removeSession } = useFitness();
  const s = sessions.find((x) => x.id === id);
  if (!s) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
          <ArrowLeft data-icon="inline-start" />
          返回紀錄
        </Button>
        <p className="text-sm text-muted-foreground">找不到這次訓練</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
          <ArrowLeft data-icon="inline-start" />
          返回紀錄
        </Button>
        {!readOnly && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => onEdit(s)}>
              編輯
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm("刪除這次訓練紀錄？")) {
                  removeSession(s.id);
                  onBack();
                }
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      <header>
        <p className="text-sm text-muted-foreground">
          {formatShortDate(s.date)}・{s.durationMin} 分{s.rpe ? `・強度 ${s.rpe}/10` : ""}
        </p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink">{s.title}</h2>
      </header>
      <ul className="space-y-2">
        {s.entries.map((e, i) => (
          <li key={i} className="rounded-xl border border-border/70 bg-white p-3">
            <p className="font-medium text-ink">{exerciseById.get(e.exerciseId)?.name ?? "?"}</p>
            {e.sets ? (
              <ol className="mt-1 grid grid-cols-2 gap-x-4 text-sm text-muted-foreground sm:grid-cols-4">
                {e.sets.map((x, k) => (
                  <li key={k} className="tabular-nums">
                    {k + 1}. {formatKg(x.weight)} kg × {x.reps}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {e.cardio?.minutes} 分
                {e.cardio?.distance ? `・${e.cardio.distance} km・${formatPace(e.cardio.minutes, e.cardio.distance)}` : ""}
                {e.cardio?.calories ? `・${e.cardio.calories} 大卡` : ""}
                {e.cardio?.avgHr ? `・心率 ${e.cardio.avgHr}` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
      {s.note && (
        <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-ink">{s.note}</p>
      )}
    </div>
  );
}
