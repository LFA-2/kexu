"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toDateKey } from "@/lib/dates";
import { useLife } from "@/store/life-store";

export function NoteCard() {
  const { notes, readOnly, setNote } = useLife();
  const today = toDateKey(new Date());
  const saved = notes[today] ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;

  return (
    <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
      <h3 className="font-display text-lg text-ink">今日須知</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {readOnly ? "今天留給連結的人的話" : "留給連結的人看的話，只顯示今天這一則"}
      </p>
      {readOnly ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {saved || <span className="text-muted-foreground">今天沒有留言</span>}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <Textarea
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例如：今天晚上要練團，訊息晚點回"
            rows={3}
            maxLength={2000}
          />
          <div className="flex items-center justify-end gap-2">
            {draft === null && saved && <span className="text-xs text-muted-foreground">已儲存</span>}
            <Button
              size="sm"
              disabled={draft === null || draft.trim() === saved}
              onClick={() => {
                setNote(today, value);
                setDraft(null);
              }}
            >
              儲存
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
