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
import { COURSE_COLORS } from "@/lib/types";
import { useSchool } from "@/store/school-store";
import { Plus } from "lucide-react";

export function AddCourseDialog() {
  const { addCourse } = useSchool();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COURSE_COLORS[0].value);

  function submit() {
    if (!name.trim()) return;
    addCourse(name, color);
    setName("");
    setColor(COURSE_COLORS[0].value);
    setOpen(false);
  }

  return (
    <>
      <Button className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新增課程
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增課程</DialogTitle>
            <DialogDescription>
              為每門課選一個主題色，之後作業、考試、進度都會用這個顏色區分。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="course-name">課程名稱</Label>
              <Input
                id="course-name"
                placeholder="例如：微積分"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
            <div className="grid gap-2">
              <Label>主題色</Label>
              <div className="flex flex-wrap gap-2">
                {COURSE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    onClick={() => setColor(c.value)}
                    className="size-9 rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      backgroundColor: c.value,
                      boxShadow:
                        color === c.value
                          ? `0 0 0 2px white, 0 0 0 4px ${c.value}`
                          : undefined,
                    }}
                    aria-label={c.name}
                    aria-pressed={color === c.value}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={!name.trim()}>
              建立課程
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
