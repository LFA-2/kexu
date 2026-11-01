"use client";

import { useMemo, useState } from "react";
import { addDays, format, parseISO, startOfWeek, subDays, subWeeks } from "date-fns";
import { BarChart, LineChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toDateKey } from "@/lib/dates";
import {
  e1rm,
  formatKg,
  formatPace,
  sessionCardio,
  sessionVolume,
  type Exercise,
} from "@/lib/fitness";
import { useFitness } from "@/store/fitness-store";
import { ArrowLeft, Trophy } from "lucide-react";

export function StatsView({ onBack }: { onBack: () => void }) {
  const { sessions, exerciseById } = useFitness();
  const [metric, setMetric] = useState<"volume" | "minutes" | "distance" | "count">("volume");

  const weeks = useMemo(() => {
    const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 12 }, (_, i) => {
      const start = subWeeks(thisWeek, 11 - i);
      const from = toDateKey(start);
      const to = toDateKey(addDays(start, 6));
      const inWeek = sessions.filter((s) => s.date >= from && s.date <= to);
      return {
        key: from,
        label: format(start, "M/d"),
        volume: inWeek.reduce((a, s) => a + sessionVolume(s), 0),
        minutes: inWeek.reduce((a, s) => a + s.durationMin, 0),
        distance: inWeek.reduce((a, s) => a + sessionCardio(s).distance, 0),
        count: inWeek.length,
        current: i === 11,
      };
    });
  }, [sessions]);

  const METRICS = {
    volume: { label: "訓練量", unit: " kg", fmt: (v: number) => Math.round(v).toLocaleString() },
    minutes: { label: "運動時間", unit: " 分", fmt: (v: number) => String(Math.round(v)) },
    distance: { label: "有氧距離", unit: " km", fmt: (v: number) => v.toFixed(1) },
    count: { label: "次數", unit: " 次", fmt: (v: number) => String(v) },
  } as const;
  const m = METRICS[metric];

  // Exercises that have been done, most frequent first
  const done = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of sessions) for (const e of s.entries) count.set(e.exerciseId, (count.get(e.exerciseId) ?? 0) + 1);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .flatMap(([id]) => (exerciseById.get(id) ? [exerciseById.get(id)!] : []));
  }, [sessions, exerciseById]);
  const [exId, setExId] = useState<string | null>(null);
  const ex = done.find((e) => e.id === exId) ?? done[0];

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回運動
      </Button>
      <header>
        <p className="text-sm text-muted-foreground">每週趨勢、各動作的進步與個人紀錄</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">分析</h2>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg text-ink">近 12 週・{m.label}</h3>
          <div className="flex rounded-lg border border-border/80 p-0.5">
            {(Object.keys(METRICS) as (keyof typeof METRICS)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setMetric(k)}
                className={`rounded-md px-2 py-1 text-xs ${metric === k ? "bg-chip text-chip-foreground" : "text-muted-foreground"}`}
              >
                {METRICS[k].label}
              </button>
            ))}
          </div>
        </div>
        <BarChart
          data={weeks.map((w) => ({
            key: w.key,
            label: w.label,
            value: w[metric],
            highlight: w.current,
            tip: `${m.fmt(w[metric])}${m.unit}`,
          }))}
          format={m.fmt}
          unit={m.unit}
        />
        <p className="mt-2 text-xs text-muted-foreground">標示週的起始日（週一）；最右邊是本週</p>
      </section>

      {ex ? (
        <ExerciseProgress ex={ex} options={done} onPick={setExId} />
      ) : (
        <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          完成第一次訓練後就會出現各動作的進步曲線
        </p>
      )}

      <PrTable />
    </div>
  );
}

function ExerciseProgress({
  ex,
  options,
  onPick,
}: {
  ex: Exercise;
  options: Exercise[];
  onPick: (id: string) => void;
}) {
  const { sessions } = useFitness();
  const rows = useMemo(
    () =>
      sessions
        .filter((s) => s.entries.some((e) => e.exerciseId === ex.id))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => {
          const entries = s.entries.filter((e) => e.exerciseId === ex.id);
          const sets = entries.flatMap((e) => e.sets ?? []);
          const cardio = entries.reduce(
            (a, e) => ({ minutes: a.minutes + (e.cardio?.minutes ?? 0), distance: a.distance + (e.cardio?.distance ?? 0) }),
            { minutes: 0, distance: 0 },
          );
          return {
            date: s.date,
            best1rm: Math.max(0, ...sets.map((x) => e1rm(x.weight, x.reps))),
            maxW: Math.max(0, ...sets.map((x) => x.weight)),
            maxReps: Math.max(0, ...sets.map((x) => x.reps)),
            ...cardio,
          };
        })
        .slice(-30),
    [sessions, ex.id],
  );
  const cardio = ex.kind === "cardio";
  const weighted = !ex.bodyweight || rows.some((r) => r.maxW > 0);
  const points = rows.map((r) => ({
    key: r.date,
    label: format(parseISO(r.date), "M/d"),
    value: cardio
      ? r.distance > 0
        ? r.minutes / r.distance
        : r.minutes
      : weighted
        ? r.best1rm
        : r.maxReps,
  }));
  const cardioByPace = cardio && rows.some((r) => r.distance > 0);
  const label = cardio ? (cardioByPace ? "配速（分/km，越低越快）" : "時間（分）") : weighted ? "估計 1RM（kg）" : "最多次數";

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-ink">動作進步</h3>
        <select
          value={ex.id}
          onChange={(e) => onPick(e.target.value)}
          className="h-8 rounded-lg border border-input bg-card px-2 text-sm"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{label}・最近 {rows.length} 次</p>
      <LineChart
        points={points}
        format={(v) => (cardioByPace ? `${Math.floor(v)}'${String(Math.round((v % 1) * 60)).padStart(2, "0")}` : v.toFixed(cardio ? 0 : 1))}
        unit={cardio ? (cardioByPace ? "/km" : " 分") : weighted ? " kg" : " 次"}
      />
    </section>
  );
}

function PrTable() {
  const { sessions, exerciseById } = useFitness();
  const prs = useMemo(() => {
    const best = new Map<string, { w: number; r: number; one: number; date: string }>();
    const cardioBest = new Map<string, { km: number; pace: string; date: string }>();
    for (const s of sessions) {
      for (const e of s.entries) {
        for (const x of e.sets ?? []) {
          const one = e1rm(x.weight, x.reps);
          const cur = best.get(e.exerciseId);
          if (!cur || one > cur.one) best.set(e.exerciseId, { w: x.weight, r: x.reps, one, date: s.date });
        }
        if (e.cardio?.distance) {
          const cur = cardioBest.get(e.exerciseId);
          if (!cur || e.cardio.distance > cur.km)
            cardioBest.set(e.exerciseId, {
              km: e.cardio.distance,
              pace: formatPace(e.cardio.minutes, e.cardio.distance),
              date: s.date,
            });
        }
      }
    }
    return { best, cardioBest };
  }, [sessions]);

  if (prs.best.size === 0 && prs.cardioBest.size === 0) return null;
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <h3 className="font-display mb-3 flex items-center gap-2 text-lg text-ink">
        <Trophy className="size-4 text-amber-600" />
        個人紀錄
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-normal">動作</th>
            <th className="pb-2 font-normal">最佳</th>
            <th className="pb-2 text-right font-normal">估計 1RM／配速</th>
          </tr>
        </thead>
        <tbody>
          {[...prs.best.entries()].map(([id, p]) => (
            <tr key={id} className="border-t border-border/50">
              <td className="py-1.5 text-ink">{exerciseById.get(id)?.name}</td>
              <td className="py-1.5 tabular-nums text-muted-foreground">
                {formatKg(p.w)} kg × {p.r}
                <span className="ml-1 text-[11px]">{format(parseISO(p.date), "M/d")}</span>
              </td>
              <td className="py-1.5 text-right tabular-nums text-ink">{p.one.toFixed(1)} kg</td>
            </tr>
          ))}
          {[...prs.cardioBest.entries()].map(([id, p]) => (
            <tr key={id} className="border-t border-border/50">
              <td className="py-1.5 text-ink">{exerciseById.get(id)?.name}</td>
              <td className="py-1.5 tabular-nums text-muted-foreground">
                最遠 {p.km} km
                <span className="ml-1 text-[11px]">{format(parseISO(p.date), "M/d")}</span>
              </td>
              <td className="py-1.5 text-right tabular-nums text-ink">{p.pace}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function BodyView({ onBack }: { onBack: () => void }) {
  const { body, readOnly, setBody } = useFitness();
  const today = toDateKey(new Date());
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState(body[today]?.weight?.toString() ?? "");
  const [fat, setFat] = useState(body[today]?.fat?.toString() ?? "");
  const [range, setRange] = useState(90);

  const points = Array.from({ length: range }, (_, i) => {
    const d = toDateKey(subDays(new Date(), range - 1 - i));
    return { key: d, label: format(parseISO(d), "M/d"), value: body[d]?.weight };
  });
  const fatPoints = points.map((p) => ({ ...p, value: body[p.key]?.fat }));
  const entries = Object.entries(body).sort((a, b) => b[0].localeCompare(a[0]));
  const latest = entries.find(([, v]) => v.weight !== undefined);
  const first = [...entries].reverse().find(([d, v]) => v.weight !== undefined && d >= toDateKey(subDays(new Date(), 30)));

  function pickDate(d: string) {
    setDate(d);
    setWeight(body[d]?.weight?.toString() ?? "");
    setFat(body[d]?.fat?.toString() ?? "");
  }

  function save() {
    const w = Number(weight);
    const f = Number(fat);
    setBody(date, {
      ...(weight && w > 0 ? { weight: Math.round(w * 10) / 10 } : {}),
      ...(fat && f > 0 ? { fat: Math.round(f * 10) / 10 } : {}),
    });
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回運動
      </Button>
      <header>
        <p className="text-sm text-muted-foreground">體重與體脂的變化</p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">身體數據</h2>
        {latest && (
          <p className="mt-2 text-sm text-ink">
            目前 {latest[1].weight} kg
            {first && first[0] !== latest[0] && (
              <span className="ml-2 text-muted-foreground">
                30 天內 {(latest[1].weight! - first[1].weight!) >= 0 ? "+" : ""}
                {(latest[1].weight! - first[1].weight!).toFixed(1)} kg
              </span>
            )}
          </p>
        )}
      </header>

      {!readOnly && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
          <label className="col-span-2 grid gap-1 text-xs text-muted-foreground sm:col-span-1">
            日期
            <Input type="date" value={date} max={today} onChange={(e) => e.target.value && pickDate(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            體重 kg
            <Input type="number" inputMode="decimal" step={0.1} value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            體脂 %（選填）
            <Input type="number" inputMode="decimal" step={0.1} value={fat} onChange={(e) => setFat(e.target.value)} />
          </label>
          <Button className="col-span-2 sm:col-span-1" onClick={save}>
            儲存
          </Button>
        </div>
      )}

      <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg text-ink">體重</h3>
          <div className="flex rounded-lg border border-border/80 p-0.5">
            {[30, 90, 365].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-md px-2 py-1 text-xs ${range === r ? "bg-chip text-chip-foreground" : "text-muted-foreground"}`}
              >
                {r === 365 ? "1 年" : `${r} 天`}
              </button>
            ))}
          </div>
        </div>
        <LineChart points={points} unit=" kg" />
      </section>
      {fatPoints.some((p) => p.value !== undefined) && (
        <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
          <h3 className="font-display mb-3 text-lg text-ink">體脂</h3>
          <LineChart points={fatPoints} unit="%" />
        </section>
      )}
    </div>
  );
}
