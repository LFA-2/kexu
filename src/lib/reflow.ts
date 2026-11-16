/**
 * The one layout engine for the 今日 list, used both when the planner makes a day and
 * when the user reorders it. Items are laid out around blocked intervals (classes, 行程,
 * items whose time is fixed), with a short break between tasks, and never past `end`.
 */
export type Interval = [number, number];

export const REFLOW_STEP = 5;
/** Minutes of rest kept between two laid-out tasks. */
export const BREAK = 10;

const up = (m: number) => Math.ceil(m / REFLOW_STEP) * REFLOW_STEP;

export type FlowItem = {
  id: string;
  dur: number;
  /** Earliest start, minutes of day ("不早於"). */
  after?: number;
  /** Items sharing a group (parts of one task, units of one course) keep their order. */
  group?: string;
};

/**
 * Minute of day each item starts at. Items that can't fit before `end` are left out
 * of the map: they are 今天排不下.
 *
 * sequential: keep the given order exactly, each item after the one before it.
 * packed: each item takes the earliest slot that fits, so later short items can fill
 * gaps earlier items were too long for (groups still keep their order).
 */
export function reflow(
  items: FlowItem[],
  blocked: Interval[],
  cursor: number,
  end: number,
  packed = false,
): Map<string, number> {
  const out = new Map<string, number>();
  const hard = [...blocked].sort((a, b) => a[0] - b[0]);
  /** Laid-out tasks, padded with BREAK on both sides. */
  const soft: Interval[] = [];
  const groupEnd = new Map<string, number>();
  const groupStuck = new Set<string>();
  let last = cursor;

  const clash = (s: number, e: number) =>
    hard.some(([a, b]) => s < b && e > a) || soft.some(([a, b]) => s < b && e > a);

  for (const it of items) {
    const dur = Math.max(REFLOW_STEP, it.dur);
    if (it.group && groupStuck.has(it.group)) continue;
    let from = Math.max(cursor, it.after ?? 0, packed ? cursor : last);
    if (it.group && groupEnd.has(it.group)) from = Math.max(from, groupEnd.get(it.group)! + BREAK);
    from = up(from);
    // The earliest feasible start is `from` or the end of some interval after it.
    const candidates = [from, ...hard.map(([, b]) => up(b)), ...soft.map(([, b]) => up(b))]
      .filter((t) => t >= from)
      .sort((a, b) => a - b);
    const t = candidates.find((c) => c + dur <= end && !clash(c, c + dur));
    if (t === undefined) {
      if (it.group) groupStuck.add(it.group);
      continue;
    }
    out.set(it.id, t);
    soft.push([t - BREAK, t + dur + BREAK]);
    last = t + dur + BREAK;
    if (it.group) groupEnd.set(it.group, t + dur);
  }
  return out;
}

/**
 * Within each group, put the members back in their natural order (part 1 before part 2,
 * unit 3 before unit 4) while keeping the positions the group occupies in `order`.
 */
export function keepChains(
  order: string[],
  chain: (id: string) => { group: string; rank: number } | undefined,
): string[] {
  const slots = new Map<string, number[]>();
  order.forEach((id, k) => {
    const c = chain(id);
    if (!c) return;
    slots.set(c.group, [...(slots.get(c.group) ?? []), k]);
  });
  const out = [...order];
  for (const positions of slots.values()) {
    if (positions.length < 2) continue;
    const members = positions.map((k) => order[k]).sort((a, b) => chain(a)!.rank - chain(b)!.rank);
    positions.forEach((k, j) => (out[k] = members[j]));
  }
  return out;
}

export const hhmm = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
