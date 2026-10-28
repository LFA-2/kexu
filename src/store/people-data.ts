"use client";

import { useCallback, useEffect, useState } from "react";
import { isLifeState, type LifeState } from "@/lib/life";
import { supabase } from "@/lib/supabase";
import { isSchoolState, type SchoolState } from "@/lib/types";

const POLL_MS = 30000;

export type PersonData = { school?: SchoolState; life?: LifeState };

/** Read-only snapshot of several people's school and life data. */
export function usePeopleData(userIds: string[]) {
  const [data, setData] = useState<Record<string, PersonData>>({});
  const [loaded, setLoaded] = useState(false);
  const idsKey = userIds.join(",");

  const refresh = useCallback(async () => {
    const ids = idsKey.split(",").filter(Boolean);
    if (ids.length === 0) return;
    const [school, life] = await Promise.all([
      supabase.from("school_data").select("user_id, state").in("user_id", ids),
      supabase.from("life_data").select("user_id, state").in("user_id", ids),
    ]);
    if (school.error || life.error) return;
    const next: Record<string, PersonData> = {};
    for (const row of school.data) {
      if (isSchoolState(row.state)) next[row.user_id] = { ...next[row.user_id], school: row.state };
    }
    for (const row of life.data) {
      if (isLifeState(row.state)) next[row.user_id] = { ...next[row.user_id], life: row.state };
    }
    setData(next);
    setLoaded(true);
  }, [idsKey]);

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

  return { data, loaded };
}
