"use client";

import { useRef, useState } from "react";
import { toMinutes, type PlanItem } from "@/lib/life";
import { CATEGORY_OF } from "@/lib/planner";
import { hhmm } from "@/lib/reflow";
import { formatMinutes } from "@/lib/types";
import { SERIES } from "@/components/charts";
import { CalendarArrowUp, GripVertical, Lock, Pin, Plus, Rows3 } from "lucide-react";

export const CATEGORY_COLOR = {
  school: SERIES[0],
  chores: SERIES[1],
  workout: SERIES[2],
  todo: SERIES[3],
  other: SERIES[4],
} as const;

/** Columns of the compact list: hour label, the thin pole, then the cards. */
const AXIS = { label: 22, pole: 30, card: 44 };
const GAP_MIN = 40;

export type RailPin = {
  id: string;
  start: string;
  end?: string;
  title: string;
  prefix: string;
  color: string;
  point?: boolean;
};

const hourOnly = (min: number) => String(Math.floor(Math.max(0, Math.round(min)) / 60) % 24);

function spanMinutes(start: string, end?: string) {
  const a = toMinutes(start);
  if (!end) return 0;
  let b = toMinutes(end);
  if (b <= a) b += 24 * 60;
  return b - a;
}

type Mark =
  | { kind: "task"; id: string; item: PlanItem; start: number | null; dur: number }
  | { kind: "pin"; id: string; pin: RailPin; start: number; dur: number };

/**
 * Today's list: compact rows in time order. Movable rows always have a drag handle
 * (arrow keys work on it too); the order decides the times, which the parent works out.
 * Items that got no time are listed at the end as 排不下.
 */
export function DayRail({
  items,
  pins,
  canMove,
  readOnly,
  frac,
  blockers,
  dayEnd,
  now,
  order,
  preview,
  gapActions,
  flashId,
  onReorder,
  onOpen,
  onCancelPin,
  onFillGaps,
  onAddAt,
  onMoveAllTomorrow,
}: {
  items: PlanItem[];
  pins: RailPin[];
  /** Order can be changed (today and earlier days the user owns). */
  canMove: boolean;
  readOnly: boolean;
  frac: (i: PlanItem) => number;
  blockers?: Map<string, string>;
  dayEnd: number;
  /** minute of day, only for today */
  now: number | null;
  /** ids of the items that can move, in their current order */
  order: string[];
  /** times the movable items would get in a given order */
  preview: (order: string[]) => Map<string, number>;
  gapActions: boolean;
  flashId: string | null;
  /** `moved` is the item the user dragged or moved with the keys. */
  onReorder: (order: string[], moved: string) => void;
  onOpen: (i: PlanItem) => void;
  onCancelPin?: (id: string) => void;
  onFillGaps?: () => void;
  onAddAt?: (start: string) => void;
  /** Send every unfinished item that didn't fit to tomorrow. */
  onMoveAllTomorrow?: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const [openGap, setOpenGap] = useState<string | null>(null);

  const current = drag?.order ?? order;
  const times = drag ? preview(drag.order) : null;
  const movable = new Set(order);
  const rank = new Map(current.map((id, k) => [id, k]));

  const marks: Mark[] = [
    ...items.map((item) => {
      // While dragging, movable items take the previewed time; none means it won't fit.
      const start =
        times && movable.has(item.id)
          ? (times.get(item.id) ?? null)
          : item.start
            ? toMinutes(item.start)
            : null;
      return {
        kind: "task" as const,
        id: item.id,
        item,
        start,
        dur: Math.max(5, item.minutes),
      };
    }),
    ...pins.map((pin) => ({
      kind: "pin" as const,
      id: pin.id,
      pin,
      start: toMinutes(pin.start),
      dur: pin.point ? 0 : spanMinutes(pin.start, pin.end),
    })),
  ].sort((a, b) => {
    if (a.start === null || b.start === null) {
      if (a.start === null && b.start === null) return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
      return a.start === null ? 1 : -1;
    }
    return (
      a.start - b.start ||
      (a.kind === b.kind ? 0 : a.kind === "pin" ? -1 : 1) ||
      (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
    );
  });

  type Row = { type: "gap"; key: string; from: number; minutes: number } | { type: "mark"; key: string; mark: Mark };
  const rows: Row[] = [];
  let prevEnd: number | null = null;
  for (const mark of marks) {
    if (mark.start !== null && prevEnd !== null && mark.start - prevEnd >= GAP_MIN) {
      rows.push({ type: "gap", key: `gap-${mark.id}`, from: prevEnd, minutes: mark.start - prevEnd });
    }
    rows.push({ type: "mark", key: mark.id, mark });
    if (mark.start !== null) prevEnd = Math.max(prevEnd ?? 0, mark.start + mark.dur);
  }
  const firstUntimed = rows.findIndex((r) => r.type === "mark" && r.mark.start === null);
  const untimedOpen = items.filter((i) => !i.start && frac(i) < 1).length;

  function move(id: string, d: number) {
    const k = order.indexOf(id);
    const j = k + d;
    if (k < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[k], next[j]] = [next[j], next[k]];
    onReorder(next, id);
  }

  function beginDrag(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    let latest = order;
    setDrag({ id, order });
    function place(ev: PointerEvent) {
      ev.preventDefault();
      const nodes = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-movable]") ?? [])];
      const others = latest.filter((x) => x !== id);
      const above = others.filter((x) => {
        const el = nodes.find((n) => n.dataset.movable === x);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 < ev.clientY;
      }).length;
      const next = [...others.slice(0, above), id, ...others.slice(above)];
      if (next.join() !== latest.join()) {
        latest = next;
        setDrag({ id, order: next });
      }
      if (ev.clientY < 70) window.scrollBy(0, -12);
      else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 12);
    }
    function finish() {
      window.removeEventListener("pointermove", place);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setDrag(null);
      if (latest.join() !== order.join()) onReorder(latest, id);
    }
    window.addEventListener("pointermove", place, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  return (
    <div ref={listRef} className="relative">
      <div className="absolute bottom-1 top-1 w-px bg-border" style={{ left: AXIS.pole }} />
      <div className="space-y-2">
        {rows.map((row, index) => {
          if (row.type === "gap") {
            const active = gapActions && (now === null || row.from + row.minutes > now);
            const open = active && openGap === row.key;
            return (
              <div key={row.key} style={{ paddingLeft: AXIS.card }}>
                {active ? (
                  <button
                    type="button"
                    onClick={() => setOpenGap(open ? null : row.key)}
                    className="flex h-7 items-center gap-1 text-xs text-muted-foreground hover:text-ink"
                    aria-expanded={open}
                  >
                    空了 {formatMinutes(row.minutes)}
                    <span className="underline-offset-2 hover:underline">・用這段空檔</span>
                  </button>
                ) : (
                  <p className="flex h-7 items-center text-xs text-muted-foreground">空了 {formatMinutes(row.minutes)}</p>
                )}
                {open && (
                  <div className="mb-1 flex flex-wrap gap-2">
                    {onFillGaps && (
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-full border border-border/80 bg-card px-3 py-1 text-xs text-ink hover:bg-soft"
                        onClick={() => {
                          setOpenGap(null);
                          onFillGaps();
                        }}
                      >
                        <Rows3 className="size-3.5" />
                        把後面的事往前補
                      </button>
                    )}
                    {onAddAt && (
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-full border border-border/80 bg-card px-3 py-1 text-xs text-ink hover:bg-soft"
                        onClick={() => {
                          setOpenGap(null);
                          onAddAt(hhmm(Math.max(row.from, now ?? 0)));
                        }}
                      >
                        <Plus className="size-3.5" />
                        在 {hhmm(Math.ceil(Math.max(row.from, now ?? 0) / 5) * 5)} 新增
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }
          const mark = row.mark;
          const color = mark.kind === "task" ? CATEGORY_COLOR[CATEGORY_OF[mark.item.kind]] : mark.pin.color;
          return (
            <div key={row.key}>
              {index === firstUntimed && (
                <div
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2 pt-1"
                  style={{ paddingLeft: AXIS.card }}
                >
                  <p className="text-xs text-muted-foreground">
                    {untimedOpen > 0 ? "今天排不下・可以拖到前面、縮短時間，或移到明天" : "沒有排時間"}
                  </p>
                  {onMoveAllTomorrow && untimedOpen > 0 && !drag && (
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-full border border-border/80 bg-card px-3 py-1 text-xs text-ink hover:bg-soft"
                      onClick={onMoveAllTomorrow}
                    >
                      <CalendarArrowUp className="size-3.5" />
                      全部移到明天
                    </button>
                  )}
                </div>
              )}
              <div className="relative" style={{ paddingLeft: AXIS.card }}>
                {mark.start !== null && (
                  <span
                    data-hour={hourOnly(mark.start)}
                    className="absolute top-3 text-right text-[11px] tabular-nums text-muted-foreground"
                    style={{ left: 0, width: AXIS.label }}
                  >
                    {hourOnly(mark.start)}
                  </span>
                )}
                <span className="absolute top-4 h-px bg-border" style={{ left: AXIS.pole, width: AXIS.card - AXIS.pole - 4 }} />
                <span
                  className="absolute top-3 size-2 rounded-full border-2 bg-card"
                  style={{ left: AXIS.pole - 3.5, borderColor: color }}
                />
                {mark.kind === "task" ? (
                  <TaskRow
                    item={mark.item}
                    start={mark.start}
                    color={color}
                    fraction={frac(mark.item)}
                    waitFor={mark.item.kind === "unit" && mark.item.refId ? blockers?.get(mark.item.refId) : undefined}
                    over={mark.start !== null && mark.start + mark.item.minutes > dayEnd ? hhmm(dayEnd) : null}
                    past={
                      now !== null &&
                      mark.start !== null &&
                      !mark.item.pinned &&
                      mark.start + mark.item.minutes <= now &&
                      frac(mark.item) < 1
                    }
                    draggable={canMove && !readOnly && movable.has(mark.id)}
                    dragging={drag?.id === mark.id}
                    flash={flashId === mark.id}
                    onOpen={() => onOpen(mark.item)}
                    onUp={() => move(mark.id, -1)}
                    onDown={() => move(mark.id, 1)}
                    onGrab={(e) => beginDrag(e, mark.id)}
                  />
                ) : (
                  <PinCard pin={mark.pin} onCancel={!drag && onCancelPin ? () => onCancelPin(mark.id) : undefined} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskRow({
  item,
  start,
  color,
  fraction,
  waitFor,
  over,
  past,
  draggable,
  dragging,
  flash,
  onOpen,
  onUp,
  onDown,
  onGrab,
}: {
  item: PlanItem;
  start: number | null;
  color: string;
  fraction: number;
  waitFor?: string;
  over: string | null;
  /** Its time is over and it isn't done (and not fixed). */
  past: boolean;
  draggable: boolean;
  dragging: boolean;
  flash: boolean;
  onOpen: () => void;
  onUp: () => void;
  onDown: () => void;
  onGrab: (e: React.PointerEvent) => void;
}) {
  const done = fraction >= 1;
  const pct = Math.round(Math.min(1, fraction) * 100);
  const range = start === null ? "" : `${hhmm(start)}–${hhmm(start + item.minutes)}`;
  const fill =
    pct > 0
      ? `linear-gradient(to right, color-mix(in srgb, ${color} 32%, var(--card)) ${pct}%, transparent ${pct}%)`
      : undefined;
  const border = dragging
    ? "border-chip shadow-md"
    : over || past
      ? "border-amber-400"
      : flash
        ? "border-chip ring-2 ring-chip/40"
        : done
          ? "border-border/50"
          : "border-border/70";

  return (
    <div
      data-task={item.title}
      data-task-id={item.id}
      data-start={start === null ? "" : hhmm(start)}
      {...(draggable ? { "data-movable": item.id } : {})}
      className={`flex items-stretch overflow-hidden rounded-xl border bg-card transition-shadow ${border}`}
      style={{ backgroundImage: fill }}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 px-2.5 py-2 text-left">
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm font-medium ${done ? "text-muted-foreground line-through" : "text-ink"}`}>
            {item.title}
          </span>
          {item.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="固定時間" />}
          {waitFor && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label={`等「${waitFor}」`} />}
          <span className={`shrink-0 text-xs tabular-nums ${past ? "text-amber-700" : "text-muted-foreground"}`}>
            {range || formatMinutes(item.minutes)}
          </span>
        </span>
        {(over || past) && (
          <span className="mt-0.5 block truncate text-[11px] text-amber-700">
            {past ? "已經過了時間" : `超過 ${over}`}
          </span>
        )}
      </button>
      {draggable && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`拖曳 ${item.title}，或用上下鍵換順序`}
          onPointerDown={onGrab}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onUp();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onDown();
            }
          }}
          className="flex w-10 shrink-0 cursor-grab touch-none items-center justify-center border-l border-border/60 text-muted-foreground hover:text-ink focus-visible:text-ink active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </span>
      )}
    </div>
  );
}

function PinCard({ pin, onCancel }: { pin: RailPin; onCancel?: () => void }) {
  return (
    <div
      data-pin={pin.title}
      data-start={pin.start}
      className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 bg-soft/80 px-3 py-1.5 text-sm text-muted-foreground"
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
