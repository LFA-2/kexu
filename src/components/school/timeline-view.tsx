"use client";

import { useMemo } from "react";
import { CheckButton } from "@/components/school/course-detail-view";
import { CourseDot } from "@/components/school/course-dot";
import { MonthCalendar } from "@/components/school/month-calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatShortDate, relativeStatus } from "@/lib/dates";
import { useSchool } from "@/store/school-store";
import { Trash2 } from "lucide-react";

type Kind = "homework" | "exam";

export function TimelineView({ kind }: { kind: Kind }) {
  const {
    courses,
    homework,
    exams,
    readOnly,
    toggleHomework,
    toggleExam,
    removeHomework,
    removeExam,
  } = useSchool();

  const title = kind === "homework" ? "作業" : "考試";
  const subtitle =
    kind === "homework"
      ? "月曆標示有作業的日子，下方依課程列出細節"
      : "月曆標示有考試的日子，下方依課程列出細節";

  const items = useMemo(
    () =>
      kind === "homework"
        ? homework.map((h) => ({ ...h, date: h.dueDate }))
        : exams.map((e) => ({ ...e })),
    [kind, homework, exams],
  );

  const colorsByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    for (const item of items) {
      if (item.done) continue;
      const course = courseMap.get(item.courseId);
      if (!course) continue;
      const list = map.get(item.date) ?? [];
      if (!list.includes(course.color)) list.push(course.color);
      map.set(item.date, list);
    }
    return map;
  }, [courses, items]);

  const grouped = useMemo(
    () =>
      courses.map((course) => ({
        course,
        items: items
          .filter((i) => i.courseId === course.id)
          .sort((a, b) => a.date.localeCompare(b.date)),
      })),
    [courses, items],
  );

  function toggle(id: string) {
    if (kind === "homework") toggleHomework(id);
    else toggleExam(id);
  }

  function remove(id: string) {
    if (kind === "homework") removeHomework(id);
    else removeExam(id);
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">
          {title}
        </h2>
        {!readOnly && (
          <p className="mt-2 text-xs text-muted-foreground">新增請到「課程」→ 點進各門課。</p>
        )}
      </header>

      <MonthCalendar colorsByDate={colorsByDate} />

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm text-muted-foreground">
          {readOnly ? "還沒有任何課程。" : "請先到「課程」新增課程。"}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ course, items: courseItems }, index) => (
            <section
              key={course.id}
              className="animate-fade-up"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="mb-3 flex items-center gap-2">
                <CourseDot color={course.color} size={10} />
                <h3 className="font-display text-lg text-ink">{course.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {courseItems.filter((i) => !i.done).length} 項未完成
                </span>
              </div>

              {courseItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-white px-4 py-4 text-sm text-muted-foreground">
                  這門課還沒有{title}
                </div>
              ) : (
                <ol className="relative ml-2 space-y-0 border-l-2 border-slate-200 pl-6">
                  {courseItems.map((item) => {
                    const status = relativeStatus(item.date, item.done);
                    return (
                      <li key={item.id} className="relative pb-5 last:pb-0">
                        <span
                          className="absolute -left-[1.9rem] top-2 size-3 rounded-full ring-4 ring-background"
                          style={{ backgroundColor: item.done ? "#94a3b8" : course.color }}
                        />
                        <div
                          className={`rounded-xl border bg-white px-4 py-3 ${
                            item.done ? "border-border/50 opacity-70" : "border-border/70"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <CheckButton
                              done={item.done}
                              color={course.color}
                              readOnly={readOnly}
                              onToggle={() => toggle(item.id)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`font-medium ${
                                    item.done ? "text-muted-foreground line-through" : "text-ink"
                                  }`}
                                >
                                  {item.title}
                                </span>
                                <StatusBadge status={status} />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatShortDate(item.date)}
                                {item.note ? ` · ${item.note}` : ""}
                              </p>
                            </div>
                            {!readOnly && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="text-muted-foreground"
                                onClick={() => remove(item.id)}
                                aria-label={`刪除${title}`}
                              >
                                <Trash2 />
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "done" | "overdue" | "today" | "tomorrow" | "upcoming";
}) {
  if (status === "done") {
    return (
      <Badge variant="secondary" className="font-normal">
        已完成
      </Badge>
    );
  }
  if (status === "overdue") {
    return <Badge className="bg-rose-700 text-white hover:bg-rose-700">已過期</Badge>;
  }
  if (status === "today") {
    return <Badge className="bg-teal-700 text-white hover:bg-teal-700">今天</Badge>;
  }
  if (status === "tomorrow") {
    return <Badge variant="secondary">明天</Badge>;
  }
  return null;
}
