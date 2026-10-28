"use client";

import { useState } from "react";
import { AccountView } from "@/components/account-view";
import { DataTools } from "@/components/data-tools";
import { LoginView } from "@/components/login-view";
import { InstallHint, UpdateBanner } from "@/components/pwa";
import { CoursesView } from "@/components/school/courses-view";
import { ProgressView } from "@/components/school/progress-view";
import { TimelineView } from "@/components/school/timeline-view";
import { supabaseConfigured } from "@/lib/supabase";
import type { Category, SchoolView } from "@/lib/types";
import { AuthProvider, useAuth } from "@/store/auth-store";
import { LinksProvider, useLinks } from "@/store/links-store";
import { SchoolProvider, useSchool, type SyncStatus } from "@/store/school-store";
import { BookOpen, CalendarDays, ClipboardList, Eye, GraduationCap } from "lucide-react";

const NAV: { id: SchoolView; label: string; icon: typeof BookOpen }[] = [
  { id: "courses", label: "課程", icon: BookOpen },
  { id: "progress", label: "讀書進度", icon: CalendarDays },
  { id: "homework", label: "作業", icon: ClipboardList },
  { id: "exams", label: "考試", icon: GraduationCap },
];

const SYNC_LABEL: Record<SyncStatus, string> = {
  loading: "載入中…",
  synced: "已同步",
  saving: "儲存中…",
  offline: "離線，變更未儲存",
};

export function AppShell() {
  return (
    <AuthProvider>
      <UpdateBanner />
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { ready, session } = useAuth();

  if (!supabaseConfigured) {
    return (
      <p className="mx-auto max-w-sm px-5 py-20 text-center text-sm text-muted-foreground">
        尚未設定 Supabase（NEXT_PUBLIC_SUPABASE_URL／NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY）。
      </p>
    );
  }
  if (!ready) return null;
  if (!session) {
    return (
      <>
        <LoginView />
        <div className="mx-auto w-full max-w-sm px-5 pb-10">
          <InstallHint />
        </div>
      </>
    );
  }
  return (
    <LinksProvider key={session.user.id} userId={session.user.id}>
      <MainApp me={session.user.id} />
    </LinksProvider>
  );
}

function MainApp({ me }: { me: string }) {
  const { profile } = useAuth();
  const { linked, incoming } = useLinks();
  const [category, setCategory] = useState<Category>("school");
  const [view, setView] = useState<SchoolView>("courses");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState(me);
  const [showAccount, setShowAccount] = useState(false);

  const viewingPerson = linked.find((p) => p.userId === viewingId);
  const ownerId = viewingPerson ? viewingPerson.userId : me;
  const isMine = ownerId === me;

  function goView(next: SchoolView) {
    setView(next);
    setSelectedCourseId(null);
    setShowAccount(false);
  }

  function switchViewing(id: string) {
    setViewingId(id);
    setSelectedCourseId(null);
  }

  const initial = (profile?.display_name || "我").slice(0, 1);
  const showSchoolNav = category === "school" && !showAccount;

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
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl border border-border/80 bg-white p-1 shadow-sm">
                <CategoryTab
                  active={category === "school" && !showAccount}
                  onClick={() => {
                    setCategory("school");
                    setShowAccount(false);
                  }}
                  label="學校"
                />
                <CategoryTab
                  active={category === "life" && !showAccount}
                  onClick={() => {
                    setCategory("life");
                    setShowAccount(false);
                  }}
                  label="生活"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAccount(true)}
                className={`relative flex size-11 items-center justify-center rounded-full border text-sm font-medium shadow-sm transition-colors ${
                  showAccount
                    ? "border-ink bg-ink text-white"
                    : "border-border/80 bg-white text-ink hover:bg-slate-50"
                }`}
                aria-label="帳號與連結"
              >
                {initial}
                {incoming.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-background bg-rose-600" />
                )}
              </button>
            </div>
          </div>
          <InstallHint />
        </header>

        {showAccount ? (
          <main className="animate-fade-up mt-8 flex-1">
            <AccountView onBack={() => setShowAccount(false)} />
          </main>
        ) : category === "life" ? (
          <LifePlaceholder />
        ) : (
          <>
            {linked.length > 0 && (
              <div className="animate-fade-up mt-6 flex items-center gap-2 overflow-x-auto pb-1">
                <span className="shrink-0 text-xs text-muted-foreground">檢視</span>
                <ViewerChip active={isMine} label="我" onClick={() => switchViewing(me)} />
                {linked.map((p) => (
                  <ViewerChip
                    key={p.userId}
                    active={ownerId === p.userId}
                    label={p.name}
                    onClick={() => switchViewing(p.userId)}
                  />
                ))}
              </div>
            )}

            <nav
              className="animate-fade-up mt-6 hidden gap-1 rounded-2xl border border-border/70 bg-white p-1.5 shadow-sm sm:flex"
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

            <SchoolProvider key={ownerId} ownerId={ownerId} editable={isMine}>
              {!isMine && viewingPerson && (
                <div className="mt-6 flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                  <Eye className="size-4 shrink-0" />
                  正在檢視「{viewingPerson.name}」的頁面（唯讀）
                </div>
              )}
              <SchoolMain
                view={view}
                selectedCourseId={selectedCourseId}
                onSelectCourse={setSelectedCourseId}
              />
            </SchoolProvider>
          </>
        )}
      </div>

      {showSchoolNav && (
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

function SchoolMain({
  view,
  selectedCourseId,
  onSelectCourse,
}: {
  view: SchoolView;
  selectedCourseId: string | null;
  onSelectCourse: (id: string | null) => void;
}) {
  const { loaded, readOnly, syncStatus } = useSchool();

  return (
    <>
      <main className="animate-fade-up mt-8 flex-1" style={{ animationDelay: "100ms" }}>
        {!loaded ? (
          <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>
        ) : (
          <>
            {view === "courses" && (
              <CoursesView selectedCourseId={selectedCourseId} onSelectCourse={onSelectCourse} />
            )}
            {view === "progress" && <ProgressView />}
            {view === "homework" && <TimelineView kind="homework" />}
            {view === "exams" && <TimelineView kind="exam" />}
          </>
        )}
      </main>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
        <span className={syncStatus === "offline" ? "text-destructive" : undefined}>
          {SYNC_LABEL[syncStatus]}
        </span>
        {!readOnly && <DataTools />}
      </div>
    </>
  );
}

function ViewerChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? "border-ink bg-ink text-white"
          : "border-border/80 bg-white text-muted-foreground hover:text-ink"
      }`}
    >
      {label}
    </button>
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
