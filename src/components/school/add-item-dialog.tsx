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
import { useSchool } from "@/store/school-store";
import { Plus } from "lucide-react";
import { toDateKey } from "@/lib/dates";

type Kind = "homework" | "exam" | "progress";

const COPY: Record<
  Kind,
  { title: string; desc: string; titleLabel: string; titlePh: string; dateLabel?: string }
> = {
  homework: {
    title: "新增作業",
    desc: "作業會出現在作業頁的月曆與時間線。",
    titleLabel: "作業標題",
    titlePh: "例如：習題 3.2",
    dateLabel: "截止日期",
  },
  exam: {
    title: "新增考試",
    desc: "考試會出現在考試頁的月曆與時間線。",
    titleLabel: "考試名稱",
    titlePh: "例如：期中考",
    dateLabel: "考試日期",
  },
  progress: {
    title: "新增讀書單元",
    desc: "完成單元後，該門課的進度條會自動更新。",
    titleLabel: "單元名稱",
    titlePh: "例如：第 5 章 積分",
  },
};

export function AddItemDialog({ kind, courseId }: { kind: Kind; courseId: string }) {
  const { courses, addHomework, addExam, addProgressUnit } = useSchool();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [note, setNote] = useState("");

  const copy = COPY[kind];
  const course = courses.find((c) => c.id === courseId);

  function submit() {
    if (!title.trim() || !course) return;
    if (kind === "homework") {
      addHomework({ courseId, title: title.trim(), dueDate: date, note: note.trim() });
    } else if (kind === "exam") {
      addExam({ courseId, title: title.trim(), date, note: note.trim() });
    } else {
      addProgressUnit(courseId, title.trim());
    }
    setTitle("");
    setNote("");
    setDate(toDateKey(new Date()));
    setOpen(false);
  }

  return (
    <>
      <Button className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        {copy.title}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
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
              />
            </div>
            {kind !== "progress" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor={`${kind}-date`}>{copy.dateLabel}</Label>
                  <Input
                    id={`${kind}-date`}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
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
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={!title.trim()}>
              新增
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
