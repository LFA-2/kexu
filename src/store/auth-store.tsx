"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Profile = {
  id: string;
  display_name: string;
  link_code: string;
};

type AuthStore = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
};

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, display_name, link_code")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setProfile(data);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) throw error;
    // An existing address returns a user with no identities instead of an error.
    if (data.user && data.user.identities?.length === 0) {
      throw new Error("User already registered");
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("kexu-cache-")) localStorage.removeItem(key);
    }
    setProfile(null);
  }, []);

  const updateDisplayName = useCallback(
    async (name: string) => {
      if (!userId) return;
      const display_name = name.trim().slice(0, 40);
      const { error } = await supabase.from("profiles").update({ display_name }).eq("id", userId);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, display_name } : prev));
    },
    [userId],
  );

  return (
    <AuthContext.Provider
      value={{
        ready,
        session,
        profile: profile && profile.id === userId ? profile : null,
        signIn,
        signUp,
        signOut,
        updateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
