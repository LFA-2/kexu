"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeError } from "@/lib/supabase";
import { useAuth } from "@/store/auth-store";

export function LoginView() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === "signup";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (isSignUp && password.length < 8) {
      setError("密碼至少需要 8 個字元。");
      return;
    }
    setBusy(true);
    try {
      if (isSignUp) await signUp(email, password, displayName);
      else await signIn(email, password);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-5 py-12">
      <p className="font-display text-4xl tracking-tight text-ink sm:text-5xl">你並沒有那麼聰明</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        把學校行程收成一條清楚的時間線——課程、作業、考試、讀書進度。
      </p>

      <div className="mt-8 flex rounded-xl border border-border/80 bg-white p-1 shadow-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              mode === m ? "bg-ink text-white shadow-sm" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {m === "signin" ? "登入" : "註冊"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border border-border/70 bg-white p-5">
        {isSignUp && (
          <div className="grid gap-2">
            <Label htmlFor="display-name">顯示名稱</Label>
            <Input
              id="display-name"
              placeholder="連結的人會看到這個名字"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              required
            />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">密碼</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder={isSignUp ? "至少 8 個字元" : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="mt-1">
          {busy ? "請稍候…" : isSignUp ? "建立帳號" : "登入"}
        </Button>
      </form>
    </div>
  );
}
