"use client";

import type { ReactNode } from "react";
import type { Person } from "@/components/shared-view";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function GameScreen({
  title,
  subtitle,
  rules,
  onBack,
  children,
}: {
  title: string;
  subtitle: string;
  rules: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回小遊戲
      </Button>
      <header>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">{title}</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{rules}</p>
      </header>
      {children}
    </div>
  );
}

export function GameCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg text-ink">{title}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function OpponentPicker({
  opponents,
  value,
  onChange,
}: {
  opponents: Person[];
  value: string;
  onChange: (userId: string) => void;
}) {
  if (opponents.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {opponents.map((p) => (
        <button
          key={p.userId}
          type="button"
          onClick={() => onChange(p.userId)}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
            p.userId === value
              ? "border-ink bg-ink text-white"
              : "border-border/80 bg-white text-muted-foreground hover:text-ink"
          }`}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

export function Verdict({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="space-y-1">
      <p className="font-display text-2xl text-ink">{text}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export const LoadingLine = () => (
  <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>
);

/** Poll while the page is visible. */
export function startPolling(refresh: () => void, ms: number) {
  const first = setTimeout(refresh, 0);
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, ms);
  const onVisible = () => {
    if (document.visibilityState === "visible") refresh();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
