"use client";

import { useState } from "react";
import { CoursesView } from "@/components/school/courses-view";
import { ProgressView } from "@/components/school/progress-view";
import { TimelineView } from "@/components/school/timeline-view";
import type { Category, SchoolView } from "@/lib/types";
import { SchoolProvider, useSchool } from "@/store/school-store";
import { BookOpen, CalendarDays, ClipboardList, GraduationCap } from "lucide-react";

const NAV: { id: SchoolView; label: string; icon: typeof BookOpen }[] = [
  { id: "courses", label: "課程", icon: BookOpen },
  { id: "progress", label: "讀書進度", icon: CalendarDays },
  { id: "homework", label: "作業", icon: ClipboardList },
  { id: "exams", label: "考試", icon: GraduationCap },
];

const SYNC_LABEL = {
  loading: "連線中…",
  synced: "已同步",
  saving: "儲存中…",
  offline: "無法連到伺服器",
} as const;

export function AppShell() {
  return (
    <SchoolProvider>
      <AppShellInner />
    </SchoolProvider>
  );
}

function AppShellInner() {
  const [category, setCategory] = useState<Category>("school");
  const [view, setView] = useState<SchoolView>("courses");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const { syncStatus } = useSchool();

  function goView(next: SchoolView) {
    setView(next);
    setSelectedCourseId(null);
  }

  return (
    <div className="relative min-h-full bg-background">
      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 sm:pb-10 sm:pt-8">
        <header className="animate-fade-up">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-4xl tracking-tight text-ink sm:text-5xl">課序</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                把學校行程收成一條清楚的時間線——課程、作業、考試、讀書進度。
              </p>
            </div>
            <div className="flex rounded-xl border border-border/80 bg-white p-1 shadow-sm">
              <CategoryTab
                active={category === "school"}
                onClick={() => setCategory("school")}
                label="學校"
              />
              <CategoryTab
                active={category === "life"}
                onClick={() => setCategory("life")}
                label="生活"
              />
            </div>
          </div>
        </header>

        {category === "life" ? (
          <LifePlaceholder />
        ) : (
          <>
            <nav
              className="animate-fade-up mt-8 hidden gap-1 rounded-2xl border border-border/70 bg-white p-1.5 shadow-sm sm:flex"
              style={{ animationDelay: "60ms" }}
              aria-label="學校導覽"
            >
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goView(item.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "bg-ink text-white shadow-sm"
                        : "text-muted-foreground hover:bg-slate-100 hover:text-ink"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <main className="animate-fade-up mt-8 flex-1" style={{ animationDelay: "100ms" }}>
              {view === "courses" && (
                <CoursesView
                  selectedCourseId={selectedCourseId}
                  onSelectCourse={setSelectedCourseId}
                />
              )}
              {view === "progress" && <ProgressView />}
              {view === "homework" && <TimelineView kind="homework" />}
              {view === "exams" && <TimelineView kind="exam" />}
            </main>

            <div className="mt-10 flex items-center justify-between border-t border-border/60 pt-4 text-xs text-muted-foreground">
              <span>資料存在 lipang，所有 Tailscale 裝置共用同一份。</span>
              <span className={syncStatus === "offline" ? "text-destructive" : undefined}>
                {SYNC_LABEL[syncStatus]}
              </span>
            </div>
          </>
        )}
      </div>

      {category === "school" && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:hidden"
          aria-label="手機導覽"
        >
          <div className="mx-auto flex max-w-lg justify-between gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goView(item.id)}
                  className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors ${
                    active ? "text-teal-800" : "text-muted-foreground"
                  }`}
                >
                  <Icon className={`size-5 ${active ? "stroke-[2.25]" : ""}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

function CategoryTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
        active ? "bg-ink text-white shadow-sm" : "text-muted-foreground hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function LifePlaceholder() {
  return (
    <section className="animate-fade-up mt-10 rounded-3xl border border-dashed border-border/80 bg-white px-6 py-20 text-center">
      <p className="font-display text-3xl text-ink">生活</p>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
        生活模組之後再開放。現在先把「學校」的課程、作業、考試與讀書進度打磨好。
      </p>
    </section>
  );
}
