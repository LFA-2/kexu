"use client";

import { useMemo, type ReactNode } from "react";
import { addDays, parseISO } from "date-fns";
import { DayTimeline, timelineRange } from "@/components/day-timeline";
import { MonthCalendar } from "@/components/month-calendar";
import { formatShortDate, toDateKey } from "@/lib/dates";
import { METRICS, sortSchedule } from "@/lib/life";
import { usePeopleData, type PersonData } from "@/store/people-data";

export type Person = { userId: string; name: string; color: string; isMe: boolean };

type AgendaItem = {
  id: string;
  person: Person;
  date: string;
  time: string;
  title: string;
  kind: "待辦" | "作業" | "考試";
  detail: string;
};

export function SharedView({ people }: { people: Person[] }) {
  const { data, loaded } = usePeopleData(people.map((p) => p.userId));
  const today = toDateKey(new Date());

  if (!loaded) {
    return <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>;
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">你和連結的人今天的狀況</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">共同</h2>
      </header>

      <Section title="今天的狀態">
        <div className="grid gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <TodayMetrics key={p.userId} person={p} data={data[p.userId]} today={today} />
          ))}
        </div>
      </Section>

      <Section title="今明行程">
        <div className="space-y-3">
          <DayPlans label="今天" date={today} people={people} data={data} />
          <DayPlans
            label="明天"
            date={toDateKey(addDays(parseISO(today), 1))}
            people={people}
            data={data}
          />
        </div>
      </Section>

      <Section title="可約會日期">
        <AvailabilityCalendar people={people} data={data} />
      </Section>

      <Section title="今日須知">
        <div className="space-y-2">
          {[...people.filter((p) => !p.isMe), ...people.filter((p) => p.isMe)].map((p) => {
            const note = data[p.userId]?.life?.notes[today];
            return (
              <div
                key={p.userId}
                className="rounded-2xl border border-border/70 bg-white p-4"
                style={{ borderLeft: `4px solid ${p.color}` }}
              >
                <PersonLabel person={p} />
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {note || <span className="text-muted-foreground">今天沒有留言</span>}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="行程總覽" hint="待做事項、作業與考試，依日期排列">
        <Agenda people={people} data={data} today={today} />
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="font-display text-xl text-ink">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function PersonLabel({ person }: { person: Person }) {
  return (
    <span className="flex items-center gap-2 text-sm font-medium text-ink">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: person.color }} />
      {person.isMe ? `${person.name}（我）` : person.name}
    </span>
  );
}

function DayPlans({
  label,
  date,
  people,
  data,
}: {
  label: string;
  date: string;
  people: Person[];
  data: Record<string, PersonData>;
}) {
  const plans = people.map((p) => sortSchedule(data[p.userId]?.life?.schedule?.[date] ?? []));
  const range = timelineRange(plans);

  return (
    <div className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
      <h4 className="mb-3 text-sm font-medium text-ink">
        {label}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          {formatShortDate(date)}
        </span>
      </h4>
      <div className="space-y-4">
        {people.map((p, i) => (
          <div key={p.userId}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <PersonLabel person={p} />
              {plans[i].length === 0 && (
                <span className="text-xs text-muted-foreground">還沒填</span>
              )}
            </div>
            <DayTimeline items={plans[i]} color={p.color} range={range} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TodayMetrics({
  person,
  data,
  today,
}: {
  person: Person;
  data: PersonData | undefined;
  today: string;
}) {
  const day = data?.life?.metrics[today] ?? {};
  return (
    <div className="rounded-2xl border border-border/70 bg-white p-4">
      <PersonLabel person={person} />
      <div className="mt-3 space-y-2">
        {METRICS.map((m) => {
          const value = day[m.key];
          return (
            <div key={m.key} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">{m.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                {value !== undefined && (
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${value * 10}%`, backgroundColor: m.color }}
                  />
                )}
              </div>
              <span className="w-8 text-right tabular-nums text-ink">
                {value ?? <span className="text-xs text-muted-foreground">未填</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AvailabilityCalendar({
  people,
  data,
}: {
  people: Person[];
  data: Record<string, PersonData>;
}) {
  const { dots, together } = useMemo(() => {
    const dots = new Map<string, string[]>();
    for (const p of people) {
      for (const date of data[p.userId]?.life?.available ?? []) {
        dots.set(date, [...(dots.get(date) ?? []), p.color]);
      }
    }
    const together = new Set([...dots].filter(([, c]) => c.length >= 2).map(([d]) => d));
    return { dots, together };
  }, [people, data]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {people.map((p) => (
          <PersonLabel key={p.userId} person={p} />
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-amber-100 ring-2 ring-amber-500 ring-inset" />
          {people.length === 2 ? "兩人都有空" : "至少兩人有空"}
        </span>
      </div>
      <MonthCalendar colorsByDate={dots} highlighted={together} />
    </div>
  );
}

function Agenda({
  people,
  data,
  today,
}: {
  people: Person[];
  data: Record<string, PersonData>;
  today: string;
}) {
  const groups = useMemo(() => {
    const items: AgendaItem[] = [];
    for (const person of people) {
      const school = data[person.userId]?.school;
      const life = data[person.userId]?.life;
      const courseName = new Map(school?.courses.map((c) => [c.id, c.name]) ?? []);
      for (const h of school?.homework ?? []) {
        if (h.done) continue;
        items.push({
          id: h.id,
          person,
          date: h.dueDate,
          time: "",
          title: h.title,
          kind: "作業",
          detail: courseName.get(h.courseId) ?? "",
        });
      }
      for (const e of school?.exams ?? []) {
        if (e.done) continue;
        items.push({
          id: e.id,
          person,
          date: e.date,
          time: "",
          title: e.title,
          kind: "考試",
          detail: courseName.get(e.courseId) ?? "",
        });
      }
      for (const t of life?.todos ?? []) {
        if (t.done) continue;
        items.push({
          id: t.id,
          person,
          date: t.date,
          time: t.time,
          title: t.title,
          kind: "待辦",
          detail: "",
        });
      }
    }
    const order = new Map(people.map((p, i) => [p.userId, i]));
    items.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time || "99").localeCompare(b.time || "99") ||
        order.get(a.person.userId)! - order.get(b.person.userId)!,
    );

    const result: { key: string; label: string; overdue: boolean; items: AgendaItem[] }[] = [];
    const overdue = items.filter((i) => i.date < today);
    if (overdue.length) result.push({ key: "overdue", label: "已過期", overdue: true, items: overdue });
    const tomorrow = toDateKey(addDays(parseISO(today), 1));
    for (const item of items.filter((i) => i.date >= today)) {
      let group = result[result.length - 1];
      if (!group || group.key !== item.date) {
        const prefix = item.date === today ? "今天・" : item.date === tomorrow ? "明天・" : "";
        group = { key: item.date, label: prefix + formatShortDate(item.date), overdue: false, items: [] };
        result.push(group);
      }
      group.items.push(item);
    }
    return result;
  }, [people, data, today]);

  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
        接下來沒有待做事項、作業或考試
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.key}>
          <h4
            className={`mb-2 text-sm font-medium ${group.overdue ? "text-rose-700" : "text-ink"}`}
          >
            {group.label}
          </h4>
          <ul className="space-y-1.5">
            {group.items.map((item) => (
              <li
                key={`${item.person.userId}-${item.id}`}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-white px-3 py-2.5"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: item.person.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.kind}
                    {item.detail ? `・${item.detail}` : ""}
                    {item.time ? `・${item.time}` : ""}
                    {group.overdue ? `・${formatShortDate(item.date)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs" style={{ color: item.person.color }}>
                  {item.person.isMe ? "我" : item.person.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
