"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [15, 30, 60, 90, 120, 180];

export function MinutesField({
  id,
  label,
  value,
  onChange,
  placeholder,
  presets = PRESETS,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  presets?: number[];
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={5}
          max={1440}
          step={5}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(e.target.value === "" || !Number.isFinite(n) || n <= 0 ? null : Math.min(1440, Math.round(n)));
          }}
        />
        <span className="shrink-0 text-sm text-muted-foreground">分鐘</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              value === m
                ? "border-ink bg-ink text-white"
                : "border-border/80 bg-white text-muted-foreground hover:text-ink"
            }`}
          >
            {m < 60 ? `${m} 分` : `${m / 60} 小時`}
          </button>
        ))}
      </div>
    </div>
  );
}
