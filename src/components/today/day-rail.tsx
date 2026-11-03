"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toMinutes, type PlanItem } from "@/lib/life";
import {
  CATEGORY_OF,
  sourceProgress,
  type LiveSources,
} from "@/lib/planner";
import { reorderRail, shiftRail, type RailBlock } from "@/lib/rail";
import { formatMinutes } from "@/lib/types";
import { SERIES } from "@/components/charts";
import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  Dumbbell,
  GraduationCap,
  ListTodo,
  Lock,
  NotebookPen,
  Pencil,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const KIND_ICON: Record<PlanItem["kind"], LucideIcon> = {
  homework: ClipboardList,
  unit: BookOpen,
  exam: GraduationCap,
  review: RotateCcw,
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

/** Pixels per minute while adjusting. 10 minutes is one snap, 20px. */
const PX = 2;
const PAD = 10;
const LABEL_W = 40;
const POLE_X = 52;
const CARD_X = 66;
const GAP_MIN = 40;
const SIDEWAYS = 56;

export type RailPin = {
  id: string;
  start: string;
  end?: string;
  title: string;
  prefix: string;
  color: string;
  point?: boolean;
};

const hhmm = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const axisOrigin = (earliest: number) => Math.max(0, Math.floor((earliest - 30) / 60) * 60);
const axisEnd = (latest: number) => Math.ceil((latest + 20) / 60) * 60;

function spanMinutes(start: string, end?: string) {
  const a = toMinutes(start);
  if (!end) return 0;
  let b = toMinutes(end);
  if (b <= a) b += 24 * 60;
  return b - a;
}

function toBlocks(items: PlanItem[], pins: RailPin[]): RailBlock[] {
  return [
    ...pins
      .filter((p) => !p.point && p.end)
      .map((p) => ({
        id: p.id,
        start: toMinutes(p.start),
        dur: Math.max(10, spanMinutes(p.start, p.end)),
        fixed: true,
      })),
    ...items
      .filter((i) => i.start)
      .map((i) => ({
        id: i.id,
        start: toMinutes(i.start),
        dur: Math.max(10, i.minutes),
        fixed: false,
      })),
  ];
}

type Gesture = {
  id: string;
  mode: "time" | "reorder";
  dx: number;
  preview: RailBlock[];
};

export function DayRail({
  items,
  pins,
  adjusting,
  readOnly,
  future,
  frac,
  src,
  blockers,
  dayStart,
  dayEnd,
  onProgress,
  onEdit,
  onCommit,
  onCancelPin,
}: {
  items: PlanItem[];
  pins: RailPin[];
  adjusting: boolean;
  readOnly: boolean;
  future: boolean;
  frac: (i: PlanItem) => number;
  src: LiveSources;
  blockers?: Map<string, string>;
  dayStart: number;
  dayEnd: number;
  onProgress: (i: PlanItem, pct: number) => void;
  onEdit: (i: PlanItem) => void;
  onCommit: (updates: { id: string; start: string }[]) => void;
  /** View mode only. Removes a 今明行程 sign from this day. */
  onCancelPin?: (id: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const originRef = useRef<number | null>(null);
  const dragLock = useRef(false);

  const blocks = useMemo(() => toBlocks(items, pins), [items, pins]);
  const starts = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of gesture?.preview ?? []) map.set(b.id, b.start);
    return map;
  }, [gesture]);

  const timed = items.filter((i) => i.start);
  const untimed = items.filter((i) => !i.start);

  const marks = [
    ...timed.map((item) => {
      const start = starts.get(item.id) ?? toMinutes(item.start);
      return { kind: "task" as const, id: item.id, item, start, dur: Math.max(10, item.minutes) };
    }),
    ...pins.map((pin) => ({
      kind: "pin" as const,
      id: pin.id,
      pin,
      start: toMinutes(pin.start),
      dur: pin.point ? 0 : spanMinutes(pin.start, pin.end),
    })),
  ].sort((a, b) => a.start - b.start || (a.kind === "pin" ? -1 : 1));

  const committedEarliest = Math.min(dayStart, ...blocks.map((b) => b.start), 8 * 60);
  const previewEarliest = gesture ? Math.min(committedEarliest, ...gesture.preview.map((b) => b.start)) : committedEarliest;
  const origin = axisOrigin(adjusting ? previewEarliest : committedEarliest);
  const latest = Math.max(
    dayEnd,
    ...marks.map((m) => m.start + m.dur),
    ...blocks.map((b) => b.start + b.dur),
  );
  const end = axisEnd(latest);

  useLayoutEffect(() => {
    if (originRef.current !== null && gesture && originRef.current !== origin) {
      window.scrollBy(0, (originRef.current - origin) * PX);
    }
    originRef.current = origin;
  }, [origin, gesture]);

  const yOf = (minute: number) => PAD + (minute - origin) * PX;

  function beginDrag(id: string, clientX: number, clientY: number) {
    if (dragLock.current) return;
    const item = timed.find((i) => i.id === id);
    if (!item || !adjusting) return;
    dragLock.current = true;
    const snapshot = blocks.map((b) => ({ ...b }));
    const original = toMinutes(item.start);
    let preview: RailBlock[] | null = null;
    let mode: Gesture["mode"] = "time";
    let latched = false;
    let dx = 0;
    let dy = 0;

    function place(ev: { clientX: number; clientY: number; preventDefault?: () => void }) {
      ev.preventDefault?.();
      dx = ev.clientX - clientX;
      dy = ev.clientY - clientY;
      if (!latched && Math.abs(dx) > SIDEWAYS && Math.abs(dx) > Math.abs(dy)) latched = true;
      const sideways = latched;
      if (sideways) {
        mode = "reorder";
        const el = railRef.current;
        const rect = el?.getBoundingClientRect();
        const originNow = Number(el?.dataset.origin ?? origin);
        const minute = rect ? originNow + (ev.clientY - rect.top - PAD) / PX : original;
        preview = reorderRail(snapshot, id, minute);
      } else {
        mode = "time";
        const delta = Math.round(dy / PX / 10) * 10;
        preview = shiftRail(snapshot, id, original + delta);
      }
      setGesture({ id, mode, dx: sideways ? dx : 0, preview });
    }
    function finish() {
      dragLock.current = false;
      window.removeEventListener("pointermove", place);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("mousemove", place);
      window.removeEventListener("mouseup", finish);
      const result = preview;
      setGesture(null);
      if (!result || Math.hypot(dx, dy) < 6) return;
      const before = new Map(snapshot.filter((b) => !b.fixed).map((b) => [b.id, b.start]));
      const updates = result.flatMap((b) => {
        const was = before.get(b.id);
        if (was === undefined || was === b.start) return [];
        return [{ id: b.id, start: hhmm(b.start) }];
      });
      if (updates.length) onCommit(updates);
    }
    window.addEventListener("pointermove", place, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("mousemove", place);
    window.addEventListener("mouseup", finish);
  }

  function onCardDown(e: React.PointerEvent | React.MouseEvent, id: string) {
    if (!adjusting) return;
    if ("button" in e && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a")) return;
    e.preventDefault();
    beginDrag(id, e.clientX, e.clientY);
  }

  const hours: number[] = [];
  if (adjusting) {
    for (let m = Math.ceil(origin / 60) * 60; m <= end; m += 60) hours.push(m);
  }

  const viewRows = (() => {
    const rows: ({ type: "gap"; key: string; minutes: number } | { type: "mark"; key: string; mark: (typeof marks)[number] })[] = [];
    let prevEnd: number | null = null;
    for (const mark of marks) {
      if (prevEnd !== null && mark.start - prevEnd >= GAP_MIN) {
        rows.push({ type: "gap", key: `gap-${mark.id}`, minutes: mark.start - prevEnd });
      }
      rows.push({ type: "mark", key: mark.id, mark });
      prevEnd = Math.max(prevEnd ?? 0, mark.start + mark.dur);
    }
    return rows;
  })();

  return (
    <div className="space-y-3">
      {marks.length > 0 &&
        (adjusting ? (
          <div
            ref={railRef}
            data-mode="adjust"
            data-origin={origin}
            data-px={PX}
            className="relative select-none"
            style={{ height: PAD * 2 + (end - origin) * PX }}
          >
            <div className="absolute bottom-0 w-px bg-border" style={{ left: POLE_X, top: 0 }} />
            {hours.map((m) => (
              <div
                key={m}
                className="absolute text-[11px] tabular-nums text-muted-foreground"
                style={{ top: yOf(m) - 7, left: 0, width: LABEL_W }}
              >
                {hhmm(m).slice(0, 5)}
              </div>
            ))}
            {marks.map((mark, index) => {
              const top = yOf(mark.start);
              const whisker = mark.dur * PX;
              const color = mark.kind === "task" ? CATEGORY_COLOR[CATEGORY_OF[mark.item.kind]] : mark.pin.color;
              const height = mark.kind === "pin" && mark.pin.point ? 32 : Math.max(52, Math.min(whisker - 4, 120));
              const dragged = gesture?.id === mark.id;
              return (
                <div key={mark.id}>
                  {whisker > 0 && (
                    <div
                      className="absolute w-1 rounded-full"
                      style={{ left: POLE_X - 1.5, top, height: Math.max(whisker, 8), backgroundColor: color, opacity: mark.kind === "pin" ? 0.45 : 0.9 }}
                    />
                  )}
                  <div
                    className="absolute h-px bg-border"
                    style={{ left: POLE_X, width: CARD_X - POLE_X - 4, top: top + 16 }}
                  />
                  <div
                    className={`absolute ${adjusting && mark.kind === "task" ? "touch-none" : ""} ${dragged ? "z-30" : ""}`}
                    style={{
                      top,
                      height,
                      left: CARD_X,
                      right: 4,
                      zIndex: dragged ? 30 : 10 + index,
                      transform: dragged && gesture?.mode === "reorder" ? `translateX(${Math.max(-28, Math.min(gesture.dx, 72))}px)` : undefined,
                    }}
                    onPointerDown={mark.kind === "task" ? (e) => onCardDown(e, mark.id) : undefined}
                    onMouseDown={mark.kind === "task" ? (e) => onCardDown(e, mark.id) : undefined}
                  >
                    {mark.kind === "task" ? (
                      <TaskOnRail
                        item={mark.item}
                        start={mark.start}
                        frac={frac}
                        src={src}
                        blockers={blockers}
                        readOnly={readOnly}
                        future={future}
                        showSlider={height >= 96}
                        showMeta={height >= 84}
                        dragging={dragged}
                        onProgress={onProgress}
                        onEdit={onEdit}
                      />
                    ) : (
                      <PinCard pin={mark.pin} />
                    )}
                  </div>
                </div>
              );
            })}
            {gesture?.mode === "reorder" && (
              <div
                className="absolute z-40 h-0.5 rounded bg-chip"
                style={{ left: POLE_X - 6, width: 36, top: yOf(starts.get(gesture.id) ?? origin) }}
              />
            )}
          </div>
        ) : (
          <div ref={railRef} data-mode="view" className="relative">
            <div className="absolute bottom-1 top-1 w-px bg-border" style={{ left: POLE_X }} />
            <div className="space-y-2">
              {viewRows.map((row) =>
                row.type === "gap" ? (
                  <div key={row.key} className="flex h-7 items-center" style={{ paddingLeft: CARD_X }}>
                    <span className="text-xs text-muted-foreground">空了 {formatMinutes(row.minutes)}</span>
                  </div>
                ) : (
                  <div key={row.key} className="relative" style={{ paddingLeft: CARD_X }}>
                    <span
                      className="absolute top-3 text-[11px] tabular-nums text-muted-foreground"
                      style={{ left: 0, width: LABEL_W }}
                    >
                      {hhmm(row.mark.start).slice(0, 5)}
                    </span>
                    <span className="absolute top-4 h-px bg-border" style={{ left: POLE_X, width: CARD_X - POLE_X - 4 }} />
                    <span
                      className="absolute top-3 size-2 rounded-full border-2 bg-card"
                      style={{
                        left: POLE_X - 3.5,
                        borderColor: row.mark.kind === "task" ? CATEGORY_COLOR[CATEGORY_OF[row.mark.item.kind]] : row.mark.pin.color,
                      }}
                    />
                    {row.mark.kind === "task" ? (
                      <TaskOnRail
                        item={row.mark.item}
                        start={row.mark.start}
                        frac={frac}
                        src={src}
                        blockers={blockers}
                        readOnly={readOnly}
                        future={future}
                        showSlider
                        showMeta
                        onProgress={onProgress}
                        onEdit={onEdit}
                      />
                    ) : (
                      <PinCard pin={row.mark.pin} onCancel={onCancelPin ? () => onCancelPin(row.mark.id) : undefined} />
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        ))}

      {untimed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">還沒排時間</p>
          {untimed.map((item) => (
            <TaskOnRail
              key={item.id}
              item={item}
              start={null}
              frac={frac}
              src={src}
              blockers={blockers}
              readOnly={readOnly}
              future={future}
              showSlider
              showMeta
              onProgress={onProgress}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskOnRail({
  item,
  start,
  frac,
  src,
  blockers,
  readOnly,
  future,
  showSlider,
  showMeta,
  dragging,
  onProgress,
  onEdit,
}: {
  item: PlanItem;
  /** minute of day, or null when the item has no time yet */
  start: number | null;
  frac: (i: PlanItem) => number;
  src: LiveSources;
  blockers?: Map<string, string>;
  readOnly: boolean;
  future: boolean;
  showSlider: boolean;
  showMeta: boolean;
  dragging?: boolean;
  onProgress: (i: PlanItem, pct: number) => void;
  onEdit: (i: PlanItem) => void;
}) {
  return (
    <div className="h-full" data-task={item.title} data-start={start === null ? "" : hhmm(start)}>
      <TaskCard
        item={item}
        startLabel={start === null ? "—" : hhmm(start)}
        endLabel={start === null ? "" : hhmm(start + item.minutes)}
        fraction={frac(item)}
        overall={sourceProgress(item, src)}
        workoutLogged={item.kind === "workout" && !!src.fitness?.sessions.some((s) => s.date === src.date)}
        waitFor={item.kind === "unit" && item.refId ? blockers?.get(item.refId) : undefined}
        readOnly={readOnly}
        future={future}
        showSlider={showSlider}
        showMeta={showMeta}
        dragging={dragging}
        onProgress={(p) => onProgress(item, p)}
        onEdit={() => onEdit(item)}
      />
    </div>
  );
}

function PinCard({ pin, onCancel }: { pin: RailPin; onCancel?: () => void }) {
  return (
    <div
      data-pin={pin.title}
      data-start={pin.start}
      className="flex h-full items-center gap-2 rounded-xl border border-dashed border-border/80 bg-soft/80 px-3 py-1.5 text-sm text-muted-foreground"
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: pin.color }} />
      <span className="min-w-0 flex-1 truncate">
        {pin.prefix}・{pin.title}
      </span>
      <span className="shrink-0 text-xs tabular-nums">
        {pin.point || !pin.end ? pin.start : `${pin.start}–${pin.end}`}
      </span>
      {onCancel && (
        <button
          type="button"
          className="shrink-0 text-xs text-muted-foreground hover:text-ink"
          aria-label={`取消 ${pin.title}`}
          onClick={onCancel}
        >
          取消
        </button>
      )}
    </div>
  );
}

function TaskCard({
  item,
  startLabel,
  endLabel,
  fraction,
  overall,
  workoutLogged,
  waitFor,
  readOnly,
  future,
  showSlider,
  showMeta,
  dragging,
  onProgress,
  onEdit,
}: {
  item: PlanItem;
  startLabel: string;
  endLabel: string;
  fraction: number;
  overall: number | null;
  workoutLogged: boolean;
  waitFor?: string;
  readOnly: boolean;
  future: boolean;
  showSlider: boolean;
  showMeta: boolean;
  dragging?: boolean;
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
  const locked = readOnly || future || !!waitFor || (item.kind === "workout" && workoutLogged);

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

  return (
    <div
      className={`h-full overflow-hidden rounded-xl border bg-card px-2.5 py-1.5 ${
        dragging ? "border-chip shadow-md" : done ? "border-border/50 bg-soft/60" : "border-border/70"
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: color }}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className={`truncate text-sm font-medium ${done ? "text-muted-foreground line-through" : "text-ink"}`}>
                {item.title}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {startLabel}
                {endLabel && endLabel !== startLabel ? `–${endLabel}` : ""}
                {item.detail ? `・${item.detail}` : ""}
                {`・${formatMinutes(item.minutes)}`}
              </p>
            </div>
            {!readOnly && (
              <Button variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground" onClick={onEdit} aria-label={`編輯 ${item.title}`}>
                <Pencil />
              </Button>
            )}
          </div>
          {showSlider && (
            <div className="mt-1 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
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
                    className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-chip"
                    style={{ left: `calc(${target}% - 1px)` }}
                  />
                )}
              </div>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink">{shown}%</span>
            </div>
          )}
          {showMeta && waitFor ? (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="size-3" />
              完成「{waitFor}」後開始
            </p>
          ) : showMeta && isWork ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              整體進度・{future ? "這天目標" : "今天目標"} {target}%{target === 100 ? "（做完）" : ""}
              {fraction >= 1 && " ✓"}
            </p>
          ) : showMeta && item.kind === "workout" ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {workoutLogged ? "已在「運動」記錄今天的訓練 ✓" : "到「運動」完成訓練會自動打勾"}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
