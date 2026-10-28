import "server-only";
import fs from "node:fs";
import path from "node:path";
import { EMPTY_STATE, type SchoolState, type StoredState } from "@/lib/types";

const DATA_FILE =
  process.env.KEXU_DATA_FILE ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "school.json");

export function readStored(): StoredState {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as StoredState;
    if (typeof parsed.version === "number" && parsed.state) return parsed;
  } catch {
    // missing or unreadable file: start empty
  }
  return { version: 0, state: EMPTY_STATE };
}

// Sync I/O keeps read-check-write atomic within the single Node process.
export function writeIfVersion(
  baseVersion: number,
  state: SchoolState,
): { ok: true; stored: StoredState } | { ok: false; stored: StoredState } {
  const current = readStored();
  if (current.version !== baseVersion) return { ok: false, stored: current };

  const next: StoredState = { version: current.version + 1, state };
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(DATA_FILE, `${DATA_FILE}.bak`);
  }
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, DATA_FILE);
  return { ok: true, stored: next };
}
