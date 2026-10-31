"use client";

import { useCallback, useEffect, useState } from "react";
import { startPolling } from "@/components/games/game-ui";
import { supabase } from "@/lib/supabase";

const POLL_MS = 10000;

export type DuelGame = "blotto" | "penalty";

export type DuelRound<M> = { round: string; mine?: M; theirs?: M };

export type DuelResult = {
  ok: boolean;
  error?: "not_linked" | "invalid" | "already_submitted";
};

/** Sealed-move duel: rounds are dates (blotto) or sequence numbers (penalty). */
export function useDuel<M>(game: DuelGame, me: string, opponent: string) {
  const [status, setStatus] = useState<{ round: string; mine: boolean; theirs: boolean } | null>(
    null,
  );
  const [rounds, setRounds] = useState<DuelRound<M>[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [st, rows] = await Promise.all([
      supabase.rpc("duel_status", { game_name: game, opponent_id: opponent }),
      supabase
        .from("duel_moves")
        .select("round, player, move")
        .eq("game", game)
        .or(
          `and(player.eq.${me},opponent.eq.${opponent}),and(player.eq.${opponent},opponent.eq.${me})`,
        )
        .order("created_at", { ascending: false })
        .limit(80),
    ]);
    if (st.error || rows.error || !st.data?.ok) return;
    const byRound = new Map<string, DuelRound<M>>();
    for (const row of rows.data) {
      const entry: DuelRound<M> = byRound.get(row.round) ?? { round: row.round };
      if (row.player === me) entry.mine = row.move as M;
      else entry.theirs = row.move as M;
      byRound.set(row.round, entry);
    }
    const sortKey = (r: string) => (game === "penalty" ? r.padStart(8, "0") : r);
    setRounds([...byRound.values()].sort((a, b) => sortKey(b.round).localeCompare(sortKey(a.round))));
    setStatus({ round: st.data.round, mine: st.data.mine, theirs: st.data.theirs });
    setLoaded(true);
  }, [game, me, opponent]);

  useEffect(() => startPolling(refresh, POLL_MS), [refresh]);

  const submit = useCallback(
    async (move: M) => {
      const { data, error } = await supabase.rpc("submit_duel", {
        game_name: game,
        opponent_id: opponent,
        move,
      });
      if (error) throw error;
      await refresh();
      return data as DuelResult;
    },
    [game, opponent, refresh],
  );

  const completed = rounds.filter((r) => r.mine && r.theirs) as Required<DuelRound<M>>[];
  const current = status ? rounds.find((r) => r.round === status.round) : undefined;

  return { status, completed, current, loaded, submit };
}

export const DUEL_ERRORS: Record<NonNullable<DuelResult["error"]>, string> = {
  not_linked: "你們目前沒有連結。",
  invalid: "出招內容不正確。",
  already_submitted: "這一局已經出過招了。",
};
