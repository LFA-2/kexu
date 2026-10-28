"use client";

import { CheckButton } from "@/components/school/course-detail-view";
import { Button } from "@/components/ui/button";
import { useSchool } from "@/store/school-store";
import { Trash2 } from "lucide-react";

export function ProgressView() {
  const { courses, progress, readOnly, courseProgress, toggleProgressUnit, removeProgressUnit } =
    useSchool();

  if (courses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-16 text-center text-sm text-muted-foreground">
        {readOnly ? "還沒有任何課程。" : "請先到「課程」新增課程，再於課程內加入讀書單元。"}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">用單元堆出每門課的完成度</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">
          讀書進度
        </h2>
        {!readOnly && (
          <p className="mt-2 text-xs text-muted-foreground">新增單元請到「課程」→ 點進各門課。</p>
        )}
      </header>

      <div className="space-y-6">
        {courses.map((course, index) => {
          const { pct, done, total } = courseProgress(course.id);
          const units = progress
            .filter((p) => p.courseId === course.id)
            .sort((a, b) => a.order - b.order);

          return (
            <section
              key={course.id}
              className="animate-fade-up rounded-2xl border border-border/70 bg-white p-5"
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: course.color }}
                    />
                    <h3 className="font-display text-xl text-ink">{course.name}</h3>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    已完成 {done}/{total || 0} 單元
                  </p>
                </div>
                <p
                  className="font-display text-3xl tabular-nums tracking-tight"
                  style={{ color: course.color }}
                >
                  {pct}
                  <span className="text-lg">%</span>
                </p>
              </div>

              <div
                className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${course.name} 進度`}
              >
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: course.color }}
                />
              </div>

              {units.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  {readOnly ? "尚未新增單元。" : "尚未新增單元。請到課程詳情頁新增。"}
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {units.map((unit) => (
                    <li
                      key={unit.id}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-slate-50/60 px-3 py-2.5"
                    >
                      <CheckButton
                        done={unit.completed}
                        color={course.color}
                        readOnly={readOnly}
                        onToggle={() => toggleProgressUnit(unit.id)}
                      />
                      <span
                        className={`min-w-0 flex-1 text-sm ${
                          unit.completed ? "text-muted-foreground line-through" : "text-ink"
                        }`}
                      >
                        {unit.title}
                      </span>
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground"
                          onClick={() => removeProgressUnit(unit.id)}
                          aria-label="刪除單元"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
