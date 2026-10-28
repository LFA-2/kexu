"use client";

import { useState } from "react";
import { addDays, isToday, parseISO, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { formatShortDate, toDateKey } from "@/lib/dates";
import { METRICS, type MetricKey } from "@/lib/life";
import { useLife } from "@/store/life-store";
import { ChevronLeft, ChevronRight, LineChart } from "lucide-react";

const SCORES = Array.from({ length: 10 }, (_, i) => i + 1);

export function MetricsPanel({ onOpenMetric }: { onOpenMetric: (key: MetricKey) => void }) {
  const { metrics, readOnly, setMetric } = useLife();
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const day = metrics[date] ?? {};
  const isTodaySelected = isToday(parseISO(date));
  const todayKey = toDateKey(new Date());

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-ink">每日狀態</h3>
            <p className="text-xs text-muted-foreground">1 到 10 分，再點一次可以取消</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setDate((d) => toDateKey(subDays(parseISO(d), 1)))}
              aria-label="前一天"
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-24 text-center text-sm tabular-nums text-ink">
              {isTodaySelected ? "今天" : formatShortDate(date)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={isTodaySelected}
              onClick={() => setDate((d) => toDateKey(addDays(parseISO(d), 1)))}
              aria-label="後一天"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {METRICS.map((m) => (
            <div key={m.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">{m.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  1 {m.low} · 10 {m.high}
                </span>
              </div>
              <div className="grid grid-cols-10 gap-1" role="group" aria-label={m.label}>
                {SCORES.map((score) => {
                  const active = day[m.key] === score;
                  return (
                    <button
                      key={score}
                      type="button"
                      disabled={readOnly}
                      onClick={() => setMetric(date, m.key, active ? null : score)}
                      aria-pressed={active}
                      aria-label={`${m.label} ${score}`}
                      className={`h-9 rounded-lg text-sm tabular-nums transition-colors disabled:cursor-default ${
                        active
                          ? "font-semibold text-white"
                          : `bg-slate-100 text-muted-foreground ${readOnly ? "" : "hover:bg-slate-200"}`
                      }`}
                      style={active ? { backgroundColor: m.color } : undefined}
                    >
                      {score}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METRICS.map((m) => {
          const value = metrics[todayKey]?.[m.key];
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onOpenMetric(m.key)}
              aria-label={`查看${m.label}趨勢`}
              className="flex flex-col items-start gap-1 rounded-2xl border border-border/70 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300"
            >
              <span className="flex w-full items-center justify-between text-xs text-muted-foreground">
                {m.label}
                <LineChart className="size-3.5" />
              </span>
              <span className="font-display text-2xl tabular-nums" style={{ color: m.color }}>
                {value ?? "—"}
              </span>
              <Sparkline metric={m.key} color={m.color} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Sparkline({ metric, color }: { metric: MetricKey; color: string }) {
  const { metrics } = useLife();
  const days = 14;
  const today = new Date();
  const points: [number, number][] = [];
  for (let i = 0; i < days; i++) {
    const value = metrics[toDateKey(subDays(today, days - 1 - i))]?.[metric];
    if (value !== undefined) points.push([(i / (days - 1)) * 100, 22 - ((value - 1) / 9) * 20]);
  }
  return (
    <svg viewBox="0 0 100 24" className="h-6 w-full" preserveAspectRatio="none" aria-hidden>
      {points.length > 1 && (
        <polyline
          points={points.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      )}
      {points.length === 1 && <circle cx={points[0][0]} cy={points[0][1]} r="1.5" fill={color} />}
    </svg>
  );
}
