"use client";

import { useCallback, useEffect, useState } from "react";
import { startPolling } from "@/components/games/game-ui";
import { supabase } from "@/lib/supabase";

const POLL_MS = 5000;

export type BsGame = {
  id: number;
  player_a: string;
  player_b: string;
  status: "placing" | "playing" | "finished";
  turn: string | null;
  winner: string | null;
};

export type BsShot = {
  id: number;
  shooter: string;
  cell: number;
  result: "miss" | "hit" | "sunk";
  sunk_cells: number[] | null;
};

export type BsResult = { ok: boolean; error?: string; result?: BsShot["result"]; finished?: boolean };

export function useBattleship(me: string, opponent: string) {
  const [game, setGame] = useState<BsGame | null>(null);
  const [record, setRecord] = useState({ wins: 0, losses: 0 });
  const [myFleet, setMyFleet] = useState<number[][] | null>(null);
  const [theirFleet, setTheirFleet] = useState<number[][] | null>(null);
  const [shots, setShots] = useState<BsShot[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { data: games, error } = await supabase
      .from("bs_games")
      .select("id, player_a, player_b, status, turn, winner")
      .or(
        `and(player_a.eq.${me},player_b.eq.${opponent}),and(player_a.eq.${opponent},player_b.eq.${me})`,
      )
      .order("id", { ascending: false })
      .limit(50);
    if (error) return;
    const rows = games as BsGame[];
    const finished = rows.filter((g) => g.status === "finished");
    setRecord({
      wins: finished.filter((g) => g.winner === me).length,
      losses: finished.filter((g) => g.winner === opponent).length,
    });
    const current = rows[0] ?? null;
    if (current) {
      const [fleets, shotRows] = await Promise.all([
        supabase.from("bs_fleets").select("player, ships").eq("game_id", current.id),
        supabase
          .from("bs_shots")
          .select("id, shooter, cell, result, sunk_cells")
          .eq("game_id", current.id)
          .order("id"),
      ]);
      if (fleets.error || shotRows.error) return;
      setMyFleet(fleets.data.find((f) => f.player === me)?.ships ?? null);
      setTheirFleet(fleets.data.find((f) => f.player === opponent)?.ships ?? null);
      setShots(shotRows.data as BsShot[]);
    } else {
      setMyFleet(null);
      setTheirFleet(null);
      setShots([]);
    }
    setGame(current);
    setLoaded(true);
  }, [me, opponent]);

  useEffect(() => startPolling(refresh, POLL_MS), [refresh]);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;
      await refresh();
      return data as BsResult;
    },
    [refresh],
  );

  return {
    game,
    record,
    myFleet,
    theirFleet,
    shots,
    loaded,
    newGame: () => call("bs_new_game", { opponent_id: opponent }),
    place: (fleet: number[][]) => call("bs_place", { target_game: game?.id, fleet }),
    fire: (cell: number) => call("bs_fire", { target_game: game?.id, target_cell: cell }),
    resign: () => call("bs_resign", { target_game: game?.id }),
  };
}
