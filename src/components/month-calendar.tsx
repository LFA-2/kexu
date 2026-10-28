"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { toDateKey } from "@/lib/dates";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function MonthCalendar({
  colorsByDate,
  selected,
  highlighted,
  onDayClick,
  isDayDisabled,
}: {
  /** dateKey (yyyy-MM-dd) → dot colors for that day */
  colorsByDate?: Map<string, string[]>;
  /** dateKey → fill color for picked days */
  selected?: Map<string, string>;
  /** dateKeys to mark prominently */
  highlighted?: Set<string>;
  onDayClick?: (dateKey: string) => void;
  isDayDisabled?: (dateKey: string) => boolean;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  return (
    <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg text-ink">
          {format(cursor, "yyyy年 M月", { locale: zhTW })}
        </h3>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCursor((d) => subMonths(d, 1))}
            aria-label="上個月"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(startOfMonth(new Date()))}
          >
            今天
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCursor((d) => addMonths(d, 1))}
            aria-label="下個月"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = toDateKey(day);
          const colors = colorsByDate?.get(key) ?? [];
          const fill = selected?.get(key);
          const marked = highlighted?.has(key) ?? false;
          const inMonth = isSameMonth(day, cursor);
          const today = isToday(day);
          const clickable = !!onDayClick && !(isDayDisabled?.(key) ?? false);

          const background = fill
            ? ""
            : marked
              ? "bg-amber-100"
              : today
                ? "bg-teal-50"
                : inMonth
                  ? "bg-slate-50/80"
                  : "bg-transparent";
          const ring = today
            ? "ring-2 ring-teal-700 ring-inset"
            : marked
              ? "ring-2 ring-amber-500 ring-inset"
              : "";

          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={() => onDayClick?.(key)}
              aria-pressed={selected ? !!fill : undefined}
              aria-label={format(day, "M月d日", { locale: zhTW })}
              className={`relative flex min-h-14 flex-col items-center rounded-xl px-1 py-1.5 transition-colors disabled:cursor-default sm:min-h-16 ${background} ${ring} ${
                inMonth ? "" : "opacity-40"
              } ${clickable && !fill ? "hover:bg-slate-100" : ""}`}
              style={fill ? { backgroundColor: fill } : undefined}
            >
              <span
                className={`text-xs tabular-nums sm:text-sm ${
                  fill
                    ? "font-semibold text-white"
                    : today
                      ? "font-semibold text-teal-800"
                      : "text-ink"
                }`}
              >
                {format(day, "d")}
              </span>
              {today && (
                <span
                  className={`mt-0.5 text-[9px] font-medium tracking-wide ${
                    fill ? "text-white" : "text-teal-700"
                  }`}
                >
                  TODAY
                </span>
              )}
              {marked && !today && (
                <span className="mt-0.5 text-[9px] font-medium text-amber-800">都有空</span>
              )}
              {colors.length > 0 && (
                <div className="mt-auto flex w-full flex-wrap justify-center gap-0.5 pb-0.5 pt-1">
                  {colors.slice(0, 4).map((color) => (
                    <span
                      key={`${key}-${color}`}
                      className="size-2 rounded-full sm:size-2.5"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  {colors.length > 4 && (
                    <span className="text-[9px] text-muted-foreground">
                      +{colors.length - 4}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
