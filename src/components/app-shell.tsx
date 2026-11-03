"use client";

import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { AccountView } from "@/components/account-view";
import { AddDoor, AddDoorButton } from "@/components/add-door";
import { DataTools } from "@/components/data-tools";
import { LifeView } from "@/components/life/life-view";
import { LoginView } from "@/components/login-view";
import { InstallHint, UpdateBanner } from "@/components/pwa";
import { SharedView, type Person } from "@/components/shared-view";
import { CoursesView } from "@/components/school/courses-view";
import { ProgressView } from "@/components/school/progress-view";
import { TimelineView } from "@/components/school/timeline-view";
import { TimetableView } from "@/components/school/timetable-view";
import { FitnessView } from "@/components/fitness/fitness-view";
import { TodayView } from "@/components/today/today-view";
import { PERSON_COLORS } from "@/lib/life";
import { applyTheme, readTheme } from "@/lib/themes";
import { supabaseConfigured } from "@/lib/supabase";
import type { Category, SchoolView } from "@/lib/types";
import { AuthProvider, useAuth } from "@/store/auth-store";
import { LifeProvider, useLife } from "@/store/life-store";
import { LinksProvider, useLinks } from "@/store/links-store";
import { FitnessProvider, useFitness } from "@/store/fitness-store";
import { SchoolProvider, useSchool, type SyncStatus } from "@/store/school-store";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Eye,
  GraduationCap,
  Heart,
  LayoutGrid,
  Sun,
  Users,
} from "lucide-react";

const NAV: { id: SchoolView; label: string; icon: typeof BookOpen }[] = [
  { id: "courses", label: "課程", icon: BookOpen },
  { id: "timetable", label: "課表", icon: LayoutGrid },
  { id: "progress", label: "讀書進度", icon: CalendarDays },
  { id: "homework", label: "作業", icon: ClipboardList },
  { id: "exams", label: "考試", icon: GraduationCap },
];

const CATEGORIES: { id: Category; label: string; icon: typeof BookOpen }[] = [
  { id: "today", label: "今日", icon: Sun },
  { id: "school", label: "學校", icon: GraduationCap },
  { id: "life", label: "生活", icon: Heart },
  { id: "fitness", label: "運動", icon: Dumbbell },
  { id: "shared", label: "共同", icon: Users },
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
      <ThemeSync />
      <UpdateBanner />
      <Gate />
    </AuthProvider>
  );
}

function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(readTheme());
  }, []);
  return null;
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
  const [category, setCategory] = useState<Category>("today");
  const [view, setView] = useState<SchoolView>("courses");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState(me);
  const [showAccount, setShowAccount] = useState(false);

  const people = useMemo<Person[]>(
    () => [
      { userId: me, name: profile?.display_name || "我", color: PERSON_COLORS[0], isMe: true },
      ...linked.map((p, i) => ({
        userId: p.userId,
        name: p.name,
        color: PERSON_COLORS[(i + 1) % PERSON_COLORS.length],
        isMe: false,
      })),
    ],
    [me, profile?.display_name, linked],
  );

  const viewingPerson = linked.find((p) => p.userId === viewingId);
  const ownerId = viewingPerson ? viewingPerson.userId : me;
  const isMine = ownerId === me;
  const ownerColor = people.find((p) => p.userId === ownerId)?.color ?? PERSON_COLORS[0];
  const activeCategory: Category =
    category === "shared" && linked.length === 0 ? "today" : category;
  const categories = CATEGORIES.filter((c) => c.id !== "shared" || linked.length > 0);

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

  function goCategory(id: Category) {
    setCategory(id);
    setShowAccount(false);
    window.scrollTo({ top: 0 });
  }

  const pagePad = isMine
    ? "pb-[calc(8.25rem+env(safe-area-inset-bottom))] sm:pb-10"
    : "pb-24 sm:pb-10";

  return (
    <SchoolProvider ownerId={me} editable>
      <LifeProvider ownerId={me} editable>
        <AddDoor enabled={isMine}>
    <div className="relative min-h-full bg-background">
      <div className={`relative mx-auto flex min-h-full max-w-5xl flex-col px-4 pt-6 sm:px-6 sm:pt-8 ${pagePad}`}>
        <header className="animate-fade-up sm:sticky sm:top-0 sm:z-30 sm:-mx-6 sm:bg-background/95 sm:px-6 sm:pb-4 sm:backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display text-3xl tracking-tight text-ink sm:text-5xl">你也許有點聰明</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                今天要做什麼、學校、生活、運動，收在同一個地方。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-xl border border-border/80 bg-card p-1 shadow-sm sm:flex">
                {categories.map((c) => (
                  <CategoryTab
                    key={c.id}
                    active={activeCategory === c.id && !showAccount}
                    onClick={() => goCategory(c.id)}
                    label={c.label}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowAccount(true)}
                className={`relative flex size-11 items-center justify-center rounded-full border text-sm font-medium shadow-sm transition-colors ${
                  showAccount
                    ? "border-chip bg-chip text-chip-foreground"
                    : "border-border/80 bg-card text-ink hover:bg-soft"
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
          <AddDoorButton />
        </header>

        {showAccount ? (
          <main className="animate-fade-up mt-8 flex-1">
            <AccountView onBack={() => setShowAccount(false)} />
          </main>
        ) : activeCategory === "shared" ? (
          <main className="animate-fade-up mt-8 flex-1">
            <SharedView people={people} />
          </main>
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

            {activeCategory === "school" && (
              <nav
                className="animate-fade-up -mx-4 mt-6 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:rounded-2xl sm:border sm:border-border/70 sm:bg-card sm:p-1.5 sm:shadow-sm"
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
                      className={`flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all sm:flex-1 sm:gap-2 sm:rounded-xl sm:border-transparent sm:px-3 sm:py-2.5 ${
                        active
                          ? "border-chip bg-chip text-chip-foreground shadow-sm"
                          : "border-border/80 bg-card text-muted-foreground hover:bg-wash hover:text-ink"
                      }`}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            )}

            {!isMine && viewingPerson && (
              <div className="mt-6 flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                <Eye className="size-4 shrink-0" />
                正在檢視「{viewingPerson.name}」的頁面（唯讀）
              </div>
            )}

            {activeCategory === "fitness" ? (
              <FitnessProvider key={`f-${ownerId}`} ownerId={ownerId} editable={isMine}>
                <FitnessMain owner={ownerId} />
              </FitnessProvider>
            ) : (
              <OwnedData isMine={isMine} ownerId={ownerId}>
                {activeCategory === "today" ? (
                  <FitnessProvider key={`f-${ownerId}`} ownerId={ownerId} editable={isMine}>
                    <TodayMain me={me} isMine={isMine} color={ownerColor} />
                  </FitnessProvider>
                ) : activeCategory === "school" ? (
                  <SchoolMain
                    view={view}
                    selectedCourseId={selectedCourseId}
                    onSelectCourse={setSelectedCourseId}
                  />
                ) : (
                  <LifeMain color={ownerColor} />
                )}
              </OwnedData>
            )}
          </>
        )}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:hidden"
        aria-label="手機導覽"
      >
        <div className="mx-auto flex max-w-lg justify-between gap-1">
          {categories.map((item) => {
            const Icon = item.icon;
            const active = activeCategory === item.id && !showAccount;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goCategory(item.id)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={`size-5 ${active ? "stroke-[2.25]" : ""}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
        </AddDoor>
      </LifeProvider>
    </SchoolProvider>
  );
}

/** Your own pages use the providers around the shell. Someone else's pages get their own read-only tree. */
function OwnedData({
  isMine,
  ownerId,
  children,
}: {
  isMine: boolean;
  ownerId: string;
  children: ReactNode;
}) {
  if (isMine) return children;
  return (
    <SchoolProvider key={`s-${ownerId}`} ownerId={ownerId} editable={false}>
      <LifeProvider key={`l-${ownerId}`} ownerId={ownerId} editable={false}>
        {children}
      </LifeProvider>
    </SchoolProvider>
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
            {view === "timetable" && <TimetableView />}
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

function TodayMain({ me, isMine, color }: { me: string; isMine: boolean; color: string }) {
  const { syncStatus } = useLife();
  return (
    <>
      <main className="animate-fade-up mt-8 flex-1" style={{ animationDelay: "100ms" }}>
        <TodayView me={me} isMine={isMine} color={color} />
      </main>
      <SyncFooter status={syncStatus} />
    </>
  );
}

function FitnessMain({ owner }: { owner: string }) {
  const { loaded, syncStatus } = useFitness();
  return (
    <>
      <main className="animate-fade-up mt-8 flex-1" style={{ animationDelay: "100ms" }}>
        {loaded ? (
          <FitnessView owner={owner} />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>
        )}
      </main>
      <SyncFooter status={syncStatus} />
    </>
  );
}

function SyncFooter({ status }: { status: SyncStatus }) {
  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
      <span className={status === "offline" ? "text-destructive" : undefined}>
        {SYNC_LABEL[status]}
      </span>
    </div>
  );
}

function LifeMain({ color }: { color: string }) {
  const { loaded, syncStatus } = useLife();

  return (
    <>
      <main className="animate-fade-up mt-8 flex-1" style={{ animationDelay: "100ms" }}>
        {loaded ? (
          <LifeView color={color} />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>
        )}
      </main>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
        <span className={syncStatus === "offline" ? "text-destructive" : undefined}>
          {SYNC_LABEL[syncStatus]}
        </span>
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
          ? "border-chip bg-chip text-chip-foreground"
          : "border-border/80 bg-card text-muted-foreground hover:text-ink"
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
        active ? "bg-chip text-chip-foreground shadow-sm" : "text-muted-foreground hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
