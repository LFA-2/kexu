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
import {
  BOARD,
  FLEET_CELLS,
  SHIP_LENGTHS,
  randomFleet,
  shipCells,
  type Orientation,
} from "@/lib/duels";
import { describeError } from "@/lib/supabase";
import { useBattleship, type BsResult, type BsShot } from "@/store/battleship";

const ERRORS: Record<string, string> = {
  not_linked: "你們目前沒有連結。",
  active_exists: "已經有一局在進行中。",
  not_placing: "這局已經開始了。",
  already_placed: "你已經佈陣了。",
  invalid: "船的位置不正確。",
  not_playing: "這局沒有在進行。",
  not_your_turn: "還沒輪到你。",
  already_shot: "這格已經打過了。",
  finished: "這局已經結束了。",
  not_found: "找不到這局。",
};

const CELLS = Array.from({ length: BOARD * BOARD }, (_, i) => i);

export function BattleshipView({
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
      title="海戰棋"
      subtitle="7×7 海域・輪流開砲"
      rules="先擺好 4 艘船（4、3、2、2 格），擺好就不能移動。雙方輪流開一砲，打中是紅色，整艘都被打中就擊沉。先擊沉對方所有船的人獲勝。"
      onBack={onBack}
    >
      <OpponentPicker opponents={opponents} value={opponent.userId} onChange={setOpponentId} />
      <BattleshipGame key={opponent.userId} me={me} opponent={opponent} />
    </GameScreen>
  );
}

function BattleshipGame({ me, opponent }: { me: Person; opponent: Person }) {
  const bs = useBattleship(me.userId, opponent.userId);
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

  if (!bs.loaded) return <LoadingLine />;

  const game = bs.game;
  const myShots = bs.shots.filter((s) => s.shooter === me.userId);
  const theirShots = bs.shots.filter((s) => s.shooter === opponent.userId);
  const lastShotId = bs.shots[bs.shots.length - 1]?.id;
  const sunkCount = myShots.filter((s) => s.result === "sunk").length;
  const lostCount = theirShots.filter((s) => s.result === "sunk").length;
  const errorLine = error && <p className="text-sm text-destructive">{error}</p>;
  const record = `戰績 ${bs.record.wins} 勝 ${bs.record.losses} 敗`;

  if (!game || game.status === "finished") {
    return (
      <>
        {game && (
          <GameCard title="上一局">
            <Verdict
              text={
                !game.winner
                  ? "這局已取消"
                  : game.winner === me.userId
                    ? "你贏了！"
                    : `${opponent.name}贏了`
              }
              detail={`你擊沉 ${sunkCount} 艘・${opponent.name}擊沉 ${lostCount} 艘`}
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <BoardBlock label={`${opponent.name}的海域`}>
                <TargetBoard shots={myShots} fleet={bs.theirFleet} lastShotId={lastShotId} />
              </BoardBlock>
              <BoardBlock label="我的海域">
                <HomeBoard fleet={bs.myFleet} shots={theirShots} lastShotId={lastShotId} />
              </BoardBlock>
            </div>
          </GameCard>
        )}
        <GameCard title="新的一局">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{record}</span>
            <Button disabled={busy} onClick={() => run(bs.newGame)}>
              開新局
            </Button>
          </div>
          {errorLine}
        </GameCard>
      </>
    );
  }

  const resign = (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      disabled={busy}
      onClick={() => {
        if (confirm(game.status === "placing" ? "取消這一局？" : "確定認輸？")) run(bs.resign);
      }}
    >
      {game.status === "placing" ? "取消這局" : "認輸"}
    </Button>
  );

  if (game.status === "placing") {
    return bs.myFleet ? (
      <GameCard title={`等${opponent.name}佈陣`} action={resign}>
        <HomeBoard fleet={bs.myFleet} shots={[]} />
        {errorLine}
      </GameCard>
    ) : (
      <>
        <FleetEditor busy={busy} onSubmit={(fleet) => run(() => bs.place(fleet))} />
        {errorLine}
        <div className="flex justify-end">{resign}</div>
      </>
    );
  }

  const myTurn = game.turn === me.userId;
  const shotCells = new Set(myShots.map((s) => s.cell));

  return (
    <>
      <div
        className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
          myTurn ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-muted-foreground"
        }`}
      >
        {myTurn ? "輪到你開砲，點對方海域的格子" : `等${opponent.name}開砲`}
      </div>
      <GameCard
        title={`${opponent.name}的海域`}
        action={<span className="text-xs text-muted-foreground">已擊沉 {sunkCount}/4</span>}
      >
        <TargetBoard
          shots={myShots}
          fleet={null}
          lastShotId={lastShotId}
          onFire={
            myTurn && !busy
              ? (cell) => {
                  if (!shotCells.has(cell)) run(() => bs.fire(cell));
                }
              : undefined
          }
        />
        {errorLine}
      </GameCard>
      <GameCard
        title="我的海域"
        action={<span className="text-xs text-muted-foreground">被擊沉 {lostCount}/4</span>}
      >
        <HomeBoard fleet={bs.myFleet} shots={theirShots} lastShotId={lastShotId} />
      </GameCard>
      <div className="flex justify-end">{resign}</div>
    </>
  );
}

function BoardBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">{label}</p>
      {children}
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

const ring = (on: boolean) => (on ? " ring-2 ring-amber-400 ring-offset-1" : "");

function TargetBoard({
  shots,
  fleet,
  lastShotId,
  onFire,
}: {
  shots: BsShot[];
  fleet: number[][] | null;
  lastShotId?: number;
  onFire?: (cell: number) => void;
}) {
  const byCell = new Map(shots.map((s) => [s.cell, s]));
  const sunk = new Set(shots.flatMap((s) => s.sunk_cells ?? []));
  const ships = new Set(fleet?.flat() ?? []);
  return (
    <Board
      onCell={onFire}
      look={(cell) => {
        const shot = byCell.get(cell);
        const last = ring(shot?.id === lastShotId);
        if (sunk.has(cell)) return { className: "bg-rose-800" + last, label: "擊沉" };
        if (shot?.result === "hit") return { className: "bg-rose-500" + last, label: "打中" };
        if (shot) return { className: "bg-slate-100" + last, dot: true, label: "沒中" };
        if (ships.has(cell)) return { className: "bg-slate-300", label: "船" };
        return {
          className: onFire ? "bg-slate-100 hover:bg-teal-100" : "bg-slate-100",
          label: "未知",
        };
      }}
    />
  );
}

function HomeBoard({
  fleet,
  shots,
  lastShotId,
}: {
  fleet: number[][] | null;
  shots: BsShot[];
  lastShotId?: number;
}) {
  const ships = new Set(fleet?.flat() ?? []);
  const byCell = new Map(shots.map((s) => [s.cell, s]));
  return (
    <Board
      look={(cell) => {
        const shot = byCell.get(cell);
        const last = ring(shot?.id === lastShotId);
        if (shot && ships.has(cell)) return { className: "bg-rose-500" + last, label: "被打中" };
        if (shot) return { className: "bg-slate-100" + last, dot: true, label: "沒中" };
        if (ships.has(cell)) return { className: "bg-slate-500", label: "我的船" };
        return { className: "bg-slate-100", label: "海" };
      }}
    />
  );
}

function FleetEditor({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (fleet: number[][]) => void;
}) {
  const [ships, setShips] = useState<(number[] | null)[]>(SHIP_LENGTHS.map(() => null));
  const [selected, setSelected] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>("h");
  const [hint, setHint] = useState<string | null>(null);

  const owner = new Map<number, number>();
  ships.forEach((cells, i) => cells?.forEach((c) => owner.set(c, i)));
  const placedCount = ships.filter(Boolean).length;

  function tap(cell: number) {
    setHint(null);
    const existing = owner.get(cell);
    if (existing !== undefined) {
      setShips((prev) => prev.map((s, i) => (i === existing ? null : s)));
      setSelected(existing);
      return;
    }
    if (selected < 0 || ships[selected]) return;
    const cells = shipCells(cell, SHIP_LENGTHS[selected], orientation);
    if (!cells || cells.some((c) => owner.has(c))) {
      setHint("這裡放不下，換個位置或方向。");
      return;
    }
    const next = ships.map((s, i) => (i === selected ? cells : s));
    setShips(next);
    setSelected(next.findIndex((s) => !s));
  }

  return (
    <GameCard title="佈陣">
      <p className="text-xs leading-relaxed text-muted-foreground">
        選一艘船，點格子放下（從那格往右或往下延伸）。點已經放好的船可以拿起來重放。
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SHIP_LENGTHS.map((length, i) => (
          <button
            key={i}
            type="button"
            onClick={() => !ships[i] && setSelected(i)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              ships[i]
                ? "border-transparent bg-slate-100 text-muted-foreground line-through"
                : selected === i
                  ? "border-ink bg-ink text-white"
                  : "border-border/80 text-muted-foreground hover:text-ink"
            }`}
          >
            {length} 格
          </button>
        ))}
        <div className="ml-auto flex rounded-lg border border-border/80 p-0.5">
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
          look={(cell) =>
            owner.has(cell)
              ? { className: "bg-slate-500", label: "船" }
              : { className: "bg-slate-100 hover:bg-teal-100", label: "海" }
          }
        />
      </div>
      {hint && <p className="mt-2 text-sm text-destructive">{hint}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShips(randomFleet());
            setSelected(-1);
            setHint(null);
          }}
        >
          隨機擺放
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShips(SHIP_LENGTHS.map(() => null));
            setSelected(0);
            setHint(null);
          }}
        >
          清除
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          disabled={busy || placedCount !== SHIP_LENGTHS.length}
          onClick={() => {
            if (confirm("確認佈陣？之後就不能移動了。")) onSubmit(ships as number[][]);
          }}
        >
          確認佈陣
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        已放 {placedCount}/{SHIP_LENGTHS.length} 艘・共 {FLEET_CELLS} 格
      </p>
    </GameCard>
  );
}
