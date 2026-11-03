"use client";

import { useEffect, useRef, useState } from "react";
import { layoutLabels } from "@/components/day-timeline";
import { toMinutes, type PlanItem } from "@/lib/life";
import { CATEGORY_OF } from "@/lib/planner";
import { hhmm } from "@/lib/reflow";
import { formatMinutes } from "@/lib/types";
import type { RailPin } from "@/components/today/day-rail";

const LABEL_PX = 11;
const SPAN_LANE = 17;
const POINT_LANE = 16;

/**
 * The 今明行程 number line, with the day's tasks on it: 行程 and classes in the
 * user's colour with labels, tasks as thin bars in their category colour.
 */
export function DayStrip({
  items,
  pins,
  color,
  colors,
  frac,
  dayStart,
  dayEnd,
  now,
  onPick,
}: {
  items: PlanItem[];
  pins: RailPin[];
  /** the user's colour, for 行程 and classes */
  color: string;
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

  const spanLabels = layoutLabels(
    spans.map((s) => ({ center: (x(s.a) + x(s.b)) / 2, text: s.pin.title })),
    width,
  );
  const pointLabels = layoutLabels(
    points.map((p) => ({ center: x(p.a), text: `${p.pin.title} ${p.pin.start}` })),
    width,
  );
  const spanLanes = spanLabels.reduce((n, l) => Math.max(n, l.lane + 1), 0);
  const pointLanes = pointLabels.reduce((n, l) => Math.max(n, l.lane + 1), 0);

  const step = width / (hi - lo) >= 34 ? 2 : 3;
  const ticks: number[] = [];
  for (let h = lo; h <= hi; h++) if ((h - lo) % step === 0 || h === hi) ticks.push(h);
  if (ticks.length > 1 && hi - ticks[ticks.length - 2] < step) ticks.splice(ticks.length - 2, 1);
  const showNow = now !== null && now >= lo * 60 && now <= hi * 60;

  return (
    <div ref={ref} className="relative w-full select-none" onMouseLeave={() => setTip(null)}>
      <div className="relative" style={{ height: spanLanes * SPAN_LANE }}>
        {spanLabels.map((l, i) => (
          <span
            key={i}
            className="absolute whitespace-nowrap font-medium leading-none"
            style={{ left: l.left, top: l.lane * SPAN_LANE + 3, fontSize: LABEL_PX, color }}
          >
            {l.text}
          </span>
        ))}
      </div>

      <div className="relative my-1 h-3.5">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        {dayEnd < hi * 60 && (
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-r-full bg-amber-300/70"
            style={{ left: x(dayEnd), right: 0 }}
            title={`超過 ${hhmm(dayEnd)}`}
          />
        )}
        {ticks.map((h) => (
          <span key={h} className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-border" style={{ left: x(h * 60) }} />
        ))}
        {spans.map(({ pin, a, b }) => (
          <span
            key={pin.id}
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full opacity-85"
            style={{ left: x(a), width: Math.max(x(b) - x(a), 4), backgroundColor: color }}
            onMouseEnter={() => setTip({ x: x((a + b) / 2), text: `${pin.prefix}・${pin.title} ${pin.start}–${pin.end}` })}
          />
        ))}
        {tasks.map(({ item, a, b }) => (
          <button
            key={item.id}
            type="button"
            aria-label={`${item.title} ${hhmm(a)}`}
            onClick={() => onPick(item.id)}
            onMouseEnter={() => setTip({ x: x((a + b) / 2), text: `${item.title} ${hhmm(a)}–${hhmm(b)}・${formatMinutes(item.minutes)}` })}
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full ring-2 ring-card"
            style={{
              left: x(a),
              width: Math.max(x(b) - x(a), 4),
              backgroundColor: colors[CATEGORY_OF[item.kind]],
              opacity: frac(item) >= 1 ? 0.35 : 1,
            }}
          />
        ))}
        {points.map(({ pin, a }) => (
          <span
            key={pin.id}
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-card"
            style={{ left: x(a), borderColor: color }}
            onMouseEnter={() => setTip({ x: x(a), text: `${pin.title} ${pin.start}` })}
          />
        ))}
        {showNow && (
          <span
            className="pointer-events-none absolute -top-0.5 h-4.5 w-0.5 -translate-x-1/2 rounded-full bg-ink"
            style={{ left: x(now) }}
            title="現在"
          />
        )}
      </div>

      <div className="relative" style={{ height: pointLanes * POINT_LANE }}>
        {pointLabels.map((l, i) => (
          <span
            key={i}
            className="absolute whitespace-nowrap leading-none text-ink"
            style={{ left: l.left, top: l.lane * POINT_LANE + 2, fontSize: LABEL_PX }}
          >
            {l.text}
          </span>
        ))}
      </div>

      {tip && (
        <div
          className="pointer-events-none absolute -top-6 z-10 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[11px] text-white shadow"
          style={{ left: Math.min(Math.max(tip.x, 70), width - 70), transform: "translateX(-50%)" }}
        >
          {tip.text}
        </div>
      )}

      <div className="relative mt-1 h-3.5 text-[10px] leading-none text-muted-foreground">
        {ticks.map((h, i) => (
          <span
            key={h}
            className="absolute tabular-nums"
            style={{
              left: x(h * 60),
              transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {h === 24 ? "24" : String(h % 24)}
          </span>
        ))}
      </div>
    </div>
  );
}
