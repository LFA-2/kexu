/**
 * Review analysis for 1A2B (4 digits, repeats allowed, scored like private.score_ab).
 *
 * For each turn: which secrets were still possible, how much the guess played was
 * expected to narrow them down, and the guess that would have narrowed them down most.
 * Guesses are judged by what they could be expected to rule out, not by the answer
 * they happened to get.
 *
 * Expected remaining for a guess g over candidates S (|S| = N):
 *   E(g) = Σ n_k² / N  over the answer groups k, where n_k secrets give answer k.
 * The 4A group counts as 0: guessing the secret leaves nothing to find.
 */

const N_ALL = 10000;
const DIGITS = new Uint8Array(N_ALL * 4);
for (let n = 0; n < N_ALL; n++) {
  DIGITS[n * 4] = Math.floor(n / 1000);
  DIGITS[n * 4 + 1] = Math.floor(n / 100) % 10;
  DIGITS[n * 4 + 2] = Math.floor(n / 10) % 10;
  DIGITS[n * 4 + 3] = n % 10;
}

/** COUNTS[n*10+d]: how many times digit d appears in n. */
const COUNTS = new Uint8Array(N_ALL * 10);
/** DISTINCT[n*5]: number of distinct digits in n, then those digits. */
const DISTINCT = new Uint8Array(N_ALL * 5);
for (let n = 0; n < N_ALL; n++) {
  let k = 0;
  for (let i = 0; i < 4; i++) {
    const d = DIGITS[n * 4 + i];
    if (COUNTS[n * 10 + d]++ === 0) DISTINCT[n * 5 + 1 + k++] = d;
  }
  DISTINCT[n * 5] = k;
}

const SOLVED = 4 * 5; // outcome code of 4A0B

/**
 * Outcome code a*5+b, matching the server. Digits in common (by multiplicity) minus the
 * exact matches gives B, which is the same as the server's "A excluded" rule.
 */
function outcome(secret: number, guess: number): number {
  const s = secret * 4;
  const g = guess * 4;
  const a =
    +(DIGITS[s] === DIGITS[g]) +
    +(DIGITS[s + 1] === DIGITS[g + 1]) +
    +(DIGITS[s + 2] === DIGITS[g + 2]) +
    +(DIGITS[s + 3] === DIGITS[g + 3]);
  let common = 0;
  const k = DISTINCT[guess * 5];
  for (let j = 1; j <= k; j++) {
    const d = DISTINCT[guess * 5 + j];
    const x = COUNTS[secret * 10 + d];
    const y = COUNTS[guess * 10 + d];
    common += x < y ? x : y;
  }
  return a * 5 + common - a;
}

export function scoreAb(secret: string, guess: string) {
  const code = outcome(Number(secret), Number(guess));
  return { a: Math.floor(code / 5), b: code % 5 };
}

export type Turn = { guess: string; a: number; b: number };

function candidatesAfter(history: Turn[]): number[] {
  let list = Array.from({ length: N_ALL }, (_, n) => n);
  for (const t of history) {
    const g = Number(t.guess);
    const code = t.a * 5 + t.b;
    list = list.filter((n) => outcome(n, g) === code);
  }
  return list;
}

const counts = new Uint32Array(25);
function expectedRemaining(guess: number, candidates: number[]): number {
  counts.fill(0);
  for (const s of candidates) counts[outcome(s, guess)]++;
  let sum = 0;
  for (let k = 0; k < 25; k++) if (k !== SOLVED) sum += counts[k] * counts[k];
  return sum / candidates.length;
}

/**
 * Digits that appear in no earlier guess are interchangeable: swapping them maps the
 * candidate set onto itself, so guesses that differ only by such a swap are equally
 * good. Only one guess per class is tried: the one using the smallest unused digits,
 * in order of first appearance.
 */
function representativeGuesses(history: Turn[]): number[] {
  const used = new Set(history.flatMap((t) => t.guess.split("").map(Number)));
  const fresh = Array.from({ length: 10 }, (_, d) => d).filter((d) => !used.has(d));
  const out: number[] = [];
  for (let n = 0; n < N_ALL; n++) {
    let next = 0;
    const seen = new Map<number, number>();
    let ok = true;
    for (let i = 0; i < 4 && ok; i++) {
      const d = DIGITS[n * 4 + i];
      if (used.has(d)) continue;
      if (!seen.has(d)) {
        if (d !== fresh[next]) ok = false;
        seen.set(d, next++);
      }
    }
    if (ok) out.push(n);
  }
  return out;
}

export type TurnReview = {
  /** Secrets still possible before this guess. */
  before: number;
  /** Expected secrets left after the guess that was played. */
  played: number;
  /** A guess with the lowest expected remaining (one of possibly several equal ones). */
  best: string;
  bestExpected: number;
  /** The played guess was as good as the best one. */
  optimal: boolean;
};

const cache = new Map<string, TurnReview | null>();

export const turnKey = (history: Turn[], guess: string) =>
  `${history.map((t) => `${t.guess}${t.a}${t.b}`).join(",")}|${guess}`;

/**
 * The review of one turn as a generator that yields every so often, so a caller can
 * spread the work over several tasks and keep the page responsive.
 */
export function* reviewTurnSteps(history: Turn[], guess: string): Generator<void, TurnReview | null> {
  const key = turnKey(history, guess);
  if (cache.has(key)) return cache.get(key)!;
  const candidates = candidatesAfter(history);
  yield;
  let result: TurnReview | null = null;
  if (candidates.length > 0) {
    const possible = new Set(candidates);
    let best = -1;
    let bestExpected = Infinity;
    let work = 0;
    for (const g of representativeGuesses(history)) {
      const e = expectedRemaining(g, candidates);
      // Ties: a guess that could be the secret, then the smaller number.
      if (e < bestExpected - 1e-9 || (Math.abs(e - bestExpected) <= 1e-9 && possible.has(g) && !possible.has(best))) {
        best = g;
        bestExpected = e;
      }
      work += candidates.length;
      if (work >= 40000) {
        work = 0;
        yield;
      }
    }
    const played = expectedRemaining(Number(guess), candidates);
    result = {
      before: candidates.length,
      played,
      best: String(best).padStart(4, "0"),
      bestExpected,
      optimal: played <= bestExpected + 1e-9,
    };
  }
  cache.set(key, result);
  return result;
}

/** Review of playing `guess` after `history`, all at once. Null if the history is inconsistent. */
export function reviewTurn(history: Turn[], guess: string): TurnReview | null {
  const steps = reviewTurnSteps(history, guess);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Reviews for every guess in order, each judged on what was known before it. */
export function reviewGame(turns: Turn[]): (TurnReview | null)[] {
  return turns.map((t, i) => reviewTurn(turns.slice(0, i), t.guess));
}
