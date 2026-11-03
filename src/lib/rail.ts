/** Minutes. Fixed blocks (今明行程) never move; the rest keep their order while being shoved. */
export const RAIL_SNAP = 10;

export type RailBlock = {
  id: string;
  start: number;
  dur: number;
  fixed: boolean;
};

const DAY = 24 * 60;

const snap = (m: number) => Math.round(m / RAIL_SNAP) * RAIL_SNAP;
const floorSnap = (m: number) => Math.floor(m / RAIL_SNAP) * RAIL_SNAP;
const ceilSnap = (m: number) => Math.ceil(m / RAIL_SNAP) * RAIL_SNAP;

function intervals(blocks: RailBlock[]) {
  return blocks
    .filter((b) => b.fixed && b.dur > 0)
    .map((b) => [b.start, b.start + b.dur] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

function hits(start: number, dur: number, fixed: [number, number][]) {
  const end = start + dur;
  return fixed.find(([a, b]) => start < b && end > a) ?? null;
}

/** Slide off a fixed block. `dir` is the way the user is dragging; the block stops them. */
function clampStart(start: number, dur: number, fixed: [number, number][], dir: 1 | -1, fallback: number) {
  let s = snap(Math.max(0, Math.min(start, DAY - RAIL_SNAP)));
  for (let n = 0; n < fixed.length + 4; n++) {
    const hit = hits(s, dur, fixed);
    if (!hit) return s;
    const nudged = dir > 0 ? floorSnap(hit[0] - dur) : ceilSnap(hit[1]);
    if (nudged === s) return fallback;
    s = Math.max(0, Math.min(nudged, DAY - RAIL_SNAP));
  }
  return fallback;
}

function movablesOf(blocks: RailBlock[]) {
  return blocks
    .filter((b) => !b.fixed)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

function cascadeDown(mov: RailBlock[], from: number, fixed: [number, number][]) {
  for (let i = from + 1; i < mov.length; i++) {
    const prevEnd = mov[i - 1].start + mov[i - 1].dur;
    if (mov[i].start >= prevEnd - 0.01) break;
    const next = clampStart(ceilSnap(prevEnd), mov[i].dur, fixed, 1, mov[i].start);
    if (next <= mov[i].start) break;
    mov[i] = { ...mov[i], start: next };
  }
}

function cascadeUp(mov: RailBlock[], from: number, fixed: [number, number][]) {
  for (let i = from - 1; i >= 0; i--) {
    const nextStart = mov[i + 1].start;
    if (mov[i].start + mov[i].dur <= nextStart + 0.01) break;
    const next = clampStart(floorSnap(nextStart - mov[i].dur), mov[i].dur, fixed, -1, mov[i].start);
    if (next >= mov[i].start) break;
    mov[i] = { ...mov[i], start: next };
  }
}

/**
 * Clear overlaps a shove could not. Push the later item forward when that fits;
 * otherwise pull the earlier one back. Fixed spans stay walls — nothing jumps over them.
 */
function repair(mov: RailBlock[], fixed: [number, number][]) {
  for (let pass = 0; pass < mov.length + 1; pass++) {
    let changed = false;
    for (let i = 1; i < mov.length; i++) {
      const prevEnd = mov[i - 1].start + mov[i - 1].dur;
      if (mov[i].start >= prevEnd - 0.01) continue;
      const pushed = clampStart(ceilSnap(prevEnd), mov[i].dur, fixed, 1, mov[i].start);
      if (pushed >= prevEnd - 0.01 && pushed > mov[i].start) {
        mov[i] = { ...mov[i], start: pushed };
        changed = true;
        continue;
      }
      const back = clampStart(
        floorSnap(mov[i].start - mov[i - 1].dur),
        mov[i - 1].dur,
        fixed,
        -1,
        mov[i - 1].start,
      );
      if (back < mov[i - 1].start && back + mov[i - 1].dur <= mov[i].start + 0.01) {
        mov[i - 1] = { ...mov[i - 1], start: back };
        changed = true;
      }
    }
    if (!changed) return;
  }
}

/**
 * Move one block to `desiredStart` (snapped to 10 minutes).
 * Dragging down shoves later blocks down; dragging up shoves earlier blocks up.
 * A gap left on the other side stays. Fixed blocks are walls.
 */
export function shiftRail(blocks: RailBlock[], id: string, desiredStart: number): RailBlock[] {
  const fixed = intervals(blocks);
  const mov = movablesOf(blocks);
  const idx = mov.findIndex((b) => b.id === id);
  if (idx < 0) return mov;
  const old = mov[idx].start;
  const dur = mov[idx].dur;
  const dir: 1 | -1 = desiredStart + 0.01 >= old ? 1 : -1;
  let start = clampStart(desiredStart, dur, fixed, dir, old);
  if (dir > 0 && idx > 0) {
    const min = ceilSnap(mov[idx - 1].start + mov[idx - 1].dur);
    if (start < min) start = clampStart(min, dur, fixed, 1, old);
  }
  if (dir < 0 && idx < mov.length - 1) {
    const max = floorSnap(mov[idx + 1].start - dur);
    if (start > max) start = clampStart(max, dur, fixed, -1, old);
  }
  if (dir > 0 && start < old) start = old;
  if (dir < 0 && start > old) start = old;
  mov[idx] = { ...mov[idx], start };
  if (dir > 0) cascadeDown(mov, idx, fixed);
  else cascadeUp(mov, idx, fixed);
  repair(mov, fixed);
  return mov;
}

/** Take a block off the pole and hang it at `dropStart`, shoving anything it lands on downward. */
export function reorderRail(blocks: RailBlock[], id: string, dropStart: number): RailBlock[] {
  const fixed = intervals(blocks);
  const mov = movablesOf(blocks);
  const item = mov.find((b) => b.id === id);
  if (!item) return mov;
  const rest = mov.filter((b) => b.id !== id);
  let at = rest.findIndex((b) => b.start >= dropStart);
  if (at < 0) at = rest.length;
  let start = snap(Math.max(0, Math.min(dropStart, DAY - RAIL_SNAP)));
  if (at > 0) {
    const prevEnd = rest[at - 1].start + rest[at - 1].dur;
    if (start < prevEnd) start = ceilSnap(prevEnd);
  }
  start = clampStart(start, item.dur, fixed, 1, start);
  if (at > 0 && start < rest[at - 1].start + rest[at - 1].dur) {
    start = clampStart(ceilSnap(rest[at - 1].start + rest[at - 1].dur), item.dur, fixed, 1, start);
  }
  const next = [...rest.slice(0, at), { ...item, start }, ...rest.slice(at)];
  cascadeDown(next, at, fixed);
  repair(next, fixed);
  return next;
}
