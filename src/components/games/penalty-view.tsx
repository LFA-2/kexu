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
import {
  DIRECTIONS,
  DIRECTION_LABEL,
  KICKS,
  penaltyResult,
  verdictText,
  type Direction,
  type PenaltyMove,
} from "@/lib/duels";
import { describeError } from "@/lib/supabase";
import { DUEL_ERRORS, useDuel } from "@/store/duel";

export function PenaltyView({
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
      title="點球大戰"
      subtitle="五球決勝"
      rules="每場先決定自己 5 球的射門方向，和當守門員時 5 次的撲救方向。射門方向和對方撲的方向不同就進球。兩人都出招後揭曉，進球多的人獲勝，之後就可以踢下一場。"
      onBack={onBack}
    >
      <OpponentPicker opponents={opponents} value={opponent.userId} onChange={setOpponentId} />
      <PenaltyGame key={opponent.userId} me={me} opponent={opponent} />
    </GameScreen>
  );
}

function PenaltyGame({ me, opponent }: { me: Person; opponent: Person }) {
  const duel = useDuel<PenaltyMove>("penalty", me.userId, opponent.userId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!duel.loaded || !duel.status) return <LoadingLine />;
  const { status, completed } = duel;
  const latest = completed[0];

  async function submit(move: PenaltyMove) {
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

  const record = completed.reduce(
    (acc, r) => {
      const { mineScore, theirScore } = penaltyResult(r.mine, r.theirs);
      if (mineScore > theirScore) acc.wins++;
      else if (mineScore < theirScore) acc.losses++;
      else acc.draws++;
      return acc;
    },
    { wins: 0, losses: 0, draws: 0 },
  );

  return (
    <>
      {latest && (
        <GameCard
          title={`第 ${latest.round} 場結果`}
          action={
            <span className="text-xs text-muted-foreground">
              戰績 {record.wins} 勝 {record.losses} 敗 {record.draws} 和
            </span>
          }
        >
          <PenaltyResult mine={latest.mine} theirs={latest.theirs} opponent={opponent} />
        </GameCard>
      )}

      {!status.mine ? (
        <PenaltyEditor
          key={status.round}
          title={`第 ${status.round} 場`}
          theirLine={status.theirs ? `${opponent.name}已出招` : `${opponent.name}還沒出招`}
          busy={busy}
          onSubmit={submit}
        />
      ) : (
        <GameCard title={`第 ${status.round} 場`}>
          <p className="text-sm text-muted-foreground">你已經出招了，等{opponent.name}出招後就會揭曉。</p>
        </GameCard>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}

const randomDirections = () =>
  Array.from({ length: KICKS }, () => DIRECTIONS[Math.floor(Math.random() * 3)]);

function PenaltyEditor({
  title,
  theirLine,
  busy,
  onSubmit,
}: {
  title: string;
  theirLine: string;
  busy: boolean;
  onSubmit: (move: PenaltyMove) => void;
}) {
  const [shots, setShots] = useState<(Direction | null)[]>(Array(KICKS).fill(null));
  const [dives, setDives] = useState<(Direction | null)[]>(Array(KICKS).fill(null));
  const complete = [...shots, ...dives].every(Boolean);

  return (
    <GameCard title={title} action={<span className="text-xs text-muted-foreground">{theirLine}</span>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <DirectionColumn caption="射門" values={shots} onChange={setShots} />
        <DirectionColumn caption="撲救" values={dives} onChange={setDives} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShots(randomDirections());
            setDives(randomDirections());
          }}
        >
          隨機填
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          disabled={busy || !complete}
          onClick={() => {
            if (confirm("確定送出？這一場就不能再改了。"))
              onSubmit({ shots: shots as Direction[], dives: dives as Direction[] });
          }}
        >
          送出
        </Button>
      </div>
    </GameCard>
  );
}

function DirectionColumn({
  caption,
  values,
  onChange,
}: {
  caption: string;
  values: (Direction | null)[];
  onChange: (next: (Direction | null)[]) => void;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-muted-foreground">{caption}</p>
      <ul className="mt-2 space-y-1.5">
        {values.map((value, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="w-4 text-sm tabular-nums text-muted-foreground">{i + 1}</span>
            <div
              role="radiogroup"
              aria-label={`${caption}第 ${i + 1} 球`}
              className="flex flex-1 rounded-lg border border-border/80 bg-white p-0.5"
            >
              {DIRECTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={value === d}
                  onClick={() => onChange(values.map((v, j) => (j === i ? d : v)))}
                  className={`flex-1 rounded-md py-1 text-sm transition-colors ${
                    value === d ? "bg-ink text-white" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {DIRECTION_LABEL[d]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PenaltyResult({
  mine,
  theirs,
  opponent,
}: {
  mine: PenaltyMove;
  theirs: PenaltyMove;
  opponent: Person;
}) {
  const { kicks, mineScore, theirScore } = penaltyResult(mine, theirs);
  return (
    <div className="space-y-4">
      <Verdict
        text={verdictText(mineScore, theirScore, opponent.name)}
        detail={`你 ${mineScore}：${theirScore} ${opponent.name}`}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="w-12 pb-2 text-left font-normal" />
            <th className="pb-2 text-left font-normal">你射門</th>
            <th className="pb-2 text-left font-normal">{opponent.name}射門</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {kicks.map((k, i) => (
            <tr key={i}>
              <td className="py-2 tabular-nums text-muted-foreground">{i + 1}</td>
              <KickCell goal={k.myGoal} shot={k.myShot} dive={k.theirDive} />
              <KickCell goal={k.theirGoal} shot={k.theirShot} dive={k.myDive} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KickCell({ goal, shot, dive }: { goal: boolean; shot: Direction; dive: Direction }) {
  return (
    <td className="py-2">
      <span className={`font-medium ${goal ? "text-teal-700" : "text-muted-foreground"}`}>
        {goal ? "進球" : "被撲出"}
      </span>
      <span className="ml-2 text-xs text-muted-foreground">
        射{DIRECTION_LABEL[shot]}・撲{DIRECTION_LABEL[dive]}
      </span>
    </td>
  );
}
