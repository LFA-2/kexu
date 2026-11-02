import { parseISO } from "date-fns";
import { isoWeekday } from "@/lib/dates";
import { sortSchedule, type ScheduleItem } from "@/lib/life";
import type { SchoolState } from "@/lib/types";

/** Merge this weekday's classes into a day's 今明行程. Manual items are kept. */
export function withTimetableClasses(
  date: string,
  items: ScheduleItem[] | undefined,
  school: SchoolState | undefined,
): ScheduleItem[] {
  const list = items ?? [];
  if (!school) return sortSchedule(list);
  const wd = isoWeekday(parseISO(date));
  const slots = (school.timetable ?? []).filter((t) => t.day === wd);
  const course = new Map(school.courses.map((c) => [c.id, c]));
  const manual = list.filter((i) => !i.fromTimetable);
  const prev = new Map(list.filter((i) => i.fromTimetable).map((i) => [i.fromTimetable!, i]));
  const synced: ScheduleItem[] = slots.map((slot) => {
    const name =
      (slot.courseId && course.get(slot.courseId)?.name) || slot.title.trim() || "上課";
    const label = slot.location.trim() ? `${name}（${slot.location.trim()}）` : name;
    const old = prev.get(slot.id);
    return {
      id: old?.id ?? `tt:${slot.id}`,
      kind: "span",
      label,
      start: slot.start,
      end: slot.end,
      fromTimetable: slot.id,
    };
  });
  return sortSchedule([...manual, ...synced]);
}

export function scheduleNeedsSync(before: ScheduleItem[] | undefined, after: ScheduleItem[]) {
  const a = before ?? [];
  if (a.length !== after.length) return true;
  return after.some((x, i) => {
    const y = a[i];
    return (
      !y ||
      x.id !== y.id ||
      x.label !== y.label ||
      x.start !== y.start ||
      x.end !== y.end ||
      x.fromTimetable !== y.fromTimetable ||
      x.kind !== y.kind
    );
  });
}
