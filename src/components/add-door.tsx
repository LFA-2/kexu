"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { addDays } from "date-fns";
import { CourseDot } from "@/components/school/course-dot";
import { MinutesField } from "@/components/minutes-field";
import { TimeField, parseTime } from "@/components/time-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WEEKDAYS, formatShortDate, toDateKey } from "@/lib/dates";
import {
  HABIT_ICONS,
  HABIT_PRESETS,
  POINT_PRESETS,
  SPAN_PRESETS,
  type ScheduleItem,
} from "@/lib/life";
import {
  COURSE_COLORS,
  DEFAULT_HOMEWORK_MINUTES,
  DEFAULT_UNIT_MINUTES,
  formatMinutes,
  unitMinutes,
} from "@/lib/types";
import { useLife } from "@/store/life-store";
import { useSchool } from "@/store/school-store";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";

const AddDoorContext = createContext<(() => void) | null>(null);

const PLAN_HINT = "今天若已經排過，按「重新排」會把它排進來。";

type Area = "school" | "life";
type SchoolKind = "course" | "homework" | "exam" | "progress";
type LifeKind = "todo" | "schedule" | "habit";
type Step =
  | { at: "area" }
  | { at: "kind"; area: Area }
  | { at: "form"; area: "school"; kind: SchoolKind }
  | { at: "form"; area: "life"; kind: LifeKind };

const SCHOOL_KINDS: { id: SchoolKind; label: string; hint: string }[] = [
  { id: "course", label: "課程", hint: "先有課程，才能加作業、考試和進度" },
  { id: "homework", label: "作業", hint: "有截止日期，會排進今日" },
  { id: "exam", label: "考試", hint: "考試日期和範圍" },
  { id: "progress", label: "讀書進度", hint: "一個單元，期限可以先不填" },
];

const LIFE_KINDS: { id: LifeKind; label: string; hint: string }[] = [
  { id: "todo", label: "待做事項", hint: "有日期的一件事，例如繳費" },
  { id: "schedule", label: "今明行程", hint: "今天或明天的一個時間" },
  { id: "habit", label: "習慣", hint: "每週固定要做的事" },
];

export function AddDoor({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (!enabled && open) setOpen(false);

  const close = useCallback(() => setOpen(false), []);
  const saved = useCallback((message: string) => {
    setOpen(false);
    setNotice(message);
    window.setTimeout(() => {
      setNotice((cur) => (cur === message ? null : cur));
    }, 4200);
  }, []);
  const openSheet = useCallback(() => setOpen(true), []);

  return (
    <AddDoorContext.Provider value={enabled ? openSheet : null}>
      {children}
      {enabled && (
        <button
          type="button"
          onClick={openSheet}
          className="fixed inset-x-4 z-40 flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-medium text-primary-foreground shadow-lg sm:hidden"
          style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
        >
          <Plus className="size-5" />
          新增待辦
        </button>
      )}
      {notice && (
        <div
          role="status"
          className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[60] mx-auto max-w-md whitespace-pre-line rounded-2xl bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-lg"
        >
          {notice}
        </div>
      )}
      {enabled && open && <AddSheet onClose={close} onSaved={saved} />}
    </AddDoorContext.Provider>
  );
}

/** Desktop entry, in the sticky title row. Hidden on phones, where the bar sits above the nav. */
export function AddDoorButton() {
  const open = useContext(AddDoorContext);
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={open}
      className="mt-4 hidden h-12 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-primary text-base font-medium text-primary-foreground shadow-sm sm:inline-flex"
    >
      <Plus className="size-5" />
      新增待辦
    </button>
  );
}

function AddSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const school = useSchool();
  const life = useLife();
  const [step, setStep] = useState<Step>({ at: "area" });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function back() {
    if (step.at === "area") onClose();
    else if (step.at === "kind") setStep({ at: "area" });
    else setStep({ at: "kind", area: step.area });
  }

  const title =
    step.at === "area"
      ? "新增待辦"
      : step.at === "kind"
        ? step.area === "school"
          ? "學校"
          : "生活"
        : step.area === "school"
          ? (SCHOOL_KINDS.find((k) => k.id === step.kind)?.label ?? "新增待辦")
          : (LIFE_KINDS.find((k) => k.id === step.kind)?.label ?? "新增待辦");

  const ready = school.loaded && life.loaded;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-door-title"
    >
      <div className="flex items-center gap-1 border-b border-border/70 px-2 py-2">
        <button
          type="button"
          onClick={back}
          autoFocus
          className="flex size-11 items-center justify-center rounded-full text-ink hover:bg-soft"
          aria-label={step.at === "area" ? "關閉" : "返回"}
        >
          <ChevronLeft className="size-6" />
        </button>
        <h2 id="add-door-title" className="min-w-0 flex-1 truncate font-display text-2xl tracking-tight text-ink">
          {title}
        </h2>
      </div>
      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        {!ready ? (
          <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>
        ) : step.at === "area" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">先選這件事屬於哪裡。</p>
            <Choice label="學校" hint="課程、作業、考試、讀書進度" onClick={() => setStep({ at: "kind", area: "school" })} />
            <Choice label="生活" hint="待做事項、今明行程、習慣" onClick={() => setStep({ at: "kind", area: "life" })} />
          </div>
        ) : step.at === "kind" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">選一種，接著填這一項要的資料。</p>
            {(step.area === "school" ? SCHOOL_KINDS : LIFE_KINDS).map((kind) => (
              <Choice
                key={kind.id}
                label={kind.label}
                hint={kind.hint}
                onClick={() =>
                  setStep(
                    step.area === "school"
                      ? { at: "form", area: "school", kind: kind.id as SchoolKind }
                      : { at: "form", area: "life", kind: kind.id as LifeKind },
                  )
                }
              />
            ))}
          </div>
        ) : step.area === "school" ? (
          step.kind === "course" ? (
            <CourseForm onSaved={onSaved} />
          ) : (
            <WorkForm kind={step.kind} onSaved={onSaved} />
          )
        ) : step.kind === "todo" ? (
          <TodoForm onSaved={onSaved} />
        ) : step.kind === "schedule" ? (
          <ScheduleForm onSaved={onSaved} />
        ) : (
          <HabitForm onSaved={onSaved} />
        )}
      </div>
    </div>
  );
}

function Choice({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-4 text-left shadow-sm transition-colors hover:bg-soft"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-medium text-ink">{label}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COURSE_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.name}
          onClick={() => onChange(c.value)}
          className="size-9 rounded-full transition-transform hover:scale-105"
          style={{
            backgroundColor: c.value,
            boxShadow: value === c.value ? `0 0 0 2px white, 0 0 0 4px ${c.value}` : undefined,
          }}
          aria-label={c.name}
          aria-pressed={value === c.value}
        />
      ))}
    </div>
  );
}

function CourseForm({ onSaved }: { onSaved: (message: string) => void }) {
  const { addCourse } = useSchool();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COURSE_COLORS[0].value);

  function submit(event: FormEvent) {
    event.preventDefault();
    const title = name.trim();
    if (!title) return;
    addCourse(title, color);
    onSaved(`已加入課程「${title}」`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">為這門課選一個顏色，之後作業和進度都會用它。</p>
      <div className="grid gap-2">
        <Label htmlFor="door-course-name">課程名稱</Label>
        <Input
          id="door-course-name"
          placeholder="例如：微積分"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
        />
      </div>
      <div className="grid gap-2">
        <Label>主題色</Label>
        <ColorSwatches value={color} onChange={setColor} />
      </div>
      <Button type="submit" disabled={!name.trim()} className="h-11 w-full text-base">
        加入課程
      </Button>
    </form>
  );
}

function WorkForm({
  kind,
  onSaved,
}: {
  kind: "homework" | "exam" | "progress";
  onSaved: (message: string) => void;
}) {
  const school = useSchool();
  const [courseId, setCourseId] = useState<string | null>(school.courses[0]?.id ?? null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(kind === "progress" ? "" : toDateKey(new Date()));
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [scope, setScope] = useState<string[]>([]);

  const course = school.courses.find((c) => c.id === courseId) ?? null;
  const units = school.progress
    .filter((p) => p.courseId === courseId)
    .sort((a, b) => a.order - b.order);
  const scopeMinutes = units
    .filter((u) => scope.includes(u.id) && !u.completed)
    .reduce((sum, u) => sum + unitMinutes(u) * (1 - (u.progress ?? 0) / 100), 0);
  const valid = !!course && !!title.trim() && (kind === "progress" || !!date);
  const noun = kind === "homework" ? "作業" : kind === "exam" ? "考試" : "讀書進度";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !course) return;
    const name = title.trim();
    const est = minutes ?? undefined;
    if (kind === "homework") {
      school.addHomework({
        courseId: course.id,
        title: name,
        dueDate: date,
        note: note.trim(),
        estimatedMinutes: est,
      });
    } else if (kind === "exam") {
      school.addExam({
        courseId: course.id,
        title: name,
        date,
        note: note.trim(),
        scope,
      });
    } else {
      school.addProgressUnit(course.id, name, { estimatedMinutes: est, dueDate: date || undefined });
    }
    onSaved(`已加入${noun}「${name}」\n${PLAN_HINT}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <CoursePick courseId={courseId} onPick={setCourseId} />
      {course && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="door-work-title">{kind === "exam" ? "考試名稱" : kind === "progress" ? "單元名稱" : "作業標題"}</Label>
            <Input
              id="door-work-title"
              placeholder={kind === "exam" ? "例如：期中考" : kind === "progress" ? "例如：第 5 章 積分" : "例如：習題 3.2"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="door-work-date">
              {kind === "exam" ? "考試日期" : kind === "progress" ? "期限（選填）" : "截止日期"}
            </Label>
            <Input id="door-work-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {kind !== "exam" && (
            <MinutesField
              id="door-work-minutes"
              label="可能需要的時間"
              value={minutes}
              onChange={setMinutes}
              placeholder={`沒填以 ${kind === "homework" ? DEFAULT_HOMEWORK_MINUTES : DEFAULT_UNIT_MINUTES} 分鐘計算`}
            />
          )}
          {kind === "exam" && (
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label>考試範圍</Label>
                {scope.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {scope.length} 個單元・還需約 {formatMinutes(Math.round(scopeMinutes))}
                  </span>
                )}
              </div>
              {units.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  這門課還沒有讀書單元，先新增讀書單元才能選範圍。
                </p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-1">
                  {units.map((u) => {
                    const on = scope.includes(u.id);
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => setScope((s) => (on ? s.filter((x) => x !== u.id) : [...s, u.id]))}
                          className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm ${on ? "bg-wash" : "hover:bg-soft"}`}
                          aria-pressed={on}
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded border ${on ? "border-transparent text-white" : "border-border"}`}
                            style={on ? { backgroundColor: course.color } : undefined}
                          >
                            {on && <Check className="size-3" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{u.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {kind !== "progress" && (
            <div className="grid gap-2">
              <Label htmlFor="door-work-note">備註（選填）</Label>
              <Textarea
                id="door-work-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
          )}
          {kind === "progress" && (
            <p className="text-xs text-muted-foreground">沒填期限時，會以涵蓋這個單元的最近一場考試當期限。</p>
          )}
          <Button type="submit" disabled={!valid} className="h-11 w-full text-base">
            加入{noun}
          </Button>
        </>
      )}
    </form>
  );
}

function CoursePick({ courseId, onPick }: { courseId: string | null; onPick: (id: string) => void }) {
  const { courses, addCourse } = useSchool();
  const [making, setMaking] = useState(courses.length === 0);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COURSE_COLORS[0].value);

  function create() {
    const title = name.trim();
    if (!title) return;
    const id = addCourse(title, color);
    setName("");
    setColor(COURSE_COLORS[0].value);
    setMaking(false);
    onPick(id);
  }

  return (
    <div className="grid gap-2">
      <Label>課程</Label>
      {courses.length > 0 && (
        <div className="grid gap-2">
          {courses.map((c) => {
            const on = c.id === courseId && !making;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setMaking(false);
                  onPick(c.id);
                }}
                className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${
                  on ? "border-chip bg-chip text-chip-foreground" : "border-border/80 bg-card text-ink"
                }`}
                aria-pressed={on}
              >
                <CourseDot color={c.color} />
                {c.name}
              </button>
            );
          })}
        </div>
      )}
      {making ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-3">
          <div className="grid gap-2">
            <Label htmlFor="door-new-course">新課程名稱</Label>
            <Input
              id="door-new-course"
              placeholder="例如：微積分"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
          </div>
          <ColorSwatches value={color} onChange={setColor} />
          <Button type="button" onClick={create} disabled={!name.trim()} className="h-10 w-full">
            {courses.length === 0 ? "建立並繼續" : "建立並改選這門課"}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMaking(true)}
          className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:text-ink"
        >
          ＋ 新增一門課
        </button>
      )}
      {!courseId && <p className="text-xs text-muted-foreground">先建立課程，再填這一項。</p>}
    </div>
  );
}

function TodoForm({ onSaved }: { onSaved: (message: string) => void }) {
  const { addTodo } = useLife();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [time, setTime] = useState("");
  const [end, setEnd] = useState("");
  const startOk = time.trim() === "" || parseTime(time) !== null;
  const endOk = end.trim() === "" || parseTime(end) !== null;
  const valid = !!title.trim() && !!date && startOk && endOk;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const name = title.trim();
    addTodo({ title: name, date, time: parseTime(time) ?? "", end: parseTime(end) ?? "" });
    onSaved(`已加入待做事項「${name}」`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="door-todo-title">事項</Label>
        <Input
          id="door-todo-title"
          placeholder="例如：繳費"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="door-todo-date">日期</Label>
        <Input id="door-todo-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="door-todo-time">開始（選填）</Label>
          <TimeField id="door-todo-time" value={time} onChange={setTime} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="door-todo-end">結束（選填）</Label>
          <TimeField id="door-todo-end" value={end} onChange={setEnd} />
        </div>
      </div>
      {(!startOk || !endOk) && <p className="text-xs text-destructive">時間請用 14:30 這種格式</p>}
      <Button type="submit" disabled={!valid} className="h-11 w-full text-base">
        加入待做事項
      </Button>
    </form>
  );
}

function ScheduleForm({ onSaved }: { onSaved: (message: string) => void }) {
  const { addScheduleItem } = useLife();
  const today = toDateKey(new Date());
  const tomorrow = toDateKey(addDays(new Date(), 1));
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const [kind, setKind] = useState<ScheduleItem["kind"]>("point");
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const presets = kind === "point" ? POINT_PRESETS : SPAN_PRESETS;
  const startOk = parseTime(start);
  const endOk = kind === "point" ? "" : parseTime(end);
  const valid = !!label.trim() && !!startOk && (kind === "point" || (!!endOk && endOk !== startOk));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !startOk) return;
    const name = label.trim();
    const date = day === "today" ? today : tomorrow;
    addScheduleItem(
      date,
      kind === "point" ? { kind, label: name, start: startOk } : { kind, label: name, start: startOk, end: endOk! },
    );
    onSaved(`已加入今明行程「${name}」`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex w-fit rounded-xl border border-border/80 bg-card p-1">
        {(["today", "tomorrow"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              day === d ? "bg-chip text-chip-foreground" : "text-muted-foreground"
            }`}
          >
            {d === "today" ? "今天" : "明天"}
            <span className="ml-1.5 text-xs opacity-70">{formatShortDate(d === "today" ? today : tomorrow)}</span>
          </button>
        ))}
      </div>
      <div className="flex w-fit rounded-lg border border-border/80 p-0.5">
        {(["point", "span"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md px-3 py-1 text-sm ${kind === k ? "bg-chip text-chip-foreground" : "text-muted-foreground"}`}
          >
            {k === "point" ? "時間點" : "時間段"}
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="door-plan-label">內容</Label>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setLabel(p)}
              className={`rounded-full border px-3 py-1 text-sm ${
                label === p ? "border-chip bg-chip text-chip-foreground" : "border-border/80 text-muted-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <Input
          id="door-plan-label"
          placeholder={kind === "point" ? "或自己輸入，例如：吃藥" : "或自己輸入，例如：社團"}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="door-plan-start">{kind === "point" ? "時間" : "開始"}</Label>
          <TimeField id="door-plan-start" value={start} onChange={setStart} />
        </div>
        {kind === "span" && (
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="door-plan-end">結束</Label>
            <TimeField id="door-plan-end" value={end} onChange={setEnd} />
          </div>
        )}
      </div>
      {kind === "span" && <p className="text-xs text-muted-foreground">結束時間比開始早，代表跨過午夜。</p>}
      <Button type="submit" disabled={!valid} className="h-11 w-full text-base">
        加入行程
      </Button>
    </form>
  );
}

function HabitForm({ onSaved }: { onSaved: (message: string) => void }) {
  const { addHabit } = useLife();
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState(HABIT_ICONS[0]);
  const [days, setDays] = useState<number[]>([]);
  const [minutes, setMinutes] = useState<number | null>(15);
  const [time, setTime] = useState("");
  const timeOk = time.trim() === "" || parseTime(time) !== null;
  const valid = !!title.trim() && days.length > 0 && timeOk;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const name = title.trim();
    addHabit({ title: name, icon, days, minutes: minutes ?? 15, time: parseTime(time) ?? "" });
    onSaved(`已加入習慣「${name}」`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {HABIT_PRESETS.map((p) => (
          <button
            key={p.title}
            type="button"
            onClick={() => {
              setTitle(p.title);
              setIcon(p.icon);
              setMinutes(p.minutes);
            }}
            className="rounded-full border border-border/80 bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-ink"
          >
            {p.icon} {p.title}
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="door-habit-title">名稱</Label>
        <Input
          id="door-habit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：倒垃圾"
          maxLength={40}
        />
      </div>
      <div className="grid gap-2">
        <Label>圖示</Label>
        <div className="flex flex-wrap gap-1">
          {HABIT_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              className={`flex size-9 items-center justify-center rounded-lg border text-lg ${
                icon === i ? "border-chip bg-wash" : "border-transparent hover:bg-soft"
              }`}
              aria-pressed={icon === i}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>星期</Label>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="xs" onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}>
              每天
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => setDays([1, 2, 3, 4, 5])}>
              平日
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => setDays([6, 7])}>
              週末
            </Button>
          </div>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDays((ds) => (on ? ds.filter((x) => x !== d) : [...ds, d].sort()))}
                className={`flex-1 rounded-lg border py-2 text-sm ${
                  on ? "border-chip bg-chip text-chip-foreground" : "border-border bg-card text-muted-foreground"
                }`}
                aria-pressed={on}
              >
                {WEEKDAYS[d - 1]}
              </button>
            );
          })}
        </div>
      </div>
      <MinutesField
        id="door-habit-minutes"
        label="大約需要"
        value={minutes}
        onChange={setMinutes}
        presets={[5, 10, 15, 30, 60]}
      />
      <div className="grid gap-2">
        <Label htmlFor="door-habit-time">習慣時間（選填）</Label>
        <TimeField id="door-habit-time" value={time} onChange={setTime} />
      </div>
      {!timeOk && <p className="text-xs text-destructive">時間請用 14:30 這種格式</p>}
      <Button type="submit" disabled={!valid} className="h-11 w-full text-base">
        加入習慣
      </Button>
    </form>
  );
}
