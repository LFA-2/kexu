"use client";

import { useEffect, useRef, useState } from "react";
import { itemMinutes, type ScheduleItem } from "@/lib/life";

const DEFAULT_RANGE: [number, number] = [6, 24];
const LABEL_PX = 11;
const SPAN_LANE = 17;
const POINT_LANE = 16;

/** Hours to show: 6:00–24:00 unless something falls outside. */
export function timelineRange(lists: ScheduleItem[][]): [number, number] {
  let [lo, hi] = DEFAULT_RANGE;
  for (const items of lists) {
    for (const item of items) {
      const [start, end] = itemMinutes(item);
      lo = Math.min(lo, Math.floor(start / 60));
      hi = Math.max(hi, Math.ceil(end / 60));
    }
  }
  return [lo, hi];
}

function textWidth(text: string) {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 255 ? LABEL_PX : LABEL_PX * 0.62;
  return w + 4;
}

/** Greedy lane assignment so labels never overlap. */
function layoutLabels(labels: { center: number; text: string }[], width: number) {
  const laneEnds: number[] = [];
  return [...labels]
    .sort((a, b) => a.center - b.center)
    .map((label) => {
      const w = textWidth(label.text);
      const left = Math.min(Math.max(label.center - w / 2, 0), Math.max(width - w, 0));
      let lane = laneEnds.findIndex((end) => end + 4 <= left);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = left + w;
      return { ...label, left, lane };
    });
}

const hourLabel = (h: number) => (h === 24 ? "24" : String(h % 24));

export function DayTimeline({
  items,
  color,
  range,
}: {
  items: ScheduleItem[];
  color: string;
  range: [number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setMeasured(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const width = measured || 320;
  const [lo, hi] = range;
  const total = (hi - lo) * 60;
  const x = (minutes: number) => ((minutes - lo * 60) / total) * width;

  const spans = items.filter((i) => i.kind === "span");
  const points = items.filter((i) => i.kind === "point");

  const spanLabels = layoutLabels(
    spans.map((s) => {
      const [a, b] = itemMinutes(s);
      return { center: (x(a) + x(b)) / 2, text: s.label };
    }),
    width,
  );
  const pointLabels = layoutLabels(
    points.map((p) => ({ center: x(itemMinutes(p)[0]), text: `${p.label} ${p.start}` })),
    width,
  );
  const spanLanes = spanLabels.reduce((n, l) => Math.max(n, l.lane + 1), 0);
  const pointLanes = pointLabels.reduce((n, l) => Math.max(n, l.lane + 1), 0);

  const step = width / (hi - lo) >= 34 ? 2 : 3;
  const ticks: number[] = [];
  for (let h = lo; h <= hi; h += 1) if ((h - lo) % step === 0 || h === hi) ticks.push(h);
  if (ticks.length > 1 && hi - ticks[ticks.length - 2] < step) ticks.splice(ticks.length - 2, 1);

  return (
    <div ref={ref} className="relative w-full select-none">
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
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
        {ticks.map((h) => (
          <span
            key={h}
            className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-slate-300"
            style={{ left: x(h * 60) }}
          />
        ))}
        {spans.map((s) => {
          const [a, b] = itemMinutes(s);
          return (
            <span
              key={s.id}
              className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full opacity-85"
              style={{ left: x(a), width: Math.max(x(b) - x(a), 4), backgroundColor: color }}
              title={`${s.label} ${s.start}–${s.end}`}
            />
          );
        })}
        {points.map((p) => (
          <span
            key={p.id}
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-white"
            style={{ left: x(itemMinutes(p)[0]), borderColor: color }}
            title={`${p.label} ${p.start}`}
          />
        ))}
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

      <div className="relative mt-1 h-3.5 text-[10px] leading-none text-muted-foreground">
        {ticks.map((h, i) => (
          <span
            key={h}
            className="absolute tabular-nums"
            style={{
              left: x(h * 60),
              transform:
                i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {hourLabel(h)}
          </span>
        ))}
      </div>
    </div>
  );
}
