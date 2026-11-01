"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CourseDot } from "@/components/school/course-dot";
import { MinutesField } from "@/components/minutes-field";
import { useSchool } from "@/store/school-store";
import { Check, Pencil, Plus } from "lucide-react";
import { toDateKey } from "@/lib/dates";
import {
  DEFAULT_HOMEWORK_MINUTES,
  DEFAULT_UNIT_MINUTES,
  formatMinutes,
  unitMinutes,
} from "@/lib/types";

type Kind = "homework" | "exam" | "progress";

const COPY: Record<
  Kind,
  { title: string; edit: string; desc: string; titleLabel: string; titlePh: string; dateLabel: string }
> = {
  homework: {
    title: "新增作業",
    edit: "編輯作業",
    desc: "作業會出現在作業頁的月曆與時間線，也會被排進「今日」。",
    titleLabel: "作業標題",
    titlePh: "例如：習題 3.2",
    dateLabel: "截止日期",
  },
  exam: {
    title: "新增考試",
    edit: "編輯考試",
    desc: "勾選考試範圍內的讀書進度，「今日」會在考前把它們排完。",
    titleLabel: "考試名稱",
    titlePh: "例如：期中考",
    dateLabel: "考試日期",
  },
  progress: {
    title: "新增讀書單元",
    edit: "編輯讀書單元",
    desc: "沒填期限時，會以涵蓋這個單元的最近一場考試當期限。",
    titleLabel: "單元名稱",
    titlePh: "例如：第 5 章 積分",
    dateLabel: "期限（選填）",
  },
};

export function AddItemDialog({ kind, courseId }: { kind: Kind; courseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        {COPY[kind].title}
      </Button>
      {open && <ItemDialog kind={kind} courseId={courseId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function EditItemButton({
  kind,
  courseId,
  id,
}: {
  kind: Kind;
  courseId: string;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label={COPY[kind].edit}
      >
        <Pencil />
      </Button>
      {open && (
        <ItemDialog kind={kind} courseId={courseId} editId={id} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ItemDialog({
  kind,
  courseId,
  editId,
  onClose,
}: {
  kind: Kind;
  courseId: string;
  editId?: string;
  onClose: () => void;
}) {
  const school = useSchool();
  const { courses, progress } = school;
  const course = courses.find((c) => c.id === courseId);

  const existing =
    kind === "homework"
      ? school.homework.find((h) => h.id === editId)
      : kind === "exam"
        ? school.exams.find((e) => e.id === editId)
        : progress.find((p) => p.id === editId);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(() => {
    if (!existing) return kind === "progress" ? "" : toDateKey(new Date());
    if ("dueDate" in existing) return existing.dueDate ?? "";
    if ("date" in existing) return existing.date;
    return "";
  });
  const [note, setNote] = useState(existing && "note" in existing ? existing.note : "");
  const [minutes, setMinutes] = useState<number | null>(
    existing && "estimatedMinutes" in existing
      ? (existing.estimatedMinutes ?? null)
      : null,
  );
  const [scope, setScope] = useState<string[]>(
    existing && "scope" in existing ? (existing.scope ?? []) : [],
  );

  const copy = COPY[kind];
  const units = progress
    .filter((p) => p.courseId === courseId)
    .sort((a, b) => a.order - b.order);
  const scopeMinutes = units
    .filter((u) => scope.includes(u.id) && !u.completed)
    .reduce((a, u) => a + unitMinutes(u) * (1 - (u.progress ?? 0) / 100), 0);

  const valid = title.trim() && (kind === "progress" || date);

  function submit() {
    if (!valid || !course) return;
    const t = title.trim();
    const est = minutes ?? undefined;
    if (kind === "homework") {
      const fields = { title: t, dueDate: date, note: note.trim(), estimatedMinutes: est };
      if (editId) school.updateHomework(editId, fields);
      else school.addHomework({ courseId, ...fields });
    } else if (kind === "exam") {
      const fields = { title: t, date, note: note.trim(), scope };
      if (editId) school.updateExam(editId, fields);
      else school.addExam({ courseId, ...fields });
    } else {
      const fields = { estimatedMinutes: est, dueDate: date || undefined };
      if (editId) school.updateProgressUnit(editId, { title: t, ...fields });
      else school.addProgressUnit(courseId, t, fields);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editId ? copy.edit : copy.title}</DialogTitle>
          <DialogDescription>{copy.desc}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>所屬課程</Label>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-input bg-muted/40 px-2.5 text-sm">
              <CourseDot color={course?.color ?? "#64748b"} />
              {course?.name}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${kind}-title`}>{copy.titleLabel}</Label>
            <Input
              id={`${kind}-title`}
              placeholder={copy.titlePh}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              maxLength={100}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${kind}-date`}>{copy.dateLabel}</Label>
            <Input
              id={`${kind}-date`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {kind !== "exam" && (
            <MinutesField
              id={`${kind}-minutes`}
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
                          onClick={() =>
                            setScope((s) => (on ? s.filter((x) => x !== u.id) : [...s, u.id]))
                          }
                          className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            on ? "bg-slate-100" : "hover:bg-slate-50"
                          }`}
                          aria-pressed={on}
                        >
                          <span
                            className={`flex size-4.5 shrink-0 items-center justify-center rounded border ${
                              on ? "border-transparent text-white" : "border-border"
                            }`}
                            style={on ? { backgroundColor: course?.color } : undefined}
                          >
                            {on && <Check className="size-3" />}
                          </span>
                          <span
                            className={`min-w-0 flex-1 truncate ${u.completed ? "text-muted-foreground line-through" : "text-ink"}`}
                          >
                            {u.title}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatMinutes(unitMinutes(u))}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {units.length > 1 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="xs" onClick={() => setScope(units.map((u) => u.id))}>
                    全選
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setScope(units.filter((u) => !u.completed).map((u) => u.id))}
                  >
                    只選未完成
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setScope([])}>
                    清除
                  </Button>
                </div>
              )}
            </div>
          )}
          {kind !== "progress" && (
            <div className="grid gap-2">
              <Label htmlFor={`${kind}-note`}>備註（選填）</Label>
              <Textarea
                id={`${kind}-note`}
                placeholder="範圍、地點或其他提醒…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editId ? "儲存" : "新增"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
