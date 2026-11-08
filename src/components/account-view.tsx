"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeError } from "@/lib/supabase";
import { useAuth } from "@/store/auth-store";
import { useLinks, type LinkedPerson } from "@/store/links-store";
import { ThemePicker } from "@/components/theme-picker";
import { hardReload } from "@/lib/hard-reload";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";
import { ArrowLeft, Bell, BellOff, Copy, LogOut, RefreshCw } from "lucide-react";

const REQUEST_ERRORS = {
  not_found: "找不到這個連結碼。",
  self: "這是你自己的連結碼。",
  already_linked: "你們已經連結了。",
  already_requested: "已經送出過邀請，等對方接受。",
} as const;

export function AccountView({ onBack }: { onBack: () => void }) {
  const { session, profile, signOut, updateDisplayName } = useAuth();
  const { linked, incoming, outgoing, requestLink, accept, remove } = useLinks();
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const nameValue = name ?? profile?.display_name ?? "";

  async function saveName(event: FormEvent) {
    event.preventDefault();
    try {
      await updateDisplayName(nameValue);
      setName(null);
    } catch (err) {
      setMessage({ tone: "error", text: describeError(err) });
    }
  }

  async function sendRequest(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await requestLink(code);
      if (result.ok) {
        setCode("");
        setMessage({
          tone: "ok",
          text: result.status === "accepted" ? "對方也邀請過你，已直接完成連結。" : "已送出邀請，等對方接受。",
        });
      } else {
        setMessage({ tone: "error", text: REQUEST_ERRORS[result.error] });
      }
    } catch (err) {
      setMessage({ tone: "error", text: describeError(err) });
    }
  }

  async function copyCode() {
    if (!profile) return;
    await navigator.clipboard?.writeText(profile.link_code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回
      </Button>

      <header>
        <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">帳號與連結</h2>
        <p className="mt-1 text-sm text-muted-foreground">{session?.user.email}</p>
      </header>

      <Section title="主題" hint="只存在這台裝置。極致黑和白參考 LINE 的主題，其餘是顏色。">
        <ThemePicker />
      </Section>

      <Section title="顯示名稱">
        <form onSubmit={saveName} className="flex gap-2">
          <Input value={nameValue} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <Button type="submit" variant="outline" disabled={name === null}>
            儲存
          </Button>
        </form>
      </Section>

      <Section title="通知" hint="每台裝置要各自開啟。連結的人指派任務給你的時候會跳通知。">
        <NotificationToggle />
      </Section>

      <Section
        title="我的連結碼"
        hint="把這組碼給對方，對方輸入後你接受，你們就能互相查看彼此的頁面（唯讀）。"
      >
        <div className="flex items-center gap-3">
          <span className="font-display text-3xl tracking-[0.2em] text-ink tabular-nums">
            {profile?.link_code ?? "······"}
          </span>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyCode}>
            <Copy className="size-3.5" />
            {copied ? "已複製" : "複製"}
          </Button>
        </div>
      </Section>

      <Section title="輸入對方的連結碼">
        <form onSubmit={sendRequest} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="例如 3FA9C2"
            maxLength={6}
            autoCapitalize="characters"
            className="tracking-widest uppercase"
          />
          <Button type="submit" disabled={code.trim().length !== 6}>
            送出邀請
          </Button>
        </form>
        {message && (
          <p className={`mt-2 text-sm ${message.tone === "ok" ? "text-primary" : "text-destructive"}`}>
            {message.text}
          </p>
        )}
      </Section>

      {incoming.length > 0 && (
        <Section title="收到的邀請">
          <PeopleList
            people={incoming}
            actions={(p) => (
              <>
                <Button size="sm" onClick={() => accept(p.linkId)}>
                  接受
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(p.linkId)}>
                  拒絕
                </Button>
              </>
            )}
          />
        </Section>
      )}

      <Section title="已連結">
        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">還沒有連結任何人。</p>
        ) : (
          <PeopleList
            people={linked}
            actions={(p) => (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm(`取消與「${p.name}」的連結？雙方都將無法再查看對方的頁面。`)) {
                    remove(p.linkId);
                  }
                }}
              >
                取消連結
              </Button>
            )}
          />
        )}
      </Section>

      {outgoing.length > 0 && (
        <Section title="等待對方接受">
          <PeopleList
            people={outgoing}
            actions={(p) => (
              <Button size="sm" variant="ghost" onClick={() => remove(p.linkId)}>
                收回
              </Button>
            )}
          />
        </Section>
      )}

      <Section title="強制更新" hint="畫面還是舊的時候用。會清掉這台裝置的離線快取再重新載入，資料都在雲端，不會不見。">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={hardReload}>
          <RefreshCw className="size-3.5" />
          清除快取並重新載入
        </Button>
      </Section>

      <Button variant="outline" className="w-full gap-1.5" onClick={() => signOut()}>
        <LogOut className="size-4" />
        登出
      </Button>
    </div>
  );
}

function NotificationToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  const note = (text: string) => <p className="text-sm text-muted-foreground">{text}</p>;
  if (state === null) return note("檢查中…");
  if (state === "needs-install")
    return note("iPhone 要先把這個 App「加入主畫面」，從主畫面打開才能開啟通知。");
  if (state === "unsupported") return note("這個瀏覽器不支援通知。");
  if (state === "denied")
    return note("通知被關掉了。到 iPhone 的「設定 → 通知」找這個 App 重新允許。");

  const on = state === "on";

  async function toggle() {
    setBusy(true);
    setError(null);
    if (on) {
      await disablePush();
      setState("off");
    } else {
      setError(await enablePush());
      setState(await getPushState());
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <Button variant={on ? "outline" : "default"} size="sm" disabled={busy} onClick={toggle}>
        {on ? <BellOff /> : <Bell />}
        {on ? "關閉這台裝置的通知" : "開啟通知"}
      </Button>
      {on && <p className="text-xs text-muted-foreground">這台裝置已經開啟。</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <h3 className="font-display text-lg text-ink">{title}</h3>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function PeopleList({
  people,
  actions,
}: {
  people: LinkedPerson[];
  actions: (person: LinkedPerson) => ReactNode;
}) {
  return (
    <ul className="space-y-2">
      {people.map((p) => (
        <li
          key={p.linkId}
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-soft/60 px-3 py-2"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-teal-700 text-sm font-medium text-white">
            {p.name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
          <div className="flex gap-1">{actions(p)}</div>
        </li>
      ))}
    </ul>
  );
}
