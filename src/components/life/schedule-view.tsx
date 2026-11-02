"use client";

import { useEffect, useState, type FormEvent } from "react";
import { addDays } from "date-fns";
import { DayTimeline, timelineRange } from "@/components/day-timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeField, parseTime } from "@/components/time-field";
import { formatShortDate, toDateKey } from "@/lib/dates";
import { POINT_PRESETS, SPAN_PRESETS, sortSchedule, type ScheduleItem } from "@/lib/life";
import { useLife } from "@/store/life-store";
import { useSchool } from "@/store/school-store";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

type Kind = ScheduleItem["kind"];

export function ScheduleView({ color, onBack }: { color: string; onBack: () => void }) {
  const { schedule, readOnly, loaded, addScheduleItem, removeScheduleItem, syncTimetableDays } = useLife();
  const school = useSchool();
  const today = toDateKey(new Date());
  const tomorrow = toDateKey(addDays(new Date(), 1));
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const date = day === "today" ? today : tomorrow;
  const items = sortSchedule(schedule?.[date] ?? []);

  useEffect(() => {
    if (readOnly || !loaded || !school.loaded) return;
    syncTimetableDays([today, tomorrow], school);
    // school itself is passed so class names/times stay current
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when timetable or courses change
  }, [readOnly, loaded, school.loaded, school.timetable, school.courses, today, tomorrow, syncTimetableDays]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回生活
      </Button>

      <header>
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "今天和明天的主要行程"
            : "課表會自動匯入。也可以記起床、出門、開會這類時間"}
        </p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">
          今明行程
        </h2>
      </header>

      <div className="flex w-fit rounded-xl border border-border/80 bg-card p-1 shadow-sm">
        {(["today", "tomorrow"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              day === d ? "bg-chip text-chip-foreground shadow-sm" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {d === "today" ? "今天" : "明天"}
            <span className="ml-1.5 text-xs opacity-70">
              {formatShortDate(d === "today" ? today : tomorrow)}
            </span>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
        {items.length === 0 ? (
          <p className="mb-3 text-sm text-muted-foreground">還沒有行程</p>
        ) : null}
        <DayTimeline items={items} color={color} range={timelineRange([items])} />
      </section>

      {!readOnly && (
        <AddForm key={date} onAdd={(item) => addScheduleItem(date, item)} />
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
            >
              <span
                className={`shrink-0 ${item.kind === "span" ? "h-2.5 w-5 rounded-full" : "size-3 rounded-full border-[3px] bg-card"}`}
                style={
                  item.kind === "span" ? { backgroundColor: color } : { borderColor: color }
                }
              />
              <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">
                {item.kind === "span" ? `${item.start}–${item.end}` : item.start}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {item.label}
                {item.fromTimetable && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">課表</span>
                )}
              </span>
              {!readOnly && !item.fromTimetable && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  onClick={() => removeScheduleItem(date, item.id)}
                  aria-label={`刪除${item.label}`}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddForm({ onAdd }: { onAdd: (item: Omit<ScheduleItem, "id">) => void }) {
  const [kind, setKind] = useState<Kind>("point");
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const presets = kind === "point" ? POINT_PRESETS : SPAN_PRESETS;
  const startOk = parseTime(start);
  const endOk = kind === "point" ? "" : parseTime(end);
  const valid = !!label.trim() && !!startOk && (kind === "point" || (!!endOk && endOk !== startOk));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !startOk) return;
    onAdd(
      kind === "point"
        ? { kind, label, start: startOk }
        : { kind, label, start: startOk, end: endOk! },
    );
    setLabel("");
    setStart("");
    setEnd("");
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg text-ink">新增</h3>
        <div className="flex rounded-lg border border-border/80 p-0.5">
          {(["point", "span"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                kind === k ? "bg-chip text-chip-foreground" : "text-muted-foreground hover:text-ink"
              }`}
            >
              {k === "point" ? "時間點" : "時間段"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="plan-label">內容</Label>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setLabel(p)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                label === p
                  ? "border-chip bg-chip text-chip-foreground"
                  : "border-border/80 text-muted-foreground hover:text-ink"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <Input
          id="plan-label"
          placeholder={kind === "point" ? "或自己輸入，例如：吃藥" : "或自己輸入，例如：社團"}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="plan-start">{kind === "point" ? "時間" : "開始"}</Label>
          <TimeField id="plan-start" value={start} onChange={setStart} />
        </div>
        {kind === "span" && (
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="plan-end">結束</Label>
            <TimeField id="plan-end" value={end} onChange={setEnd} />
          </div>
        )}
      </div>

      {kind === "span" && (
        <p className="text-xs text-muted-foreground">結束時間比開始早，代表跨過午夜。</p>
      )}

      <Button type="submit" disabled={!valid} className="w-full gap-1.5 sm:w-auto">
        <Plus data-icon="inline-start" />
        新增
      </Button>
    </form>
  );
}
