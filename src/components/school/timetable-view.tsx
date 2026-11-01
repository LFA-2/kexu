"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoWeekday, WEEKDAYS } from "@/lib/dates";
import { toMinutes } from "@/lib/life";
import { COURSE_COLORS, type TimetableSlot } from "@/lib/types";
import { useSchool } from "@/store/school-store";
import { MapPin, Plus, Trash2 } from "lucide-react";

const FALLBACK_COLOR = "#64748b";

export function TimetableView() {
  const { timetable = [], courses, readOnly } = useSchool();
  const [editing, setEditing] = useState<TimetableSlot | "new" | null>(null);
  const today = isoWeekday(new Date());

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const showWeekend = timetable.some((t) => t.day >= 6);
  const days = showWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];

  const { startHour, endHour } = useMemo(() => {
    if (timetable.length === 0) return { startHour: 8, endHour: 18 };
    const starts = timetable.map((t) => toMinutes(t.start));
    const ends = timetable.map((t) => toMinutes(t.end));
    return {
      startHour: Math.min(8, Math.floor(Math.min(...starts) / 60)),
      endHour: Math.max(17, Math.ceil(Math.max(...ends) / 60)),
    };
  }, [timetable]);

  const slotInfo = (t: TimetableSlot) => {
    const course = t.courseId ? courseMap.get(t.courseId) : undefined;
    return { name: course?.name ?? t.title ?? "未命名", color: course?.color ?? FALLBACK_COLOR };
  };

  const totalMinutes = timetable.reduce(
    (a, t) => a + Math.max(0, toMinutes(t.end) - toMinutes(t.start)),
    0,
  );

  const HOUR_PX = 56;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            每週固定的上課時間，「今日」會避開這些時段排讀書
          </p>
          <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">課表</h2>
          {timetable.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              每週 {timetable.length} 堂・共 {Math.round((totalMinutes / 60) * 10) / 10} 小時
            </p>
          )}
        </div>
        {!readOnly && (
          <Button className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus data-icon="inline-start" />
            新增上課時段
          </Button>
        )}
      </header>

      {timetable.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-16 text-center">
          <p className="font-display text-xl text-ink">還沒有課表</p>
          {!readOnly && (
            <p className="mt-2 text-sm text-muted-foreground">
              按「新增上課時段」，選星期、時間與課程。可以一次勾選多天。
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Phone: the whole week as a list, one section per day */}
          <div className="space-y-4 sm:hidden">
            {days.map((d) => {
              const slots = timetable
                .filter((t) => t.day === d)
                .sort((a, b) => a.start.localeCompare(b.start));
              return (
                <section key={d}>
                  <h3 className={`mb-1.5 text-sm ${d === today ? "font-medium text-ink" : "text-muted-foreground"}`}>
                    星期{WEEKDAYS[d - 1]}
                    {d === today && <span className="ml-1.5 text-xs text-teal-800">今天</span>}
                  </h3>
                  {slots.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border/70 bg-white px-3 py-2.5 text-sm text-muted-foreground">
                      沒有課
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {slots.map((t) => {
                        const { name, color } = slotInfo(t);
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              disabled={readOnly}
                              onClick={() => setEditing(t)}
                              className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-white px-3 py-3 text-left disabled:cursor-default"
                            >
                              <span className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                              <span className="w-24 shrink-0 text-sm tabular-nums text-ink">
                                {t.start}–{t.end}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-ink">{name}</span>
                                {t.location && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="size-3" />
                                    {t.location}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-border/70 bg-white sm:block">
            <div
              className="grid border-b border-border/70 text-center text-sm text-muted-foreground"
              style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <span />
              {days.map((d) => (
                <span
                  key={d}
                  className={`py-2 ${d === today ? "font-medium text-ink" : ""}`}
                >
                  星期{WEEKDAYS[d - 1]}
                </span>
              ))}
            </div>
            <div
              className="relative grid"
              style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <div>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="relative border-b border-border/40 text-right text-[11px] text-muted-foreground"
                    style={{ height: HOUR_PX }}
                  >
                    <span className="absolute right-1.5 top-0.5 tabular-nums">{h}:00</span>
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div key={d} className="relative border-l border-border/40">
                  {hours.map((h) => (
                    <div key={h} className="border-b border-border/40" style={{ height: HOUR_PX }} />
                  ))}
                  {timetable
                    .filter((t) => t.day === d)
                    .map((t) => {
                      const { name, color } = slotInfo(t);
                      const top = ((toMinutes(t.start) - startHour * 60) / 60) * HOUR_PX;
                      const height = Math.max(
                        20,
                        ((toMinutes(t.end) - toMinutes(t.start)) / 60) * HOUR_PX - 2,
                      );
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={readOnly}
                          onClick={() => setEditing(t)}
                          className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-left text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-default"
                          style={{ top: top + 1, height, backgroundColor: color }}
                        >
                          <span className="block truncate text-xs font-medium">{name}</span>
                          <span className="block truncate text-[10px] opacity-85">
                            {t.start}–{t.end}
                            {t.location ? ` · ${t.location}` : ""}
                          </span>
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {editing && (
        <SlotDialog
          slot={editing === "new" ? null : editing}
          defaultDay={today}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SlotDialog({
  slot,
  defaultDay,
  onClose,
}: {
  slot: TimetableSlot | null;
  defaultDay: number;
  onClose: () => void;
}) {
  const { courses, addCourse, addTimetableSlot, updateTimetableSlot, removeTimetableSlot } =
    useSchool();
  const [days, setDays] = useState<number[]>(slot ? [slot.day] : [defaultDay]);
  const [start, setStart] = useState(slot?.start ?? "09:10");
  const [end, setEnd] = useState(slot?.end ?? "12:10");
  const [courseId, setCourseId] = useState<string | "new" | "">(
    slot ? (slot.courseId ?? "") : (courses[0]?.id ?? "new"),
  );
  const [newName, setNewName] = useState("");
  const [title, setTitle] = useState(slot?.title ?? "");
  const [location, setLocation] = useState(slot?.location ?? "");

  const timeOk = start && end && toMinutes(end) > toMinutes(start);
  const nameOk = courseId === "new" ? newName.trim() : courseId ? true : title.trim();
  const valid = days.length > 0 && timeOk && nameOk;

  function submit() {
    if (!valid) return;
    let cid: string | null = courseId || null;
    if (courseId === "new") {
      const used = new Set(courses.map((c) => c.color));
      const color = COURSE_COLORS.find((c) => !used.has(c.value))?.value ?? COURSE_COLORS[0].value;
      cid = addCourse(newName.trim(), color);
    }
    const fields = {
      start,
      end,
      courseId: cid,
      title: cid ? "" : title.trim(),
      location: location.trim().slice(0, 40),
    };
    if (slot) {
      updateTimetableSlot(slot.id, { ...fields, day: days[0] });
      for (const d of days.slice(1)) addTimetableSlot({ ...fields, day: d });
    } else {
      for (const d of days) addTimetableSlot({ ...fields, day: d });
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{slot ? "編輯上課時段" : "新增上課時段"}</DialogTitle>
          <DialogDescription>同一門課一週上好幾次時，可以一次勾選多天。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>星期</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDays((ds) => (on ? ds.filter((x) => x !== d) : [...ds, d].sort()))
                    }
                    className={`flex-1 rounded-lg border py-1.5 text-sm transition-colors ${
                      on ? "border-ink bg-ink text-white" : "border-border bg-white text-muted-foreground"
                    }`}
                    aria-pressed={on}
                  >
                    {WEEKDAYS[d - 1]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="tt-start">開始</Label>
              <Input id="tt-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tt-end">結束</Label>
              <Input id="tt-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {!timeOk && start && end && (
            <p className="-mt-2 text-xs text-destructive">結束時間要晚於開始時間</p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="tt-course">課程</Label>
            <select
              id="tt-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="h-9 rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="new">＋ 新增一門課…</option>
              <option value="">其他（不連到課程）</option>
            </select>
            {courseId === "new" && (
              <Input
                placeholder="新課程名稱，例如：計算理論"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={40}
                autoFocus
              />
            )}
            {courseId === "" && (
              <Input
                placeholder="名稱，例如：系週會"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={40}
              />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tt-loc">教室（選填）</Label>
            <Input
              id="tt-loc"
              placeholder="例如：德田館 103"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={40}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {slot ? (
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                removeTimetableSlot(slot.id);
                onClose();
              }}
            >
              <Trash2 className="size-3.5" />
              刪除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={submit} disabled={!valid}>
              {slot ? "儲存" : "新增"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
