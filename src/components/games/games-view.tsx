"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Hash } from "lucide-react";

export function GamesView({ onBack, onOpenAb }: { onBack: () => void; onOpenAb: () => void }) {
  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回共同
      </Button>

      <header>
        <p className="text-sm text-muted-foreground">和連結的人一起玩</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">小遊戲</h2>
      </header>

      <button
        type="button"
        onClick={onOpenAb}
        className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-white p-4 text-left transition-colors hover:border-slate-300 sm:p-5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink">
          <Hash className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display block text-lg text-ink">1A2B</span>
          <span className="block truncate text-xs text-muted-foreground">
            每天設一組 4 位數字，猜對方的數字，次數少的人贏
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}
