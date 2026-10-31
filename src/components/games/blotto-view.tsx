"use client";

import { useState } from "react";
import {
  GameCard,
  GameScreen,
  LoadingLine,
  OpponentPicker,
  Verdict,
} from "@/components/games/game-ui";
import type { Person } from "@/components/shared-view";
import { Button } from "@/components/ui/button";
import { CASTLES, SOLDIERS, blottoResult, verdictText, type BlottoMove } from "@/lib/duels";
import { describeError } from "@/lib/supabase";
import { DUEL_ERRORS, useDuel } from "@/store/duel";
import { Minus, Plus } from "lucide-react";

const CASTLE_NAMES = ["左城", "中城", "右城"];

export function BlottoView({
  me,
  opponents,
  onBack,
}: {
  me: Person;
  opponents: Person[];
  onBack: () => void;
}) {
  const [opponentId, setOpponentId] = useState(opponents[0].userId);
  const opponent = opponents.find((p) => p.userId === opponentId) ?? opponents[0];
  return (
    <GameScreen
      title="攻城戰"
      subtitle="每天一回合"
      rules={`每天有 ${SOLDIERS} 個兵，分配去攻打對方的 3 座城和守住自己的 3 座城。攻擊兵比對方那座城的守兵多才算攻下。兩人都出兵後立刻揭曉，攻下比較多城的人獲勝。`}
      onBack={onBack}
    >
      <OpponentPicker opponents={opponents} value={opponent.userId} onChange={setOpponentId} />
      <BlottoGame key={opponent.userId} me={me} opponent={opponent} />
    </GameScreen>
  );
}

function BlottoGame({ me, opponent }: { me: Person; opponent: Person }) {
  const duel = useDuel<BlottoMove>("blotto", me.userId, opponent.userId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!duel.loaded || !duel.status) return <LoadingLine />;
  const { status, current } = duel;

  async function submit(move: BlottoMove) {
    setError(null);
    setBusy(true);
    try {
      const result = await duel.submit(move);
      if (!result.ok) setError(DUEL_ERRORS[result.error ?? "invalid"]);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const theirLine = status.theirs ? `${opponent.name}今天已出兵` : `${opponent.name}今天還沒出兵`;
  const history = duel.completed.filter((r) => r.round !== status.round).slice(0, 7);
  const record = duel.completed.reduce(
    (acc, r) => {
      const { mineScore, theirScore } = blottoResult(r.mine, r.theirs);
      if (mineScore > theirScore) acc.wins++;
      else if (mineScore < theirScore) acc.losses++;
      else acc.draws++;
      return acc;
    },
    { wins: 0, losses: 0, draws: 0 },
  );

  return (
    <>
      {!status.mine ? (
        <AllocationCard theirLine={theirLine} busy={busy} onSubmit={submit} />
      ) : current?.mine && current.theirs ? (
        <GameCard title="今天的戰果">
          <BlottoResult mine={current.mine} theirs={current.theirs} opponent={opponent} />
        </GameCard>
      ) : (
        <GameCard title="今天已出兵">
          {current?.mine && <AllocationSummary move={current.mine} />}
          <p className="mt-3 text-sm text-muted-foreground">等{opponent.name}出兵後就會揭曉。</p>
        </GameCard>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {duel.completed.length > 0 && (
        <GameCard
          title="戰績"
          action={
            <span className="text-xs text-muted-foreground">
              {record.wins} 勝 {record.losses} 敗 {record.draws} 和
            </span>
          }
        >
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">從今天開始累積。</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {history.map((r) => {
                const { mineScore, theirScore } = blottoResult(r.mine, r.theirs);
                return (
                  <li key={r.round} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-muted-foreground">{r.round.slice(5).replace("-", "/")}</span>
                    <span className="tabular-nums">
                      {mineScore}：{theirScore}
                    </span>
                    <span className="w-16 text-right">
                      {mineScore > theirScore ? "贏" : mineScore < theirScore ? "輸" : "平手"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </GameCard>
      )}
    </>
  );
}

function AllocationCard({
  theirLine,
  busy,
  onSubmit,
}: {
  theirLine: string;
  busy: boolean;
  onSubmit: (move: BlottoMove) => void;
}) {
  const [attack, setAttack] = useState(() => Array(CASTLES).fill(0) as number[]);
  const [defense, setDefense] = useState(() => Array(CASTLES).fill(0) as number[]);
  const left = SOLDIERS - [...attack, ...defense].reduce((a, b) => a + b, 0);

  const change = (setter: typeof setAttack, i: number, delta: number) =>
    setter((prev) => prev.map((v, j) => (j === i ? v + delta : v)));

  return (
    <GameCard
      title="今天的出兵"
      action={<span className="text-xs text-muted-foreground">{theirLine}</span>}
    >
      <div className="grid grid-cols-3 gap-2">
        {CASTLE_NAMES.map((name, i) => (
          <div key={name} className="space-y-3 rounded-xl bg-slate-50 p-2.5 text-center">
            <p className="text-sm font-medium text-ink">{name}</p>
            <Stepper
              label={`${name}攻擊`}
              caption="攻擊"
              value={attack[i]}
              canAdd={left > 0}
              onChange={(d) => change(setAttack, i, d)}
            />
            <Stepper
              label={`${name}防守`}
              caption="防守"
              value={defense[i]}
              canAdd={left > 0}
              onChange={(d) => change(setDefense, i, d)}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          剩 <span className="font-medium tabular-nums text-ink">{left}</span> 個兵
        </span>
        <Button
          disabled={busy || left !== 0}
          onClick={() => {
            if (confirm("確定出兵？今天就不能再改了。")) onSubmit({ attack, defense });
          }}
        >
          出兵
        </Button>
      </div>
    </GameCard>
  );
}

function Stepper({
  label,
  caption,
  value,
  canAdd,
  onChange,
}: {
  label: string;
  caption: string;
  value: number;
  canAdd: boolean;
  onChange: (delta: number) => void;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{caption}</p>
      <div className="mt-1 flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`${label}減少`}
          disabled={value === 0}
          onClick={() => onChange(-1)}
        >
          <Minus />
        </Button>
        <span className="w-5 text-lg font-medium tabular-nums text-ink" aria-label={label}>
          {value}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`${label}增加`}
          disabled={!canAdd}
          onClick={() => onChange(1)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function AllocationSummary({ move }: { move: BlottoMove }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {CASTLE_NAMES.map((name, i) => (
        <div key={name} className="rounded-xl bg-slate-50 p-2.5">
          <p className="text-sm font-medium text-ink">{name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            攻 {move.attack[i]}・守 {move.defense[i]}
          </p>
        </div>
      ))}
    </div>
  );
}

function BlottoResult({
  mine,
  theirs,
  opponent,
}: {
  mine: BlottoMove;
  theirs: BlottoMove;
  opponent: Person;
}) {
  const { castles, mineScore, theirScore } = blottoResult(mine, theirs);
  return (
    <div className="space-y-4">
      <Verdict
        text={verdictText(mineScore, theirScore, opponent.name)}
        detail={`你攻下 ${mineScore} 座・${opponent.name}攻下 ${theirScore} 座`}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <ResultList
          title="我的進攻"
          rows={castles.map((c, i) => ({
            name: CASTLE_NAMES[i],
            numbers: `攻 ${mine.attack[i]} vs 守 ${theirs.defense[i]}`,
            good: c.iCapture,
            text: c.iCapture ? "攻下" : "沒攻下",
          }))}
        />
        <ResultList
          title="我的防守"
          rows={castles.map((c, i) => ({
            name: CASTLE_NAMES[i],
            numbers: `攻 ${theirs.attack[i]} vs 守 ${mine.defense[i]}`,
            good: !c.theyCapture,
            text: c.theyCapture ? "失守" : "守住",
          }))}
        />
      </div>
    </div>
  );
}

function ResultList({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; numbers: string; good: boolean; text: string }[];
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between text-sm">
            <span className="text-ink">{r.name}</span>
            <span className="tabular-nums text-muted-foreground">{r.numbers}</span>
            <span className={`w-12 text-right font-medium ${r.good ? "text-teal-700" : "text-rose-700"}`}>
              {r.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
