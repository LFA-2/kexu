"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { parseBackup, shareOrDownloadBackup } from "@/lib/backup";
import { useSchool } from "@/store/school-store";
import { Download, Upload } from "lucide-react";

export function DataTools() {
  const { courses, homework, exams, progress, replaceAll } = useSchool();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onImport(file: File) {
    const next = parseBackup(await file.text());
    if (!next) {
      alert("這不是有效的課序備份檔。");
      return;
    }
    const summary = `${next.courses.length} 門課、${next.homework.length} 項作業、${next.exams.length} 場考試`;
    if (confirm(`匯入後會取代這台裝置上目前的資料。\n備份內容：${summary}\n確定匯入？`)) {
      replaceAll(next);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => shareOrDownloadBackup({ courses, homework, exams, progress })}
      >
        <Download className="size-3.5" />
        匯出備份
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="size-3.5" />
        匯入備份
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onImport(file);
        }}
      />
    </div>
  );
}
