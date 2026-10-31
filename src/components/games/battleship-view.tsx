"use client";

import { useState, type ReactNode } from "react";
import {
  GameCard,
  GameScreen,
  LoadingLine,
  OpponentPicker,
  Verdict,
} from "@/components/games/game-ui";
import type { Person } from "@/components/shared-view";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/dates";
import {
  BOARD,
  FLEET_CELLS,
  SHIP_LENGTHS,
  randomShip,
  shipCells,
  type Orientation,
} from "@/lib/duels";
import { describeError } from "@/lib/supabase";
import { useBattleship, type BsResult, type BsShot } from "@/store/battleship";

const ERRORS: Record<string, string> = {
  invalid: "船的位置不正確。",
  already_set: "今天已經擺過船了。",
  not_linked: "你們目前沒有連結。",
  no_own_fleet: "先擺好你的船才能開砲。",
  no_fleet: "對方今天還沒擺船。",
  already_finished: "已經全部擊沉了。",
  already_shot: "這格已經打過了。",
};

const CELLS = Array.from({ length: BOARD * BOARD }, (_, i) => i);

type Progress = { shots: number; sunk: number; finished: boolean };

function progressOf(shots: BsShot[]): Progress {
  return {
    shots: shots.length,
    sunk: shots.filter((s) => s.result === "sunk").length,
    finished: shots.filter((s) => s.result !== "miss").length === FLEET_CELLS,
  };
}

export function BattleshipView({
  me,
  opponents,
  onBack,
}: {
  me: Person;
  opponents: Person[];
  onBack: () => void;
}) {
  const bs = useBattleship();
  const [opponentId, setOpponentId] = useState(opponents[0].userId);
  const opponent = opponents.find((p) => p.userId === opponentId) ?? opponents[0];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<BsResult>) {
    setError(null);
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) setError(ERRORS[result.error ?? ""] ?? "操作失敗。");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const myShots = bs.shots.filter((s) => s.shooter === me.userId && s.owner === opponent.userId);
  const theirShots = bs.shots.filter((s) => s.shooter === opponent.userId && s.owner === me.userId);
  const mine = progressOf(myShots);
  const theirs = progressOf(theirShots);
  const ready = bs.readyIds.has(opponent.userId);
  const shotCells = new Set(myShots.map((s) => s.cell));
  const errorLine = error && <p className="mt-3 text-sm text-destructive">{error}</p>;

  return (
    <GameScreen
      title="海戰棋"
      subtitle={`${formatShortDate(bs.day)}・每天擺一次船`}
      rules="每天擺一次 4 艘船（4、3、2、2 格），擺好今天就不能改。兩人都擺好後，就可以對對方的海域開砲，不用輪流，隨時都能打。兩人都擊沉對方全部的船後，用的砲數少的人獲勝。"
      onBack={onBack}
    >
      {!bs.loaded ? (
        <LoadingLine />
      ) : (
        <>
          <OpponentPicker opponents={opponents} value={opponent.userId} onChange={setOpponentId} />

          {bs.myFleet ? (
            <GameCard
              title="我今天的海域"
              action={
                <span className="text-xs text-muted-foreground">
                  {opponent.name}
                  {theirs.shots === 0 ? "還沒開砲" : `開了 ${theirs.shots} 砲・擊沉 ${theirs.sunk}/4`}
                </span>
              }
            >
              <HomeBoard fleet={bs.myFleet} shots={theirShots} />
            </GameCard>
          ) : (
            <FleetEditor
              busy={busy}
              onSubmit={(fleet) => run(() => bs.setFleet(fleet))}
              error={errorLine}
            />
          )}

          <GameCard
            title={`打「${opponent.name}」的海域`}
            action={
              bs.myFleet && ready ? (
                <span className="text-xs text-muted-foreground">
                  已開 {mine.shots} 砲・擊沉 {mine.sunk}/4
                </span>
              ) : undefined
            }
          >
            {!bs.myFleet ? (
              <p className="text-sm text-muted-foreground">先擺好你今天的船才能開砲。</p>
            ) : !ready ? (
              <p className="text-sm text-muted-foreground">{opponent.name}今天還沒擺船。</p>
            ) : (
              <>
                <TargetBoard
                  shots={myShots}
                  onFire={
                    mine.finished || busy
                      ? undefined
                      : (cell) => {
                          if (!shotCells.has(cell)) run(() => bs.fire(opponent.userId, cell));
                        }
                  }
                />
                {mine.finished && (
                  <p className="mt-3 rounded-xl bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">
                    全部擊沉！共 {mine.shots} 砲
                  </p>
                )}
                {bs.myFleet && errorLine}
              </>
            )}
          </GameCard>

          <GameCard title="結果">
            {mine.finished && theirs.finished ? (
              <Verdict
                text={
                  mine.shots < theirs.shots
                    ? "你贏了！"
                    : mine.shots > theirs.shots
                      ? `${opponent.name}贏了`
                      : "平手"
                }
                detail={`你 ${mine.shots} 砲・${opponent.name} ${theirs.shots} 砲`}
              />
            ) : (
              <div className="space-y-2 text-sm">
                <StatusRow name="你" progress={mine} />
                <StatusRow name={opponent.name} progress={theirs} />
                <p className="pt-1 text-xs text-muted-foreground">兩人都擊沉全部的船後揭曉勝負。</p>
              </div>
            )}
          </GameCard>
        </>
      )}
    </GameScreen>
  );
}

function StatusRow({ name, progress }: { name: string; progress: Progress }) {
  const { shots, sunk, finished } = progress;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-ink">{name}</span>
      <span className="text-muted-foreground">
        {finished ? `全部擊沉・${shots} 砲` : shots > 0 ? `進行中・${shots} 砲・擊沉 ${sunk}/4` : "還沒開始"}
      </span>
    </div>
  );
}

type CellLook = { className: string; dot?: boolean; label: string };

function Board({
  look,
  onCell,
}: {
  look: (cell: number) => CellLook;
  onCell?: (cell: number) => void;
}) {
  return (
    <div className="grid max-w-sm grid-cols-7 gap-1">
      {CELLS.map((cell) => {
        const { className, dot, label } = look(cell);
        return (
          <button
            key={cell}
            type="button"
            disabled={!onCell}
            onClick={() => onCell?.(cell)}
            aria-label={`${String.fromCharCode(65 + (cell % BOARD))}${Math.floor(cell / BOARD) + 1} ${label}`}
            className={`flex aspect-square items-center justify-center rounded-md transition-colors disabled:cursor-default ${className}`}
          >
            {dot && <span className="size-1.5 rounded-full bg-slate-400" />}
          </button>
        );
      })}
    </div>
  );
}

const lastRing = (shots: BsShot[], shot?: BsShot) =>
  shot && shot.id === shots[shots.length - 1]?.id ? " ring-2 ring-amber-400 ring-offset-1" : "";

function TargetBoard({ shots, onFire }: { shots: BsShot[]; onFire?: (cell: number) => void }) {
  const byCell = new Map(shots.map((s) => [s.cell, s]));
  const sunk = new Set(shots.flatMap((s) => s.sunk_cells ?? []));
  return (
    <Board
      onCell={onFire}
      look={(cell) => {
        const shot = byCell.get(cell);
        const ring = lastRing(shots, shot);
        if (sunk.has(cell)) return { className: "bg-rose-800" + ring, label: "擊沉" };
        if (shot?.result === "hit") return { className: "bg-rose-500" + ring, label: "打中" };
        if (shot) return { className: "bg-slate-100" + ring, dot: true, label: "沒中" };
        return {
          className: onFire ? "bg-slate-100 hover:bg-teal-100" : "bg-slate-100",
          label: "未知",
        };
      }}
    />
  );
}

function HomeBoard({ fleet, shots }: { fleet: number[][]; shots: BsShot[] }) {
  const ships = new Set(fleet.flat());
  const byCell = new Map(shots.map((s) => [s.cell, s]));
  return (
    <Board
      look={(cell) => {
        const shot = byCell.get(cell);
        const ring = lastRing(shots, shot);
        if (shot && ships.has(cell)) return { className: "bg-rose-500" + ring, label: "被打中" };
        if (shot) return { className: "bg-slate-100" + ring, dot: true, label: "沒中" };
        if (ships.has(cell)) return { className: "bg-slate-500", label: "我的船" };
        return { className: "bg-slate-100", label: "海" };
      }}
    />
  );
}

function FleetEditor({
  busy,
  onSubmit,
  error,
}: {
  busy: boolean;
  onSubmit: (fleet: number[][]) => void;
  error: ReactNode;
}) {
  const [ships, setShips] = useState<(number[] | null)[]>(SHIP_LENGTHS.map(() => null));
  const [selected, setSelected] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>("h");
  const [hint, setHint] = useState<string | null>(null);

  const owner = new Map<number, number>();
  ships.forEach((cells, i) => cells?.forEach((c) => owner.set(c, i)));
  const placedCount = ships.filter(Boolean).length;
  const othersOf = (i: number) =>
    new Set(ships.flatMap((cells, j) => (j === i || !cells ? [] : cells)));

  function place(i: number, cells: number[]) {
    const next = ships.map((s, j) => (j === i ? cells : s));
    setShips(next);
    if (ships[i] === null) {
      const nextEmpty = next.findIndex((s) => !s);
      if (nextEmpty >= 0) setSelected(nextEmpty);
    }
  }

  function tap(cell: number) {
    setHint(null);
    const existing = owner.get(cell);
    if (existing !== undefined && existing !== selected) {
      setSelected(existing);
      return;
    }
    const cells = shipCells(cell, SHIP_LENGTHS[selected], orientation);
    const others = othersOf(selected);
    if (!cells || cells.some((c) => others.has(c))) {
      setHint("這裡放不下，換個位置或方向。");
      return;
    }
    place(selected, cells);
  }

  function randomize(i: number) {
    setHint(null);
    setSelected(i);
    const cells = randomShip(SHIP_LENGTHS[i], othersOf(i));
    if (cells) place(i, cells);
    else setHint("剩下的空間放不下這艘船。");
  }

  function clear(i: number) {
    setHint(null);
    setShips((prev) => prev.map((s, j) => (j === i ? null : s)));
    setSelected(i);
  }

  return (
    <GameCard title="擺放今天的船">
      <p className="text-xs leading-relaxed text-muted-foreground">
        選一艘船，點格子放下（從那格往右或往下延伸），再點別的位置可以移動它。
      </p>

      <ul className="mt-3 space-y-1.5">
        {SHIP_LENGTHS.map((length, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors ${
              selected === i ? "border-ink" : "border-border/70"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setSelected(i);
                setHint(null);
              }}
              aria-pressed={selected === i}
              className="flex flex-1 items-center gap-3 text-left"
            >
              <span className="flex gap-0.5">
                {Array.from({ length }, (_, k) => (
                  <span
                    key={k}
                    className={`size-3 rounded-sm ${ships[i] ? "bg-slate-500" : "bg-slate-200"}`}
                  />
                ))}
              </span>
              <span className="text-sm text-ink">{length} 格</span>
              <span className="text-xs text-muted-foreground">{ships[i] ? "已擺放" : "未擺放"}</span>
            </button>
            <Button variant="ghost" size="sm" onClick={() => randomize(i)} aria-label={`${length} 格船隨機擺放`}>
              隨機
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!ships[i]}
              onClick={() => clear(i)}
              aria-label={`${length} 格船清除`}
            >
              清除
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">放置方向</span>
        <div className="flex rounded-lg border border-border/80 p-0.5">
          {(["h", "v"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrientation(o)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                orientation === o ? "bg-ink text-white" : "text-muted-foreground hover:text-ink"
              }`}
            >
              {o === "h" ? "橫放" : "直放"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <Board
          onCell={tap}
          look={(cell) => {
            const i = owner.get(cell);
            if (i === undefined) return { className: "bg-slate-100 hover:bg-teal-100", label: "海" };
            return { className: i === selected ? "bg-ink" : "bg-slate-500", label: `${SHIP_LENGTHS[i]} 格船` };
          }}
        />
      </div>
      {hint && <p className="mt-2 text-sm text-destructive">{hint}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          已擺 {placedCount}/{SHIP_LENGTHS.length} 艘
        </span>
        <Button
          size="sm"
          disabled={busy || placedCount !== SHIP_LENGTHS.length}
          onClick={() => {
            if (confirm("確認今天的佈陣？擺好後今天就不能改了。")) onSubmit(ships as number[][]);
          }}
        >
          確認佈陣
        </Button>
      </div>
      {error}
    </GameCard>
  );
}
