export const BOARD = 7;
export const SHIP_LENGTHS = [4, 3, 2, 2];
export const FLEET_CELLS = SHIP_LENGTHS.reduce((a, b) => a + b, 0);

export type Orientation = "h" | "v";

/** Cells for a ship starting at `start`, or null if it leaves the board. */
export function shipCells(start: number, length: number, orientation: Orientation) {
  const row = Math.floor(start / BOARD);
  const col = start % BOARD;
  if (orientation === "h" && col + length > BOARD) return null;
  if (orientation === "v" && row + length > BOARD) return null;
  return Array.from({ length }, (_, i) => (orientation === "h" ? start + i : start + i * BOARD));
}

export function randomFleet(): number[][] {
  for (;;) {
    const used = new Set<number>();
    const fleet: number[][] = [];
    for (const length of SHIP_LENGTHS) {
      let placed = false;
      for (let attempt = 0; attempt < 100 && !placed; attempt++) {
        const cells = shipCells(
          Math.floor(Math.random() * BOARD * BOARD),
          length,
          Math.random() < 0.5 ? "h" : "v",
        );
        if (cells && cells.every((c) => !used.has(c))) {
          cells.forEach((c) => used.add(c));
          fleet.push(cells);
          placed = true;
        }
      }
      if (!placed) break;
    }
    if (fleet.length === SHIP_LENGTHS.length) return fleet;
  }
}

// ---------------------------------------------------------------------------

export const SOLDIERS = 10;
export const CASTLES = 3;
export type BlottoMove = { attack: number[]; defense: number[] };

export function blottoResult(mine: BlottoMove, theirs: BlottoMove) {
  const castles = Array.from({ length: CASTLES }, (_, i) => ({
    iCapture: mine.attack[i] > theirs.defense[i],
    theyCapture: theirs.attack[i] > mine.defense[i],
  }));
  const mineScore = castles.filter((c) => c.iCapture).length;
  const theirScore = castles.filter((c) => c.theyCapture).length;
  return { castles, mineScore, theirScore };
}

// ---------------------------------------------------------------------------

export type Direction = "L" | "C" | "R";
export const DIRECTIONS: Direction[] = ["L", "C", "R"];
export const DIRECTION_LABEL: Record<Direction, string> = { L: "左", C: "中", R: "右" };
export const KICKS = 5;
export type PenaltyMove = { shots: Direction[]; dives: Direction[] };

export function penaltyResult(mine: PenaltyMove, theirs: PenaltyMove) {
  const kicks = Array.from({ length: KICKS }, (_, i) => ({
    myShot: mine.shots[i],
    theirDive: theirs.dives[i],
    myGoal: mine.shots[i] !== theirs.dives[i],
    theirShot: theirs.shots[i],
    myDive: mine.dives[i],
    theirGoal: theirs.shots[i] !== mine.dives[i],
  }));
  return {
    kicks,
    mineScore: kicks.filter((k) => k.myGoal).length,
    theirScore: kicks.filter((k) => k.theirGoal).length,
  };
}

export function verdictText(mine: number, theirs: number, opponentName: string) {
  if (mine > theirs) return "你贏了！";
  if (mine < theirs) return `${opponentName}贏了`;
  return "平手";
}
