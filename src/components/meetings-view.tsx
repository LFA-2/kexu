"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import type { Person } from "@/components/shared-view";
import { CheckButton } from "@/components/check-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatShortDate, toDateKey } from "@/lib/dates";
import {
  createMeeting,
  deleteMeeting,
  getMeeting,
  listMeetings,
  saveMeeting,
  type Meeting,
  type MeetingAction,
  type MeetingFields,
} from "@/lib/meetings";
import { uid } from "@/lib/utils";
import { ArrowLeft, ChevronRight, Plus, Trash2, Users } from "lucide-react";

const POLL_MS = 6000;

export function MeetingsView({ people, onBack }: { people: Person[]; onBack: () => void }) {
  const me = people.find((p) => p.isMe)!;
  const others = people.filter((p) => !p.isMe);
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [partner, setPartner] = useState(others[0]?.userId ?? "");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listMeetings();
    if (list) {
      setMeetings(list);
      setError(false);
    } else setError(true);
  }, []);

  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  if (openId !== null) {
    return (
      <MeetingEditor
        id={openId}
        people={people}
        onBack={() => {
          setOpenId(null);
          refresh();
        }}
      />
    );
  }

  async function create() {
    if (!partner) return;
    setCreating(true);
    const m = await createMeeting(me.userId, partner, {
      date: toDateKey(new Date()),
      title: `${format(new Date(), "M/d")} 會議`,
    });
    setCreating(false);
    if (!m) {
      alert("建立失敗，請確認網路，以及你們仍然是連結狀態。");
      return;
    }
    setOpenId(m.id);
  }

  const nameOf = (id: string) => people.find((p) => p.userId === id);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回共同
      </Button>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">兩個人都能編輯，待辦會出現在被指派者的「今日」</p>
          <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">會議</h2>
        </div>
        <div className="flex items-center gap-2">
          {others.length > 1 && (
            <select
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
              className="h-8 rounded-lg border border-input bg-white px-2 text-sm"
              aria-label="和誰開會"
            >
              {others.map((p) => (
                <option key={p.userId} value={p.userId}>
                  和 {p.name}
                </option>
              ))}
            </select>
          )}
          <Button className="gap-1.5" onClick={create} disabled={creating || !partner}>
            <Plus data-icon="inline-start" />
            新增會議
          </Button>
        </div>
      </header>

      {error && <p className="text-sm text-destructive">讀取失敗，請確認網路。</p>}
      {meetings === null ? (
        <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>
      ) : meetings.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-12 text-center text-sm text-muted-foreground">
          還沒有會議紀錄
        </p>
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => {
            const other = nameOf(m.created_by === me.userId ? m.partner : m.created_by);
            const open = m.actions.filter((a) => !a.done).length;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(m.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-white px-4 py-3 text-left hover:border-slate-300"
                >
                  <span className="w-14 shrink-0 text-center">
                    <span className="block font-display text-xl text-ink">{format(parseISO(m.date), "M/d")}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{m.title || "未命名會議"}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {other ? `和 ${other.name}` : "已取消連結"}
                      {m.actions.length > 0 && `・待辦 ${m.actions.length - open}/${m.actions.length}`}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type TextKey = "title" | "agenda" | "notes" | "decisions" | "date";
const TEXT_KEYS: TextKey[] = ["title", "agenda", "notes", "decisions", "date"];

function MeetingEditor({ id, people, onBack }: { id: number; people: Person[]; onBack: () => void }) {
  const me = people.find((p) => p.isMe)!;
  const [server, setServer] = useState<Meeting | null>(null);
  const [local, setLocal] = useState<Record<TextKey, string>>({ title: "", agenda: "", notes: "", decisions: "", date: "" });
  const [actions, setActions] = useState<MeetingAction[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [missing, setMissing] = useState(false);
  const [newAction, setNewAction] = useState("");

  const serverRef = useRef<Meeting | null>(null);
  const dirty = useRef(new Set<TextKey>());
  const localRef = useRef(local);
  useEffect(() => {
    localRef.current = local;
  }, [local]);
  const saving = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accept = useCallback((m: Meeting) => {
    serverRef.current = m;
    setServer(m);
    setLocal((prev) => {
      const next = { ...prev };
      for (const k of TEXT_KEYS) if (!dirty.current.has(k)) next[k] = m[k];
      return next;
    });
    if (saving.current === 0) setActions(m.actions);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (saving.current > 0) return;
      const m = await getMeeting(id);
      if (!alive) return;
      if (!m) {
        if (!serverRef.current) setMissing(true);
        return;
      }
      if (!serverRef.current || m.version !== serverRef.current.version) accept(m);
    };
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, accept]);

  const run = useCallback(
    async (patch: (latest: Meeting) => Partial<MeetingFields>) => {
      const base = serverRef.current;
      if (!base) return;
      saving.current++;
      setStatus("saving");
      const result = await saveMeeting(base, patch);
      saving.current--;
      if (result) {
        accept(result);
        if (saving.current === 0) {
          setActions(result.actions);
          setStatus("idle");
        }
      } else setStatus("error");
    },
    [accept],
  );

  const flushText = useCallback(() => {
    if (dirty.current.size === 0) return;
    const sent: Partial<Record<TextKey, string>> = {};
    for (const k of dirty.current) sent[k] = localRef.current[k];
    run(() => sent as Partial<MeetingFields>).then(() => {
      for (const k of Object.keys(sent) as TextKey[]) {
        if (localRef.current[k] === sent[k]) dirty.current.delete(k);
      }
    });
  }, [run]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function edit(k: TextKey, v: string) {
    dirty.current.add(k);
    localRef.current = { ...localRef.current, [k]: v };
    setLocal((p) => ({ ...p, [k]: v }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flushText, 700);
  }

  function changeActions(fn: (list: MeetingAction[]) => MeetingAction[]) {
    setActions((a) => fn(a));
    run((latest) => ({ actions: fn(latest.actions) }));
  }

  if (missing) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
          <ArrowLeft data-icon="inline-start" />
          返回會議
        </Button>
        <p className="text-sm text-muted-foreground">找不到這場會議，可能已被刪除。</p>
      </div>
    );
  }
  if (!server) return <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>;

  const otherId = server.created_by === me.userId ? server.partner : server.created_by;
  const other = people.find((p) => p.userId === otherId);
  const editable = !!other;
  const participants = [me, ...(other ? [other] : [])];
  const updatedBy = people.find((p) => p.userId === server.updated_by);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            flushText();
            onBack();
          }}
          className="gap-1.5 px-2"
        >
          <ArrowLeft data-icon="inline-start" />
          返回會議
        </Button>
        <span className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {status === "saving"
            ? "儲存中…"
            : status === "error"
              ? "儲存失敗，請確認網路"
              : updatedBy
                ? `${updatedBy.isMe ? "你" : updatedBy.name} 於 ${format(parseISO(server.updated_at), "M/d HH:mm")} 更新`
                : "已同步"}
        </span>
      </div>

      {!editable && (
        <p className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          你們已取消連結，這場會議只能查看。
        </p>
      )}

      <section className="grid gap-3 rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
        <Input
          value={local.title}
          onChange={(e) => edit("title", e.target.value.slice(0, 100))}
          disabled={!editable}
          placeholder="會議標題"
          className="font-display h-auto border-none px-0 text-2xl text-ink shadow-none focus-visible:ring-0 md:text-2xl"
        />
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Input
            type="date"
            value={local.date}
            onChange={(e) => e.target.value && edit("date", e.target.value)}
            disabled={!editable}
            className="h-8 w-auto"
          />
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            {participants.map((p) => p.name).join("、")}
          </span>
        </div>
      </section>

      <TextSection label="議程" hint="這次要討論什麼" value={local.agenda} rows={3} editable={editable} onChange={(v) => edit("agenda", v.slice(0, 20000))} placeholder={"1. \n2. \n3. "} />
      <TextSection label="討論內容" hint="兩人都可以同時寫，大約每 6 秒同步一次" value={local.notes} rows={8} editable={editable} onChange={(v) => edit("notes", v.slice(0, 50000))} placeholder="記下討論的重點…" />
      <TextSection label="決議" value={local.decisions} rows={3} editable={editable} onChange={(v) => edit("decisions", v.slice(0, 20000))} placeholder="最後決定了什麼" />

      <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
        <h3 className="font-display text-lg text-ink">待辦事項</h3>
        <p className="mb-3 text-xs text-muted-foreground">指派給某人後，會出現在那個人的「今日」頁</p>
        <ul className="space-y-2">
          {actions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
              <CheckButton
                done={a.done}
                color={people.find((p) => p.userId === a.assignee)?.color ?? "#475569"}
                readOnly={!editable}
                onToggle={() => changeActions((list) => list.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)))}
              />
              <span className={`min-w-0 flex-1 text-sm ${a.done ? "text-muted-foreground line-through" : "text-ink"}`}>
                {a.text}
              </span>
              <select
                value={a.assignee ?? ""}
                disabled={!editable}
                onChange={(e) =>
                  changeActions((list) => list.map((x) => (x.id === a.id ? { ...x, assignee: e.target.value || null } : x)))
                }
                className="h-7 rounded-md border border-input bg-white px-1.5 text-xs"
              >
                <option value="">未指派</option>
                {participants.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.isMe ? `${p.name}（我）` : p.name}
                  </option>
                ))}
              </select>
              <Input
                type="date"
                value={a.due}
                disabled={!editable}
                onChange={(e) => changeActions((list) => list.map((x) => (x.id === a.id ? { ...x, due: e.target.value } : x)))}
                className="h-7 w-auto text-xs"
                aria-label="期限"
              />
              {editable && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  onClick={() => changeActions((list) => list.filter((x) => x.id !== a.id))}
                  aria-label="刪除待辦"
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = newAction.trim();
              if (!text) return;
              const item: MeetingAction = { id: uid("act"), text: text.slice(0, 200), assignee: me.userId, done: false, due: "" };
              changeActions((list) => [...list, item]);
              setNewAction("");
            }}
          >
            <Input value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="新增待辦，例如：整理報告初稿" maxLength={200} />
            <Button type="submit" disabled={!newAction.trim()}>
              <Plus className="size-4" />
            </Button>
          </form>
        )}
      </section>

      {editable && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              if (!confirm("刪除這場會議？對方也會看不到。")) return;
              if (await deleteMeeting(server.id)) onBack();
              else alert("刪除失敗");
            }}
          >
            <Trash2 className="size-3.5" />
            刪除會議
          </Button>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">{formatShortDate(server.date)}</p>
    </div>
  );
}

function TextSection({
  label,
  hint,
  value,
  rows,
  editable,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  rows: number;
  editable: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
      <Label className="font-display text-lg text-ink">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!editable}
        rows={rows}
        placeholder={placeholder}
        className="mt-2 leading-relaxed"
      />
    </section>
  );
}
