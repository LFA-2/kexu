"use client";

import { Check } from "lucide-react";

export function CheckButton({
  done,
  color,
  readOnly,
  onToggle,
  className = "",
}: {
  done: boolean;
  color: string;
  readOnly: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={readOnly}
      className={`flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-default ${
        done
          ? "border-transparent text-white"
          : `border-border text-muted-foreground ${readOnly ? "" : "hover:border-teal-700"}`
      } ${className}`}
      style={done ? { backgroundColor: color } : undefined}
      aria-pressed={done}
      aria-label={done ? "已完成" : "未完成"}
    >
      <Check className="size-3.5" />
    </button>
  );
}
