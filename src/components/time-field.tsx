"use client";

import { Input } from "@/components/ui/input";

/** Accept "14:30", "1430", "9:5" → "14:30", or null if it isn't a time. */
export function parseTime(raw: string): string | null {
  const t = raw.trim().replace(/：/g, ":");
  const m = t.match(/^(\d{1,2}):(\d{1,2})$/) ?? t.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Manual HH:mm input — no native time wheel. */
export function TimeField({
  id,
  value,
  onChange,
  "aria-label": ariaLabel,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="14:30"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      className="tabular-nums"
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const next = parseTime(value);
        if (next) onChange(next);
      }}
    />
  );
}
