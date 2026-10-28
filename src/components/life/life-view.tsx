"use client";

import { useState, type ReactNode } from "react";
import { AvailabilityView } from "@/components/life/availability-view";
import { MetricChartView } from "@/components/life/metric-chart-view";
import { MetricsPanel } from "@/components/life/metrics-panel";
import { NoteCard } from "@/components/life/note-card";
import { TodosView } from "@/components/life/todos-view";
import { formatShortDate, toDateKey } from "@/lib/dates";
import type { MetricKey } from "@/lib/life";
import { useLife } from "@/store/life-store";
import { CalendarHeart, ChevronRight, ListTodo } from "lucide-react";

type Screen =
  | { type: "home" }
  | { type: "metric"; key: MetricKey }
  | { type: "todos" }
  | { type: "dates" };

export function LifeView({ color }: { color: string }) {
  const { todos, available } = useLife();
  const [screen, setScreen] = useState<Screen>({ type: "home" });

  function go(next: Screen) {
    setScreen(next);
    window.scrollTo({ top: 0 });
  }
  const back = () => go({ type: "home" });

  if (screen.type === "metric") return <MetricChartView initial={screen.key} onBack={back} />;
  if (screen.type === "todos") return <TodosView color={color} onBack={back} />;
  if (screen.type === "dates") return <AvailabilityView color={color} onBack={back} />;

  const today = toDateKey(new Date());
  const openTodos = todos
    .filter((t) => !t.done)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99"));
  const next = openTodos.find((t) => t.date >= today);
  const upcomingDates = available.filter((d) => d >= today);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">記錄每天的狀態，也讓連結的人知道你的近況</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">生活</h2>
      </header>

      <MetricsPanel onOpenMetric={(key) => go({ type: "metric", key })} />

      <div className="grid gap-3 sm:grid-cols-2">
        <EntryCard
          icon={<ListTodo className="size-5" />}
          title="待做事項"
          summary={
            openTodos.length === 0
              ? "沒有未完成的事項"
              : `${openTodos.length} 項未完成${next ? `・下一項 ${formatShortDate(next.date)} ${next.title}` : ""}`
          }
          onClick={() => go({ type: "todos" })}
        />
        <EntryCard
          icon={<CalendarHeart className="size-5" />}
          title="可約會日期"
          summary={
            upcomingDates.length === 0
              ? "還沒有標記有空的日子"
              : `接下來 ${upcomingDates.length} 天有空・最近 ${formatShortDate(upcomingDates[0])}`
          }
          onClick={() => go({ type: "dates" })}
        />
      </div>

      <NoteCard />
    </div>
  );
}

function EntryCard({
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
      className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white p-4 text-left transition-colors hover:border-slate-300 sm:p-5"
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
