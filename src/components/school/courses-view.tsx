"use client";

import { AddCourseDialog } from "@/components/school/add-course-dialog";
import { CourseDetailView } from "@/components/school/course-detail-view";
import { useSchool } from "@/store/school-store";
import { ChevronRight } from "lucide-react";

export function CoursesView({
  selectedCourseId,
  onSelectCourse,
}: {
  selectedCourseId: string | null;
  onSelectCourse: (id: string | null) => void;
}) {
  const { courses, homework, exams, courseProgress, readOnly } = useSchool();

  if (selectedCourseId) {
    return (
      <CourseDetailView courseId={selectedCourseId} onBack={() => onSelectCourse(null)} />
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {readOnly ? "點進課程查看細節" : "點進課程管理細節"}
          </p>
          <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">
            {readOnly ? "課程" : "我的課程"}
          </h2>
        </div>
        {!readOnly && <AddCourseDialog />}
      </header>

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-16 text-center">
          <p className="font-display text-xl text-ink">還沒有任何課程</p>
          {!readOnly && (
            <p className="mt-2 text-sm text-muted-foreground">
              新增第一門課後，可在課程內加入作業、考試與讀書單元。
            </p>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {courses.map((course, index) => {
            const pct = courseProgress(course.id).pct;
            const hwCount = homework.filter((h) => h.courseId === course.id && !h.done).length;
            const exCount = exams.filter((e) => e.courseId === course.id && !e.done).length;

            return (
              <li
                key={course.id}
                className="animate-fade-up"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <button
                  type="button"
                  onClick={() => onSelectCourse(course.id)}
                  className="group w-full overflow-hidden rounded-2xl border border-border/70 bg-white text-left transition-colors hover:border-teal-700/40 hover:bg-teal-50/30"
                >
                  <div className="h-1.5 w-full" style={{ backgroundColor: course.color }} />
                  <div className="flex items-center gap-3 p-5">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-xl text-ink">{course.name}</h3>
                      <div
                        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: course.color }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>讀書進度 {pct}%</span>
                        <span>·</span>
                        <span>作業 {hwCount}</span>
                        <span>·</span>
                        <span>考試 {exCount}</span>
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
