"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
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
      subtitle="三球決勝"
      rules="每場先決定自己 3 球的射門方向，和當守門員時 3 次的撲救方向。射門方向和對方撲的方向不同就進球。兩人都出招後逐球揭曉，進球多的人獲勝，之後就可以踢下一場。"
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
          <PenaltyResult mine={latest.mine} theirs={latest.theirs} me={me} opponent={opponent} />
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

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const KICK_BEAT_MS = 1900;
const ME_COLOR = "#0f766e";
const THEM_COLOR = "#1e3a5f";
const LANE: Record<Direction, string> = { L: "24%", C: "50%", R: "76%" };

function PenaltyResult({
  mine,
  theirs,
  me,
  opponent,
}: {
  mine: PenaltyMove;
  theirs: PenaltyMove;
  me: Person;
  opponent: Person;
}) {
  const { kicks, mineScore, theirScore } = penaltyResult(mine, theirs);
  const script = kicks
    .map((k) => `${k.myShot}${k.theirDive}${k.myGoal ? 1 : 0}${k.theirShot}${k.myDive}${k.theirGoal ? 1 : 0}`)
    .join("|");
  const [playId, setPlayId] = useState(0);
  const [cursor, setCursor] = useState(0);
  const reduced = useReducedMotion();
  const count = kicks.length;

  useEffect(() => {
    if (reduced) return;
    const timers = Array.from({ length: count }, (_, i) =>
      setTimeout(() => setCursor(i), i * KICK_BEAT_MS),
    );
    const doneTimer = setTimeout(() => setCursor(count), count * KICK_BEAT_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
  }, [script, playId, reduced, count]);

  const done = reduced || cursor >= count;
  const shown = done ? count : cursor;
  const live = kicks.slice(0, shown);
  const liveMine = live.filter((k) => k.myGoal).length;
  const liveTheirs = live.filter((k) => k.theirGoal).length;
  const spot = done ? null : kicks[cursor];

  return (
    <div className="space-y-4">
      {done ? (
        <Verdict
          text={verdictText(mineScore, theirScore, opponent.name)}
          detail={`你 ${mineScore}：${theirScore} ${opponent.name}`}
        />
      ) : (
        <div className="space-y-2">
          <p className="font-display text-2xl text-ink">第 {cursor + 1} 球</p>
          <p className="text-sm tabular-nums text-muted-foreground">
            你 {liveMine}：{liveTheirs} {opponent.name}
          </p>
        </div>
      )}
      <div className="flex gap-1.5" aria-hidden>
        {kicks.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < shown ? "bg-ink" : i === cursor ? "bg-teal-600" : "bg-slate-200"}`}
          />
        ))}
      </div>

      {spot && (
        <KickPair
          kick={spot}
          me={me}
          opponent={opponent}
          mode="play"
        />
      )}

      {done &&
        kicks.map((kick, i) => (
          <div key={i} className="space-y-2">
            <p className="text-xs text-muted-foreground">第 {i + 1} 球</p>
            <KickPair kick={kick} me={me} opponent={opponent} mode="settled" />
          </div>
        ))}

      {done && !reduced && (
        <Button variant="outline" size="sm" onClick={() => setPlayId((n) => n + 1)}>
          再看一次
        </Button>
      )}
    </div>
  );
}

type Kick = ReturnType<typeof penaltyResult>["kicks"][number];

function KickPair({
  kick,
  me,
  opponent,
  mode,
}: {
  kick: Kick;
  me: Person;
  opponent: Person;
  mode: "play" | "settled";
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <KickStage
        shot={kick.myShot}
        dive={kick.theirDive}
        goal={kick.myGoal}
        shooter={me.name}
        keeper={opponent.name}
        shooterColor={ME_COLOR}
        keeperColor={THEM_COLOR}
        mode={mode}
      />
      <KickStage
        shot={kick.theirShot}
        dive={kick.myDive}
        goal={kick.theirGoal}
        shooter={opponent.name}
        keeper={me.name}
        shooterColor={THEM_COLOR}
        keeperColor={ME_COLOR}
        mode={mode}
      />
    </div>
  );
}

function KickStage({
  shot,
  dive,
  goal,
  shooter,
  keeper,
  shooterColor,
  keeperColor,
  mode,
}: {
  shot: Direction;
  dive: Direction;
  goal: boolean;
  shooter: string;
  keeper: string;
  shooterColor: string;
  keeperColor: string;
  mode: "play" | "settled";
}) {
  return (
    <figure
      className={`pk-card ${mode === "play" ? "pk-on" : "pk-settled"} ${goal ? "is-goal" : "is-save"}`}
      style={
        {
          "--shot-x": LANE[shot],
          "--dive-x": LANE[dive],
          "--dive-rot": dive === "L" ? "-68deg" : dive === "R" ? "68deg" : "0deg",
          "--dive-y": dive === "C" ? "-8px" : "12px",
        } as CSSProperties
      }
    >
      <div className="pk-stage" aria-hidden>
        <div className="pk-goal" />
        <div className="pk-flash" />
        <div className="pk-keeper">
          <span className="pk-tag" style={{ color: keeperColor }}>
            {keeper}
          </span>
          <Person color={keeperColor} keeper />
        </div>
        <div className={`pk-ball ${goal ? "is-goal" : "is-save"}`} />
        <div className="pk-kicker">
          <span className="pk-tag" style={{ color: shooterColor }}>
            {shooter}
          </span>
          <Person color={shooterColor} />
        </div>
      </div>
      <figcaption className="pk-call">
        <span className={goal ? "text-teal-800" : "text-ink"}>{goal ? "進球" : "被撲出"}</span>
        <span className="text-muted-foreground">
          {shooter} 射{DIRECTION_LABEL[shot]}・{keeper} 撲{DIRECTION_LABEL[dive]}
        </span>
      </figcaption>
    </figure>
  );
}

function Person({ color, keeper = false }: { color: string; keeper?: boolean }) {
  return (
    <span className="pk-body" style={{ color }}>
      {keeper && (
        <>
          <span className="pk-glove pk-glove-l" />
          <span className="pk-glove pk-glove-r" />
        </>
      )}
      <span className="pk-head" />
      <span className="pk-torso" />
      <span className="pk-leg pk-leg-l" />
      {keeper ? <span className="pk-leg pk-leg-r" /> : <span className="pk-boot" />}
    </span>
  );
}
