import {
  addDays,
  format,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import { zhTW } from "date-fns/locale";

export function toDateKey(date: Date | string) {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "yyyy-MM-dd");
}

export function formatShortDate(dateKey: string) {
  return format(parseISO(dateKey), "M/d（EEE）", { locale: zhTW });
}

export function relativeStatus(dateKey: string, done: boolean) {
  if (done) return "done" as const;
  const d = startOfDay(parseISO(dateKey));
  const today = startOfDay(new Date());
  if (isBefore(d, today)) return "overdue" as const;
  if (isSameDay(d, today)) return "today" as const;
  if (isSameDay(d, addDays(today, 1))) return "tomorrow" as const;
  return "upcoming" as const;
}
