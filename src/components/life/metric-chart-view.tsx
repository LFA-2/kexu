"use client";

import { useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { toDateKey } from "@/lib/dates";
import { METRICS, type MetricKey } from "@/lib/life";
import { useLife } from "@/store/life-store";
import { ArrowLeft } from "lucide-react";

const RANGES = [
  { days: 7, label: "7 天" },
  { days: 30, label: "30 天" },
  { days: 90, label: "90 天" },
];

export function MetricChartView({
  initial,
  onBack,
}: {
  initial: MetricKey;
  onBack: () => void;
}) {
  const { metrics } = useLife();
  const [key, setKey] = useState(initial);
  const [range, setRange] = useState(30);
  const metric = METRICS.find((m) => m.key === key)!;

  const today = new Date();
  const points = Array.from({ length: range }, (_, i) => {
    const date = toDateKey(subDays(today, range - 1 - i));
    return { date, value: metrics[date]?.[key] };
  });
  const values = points.flatMap((p) => (p.value === undefined ? [] : [p.value]));
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回生活
      </Button>

      <header>
        <p className="text-sm text-muted-foreground">
          1 {metric.low} · 10 {metric.high}
        </p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">
          {metric.label}
        </h2>
      </header>

      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setKey(m.key)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              m.key === key
                ? "border-transparent text-white"
                : "border-border/80 bg-white text-muted-foreground hover:text-ink"
            }`}
            style={m.key === key ? { backgroundColor: m.color } : undefined}
          >
            {m.label}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-5 text-sm">
            <Stat label="平均" value={avg === null ? "—" : avg.toFixed(1)} />
            <Stat label="最高" value={values.length ? String(Math.max(...values)) : "—"} />
            <Stat label="最低" value={values.length ? String(Math.min(...values)) : "—"} />
            <Stat label="記錄" value={`${values.length} 天`} />
          </div>
          <div className="flex rounded-lg border border-border/80 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setRange(r.days)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  range === r.days ? "bg-ink text-white" : "text-muted-foreground hover:text-ink"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <MetricChart points={points} color={metric.color} />
        {values.length === 0 && (
          <p className="mt-2 text-center text-sm text-muted-foreground">這段期間還沒有記錄</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl tabular-nums text-ink">{value}</p>
    </div>
  );
}

const W = 640;
const H = 260;
const PAD = { left: 30, right: 14, top: 14, bottom: 30 };

function MetricChart({
  points,
  color,
}: {
  points: { date: string; value: number | undefined }[];
  color: string;
}) {
  const n = points.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + ((10 - v) / 9) * innerH;

  const defined = points.flatMap((p, i) => (p.value === undefined ? [] : [{ i, v: p.value }]));
  const path = defined.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
  const tickCount = Math.min(n, 6);
  const ticks = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k / Math.max(tickCount - 1, 1)) * (n - 1)),
  );
  const r = n > 45 ? 2.5 : 4;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="指數變化圖，橫軸為日期，縱軸為 1 到 10 分"
    >
      {Array.from({ length: 10 }, (_, k) => k + 1).map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke={v === 1 || v === 5 || v === 10 ? "#cbd5e1" : "#eef2f6"}
            strokeWidth={1}
          />
          {(v === 1 || v === 5 || v === 10) && (
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#64748b">
              {v}
            </text>
          )}
        </g>
      ))}
      {ticks.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          fontSize="12"
          fill="#64748b"
        >
          {format(parseISO(points[i].date), "M/d")}
        </text>
      ))}
      {defined.length > 1 && (
        <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      )}
      {defined.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={r} fill="white" stroke={color} strokeWidth={2}>
          <title>{`${points[p.i].date}：${p.v}`}</title>
        </circle>
      ))}
    </svg>
  );
}
