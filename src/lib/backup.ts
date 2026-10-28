import { format } from "date-fns";
import { isSchoolState, type SchoolState } from "@/lib/types";

export function serializeBackup(state: SchoolState) {
  return JSON.stringify(
    { app: "kexu", format: 1, exportedAt: new Date().toISOString(), state },
    null,
    2,
  );
}

/** Accepts this app's backup files, the old server data file, or a bare state object. */
export function parseBackup(text: string): SchoolState | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (isSchoolState(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && isSchoolState((parsed as { state?: unknown }).state)) {
      return (parsed as { state: SchoolState }).state;
    }
  } catch {
    // not JSON
  }
  return null;
}

export async function shareOrDownloadBackup(state: SchoolState) {
  const name = `kexu-backup-${format(new Date(), "yyyyMMdd-HHmm")}.json`;
  const file = new File([serializeBackup(state)], name, { type: "application/json" });

  // iOS standalone apps ignore <a download>; the share sheet offers "Save to Files".
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "課序備份" });
      return;
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
