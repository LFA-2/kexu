"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

const POLL_MS = 30000;

type LinkRow = {
  id: number;
  requester: string;
  addressee: string;
  status: "pending" | "accepted";
};

export type LinkedPerson = {
  linkId: number;
  userId: string;
  name: string;
};

type RequestResult =
  | { ok: true; status: "pending" | "accepted" }
  | { ok: false; error: "not_found" | "self" | "already_linked" | "already_requested" };

type LinksStore = {
  linked: LinkedPerson[];
  incoming: LinkedPerson[];
  outgoing: LinkedPerson[];
  requestLink: (code: string) => Promise<RequestResult>;
  accept: (linkId: number) => Promise<void>;
  remove: (linkId: number) => Promise<void>;
  refresh: () => Promise<void>;
};

const LinksContext = createContext<LinksStore | null>(null);

export function LinksProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const { data: links } = await supabase
      .from("links")
      .select("id, requester, addressee, status")
      .order("created_at");
    if (!links) return;
    const others = [...new Set(links.map((l) => (l.requester === userId ? l.addressee : l.requester)))];
    const nextNames: Record<string, string> = {};
    if (others.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", others);
      for (const p of profiles ?? []) nextNames[p.id] = p.display_name;
    }
    setRows(links as LinkRow[]);
    setNames(nextNames);
  }, [userId]);

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

  const value = useMemo<LinksStore>(() => {
    const toPerson = (row: LinkRow): LinkedPerson => {
      const other = row.requester === userId ? row.addressee : row.requester;
      return { linkId: row.id, userId: other, name: names[other] || "（未命名）" };
    };
    return {
      linked: rows.filter((r) => r.status === "accepted").map(toPerson),
      incoming: rows.filter((r) => r.status === "pending" && r.addressee === userId).map(toPerson),
      outgoing: rows.filter((r) => r.status === "pending" && r.requester === userId).map(toPerson),
      requestLink: async (code: string) => {
        const { data, error } = await supabase.rpc("request_link", { code });
        if (error) throw error;
        await refresh();
        return data as RequestResult;
      },
      accept: async (linkId: number) => {
        const { error } = await supabase.from("links").update({ status: "accepted" }).eq("id", linkId);
        if (error) throw error;
        await refresh();
      },
      remove: async (linkId: number) => {
        const { error } = await supabase.from("links").delete().eq("id", linkId);
        if (error) throw error;
        await refresh();
      },
      refresh,
    };
  }, [rows, names, userId, refresh]);

  return <LinksContext.Provider value={value}>{children}</LinksContext.Provider>;
}

export function useLinks() {
  const ctx = useContext(LinksContext);
  if (!ctx) throw new Error("useLinks must be used within LinksProvider");
  return ctx;
}
