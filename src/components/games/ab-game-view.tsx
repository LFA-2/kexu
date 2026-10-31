"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { Person } from "@/components/shared-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { describeError } from "@/lib/supabase";
import { useAbGame, type Guess } from "@/store/ab-game";
import { ArrowLeft } from "lucide-react";

const GUESS_ERRORS = {
  invalid: "請輸入 4 位數字。",
  not_linked: "你們目前沒有連結。",
  no_secret: "對方今天還沒設定數字。",
  already_solved: "已經猜中了。",
} as const;

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4);

type Progress = { tries: number; solved: boolean };

function progressOf(guesses: Guess[], guesser: string, owner: string): Progress {
  const mine = guesses.filter((g) => g.guesser === guesser && g.owner === owner);
  return { tries: mine.length, solved: mine.some((g) => g.a === 4) };
}

export function AbGameView({
  me,
  opponents,
  onBack,
}: {
  me: Person;
  opponents: Person[];
  onBack: () => void;
}) {
  const game = useAbGame();
  const [opponentId, setOpponentId] = useState(opponents[0]?.userId ?? "");
  const opponent = opponents.find((p) => p.userId === opponentId) ?? opponents[0];

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 px-2">
        <ArrowLeft data-icon="inline-start" />
        返回小遊戲
      </Button>

      <header>
        <p className="text-sm text-muted-foreground">
          {formatShortDate(game.day)}・每天換一組數字
        </p>
        <h2 className="font-display mt-1 text-2xl tracking-tight text-ink sm:text-3xl">1A2B</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          A＝數字和位置都對，B＝數字對但位置不對。數字可以重複，已經算進 A 的不會再算進 B。
          兩人都猜中後，次數少的人獲勝。
        </p>
      </header>

      {!game.loaded ? (
        <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>
      ) : (
        <>
          <MySecretCard
            secret={game.mySecret}
            onSet={game.setSecret}
            opponents={opponents}
            progress={(p) => progressOf(game.guesses, p.userId, me.userId)}
          />

          {opponents.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {opponents.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => setOpponentId(p.userId)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    p.userId === opponent?.userId
                      ? "border-ink bg-ink text-white"
                      : "border-border/80 bg-white text-muted-foreground hover:text-ink"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {opponent && (
            <>
              <GuessCard
                key={opponent.userId}
                opponent={opponent}
                ready={game.readyIds.has(opponent.userId)}
                guesses={game.guesses.filter(
                  (g) => g.guesser === me.userId && g.owner === opponent.userId,
                )}
                onGuess={(value) => game.guess(opponent.userId, value)}
              />
              {game.mySecret && (
                <TheirGuessesCard
                  opponent={opponent}
                  guesses={game.guesses.filter(
                    (g) => g.guesser === opponent.userId && g.owner === me.userId,
                  )}
                />
              )}
              <ResultCard
                opponent={opponent}
                iHaveSecret={!!game.mySecret}
                mine={progressOf(game.guesses, me.userId, opponent.userId)}
                theirs={progressOf(game.guesses, opponent.userId, me.userId)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
      <h3 className="font-display text-lg text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DigitBoxes({ value, muted = false }: { value: string; muted?: boolean }) {
  return (
    <div className="flex gap-1.5">
      {value.split("").map((d, i) => (
        <span
          key={i}
          className={`flex size-10 items-center justify-center rounded-lg font-display text-xl tabular-nums ${
            muted ? "bg-slate-100 text-ink" : "bg-ink text-white"
          }`}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function MySecretCard({
  secret,
  onSet,
  opponents,
  progress,
}: {
  secret: string | null;
  onSet: (value: string) => Promise<{ ok: boolean; error?: string }>;
  opponents: Person[];
  progress: (p: Person) => Progress;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (value.length !== 4) return;
    if (!confirm(`今天的數字設為 ${value}？設定後今天就不能更改。`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onSet(value);
      if (!result.ok) {
        setError(result.error === "already_set" ? "今天已經設定過了。" : "請輸入 4 位數字。");
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="我今天的數字">
      {secret ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <DigitBoxes value={secret} />
            <span className="text-xs text-muted-foreground">今天已設定，不能更改</span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {opponents.map((p) => {
              const { tries, solved } = progress(p);
              return (
                <li key={p.userId} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-ink">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </span>
                  <span className="text-muted-foreground">
                    {tries === 0 ? "還沒開始猜" : solved ? `猜中了・${tries} 次` : `猜了 ${tries} 次`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(digitsOnly(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="4 位數字"
              aria-label="我的 4 位數字"
              className="max-w-40 font-display text-lg tracking-[0.4em] tabular-nums"
            />
            <Button type="submit" disabled={value.length !== 4 || busy}>
              設定
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">數字可以重複。設定後今天不能更改。</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      )}
    </Card>
  );
}

function GuessList({ guesses }: { guesses: Guess[] }) {
  if (guesses.length === 0) return null;
  return (
    <ol className="space-y-1.5">
      {guesses.map((g, i) => (
        <li key={g.id} className="flex items-center gap-3">
          <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
          <span className="font-display text-lg tracking-[0.3em] tabular-nums text-ink">
            {g.guess}
          </span>
          <span className="ml-auto text-sm font-medium tabular-nums">
            <span className="text-teal-700">{g.a}A</span>
            <span className="text-amber-700">{g.b}B</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function TheirGuessesCard({ opponent, guesses }: { opponent: Person; guesses: Guess[] }) {
  const solved = guesses.some((g) => g.a === 4);
  return (
    <Card title={`「${opponent.name}」猜我的數字`}>
      {guesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">{opponent.name}還沒開始猜。</p>
      ) : (
        <div className="space-y-3">
          <GuessList guesses={guesses} />
          <p className="text-xs text-muted-foreground">
            {solved ? `猜中了・共 ${guesses.length} 次` : `已猜 ${guesses.length} 次，還沒猜中`}
          </p>
        </div>
      )}
    </Card>
  );
}

function GuessCard({
  opponent,
  ready,
  guesses,
  onGuess,
}: {
  opponent: Person;
  ready: boolean;
  guesses: Guess[];
  onGuess: (value: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const solved = guesses.some((g) => g.a === 4);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (value.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onGuess(value);
      if (result.ok) setValue("");
      else setError(GUESS_ERRORS[result.error as keyof typeof GUESS_ERRORS] ?? "猜測失敗。");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={`猜「${opponent.name}」的數字`}>
      {!ready ? (
        <p className="text-sm text-muted-foreground">{opponent.name}今天還沒設定數字。</p>
      ) : (
        <div className="space-y-3">
          <GuessList guesses={guesses} />

          {solved ? (
            <p className="rounded-xl bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">
              猜中了！共 {guesses.length} 次
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={value}
                  onChange={(e) => setValue(digitsOnly(e.target.value))}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="4 位數字"
                  aria-label="猜的數字"
                  className="max-w-40 font-display text-lg tracking-[0.4em] tabular-nums"
                />
                <Button type="submit" disabled={value.length !== 4 || busy}>
                  猜
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

function ResultCard({
  opponent,
  iHaveSecret,
  mine,
  theirs,
}: {
  opponent: Person;
  iHaveSecret: boolean;
  mine: Progress;
  theirs: Progress;
}) {
  const done = mine.solved && theirs.solved;
  const status = (p: Progress) =>
    p.solved ? `猜中・${p.tries} 次` : p.tries > 0 ? `進行中・${p.tries} 次` : "還沒開始";

  return (
    <Card title="結果">
      {done ? (
        <div className="space-y-2">
          <p className="font-display text-2xl text-ink">
            {mine.tries < theirs.tries
              ? "你贏了！"
              : mine.tries > theirs.tries
                ? `${opponent.name}贏了`
                : "平手"}
          </p>
          <p className="text-sm text-muted-foreground">
            你 {mine.tries} 次・{opponent.name} {theirs.tries} 次
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-ink">你</span>
            <span className="text-muted-foreground">{status(mine)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-ink">{opponent.name}</span>
            <span className="text-muted-foreground">{status(theirs)}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            {iHaveSecret ? "兩人都猜中後揭曉勝負。" : "你還沒設定今天的數字，對方還不能開始猜。"}
          </p>
        </div>
      )}
    </Card>
  );
}
