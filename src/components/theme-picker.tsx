"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { applyTheme, readTheme, subscribeTheme, THEMES, type ThemeId } from "@/lib/themes";

export function ThemePicker() {
  const current = useSyncExternalStore(subscribeTheme, readTheme, (): ThemeId => "default");

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="listbox" aria-label="主題">
      {THEMES.map((theme) => {
        const selected = current === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => applyTheme(theme.id)}
            className={`rounded-xl p-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
              selected ? "ring-2 ring-primary" : ""
            }`}
          >
            <span
              className="relative block overflow-hidden rounded-lg border border-black/10"
              style={{ background: theme.preview.bg }}
            >
              <span className="mx-1.5 mt-1.5 block h-5 rounded-md shadow-sm" style={{ background: theme.preview.card }} />
              <span className="mx-1.5 mt-1 mb-1.5 block h-1.5 w-7 rounded-full" style={{ background: theme.preview.accent }} />
              {selected && (
                <span
                  className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full"
                  style={{ background: theme.preview.accent, color: theme.id === "black" ? "#042f2e" : "#fff" }}
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className={`mt-1 block text-center text-xs ${selected ? "font-medium text-ink" : "text-muted-foreground"}`}>
              {theme.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
