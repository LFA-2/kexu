"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const POLL_MS = 30000;

export type SyncStatus = "loading" | "synced" | "saving" | "offline";

type Stored<T> = { version: number; state: T };
type Updater<T> = (prev: T) => T;

export type CloudDocOptions<T> = {
  table: "school_data" | "life_data";
  rpc: "save_school_data" | "save_life_data";
  cacheKey: string;
  ownerId: string;
  editable: boolean;
  empty: T;
  isValid: (value: unknown) => value is T;
  /** Runs once after the first server load when editable; return a state to upload instead. */
  onFirstSync?: (serverState: T) => T | null;
};

function readCache<T>(key: string, isValid: (v: unknown) => v is T): Stored<T> | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    if (parsed && typeof parsed.version === "number" && isValid(parsed.state)) return parsed;
  } catch {
    // ignore unreadable cache
  }
  return null;
}

function writeCache<T>(key: string, stored: Stored<T>) {
  try {
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // storage full or unavailable: the cloud copy is authoritative anyway
  }
}

/**
 * One JSON document per user, cached locally, polled, and saved with optimistic
 * concurrency. Mount the owning provider with `key={ownerId}`.
 */
export function useCloudDoc<T>({
  table,
  rpc,
  cacheKey,
  ownerId,
  editable,
  empty,
  isValid,
  onFirstSync,
}: CloudDocOptions<T>) {
  const [initial] = useState(() => readCache(cacheKey, isValid));
  const [state, setState] = useState<T>(initial?.state ?? empty);
  const [loaded, setLoaded] = useState(initial !== null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");

  const serverRef = useRef<Stored<T>>(initial ?? { version: -1, state: empty });
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const firstSyncDoneRef = useRef(false);
  const onFirstSyncRef = useRef(onFirstSync);
  useEffect(() => {
    onFirstSyncRef.current = onFirstSync;
  });

  const commit = useCallback(
    (updater: Updater<T>) => {
      pendingRef.current += 1;
      setSyncStatus("saving");

      // On conflict, re-apply the updater to the latest server copy so edits
      // made on another device are merged rather than overwritten.
      queueRef.current = queueRef.current.then(async () => {
        try {
          let base = serverRef.current;
          for (let attempt = 0; attempt < 5; attempt++) {
            const { data, error } = await supabase.rpc(rpc, {
              base_version: base.version,
              new_state: updater(base.state),
            });
            if (error) throw error;
            const result = data as { ok: boolean } & Stored<T>;
            serverRef.current = { version: result.version, state: result.state };
            if (result.ok) break;
            base = serverRef.current;
          }
          writeCache(cacheKey, serverRef.current);
          pendingRef.current -= 1;
          if (pendingRef.current === 0) {
            setState(serverRef.current.state);
            setSyncStatus("synced");
          }
        } catch {
          pendingRef.current -= 1;
          setSyncStatus("offline");
          if (pendingRef.current === 0) setState(serverRef.current.state);
        }
      });
    },
    [rpc, cacheKey],
  );

  const refresh = useCallback(async () => {
    if (pendingRef.current > 0) return;
    const { data, error } = await supabase
      .from(table)
      .select("version, state")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (pendingRef.current > 0) return;
    if (error || !data || !isValid(data.state)) {
      setSyncStatus("offline");
      return;
    }
    const stored = data as Stored<T>;
    if (stored.version !== serverRef.current.version) {
      serverRef.current = stored;
      writeCache(cacheKey, stored);
      setState(stored.state);
    }
    setLoaded(true);
    setSyncStatus("synced");

    if (editable && !firstSyncDoneRef.current) {
      firstSyncDoneRef.current = true;
      const replacement = onFirstSyncRef.current?.(stored.state) ?? null;
      if (replacement) {
        setState(replacement);
        commit(() => replacement);
      }
    }
  }, [table, ownerId, cacheKey, editable, isValid, commit]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  const mutate = useCallback(
    (updater: Updater<T>) => {
      if (!editable) return;
      setState((prev) => updater(prev));
      commit(updater);
    },
    [editable, commit],
  );

  return { state, loaded, syncStatus, mutate };
}
