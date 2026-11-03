"use client";

import { useEffect, useRef, useState } from "react";
import { toMinutes, type PlanItem } from "@/lib/life";
import { CATEGORY_OF } from "@/lib/planner";
import { hhmm } from "@/lib/reflow";
import { formatMinutes } from "@/lib/types";
import type { RailPin } from "@/components/today/day-rail";

/**
 * The whole day squeezed into one bar: classes and 行程 hatched, tasks in their
 * category colour, a line for now, and anything past the day's end in amber.
 */
export function DayStrip({
  items,
  pins,
  colors,
  frac,
  dayStart,
  dayEnd,
  now,
  onPick,
}: {
  items: PlanItem[];
  pins: RailPin[];
  colors: Record<string, string>;
  frac: (i: PlanItem) => number;
  dayStart: number;
  dayEnd: number;
  /** minute of day, only for today */
  now: number | null;
  onPick: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [tip, setTip] = useState<{ x: number; text: string } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new ResizeObserver(([e]) => setWidth(e.contentRect.width || 320));
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  const spans = pins
    .filter((p) => !p.point && p.end)
    .map((p) => {
      const a = toMinutes(p.start);
      let b = toMinutes(p.end ?? p.start);
      if (b <= a) b += 24 * 60;
      return { pin: p, a, b };
    });
  const points = pins.filter((p) => p.point).map((p) => ({ pin: p, a: toMinutes(p.start) }));
  const tasks = items
    .filter((i) => i.start)
    .map((i) => ({ item: i, a: toMinutes(i.start), b: toMinutes(i.start) + Math.max(5, i.minutes) }));

  const lo = Math.floor(Math.min(dayStart, ...spans.map((s) => s.a), ...points.map((p) => p.a), ...tasks.map((t) => t.a)) / 60);
  const hi = Math.ceil(Math.max(dayEnd, ...spans.map((s) => s.b), ...tasks.map((t) => t.b)) / 60);
  const total = Math.max(60, (hi - lo) * 60);
  const x = (m: number) => ((m - lo * 60) / total) * width;
  const step = width / (hi - lo) >= 40 ? 2 : width / (hi - lo) >= 22 ? 3 : 4;
  const ticks: number[] = [];
  for (let h = lo; h <= hi; h++) if ((h - lo) % step === 0) ticks.push(h);

  const H = 30;
  return (
    <div ref={ref} className="relative w-full select-none" onMouseLeave={() => setTip(null)}>
      <div className="relative overflow-hidden rounded-lg bg-soft" style={{ height: H }}>
        {dayEnd < hi * 60 && (
          <div
            className="absolute inset-y-0 bg-amber-100/70"
            style={{ left: x(dayEnd), right: 0 }}
            title={`超過 ${hhmm(dayEnd)}`}
          />
        )}
        {spans.map(({ pin, a, b }) => (
          <div
            key={pin.id}
            className="absolute inset-y-0 border-x border-card"
            style={{
              left: x(a),
              width: Math.max(2, x(b) - x(a)),
              backgroundImage: `repeating-linear-gradient(135deg, color-mix(in srgb, ${pin.color} 45%, transparent) 0 3px, transparent 3px 7px)`,
            }}
            onMouseEnter={() => setTip({ x: x((a + b) / 2), text: `${pin.prefix}・${pin.title} ${pin.start}–${pin.end}` })}
          />
        ))}
        {tasks.map(({ item, a, b }) => {
          const done = frac(item) >= 1;
          const over = b > dayEnd;
          const color = colors[CATEGORY_OF[item.kind]];
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`${item.title} ${hhmm(a)}`}
              onClick={() => onPick(item.id)}
              onMouseEnter={() => setTip({ x: x((a + b) / 2), text: `${item.title} ${hhmm(a)}–${hhmm(b)}・${formatMinutes(item.minutes)}` })}
              className="absolute rounded-[4px] border-x border-card"
              style={{
                left: x(a),
                width: Math.max(4, x(b) - x(a)),
                top: 5,
                bottom: 5,
                backgroundColor: color,
                opacity: done ? 0.35 : 1,
                boxShadow: over ? "inset 0 -3px 0 #d97706" : undefined,
              }}
            />
          );
        })}
        {points.map(({ pin, a }) => (
          <span
            key={pin.id}
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card"
            style={{ left: x(a), borderColor: pin.color }}
            onMouseEnter={() => setTip({ x: x(a), text: `${pin.title} ${pin.start}` })}
          />
        ))}
        {now !== null && now >= lo * 60 && now <= hi * 60 && (
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: x(now) - 1 }} />
        )}
      </div>
      {tip && (
        <div
          className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[11px] text-white shadow"
          style={{ left: Math.min(Math.max(tip.x, 60), width - 60), transform: "translateX(-50%)" }}
        >
          {tip.text}
        </div>
      )}
      <div className="relative mt-1 h-3.5 text-[10px] leading-none tabular-nums text-muted-foreground">
        {ticks.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2"
            style={{ left: Math.min(Math.max(x(h * 60), 6), width - 6) }}
          >
            {h % 24}
          </span>
        ))}
        {now !== null && now >= lo * 60 && now <= hi * 60 && (
          <span
            className="absolute -translate-x-1/2 font-medium text-ink"
            style={{ left: Math.min(Math.max(x(now), 14), width - 14), top: 12 }}
          >
            現在
          </span>
        )}
      </div>
      <div className="h-3" />
    </div>
  );
}
