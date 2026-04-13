// Fisher-Yates shuffle
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const MIN_GRID_SIZE = 2;
export const MAX_GRID_SIZE = 5;
export const MIN_CARD_CELLS = MIN_GRID_SIZE * MIN_GRID_SIZE;
export const REQUIRED_PREDICTIONS_PER_PLAYER = 2;

export function getMinVisiblePredictions(
  players: { id: string }[],
  predictions: { subjectId: string }[],
): number {
  if (players.length === 0) return 0;

  return players.reduce((min, player) => {
    const count = predictions.filter((p) => p.subjectId !== player.id).length;
    return Math.min(min, count);
  }, Infinity);
}

export function getMinPredictionsPerPlayer(
  players: { id: string }[],
  predictions: { subjectId: string }[],
): number {
  if (players.length === 0) return 0;

  return players.reduce((min, player) => {
    const count = predictions.filter((p) => p.subjectId === player.id).length;
    return Math.min(min, count);
  }, Infinity);
}

export function canStartGameWithPredictions(
  players: { id: string }[],
  predictions: { subjectId: string }[],
): boolean {
  return (
    getMinVisiblePredictions(players, predictions) >= MIN_CARD_CELLS &&
    getMinPredictionsPerPlayer(players, predictions) >=
      REQUIRED_PREDICTIONS_PER_PLAYER
  );
}

// Compute grid size from the predictions each player will see.
// Each player's card = all predictions where subjectId != their id.
// With N players each writing 1 prediction per other player, every card
// has (N-1)² predictions — a perfect square, giving a clean NxN grid.
export function computeGridSize(
  players: { id: string }[],
  predictions: { subjectId: string }[]
): number {
  if (players.length < 2) return MIN_GRID_SIZE;
  const minVisible = getMinVisiblePredictions(players, predictions);
  const n = Math.floor(Math.sqrt(minVisible));
  return Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, n)); // clamp: 2×2 minimum, 5×5 maximum
}

// Generate bingo cards for all players.
// Each player's card shows all predictions EXCEPT those made about themselves —
// they can observe others but can't see what's coming for them.
// Returns a map of playerId → flat array of predictionIds (length = gridSize²).
export function generateCards(
  players: { id: string }[],
  predictions: { id: string; subjectId: string }[],
  gridSize: number
): Record<string, string[]> {
  const totalCells = gridSize * gridSize;
  const cards: Record<string, string[]> = {};

  for (const player of players) {
    const visible = predictions.filter(p => p.subjectId !== player.id);
    const shuffled = shuffle(visible);
    cards[player.id] = shuffled.slice(0, totalCells).map(p => p.id);
  }

  return cards;
}

// Returns true if any row, column, or diagonal is fully marked.
export function checkWin(
  grid: string[],
  markedIds: Set<string>,
  gridSize: number
): boolean {
  return getWinningLine(grid, markedIds, gridSize) !== null;
}

// Returns the flat indices of the winning line, or null if no win.
export function getWinningLine(
  grid: string[],
  markedIds: Set<string>,
  gridSize: number
): number[] | null {
  const isMarked = (i: number) => markedIds.has(grid[i]);

  for (let r = 0; r < gridSize; r++) {
    const row = Array.from({ length: gridSize }, (_, c) => r * gridSize + c);
    if (row.every(isMarked)) return row;
  }
  for (let c = 0; c < gridSize; c++) {
    const col = Array.from({ length: gridSize }, (_, r) => r * gridSize + c);
    if (col.every(isMarked)) return col;
  }
  const diag1 = Array.from({ length: gridSize }, (_, i) => i * gridSize + i);
  if (diag1.every(isMarked)) return diag1;
  const diag2 = Array.from({ length: gridSize }, (_, i) => i * gridSize + (gridSize - 1 - i));
  if (diag2.every(isMarked)) return diag2;

  return null;
}

// ─── Podium helpers ───────────────────────────────────────────────────────────

export function computeNextPlace(existingWinners: { place?: 1 | 2 | 3 }[]): 1 | 2 | 3 {
  const placed = existingWinners.filter((w) => w.place != null);
  if (placed.length === 0) return 1;
  const max = Math.max(...placed.map((w) => w.place!));
  return Math.min(max + 1, 3) as 1 | 2 | 3;
}

export function shouldGameFinish(
  existingWinners: { place?: 1 | 2 | 3 }[],
  newCount: number,
  playerCount: number,
): boolean {
  const nextPlace = computeNextPlace(existingWinners);
  return nextPlace === 3 || existingWinners.length + newCount >= playerCount;
}

export function formatPlaceLabel(place: 1 | 2 | 3): string {
  return place === 1 ? '1st' : place === 2 ? '2nd' : '3rd';
}

// Short alphanumeric game code — excludes ambiguous chars (0, O, I, 1, L)
export function generateGameCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Simple unique ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
