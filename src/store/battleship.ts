"use client";

import { useCallback, useEffect, useState } from "react";
import { startPolling } from "@/components/games/game-ui";
import { supabase } from "@/lib/supabase";
import { taipeiToday } from "@/store/ab-game";

const POLL_MS = 15000;

export type BsShot = {
  id: number;
  shooter: string;
  owner: string;
  cell: number;
  result: "miss" | "hit" | "sunk";
  sunk_cells: number[] | null;
};

export type BsResult = { ok: boolean; error?: string };

export function useBattleship() {
  const [day, setDay] = useState(taipeiToday);
  const [myFleet, setMyFleet] = useState<number[][] | null>(null);
  const [readyIds, setReadyIds] = useState<Set<string>>(new Set());
  const [shots, setShots] = useState<BsShot[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const today = taipeiToday();
    const [fleet, status, rows] = await Promise.all([
      supabase.from("bs_daily_fleets").select("ships").eq("day", today).maybeSingle(),
      supabase.rpc("bs_fleet_status"),
      supabase
        .from("bs_daily_shots")
        .select("id, shooter, owner, cell, result, sunk_cells")
        .eq("day", today)
        .order("id"),
    ]);
    if (fleet.error || status.error || rows.error) return;
    setDay(today);
    setMyFleet(fleet.data?.ships ?? null);
    setReadyIds(new Set((status.data as { user_id: string }[]).map((r) => r.user_id)));
    setShots(rows.data as BsShot[]);
    setLoaded(true);
  }, []);

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
    day,
    myFleet,
    readyIds,
    shots,
    loaded,
    setFleet: (fleet: number[][]) => call("bs_set_fleet", { fleet }),
    fire: (target: string, cell: number) => call("bs_daily_fire", { target, target_cell: cell }),
  };
}
