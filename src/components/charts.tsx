"use client";

import { useState } from "react";

/** Validated categorical order (fixed, never cycled). Slots 3–5 are below 3:1, so always label them. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const MAIN = SERIES[0];
const TRACK = "var(--muted)";
const GRID = "var(--border)";
const AXIS_TEXT = "var(--muted-foreground)";

export function ProgressRing({
  pct,
  size = 132,
  stroke = 12,
  color = MAIN,
  label,
  sublabel,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ?? ""} ${Math.round(clamped)}%`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
        {clamped > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 600ms ease-out" }}
        />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-3xl tabular-nums leading-none text-ink">
          {Math.round(clamped)}
          <span className="text-base">%</span>
        </span>
        {label && <span className="mt-1 text-[11px] text-muted-foreground">{label}</span>}
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      </div>
    </div>
  );
}

export type BarDatum = {
  key: string;
  label: string;
  value: number | null;
  /** Tooltip text; defaults to the formatted value */
  tip?: string;
  /** When set, a light bar of this size is drawn behind the value (done out of total). */
  total?: number | null;
  highlight?: boolean;
};

/** Vertical bars, one series. `null` values draw nothing (no data), 0 draws a stub. */
export function BarChart({
  data,
  max,
  height = 160,
  format = (v) => String(Math.round(v)),
  color = MAIN,
  unit = "",
}: {
  data: BarDatum[];
  max?: number;
  height?: number;
  format?: (v: number) => string;
  color?: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const top = 8;
  const innerH = H - top;
  const slot = W / Math.max(1, data.length);
  const barW = Math.min(44, slot * 0.6);
  const peak = max ?? Math.max(1, ...data.map((d) => Math.max(d.value ?? 0, d.total ?? 0)));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img">
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={top + innerH * (1 - f)}
            y2={top + innerH * (1 - f)}
            stroke={GRID}
            strokeDasharray="4 4"
          />
        ))}
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--border)" />
        {data.map((d, i) => {
          const cx = i * slot + slot / 2;
          const h =
            d.value === null ? 0 : Math.max(d.value > 0 ? 3 : 1.5, (d.value / peak) * innerH);
          const y = H - h;
          const dim = hover !== null && hover !== i;
          const th = d.total ? Math.max(3, (d.total / peak) * innerH) : 0;
          return (
            <g key={d.key}>
              {th > 0 && (
                <path
                  d={roundedTopBar(cx - barW / 2, H - th, barW, th, Math.min(4, th))}
                  fill={color}
                  opacity={dim ? 0.08 : 0.2}
                />
              )}
              {d.value !== null && (d.value > 0 || !d.total) && (
                <path
                  d={roundedTopBar(cx - barW / 2, y, barW, h, Math.min(4, h))}
                  fill={color}
                  opacity={dim ? 0.35 : d.highlight === false ? 0.55 : 1}
                />
              )}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(hover === i ? null : i)}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex">
        {data.map((d) => (
          <span
            key={d.key}
            className={`flex-1 truncate text-center text-[11px] ${d.highlight ? "font-medium text-ink" : ""}`}
            style={d.highlight ? undefined : { color: AXIS_TEXT }}
          >
            {d.label}
          </span>
        ))}
      </div>
      {hover !== null && data[hover] && (
        <Tooltip leftPct={((hover + 0.5) / data.length) * 100}>
          <span className="text-muted-foreground">{data[hover].label}</span>{" "}
          <span className="font-medium tabular-nums text-ink">
            {data[hover].tip ??
              (data[hover].value === null ? "沒有資料" : `${format(data[hover].value!)}${unit}`)}
          </span>
        </Tooltip>
      )}
    </div>
  );
}

function roundedTopBar(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function Tooltip({ leftPct, children }: { leftPct: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/80 bg-card px-2 py-1 text-xs shadow-md"
      style={{ left: `${Math.max(12, Math.min(88, leftPct))}%` }}
    >
      {children}
    </div>
  );
}

export type LinePoint = { key: string; label: string; value: number | undefined };

/** One series over time, with a crosshair tooltip. */
export function LineChart({
  points,
  height = 200,
  format = (v) => v.toFixed(1),
  unit = "",
  color = MAIN,
  tickEvery,
}: {
  points: LinePoint[];
  height?: number;
  format?: (v: number) => string;
  unit?: string;
  color?: string;
  tickEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const PAD = { left: 40, right: 12, top: 14, bottom: 26 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = points.length;
  const vals = points.flatMap((p) => (p.value === undefined ? [] : [p.value]));
  if (vals.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">還沒有資料</p>
    );
  }
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const padV = (hi - lo) * 0.12;
  lo -= padV;
  hi += padV;
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH;
  const defined = points.flatMap((p, i) => (p.value === undefined ? [] : [{ i, v: p.value }]));
  const path = defined.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
  const step = tickEvery ?? Math.max(1, Math.ceil(n / 6));
  const yTicks = [lo + padV, (lo + hi) / 2, hi - padV];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best: number | null = null;
    let dist = Infinity;
    for (const p of defined) {
      const d = Math.abs(x(p.i) - px);
      if (d < dist) {
        dist = d;
        best = p.i;
      }
    }
    setHover(best);
  }

  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeDasharray="4 4" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
              {format(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={p.key} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
              {p.label}
            </text>
          ) : null,
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {defined.map((p) => (
          <circle
            key={p.i}
            cx={x(p.i)}
            cy={y(p.v)}
            r={n > 40 ? 2.5 : 4}
            fill={color}
            stroke="var(--card)"
            strokeWidth={2}
          />
        ))}
        {hp && hover !== null && hp.value !== undefined && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--muted-foreground)" />
            <circle cx={x(hover)} cy={y(hp.value)} r={5} fill={color} stroke="var(--card)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && hover !== null && hp.value !== undefined && (
        <Tooltip leftPct={(x(hover) / W) * 100}>
          <span className="text-muted-foreground">{hp.label}</span>{" "}
          <span className="font-medium tabular-nums text-ink">
            {format(hp.value)}
            {unit}
          </span>
        </Tooltip>
      )}
    </div>
  );
}

export type LineSeries = { key: string; label: string; color: string; values: (number | undefined)[] };

/** Several whole-number series over shared x labels, with a legend and a crosshair tooltip. */
export function MultiLineChart({
  labels,
  series,
  height = 200,
  unit = "",
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const PAD = { left: 32, right: 12, top: 14, bottom: 26 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = labels.length;
  const vals = series.flatMap((s) => s.values.filter((v): v is number => v !== undefined));
  if (vals.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">還沒有資料</p>;
  }
  const tickStep = Math.max(1, Math.ceil(Math.max(...vals) / 4));
  const hi = tickStep * Math.max(1, Math.ceil((Math.max(...vals) + 0.5) / tickStep));
  const yTicks = Array.from({ length: hi / tickStep + 1 }, (_, k) => k * tickStep);
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + ((hi - v) / hi) * innerH;
  const step = Math.max(1, Math.ceil(n / 6));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = n === 1 ? 0 : Math.round(((px - PAD.left) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-pan-y"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeDasharray="4 4" />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {t}
              </text>
            </g>
          ))}
          {labels.map((label, i) =>
            i % step === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                {label}
              </text>
            ) : null,
          )}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--muted-foreground)" />
          )}
          {series.map((s) => {
            const pts = s.values.flatMap((v, i) => (v === undefined ? [] : [{ i, v }]));
            const path = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
            return (
              <g key={s.key}>
                <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p) => (
                  <circle
                    key={p.i}
                    cx={x(p.i)}
                    cy={y(p.v)}
                    r={p.i === hover ? 5 : n > 40 ? 2.5 : 4}
                    fill={s.color}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <Tooltip leftPct={(x(hover) / W) * 100}>
            <span className="block text-muted-foreground">{labels[hover]}</span>
            {series.map((s) => (
              <span key={s.key} className="block tabular-nums text-ink">
                <span style={{ color: s.color }}>●</span> {s.label}{" "}
                {s.values[hover] === undefined ? "—" : `${s.values[hover]}${unit}`}
              </span>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export type Segment = { key: string; label: string; value: number; color: string };

/** One horizontal 100% bar with a labelled legend (labels carry identity, not color alone). */
export function SegmentBar({
  segments,
  format = (v) => String(v),
}: {
  segments: Segment[];
  format?: (v: number) => string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return null;
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded">
        {shown.map((s) => (
          <div
            key={s.key}
            className="h-full first:rounded-l last:rounded-r"
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label} ${format(s.value)}`}
          />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {shown.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-ink">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {format(s.value)}・{Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** GitHub-style calendar heatmap; `weeks` columns ending this week. Sequential single hue. */
export function Heatmap({
  counts,
  weeks = 16,
  endDate = new Date(),
  label = (date: string, n: number) => `${date}：${n}`,
}: {
  counts: Record<string, number>;
  weeks?: number;
  endDate?: Date;
  label?: (date: string, n: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const end = new Date(endDate);
  const dow = (end.getDay() + 6) % 7;
  const start = new Date(end);
  start.setDate(end.getDate() - dow - (weeks - 1) * 7);
  const ramp = ["var(--wash)", "#bcd4f2", "#7eaee6", "#2a78d6"];
  const cells: { key: string; col: number; row: number; n: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    cells.push({ key, col: Math.floor(i / 7), row: i % 7, n: counts[key] ?? 0, future: d > end });
  }
  const S = 14;
  const G = 3;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${weeks * (S + G)} ${7 * (S + G)}`}
        className="h-auto w-full max-w-md"
        role="img"
        aria-label="訓練日曆"
      >
        {cells.map((c) => (
          <rect
            key={c.key}
            x={c.col * (S + G)}
            y={c.row * (S + G)}
            width={S}
            height={S}
            rx={3}
            fill={c.future ? "transparent" : ramp[Math.min(3, c.n)]}
            stroke={hover === c.key ? "var(--ink)" : "none"}
            onMouseEnter={() => setHover(c.key)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(c.key)}
          />
        ))}
      </svg>
      <p className="mt-1 h-4 text-xs text-muted-foreground">
        {hover ? label(hover, counts[hover] ?? 0) : ""}
      </p>
    </div>
  );
}
