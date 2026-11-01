"use client";

import type { ReactNode } from "react";
import { CheckButton } from "@/components/check-button";
import { AddItemDialog, EditItemButton } from "@/components/school/add-item-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatShortDate, relativeStatus } from "@/lib/dates";
import {
  formatMinutes,
  homeworkMinutes,
  unitDeadline,
  unitMinutes,
  type Exam,
  type ProgressUnit,
} from "@/lib/types";
import { useSchool } from "@/store/school-store";
import { ArrowLeft, Trash2 } from "lucide-react";

export function CourseDetailView({
  courseId,
  onBack,
}: {
  courseId: string;
  onBack: () => void;
}) {
  const {
    courses,
    homework,
    exams,
    progress,
    readOnly,
    courseProgress,
    toggleHomework,
    toggleExam,
    toggleProgressUnit,
    removeHomework,
    removeExam,
    removeProgressUnit,
    removeCourse,
  } = useSchool();

  const course = courses.find((c) => c.id === courseId);
  if (!course) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack} className="gap-1.5">
          <ArrowLeft data-icon="inline-start" />
          返回課程
        </Button>
        <p className="text-sm text-muted-foreground">找不到這門課。</p>
      </div>
    );
  }

  const { pct, done, total } = courseProgress(course.id);
  const units = progress
    .filter((p) => p.courseId === course.id)
    .sort((a, b) => a.order - b.order);
  const hw = homework
    .filter((h) => h.courseId === course.id)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const ex = exams
    .filter((e) => e.courseId === course.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
          <ArrowLeft data-icon="inline-start" />
          返回課程列表
        </Button>
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (confirm(`確定刪除「${course.name}」及其所有內容？`)) {
                removeCourse(course.id);
                onBack();
              }
            }}
          >
            <Trash2 className="size-3.5" />
            刪除課程
          </Button>
        )}
      </div>

      <header>
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ backgroundColor: course.color }} />
          <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            {course.name}
          </h2>
        </div>
        {!readOnly && (
          <p className="mt-2 text-sm text-muted-foreground">
            在這裡新增與管理作業、考試、讀書單元。
          </p>
        )}
        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-wash"
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
        <p className="mt-2 text-xs text-muted-foreground">
          讀書進度 {pct}%（{done}/{total || 0} 單元）
        </p>
      </header>

      <DetailSection
        title="作業"
        action={readOnly ? null : <AddItemDialog kind="homework" courseId={course.id} />}
      >
        {hw.length === 0 ? (
          <EmptyLine text="尚未新增作業" />
        ) : (
          <ul className="space-y-2">
            {hw.map((item) => (
              <ItemRow
                key={item.id}
                title={item.title}
                date={item.dueDate}
                note={item.note}
                meta={`約 ${formatMinutes(homeworkMinutes(item))}${item.estimatedMinutes ? "" : "（預設）"}`}
                partial={item.done ? undefined : item.progress}
                done={item.done}
                color={course.color}
                readOnly={readOnly}
                onToggle={() => toggleHomework(item.id)}
                onRemove={() => removeHomework(item.id)}
                edit={<EditItemButton kind="homework" courseId={course.id} id={item.id} />}
              />
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection
        title="考試"
        action={readOnly ? null : <AddItemDialog kind="exam" courseId={course.id} />}
      >
        {ex.length === 0 ? (
          <EmptyLine text="尚未新增考試" />
        ) : (
          <ul className="space-y-2">
            {ex.map((item) => (
              <ItemRow
                key={item.id}
                title={item.title}
                date={item.date}
                note={item.note}
                done={item.done}
                color={course.color}
                readOnly={readOnly}
                onToggle={() => toggleExam(item.id)}
                onRemove={() => removeExam(item.id)}
                edit={<EditItemButton kind="exam" courseId={course.id} id={item.id} />}
              >
                <ExamScope exam={item} units={units} color={course.color} />
              </ItemRow>
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection
        title="讀書進度"
        action={readOnly ? null : <AddItemDialog kind="progress" courseId={course.id} />}
      >
        {units.length === 0 ? (
          <EmptyLine text="尚未新增讀書單元" />
        ) : (
          <ul className="space-y-2">
            {units.map((unit) => (
              <li
                key={unit.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
              >
                <CheckButton
                  done={unit.completed}
                  color={course.color}
                  readOnly={readOnly}
                  onToggle={() => toggleProgressUnit(unit.id)}
                />
                <UnitText unit={unit} exams={exams} color={course.color} />
                {!readOnly && <EditItemButton kind="progress" courseId={course.id} id={unit.id} />}
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
      </DetailSection>
    </div>
  );
}

function DetailSection({
  title,
  action,
  children,
}: {
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function ItemRow({
  title,
  date,
  note,
  meta,
  partial,
  done,
  color,
  readOnly,
  onToggle,
  onRemove,
  edit,
  children,
}: {
  title: string;
  date: string;
  note: string;
  meta?: string;
  partial?: number;
  done: boolean;
  color: string;
  readOnly: boolean;
  onToggle: () => void;
  onRemove: () => void;
  edit?: ReactNode;
  children?: ReactNode;
}) {
  const status = relativeStatus(date, done);
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/60 bg-soft/60 px-3 py-3">
      <CheckButton
        done={done}
        color={color}
        readOnly={readOnly}
        onToggle={onToggle}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-medium ${done ? "text-muted-foreground line-through" : "text-ink"}`}
          >
            {title}
          </span>
          {status === "overdue" && (
            <Badge className="bg-rose-700 text-white hover:bg-rose-700">已過期</Badge>
          )}
          {status === "today" && (
            <Badge className="bg-teal-700 text-white hover:bg-teal-700">今天</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatShortDate(date)}
          {meta ? ` · ${meta}` : ""}
          {note ? ` · ${note}` : ""}
        </p>
        {partial !== undefined && partial > 0 && <PartialBar pct={partial} color={color} />}
        {children}
      </div>
      {!readOnly && edit}
      {!readOnly && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={onRemove}
          aria-label="刪除"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function PartialBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/70">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function UnitText({
  unit,
  exams,
  color,
}: {
  unit: ProgressUnit;
  exams: Exam[];
  color: string;
}) {
  const deadline = unitDeadline(unit, exams);
  const status = deadline ? relativeStatus(deadline, unit.completed) : null;
  const fromExam = deadline && !unit.dueDate;
  return (
    <div className="min-w-0 flex-1">
      <span
        className={`block text-sm ${unit.completed ? "text-muted-foreground line-through" : "text-ink"}`}
      >
        {unit.title}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
        <span>約 {formatMinutes(unitMinutes(unit))}</span>
        {deadline && (
          <span className={status === "overdue" ? "text-destructive" : undefined}>
            · {fromExam ? "考前 " : "期限 "}
            {formatShortDate(deadline)}
          </span>
        )}
        {!unit.completed && (unit.progress ?? 0) > 0 && (
          <span style={{ color }}>· 已讀 {unit.progress}%</span>
        )}
      </span>
    </div>
  );
}

export function ExamScope({
  exam,
  units,
  color,
}: {
  exam: Exam;
  units: ProgressUnit[];
  color: string;
}) {
  const inScope = units.filter((u) => exam.scope?.includes(u.id));
  if (inScope.length === 0) return null;
  const total = inScope.reduce((a, u) => a + unitMinutes(u), 0);
  const got = inScope.reduce(
    (a, u) => a + unitMinutes(u) * (u.completed ? 1 : (u.progress ?? 0) / 100),
    0,
  );
  const pct = total ? Math.round((got / total) * 100) : 0;
  const doneCount = inScope.filter((u) => u.completed).length;
  return (
    <div className="mt-2 rounded-lg bg-card/80 p-2 ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          考試範圍 {doneCount}/{inScope.length} 單元
          {total - got > 0 && `・還剩約 ${formatMinutes(Math.round(total - got))}`}
        </span>
        <span className="tabular-nums" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-wash">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {inScope.map((u) => (
          <span
            key={u.id}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              u.completed ? "bg-wash text-muted-foreground line-through" : "bg-wash text-ink"
            }`}
          >
            {u.title}
          </span>
        ))}
      </div>
    </div>
  );
}
