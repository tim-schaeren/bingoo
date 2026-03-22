// Fisher-Yates shuffle
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generate bingo cards for all players.
// Each player's card contains shuffled predictions made about them by others.
// Returns a map of playerId → flat array of predictionIds (length = gridSize²).
export function generateCards(
  players: { id: string }[],
  predictions: { id: string; subjectId: string }[],
  gridSize: number
): Record<string, string[]> {
  const totalCells = gridSize * gridSize;
  const cards: Record<string, string[]> = {};

  for (const player of players) {
    const aboutPlayer = predictions.filter(p => p.subjectId === player.id);
    const shuffled = shuffle(aboutPlayer);
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
  const indices = (arr: number[]) => arr;

  // Rows
  for (let r = 0; r < gridSize; r++) {
    const row = Array.from({ length: gridSize }, (_, c) => r * gridSize + c);
    if (row.every(isMarked)) return indices(row);
  }

  // Columns
  for (let c = 0; c < gridSize; c++) {
    const col = Array.from({ length: gridSize }, (_, r) => r * gridSize + c);
    if (col.every(isMarked)) return indices(col);
  }

  // Top-left to bottom-right diagonal
  const diag1 = Array.from({ length: gridSize }, (_, i) => i * gridSize + i);
  if (diag1.every(isMarked)) return indices(diag1);

  // Top-right to bottom-left diagonal
  const diag2 = Array.from({ length: gridSize }, (_, i) => i * gridSize + (gridSize - 1 - i));
  if (diag2.every(isMarked)) return indices(diag2);

  return null;
}

// How many predictions about each player are needed to fill the grid.
export function requiredPredictionsPerPlayer(gridSize: number, playerCount: number): number {
  const totalCells = gridSize * gridSize;
  const contributors = playerCount - 1; // everyone except the subject writes about them
  return Math.ceil(totalCells / contributors);
}

// Short alphanumeric game code
export function generateGameCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Simple unique ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
