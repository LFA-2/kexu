"use client";

import { MonthCalendar } from "@/components/month-calendar";
import { Button } from "@/components/ui/button";
import { formatShortDate, toDateKey } from "@/lib/dates";
import { useLife } from "@/store/life-store";
import { ArrowLeft } from "lucide-react";

export function AvailabilityView({ color, onBack }: { color: string; onBack: () => void }) {
  const { available, readOnly, toggleAvailable } = useLife();
  const today = toDateKey(new Date());
  const upcoming = available.filter((d) => d >= today);
  const selected = new Map(available.map((d) => [d, color]));

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回生活
      </Button>

      <header>
        <p className="text-sm text-muted-foreground">
          {readOnly ? "有空可以約的日子" : "點日期標記有空可以約的日子，再點一次取消"}
        </p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">
          可約會日期
        </h2>
      </header>

      <MonthCalendar
        selected={selected}
        onDayClick={readOnly ? undefined : toggleAvailable}
        isDayDisabled={(key) => key < today}
      />

      <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
        <h3 className="font-display text-lg text-ink">接下來有空</h3>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">還沒有標記任何日期</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {upcoming.map((d) => (
              <span
                key={d}
                className="rounded-full px-3 py-1 text-sm text-white"
                style={{ backgroundColor: color }}
              >
                {formatShortDate(d)}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
