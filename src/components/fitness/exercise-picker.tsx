"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MUSCLES, type ExerciseKind, type Muscle } from "@/lib/fitness";
import { useFitness } from "@/store/fitness-store";
import { Plus, Search } from "lucide-react";

export function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exerciseId: string) => void;
}) {
  const { allExercises, addExercise, readOnly } = useFitness();
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<Muscle | "all">("all");
  const [creating, setCreating] = useState(false);
  const [newKind, setNewKind] = useState<ExerciseKind>("strength");
  const [newMuscle, setNewMuscle] = useState<Muscle>("胸");

  const list = useMemo(
    () =>
      allExercises.filter(
        (e) =>
          (muscle === "all" || e.muscle === muscle) &&
          (!q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [allExercises, muscle, q],
  );

  function pick(id: string) {
    onPick(id);
    setQ("");
    setCreating(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>選擇動作</DialogTitle>
          <DialogDescription>找不到的話可以自己新增。</DialogDescription>
        </DialogHeader>
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜尋動作"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex shrink-0 gap-1 overflow-x-auto pb-1">
          {(["all", ...MUSCLES] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMuscle(m)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${
                muscle === m ? "border-chip bg-chip text-chip-foreground" : "border-border/80 text-muted-foreground"
              }`}
            >
              {m === "all" ? "全部" : m}
            </button>
          ))}
        </div>
        <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {list.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => pick(e.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-soft"
              >
                <span className="text-ink">{e.name}</span>
                <span className="text-xs text-muted-foreground">
                  {e.muscle}
                  {e.custom ? "・自訂" : ""}
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && !creating && (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">沒有符合的動作</li>
          )}
        </ul>
        {!readOnly &&
          (creating ? (
            <div className="grid gap-2 rounded-lg border border-border/70 p-3">
              <Input
                placeholder="動作名稱"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={40}
                autoFocus
              />
              <div className="flex gap-2">
                <select
                  value={newKind}
                  onChange={(e) => {
                    const k = e.target.value as ExerciseKind;
                    setNewKind(k);
                    if (k === "cardio") setNewMuscle("有氧");
                  }}
                  className="h-8 flex-1 rounded-lg border border-input bg-card px-2 text-sm"
                >
                  <option value="strength">重量訓練</option>
                  <option value="cardio">有氧</option>
                </select>
                <select
                  value={newMuscle}
                  onChange={(e) => setNewMuscle(e.target.value as Muscle)}
                  className="h-8 flex-1 rounded-lg border border-input bg-card px-2 text-sm"
                >
                  {MUSCLES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <Button
                disabled={!q.trim()}
                onClick={() => pick(addExercise({ name: q, kind: newKind, muscle: newMuscle }))}
              >
                新增並加入
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="gap-1.5" onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" />
              自訂動作
            </Button>
          ))}
      </DialogContent>
    </Dialog>
  );
}
