"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Castle, ChevronRight, Goal, Hash, Ship, type LucideIcon } from "lucide-react";

export type GameId = "ab" | "battleship" | "blotto" | "penalty";

const GAMES: { id: GameId; name: string; description: string; icon: LucideIcon }[] = [
  { id: "ab", name: "1A2B", description: "每天設一組 4 位數字，猜對方的數字，次數少的人贏", icon: Hash },
  { id: "battleship", name: "海戰棋", description: "藏好 4 艘船，輪流開砲，先擊沉對方全部的人贏", icon: Ship },
  { id: "blotto", name: "攻城戰", description: "每天分配 10 個兵去攻城和守城，攻下比較多城的人贏", icon: Castle },
  { id: "penalty", name: "點球大戰", description: "五球決勝，猜對方往哪射、往哪撲", icon: Goal },
];

export function GamesView({ onBack, onOpen }: { onBack: () => void; onOpen: (id: GameId) => void }) {
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

      <div className="grid gap-3 sm:grid-cols-2">
        {GAMES.map(({ id, name, description, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onOpen(id)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-white p-4 text-left transition-colors hover:border-slate-300 sm:p-5"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-display block text-lg text-ink">{name}</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">{description}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
