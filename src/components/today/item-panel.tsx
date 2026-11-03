"use client";

import { useEffect, useRef, useState } from "react";
import { MinutesField } from "@/components/minutes-field";
import { TimeField, parseTime } from "@/components/time-field";
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
import { toMinutes, type PlanItem } from "@/lib/life";
import { hhmm } from "@/lib/reflow";
import { formatMinutes } from "@/lib/types";
import { CalendarArrowUp, Lock, Pin, Trash2 } from "lucide-react";

/**
 * Everything about one item in one place: today's progress, when, how long,
 * pin the time, move to tomorrow, remove.
 */
export function ItemPanel({
  item,
  color,
  fraction,
  overall,
  workoutLogged,
  waitFor,
  readOnly,
  future,
  canMove,
  onProgress,
  onSave,
  onRemove,
  onMoveTomorrow,
  onClose,
}: {
  item: PlanItem;
  color: string;
  fraction: number;
  /** overall % of the source for homework/units, else null */
  overall: number | null;
  workoutLogged: boolean;
  waitFor?: string;
  readOnly: boolean;
  future: boolean;
  /** Today: times flow, and the item can go to tomorrow. */
  canMove: boolean;
  onProgress: (pct: number) => void;
  /** follow: drop the fixed time and let it sit right after the item before it */
  onSave: (item: PlanItem, follow: boolean) => void;
  onRemove: () => void;
  onMoveTomorrow?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [start, setStart] = useState(item.start);
  const [minutes, setMinutes] = useState<number | null>(item.minutes);
  const [pinned, setPinned] = useState(!!item.pinned);
  const [follow, setFollow] = useState(false);
  const custom = item.kind === "custom";

  const isWork = overall !== null;
  const value = isWork ? overall : Math.round(fraction * 100);
  const target = isWork ? Math.min(100, Math.round((item.base ?? 0) + (item.share ?? 0))) : null;
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = draft ?? value;
  const locked = readOnly || future || !!waitFor || (item.kind === "workout" && workoutLogged);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  function change(v: number) {
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onProgress(v);
      setDraft(null);
    }, 350);
  }

  function nudge(d: number) {
    const base = parseTime(start) ?? item.start;
    const m = base ? toMinutes(base) : 9 * 60;
    setStart(hhmm(Math.min(23 * 60 + 55, Math.max(0, Math.round((m + d) / 5) * 5))));
    setPinned(true);
    setFollow(false);
  }

  const startOk = parseTime(start);
  const end = startOk && minutes ? hhmm(toMinutes(startOk) + minutes) : "";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="min-w-0 truncate">{item.title}</span>
          </DialogTitle>
          {item.detail && <DialogDescription>{item.detail}</DialogDescription>}
        </DialogHeader>

        <section className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label>{isWork ? "整體進度" : future ? "這天進度" : "今天進度"}</Label>
            <span className="text-sm tabular-nums text-ink">{shown}%</span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={shown}
              disabled={locked}
              onChange={(e) => change(Number(e.target.value))}
              className="progress-range w-full"
              style={{ "--fill": `${shown}%`, "--accent": color } as React.CSSProperties}
              aria-label={`${item.title} 進度`}
            />
            {target !== null && target < 100 && (
              <span
                className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-chip"
                style={{ left: `calc(${target}% - 1px)` }}
              />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {waitFor ? (
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3" />
                完成「{waitFor}」後開始
              </span>
            ) : isWork ? (
              `${future ? "這天" : "今天"}目標 ${target}%${target === 100 ? "（做完）" : ""}，拉到 100% 就算完成`
            ) : item.kind === "workout" ? (
              workoutLogged ? "已在「運動」記錄今天的訓練 ✓" : "到「運動」完成訓練會自動打勾"
            ) : (
              "拉到 100% 就算完成"
            )}
          </p>
        </section>

        {!readOnly && (
          <section className="grid gap-4 border-t border-border/60 pt-4">
            {custom && (
              <div className="grid gap-2">
                <Label htmlFor="pi-title">名稱</Label>
                <Input id="pi-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
              </div>
            )}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pi-start">開始時間</Label>
                {end && !follow && <span className="text-xs tabular-nums text-muted-foreground">到 {end}</span>}
              </div>
              {follow ? (
                <p className="rounded-lg bg-soft px-3 py-2 text-sm text-ink">
                  接在前一件後面，時間會自動算
                  <button type="button" className="ml-2 text-xs text-muted-foreground underline" onClick={() => setFollow(false)}>
                    改回指定時間
                  </button>
                </p>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="tabular-nums" onClick={() => nudge(-15)}>
                    −15
                  </Button>
                  <div className="min-w-0 flex-1">
                    <TimeField
                      id="pi-start"
                      value={start}
                      onChange={(v) => {
                        setStart(v);
                        setPinned(true);
                      }}
                    />
                  </div>
                  <Button type="button" variant="outline" size="sm" className="tabular-nums" onClick={() => nudge(15)}>
                    +15
                  </Button>
                </div>
              )}
              {canMove && (
                <div className="flex flex-wrap items-center gap-2">
                  {!follow && (
                    <button
                      type="button"
                      className="rounded-full border border-border/80 px-3 py-1 text-xs text-ink hover:bg-soft"
                      onClick={() => {
                        setFollow(true);
                        setPinned(false);
                      }}
                    >
                      接在上一件後面
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-ink">
                    <input
                      type="checkbox"
                      checked={pinned}
                      disabled={follow}
                      onChange={(e) => setPinned(e.target.checked)}
                      className="size-3.5 accent-current"
                    />
                    <Pin className="size-3" />
                    固定這個時間（換順序時不移動）
                  </label>
                </div>
              )}
            </div>
            <MinutesField
              id="pi-min"
              label="要花多久"
              value={minutes}
              onChange={setMinutes}
              presets={[15, 30, 45, 60, 90, 120]}
            />
            {(item.kind === "homework" || item.kind === "unit") && (
              <p className="-mt-2 text-xs text-muted-foreground">
                改時間長度會一起調整今天的目標進度。目前 {formatMinutes(item.minutes)}。
              </p>
            )}
          </section>
        )}

        {!readOnly && (
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm(`拿掉「${item.title}」？重新排不會再把它加回來。`)) onRemove();
                }}
              >
                <Trash2 className="size-3.5" />
                刪除
              </Button>
              {onMoveTomorrow && (
                <Button variant="ghost" className="text-muted-foreground" onClick={onMoveTomorrow}>
                  <CalendarArrowUp className="size-3.5" />
                  移到明天
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                disabled={!minutes || (custom && !title.trim()) || (!follow && !!start && !startOk)}
                onClick={() => {
                  const m = minutes ?? item.minutes;
                  let share = item.share;
                  if ((item.kind === "homework" || item.kind === "unit") && item.share !== undefined && item.minutes > 0) {
                    share = Math.min(100 - (item.base ?? 0), Math.round(((item.share * m) / item.minutes) * 10) / 10);
                  }
                  onSave(
                    {
                      ...item,
                      title: custom ? title.trim() : item.title,
                      start: follow ? item.start : (startOk ?? ""),
                      minutes: m,
                      share,
                      pinned: !follow && pinned && !!startOk,
                    },
                    follow,
                  );
                }}
              >
                儲存
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
