"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const POLL_MS = 15000;

export type Guess = {
  id: number;
  guesser: string;
  owner: string;
  guess: string;
  a: number;
  b: number;
};

/** A guess from an earlier day, enough to count tries per day. */
export type PastGuess = Pick<Guess, "guesser" | "owner" | "a"> & { day: string };

const HISTORY_DAYS = 90;

export type GuessResult =
  | { ok: true; a: number; b: number; attempts: number; solved: boolean }
  | { ok: false; error: "invalid" | "not_linked" | "no_secret" | "already_solved" };

export type SetSecretResult = { ok: true } | { ok: false; error: "invalid" | "already_set" };

/** The game day follows Taiwan time, matching the server. */
export function taipeiToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

export function useAbGame() {
  const [day, setDay] = useState(taipeiToday);
  const [mySecret, setMySecret] = useState<string | null>(null);
  const [readyIds, setReadyIds] = useState<Set<string>>(new Set());
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<PastGuess[]>([]);

  // Earlier days don't change, so they're fetched once per game day.
  useEffect(() => {
    let cancelled = false;
    const from = new Date(`${day}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - HISTORY_DAYS);
    supabase
      .from("ab_guesses")
      .select("day, guesser, owner, a")
      .lt("day", day)
      .gte("day", from.toISOString().slice(0, 10))
      .order("id")
      .then(({ data, error }) => {
        if (!cancelled && !error) setHistory(data as PastGuess[]);
      });
    return () => {
      cancelled = true;
    };
  }, [day]);

  const refresh = useCallback(async () => {
    const today = taipeiToday();
    const [secret, status, rows] = await Promise.all([
      supabase.from("daily_secrets").select("secret").eq("day", today).maybeSingle(),
      supabase.rpc("daily_secret_status"),
      supabase
        .from("ab_guesses")
        .select("id, guesser, owner, guess, a, b")
        .eq("day", today)
        .order("id"),
    ]);
    if (secret.error || status.error || rows.error) return;
    setDay(today);
    setMySecret(secret.data?.secret ?? null);
    setReadyIds(new Set((status.data as { user_id: string }[]).map((r) => r.user_id)));
    setGuesses(rows.data as Guess[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const setSecret = useCallback(
    async (value: string) => {
      const { data, error } = await supabase.rpc("set_daily_secret", { new_secret: value });
      if (error) throw error;
      await refresh();
      return data as SetSecretResult;
    },
    [refresh],
  );

  const guess = useCallback(
    async (target: string, value: string) => {
      const { data, error } = await supabase.rpc("make_guess", { target, attempt: value });
      if (error) throw error;
      await refresh();
      return data as GuessResult;
    },
    [refresh],
  );

  return { day, mySecret, readyIds, guesses, history, loaded, setSecret, guess, refresh };
}
