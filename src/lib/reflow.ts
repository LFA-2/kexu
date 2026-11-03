/**
 * Order-first scheduling for the 今日 list: the user decides the order, the times follow.
 * Items are laid one after another from `cursor`, stepping around blocked intervals
 * (classes, 行程, items whose time is pinned).
 */
export type Interval = [number, number];

export const REFLOW_STEP = 5;

const up = (m: number) => Math.ceil(m / REFLOW_STEP) * REFLOW_STEP;

function earliestFit(from: number, dur: number, blocked: Interval[]) {
  let t = up(from);
  for (let n = 0; n <= blocked.length + 1; n++) {
    const hit = blocked.find(([a, b]) => t < b && t + dur > a);
    if (!hit) return t;
    t = up(hit[1]);
  }
  return t;
}

/** Start of the next blocked interval at or after t (or Infinity), and the end of one t sits in. */
function room(t: number, blocked: Interval[]) {
  const inside = blocked.find(([a, b]) => t >= a && t < b);
  if (inside) return { inside: inside[1], next: t };
  const next = Math.min(Infinity, ...blocked.filter(([a]) => a >= t).map(([a]) => a));
  return { inside: null, next };
}

/**
 * Minute of day each item starts at.
 * strict: keep the given order exactly.
 * fill: when the next item doesn't fit before a blocked interval, pull a later one that does.
 */
export function reflow(
  items: { id: string; dur: number }[],
  blocked: Interval[],
  cursor: number,
  fill = false,
): Map<string, number> {
  const out = new Map<string, number>();
  const sorted = [...blocked].sort((a, b) => a[0] - b[0]);
  let t = cursor;
  if (!fill) {
    for (const it of items) {
      const s = earliestFit(t, Math.max(REFLOW_STEP, it.dur), sorted);
      out.set(it.id, s);
      t = s + Math.max(REFLOW_STEP, it.dur);
    }
    return out;
  }
  const left = [...items];
  let guard = 0;
  while (left.length && guard++ < 500) {
    t = up(t);
    const r = room(t, sorted);
    if (r.inside !== null) {
      t = r.inside;
      continue;
    }
    const gap = r.next - t;
    const k = left.findIndex((it) => Math.max(REFLOW_STEP, it.dur) <= gap);
    if (k === -1) {
      const end = sorted.find(([a]) => a === r.next)?.[1];
      if (end === undefined) break;
      t = end;
      continue;
    }
    const [it] = left.splice(k, 1);
    out.set(it.id, t);
    t += Math.max(REFLOW_STEP, it.dur);
  }
  for (const it of left) {
    const s = earliestFit(t, Math.max(REFLOW_STEP, it.dur), sorted);
    out.set(it.id, s);
    t = s + Math.max(REFLOW_STEP, it.dur);
  }
  return out;
}

export const hhmm = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
