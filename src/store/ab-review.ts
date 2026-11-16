"use client";

import { useEffect, useState } from "react";
import { reviewTurnSteps, turnKey, type Turn, type TurnReview } from "@/lib/ab-solver";

/** Finished reviews, shared by every list on the page and kept across re-renders. */
const done = new Map<string, TurnReview | null>();
const queue: { key: string; steps: Generator<void, TurnReview | null> }[] = [];
const queued = new Set<string>();
const listeners = new Set<() => void>();
let running = false;

/** Slice budget per task, so taps and scrolling stay smooth while reviews are worked out. */
const SLICE_MS = 12;

function pump() {
  const until = performance.now() + SLICE_MS;
  while (queue.length && performance.now() < until) {
    const job = queue[0];
    const r = job.steps.next();
    if (!r.done) continue;
    queue.shift();
    queued.delete(job.key);
    done.set(job.key, r.value);
    listeners.forEach((l) => l());
  }
  if (queue.length) setTimeout(pump, 0);
  else running = false;
}

function request(history: Turn[], guess: string) {
  const key = turnKey(history, guess);
  if (done.has(key) || queued.has(key)) return;
  queued.add(key);
  queue.push({ key, steps: reviewTurnSteps(history, guess) });
  if (!running) {
    running = true;
    setTimeout(pump, 0);
  }
}

const plain = (t: Turn): Turn => ({ guess: t.guess, a: t.a, b: t.b });

/** Review of each turn: undefined while it's still being worked out, null if unknown. */
export function useAbReviews(turns: Turn[]): (TurnReview | null | undefined)[] {
  const [, bump] = useState(0);
  const list = turns.map(plain);
  const keys = list.map((t, i) => turnKey(list.slice(0, i), t.guess));
  const signature = keys.join(";");

  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    list.forEach((t, i) => request(list.slice(0, i), t.guess));
    // `list` is described fully by the signature
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return keys.map((k) => (done.has(k) ? done.get(k) : undefined));
}
