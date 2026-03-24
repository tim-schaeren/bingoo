import {
  computeGridSize,
  generateCards,
  getWinningLine,
  checkWin,
  getMinVisiblePredictions,
  getMinPredictionsPerPlayer,
  canStartGameWithPredictions,
  MIN_CARD_CELLS,
  REQUIRED_PREDICTIONS_PER_PLAYER,
} from '../lib/gameLogic';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlayers(ids: string[]) {
  return ids.map((id) => ({ id }));
}

function makePredictions(pairs: { id: string; subjectId: string }[]) {
  return pairs;
}

// ─── computeGridSize ─────────────────────────────────────────────────────────

describe('computeGridSize', () => {
  it('returns 2 when fewer than 2 players', () => {
    expect(computeGridSize([], [])).toBe(2);
    expect(computeGridSize([{ id: 'a' }], [])).toBe(2);
  });

  it('clamps minimum to 2', () => {
    // 2 players, 0 predictions → minVisible = 0 → floor(sqrt(0)) = 0 → clamped to 2
    const players = makePlayers(['a', 'b']);
    expect(computeGridSize(players, [])).toBe(2);
  });

  it('clamps maximum to 5', () => {
    // Create a scenario with 36+ visible predictions per player
    const players = makePlayers(['a', 'b']);
    const predictions = Array.from({ length: 36 }, (_, i) => ({
      id: `p${i}`,
      subjectId: 'b', // all about b, so a sees all 36
    }));
    // player b sees 0 (all are about b), so minVisible = 0 → clamped to 2
    // Let's make predictions about both so everyone sees some
    const balanced = [
      ...Array.from({ length: 25 }, (_, i) => ({ id: `ab${i}`, subjectId: 'b' })),
      ...Array.from({ length: 25 }, (_, i) => ({ id: `ba${i}`, subjectId: 'a' })),
    ];
    // a sees 25 predictions (about b), b sees 25 predictions (about a)
    // sqrt(25) = 5 → grid size 5
    expect(computeGridSize(players, balanced)).toBe(5);
  });

  it('computes correct size for a typical 4-player game', () => {
    // 4 players, each writes 2 predictions per other player = 6 predictions each as author
    // Each player sees (4-1)*2*? predictions not about themselves
    // Simpler: 3 other players each write 2 about this player = 6 predictions about each player
    // Each player sees total predictions - those about themselves
    const players = makePlayers(['a', 'b', 'c', 'd']);
    const predictions: { id: string; subjectId: string }[] = [];
    let idx = 0;
    for (const subject of ['a', 'b', 'c', 'd']) {
      for (let i = 0; i < 6; i++) {
        predictions.push({ id: `p${idx++}`, subjectId: subject });
      }
    }
    // Total = 24. Each player sees 24 - 6 = 18. sqrt(18) ≈ 4.24 → floor = 4
    expect(computeGridSize(players, predictions)).toBe(4);
  });
});

describe('prediction capacity checks', () => {
  it('blocks game start when any player would see fewer than 4 predictions', () => {
    const players = makePlayers(['a', 'b', 'c']);
    const predictions = makePredictions([
      { id: 'p1', subjectId: 'a' },
      { id: 'p2', subjectId: 'b' },
      { id: 'p3', subjectId: 'c' },
    ]);

    expect(getMinVisiblePredictions(players, predictions)).toBe(2);
    expect(canStartGameWithPredictions(players, predictions)).toBe(false);
  });

  it('blocks game start when a newly joined player has no predictions about them yet', () => {
    const players = makePlayers(['a', 'b', 'c', 'd']);
    const predictions = makePredictions([
      { id: 'p1', subjectId: 'a' },
      { id: 'p2', subjectId: 'a' },
      { id: 'p3', subjectId: 'b' },
      { id: 'p4', subjectId: 'b' },
      { id: 'p5', subjectId: 'c' },
      { id: 'p6', subjectId: 'c' },
    ]);

    expect(getMinVisiblePredictions(players, predictions)).toBe(4);
    expect(getMinPredictionsPerPlayer(players, predictions)).toBe(0);
    expect(canStartGameWithPredictions(players, predictions)).toBe(false);
  });

  it('allows game start once every player has at least 4 visible predictions', () => {
    const players = makePlayers(['a', 'b', 'c']);
    const predictions = makePredictions([
      { id: 'p1', subjectId: 'a' },
      { id: 'p2', subjectId: 'a' },
      { id: 'p3', subjectId: 'b' },
      { id: 'p4', subjectId: 'b' },
      { id: 'p5', subjectId: 'c' },
      { id: 'p6', subjectId: 'c' },
    ]);

    expect(getMinVisiblePredictions(players, predictions)).toBe(MIN_CARD_CELLS);
    expect(getMinPredictionsPerPlayer(players, predictions)).toBe(
      REQUIRED_PREDICTIONS_PER_PLAYER,
    );
    expect(canStartGameWithPredictions(players, predictions)).toBe(true);
  });
});

// ─── generateCards ────────────────────────────────────────────────────────────

describe('generateCards', () => {
  const players = makePlayers(['a', 'b', 'c']);
  const predictions = makePredictions([
    { id: 'p1', subjectId: 'a' },
    { id: 'p2', subjectId: 'a' },
    { id: 'p3', subjectId: 'a' },
    { id: 'p4', subjectId: 'b' },
    { id: 'p5', subjectId: 'b' },
    { id: 'p6', subjectId: 'b' },
    { id: 'p7', subjectId: 'c' },
    { id: 'p8', subjectId: 'c' },
    { id: 'p9', subjectId: 'c' },
  ]);
  const gridSize = 2; // 2×2 = 4 cells

  it('generates a card for every player', () => {
    const cards = generateCards(players, predictions, gridSize);
    expect(Object.keys(cards)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('each card has exactly gridSize² cells', () => {
    const cards = generateCards(players, predictions, gridSize);
    for (const [, grid] of Object.entries(cards)) {
      expect(grid).toHaveLength(gridSize * gridSize);
    }
  });

  it('no card contains a prediction about its own player', () => {
    const cards = generateCards(players, predictions, gridSize);
    const predMap = new Map(predictions.map((p) => [p.id, p.subjectId]));
    for (const [playerId, grid] of Object.entries(cards)) {
      for (const predId of grid) {
        expect(predMap.get(predId)).not.toBe(playerId);
      }
    }
  });

  it('no duplicate prediction IDs within a single card', () => {
    const cards = generateCards(players, predictions, gridSize);
    for (const [, grid] of Object.entries(cards)) {
      expect(new Set(grid).size).toBe(grid.length);
    }
  });
});

// ─── getWinningLine ───────────────────────────────────────────────────────────

describe('getWinningLine', () => {
  // 3×3 grid, ids are their index as strings
  const grid3 = ['0','1','2','3','4','5','6','7','8'];

  it('returns null when nothing is marked', () => {
    expect(getWinningLine(grid3, new Set(), 3)).toBeNull();
  });

  it('detects a winning row', () => {
    // Row 0: indices 0,1,2
    const marked = new Set(['0', '1', '2']);
    expect(getWinningLine(grid3, marked, 3)).toEqual([0, 1, 2]);
  });

  it('detects a winning column', () => {
    // Column 1: indices 1,4,7
    const marked = new Set(['1', '4', '7']);
    expect(getWinningLine(grid3, marked, 3)).toEqual([1, 4, 7]);
  });

  it('detects the main diagonal', () => {
    // Diagonal: indices 0,4,8
    const marked = new Set(['0', '4', '8']);
    expect(getWinningLine(grid3, marked, 3)).toEqual([0, 4, 8]);
  });

  it('detects the anti-diagonal', () => {
    // Anti-diagonal: indices 2,4,6
    const marked = new Set(['2', '4', '6']);
    expect(getWinningLine(grid3, marked, 3)).toEqual([2, 4, 6]);
  });

  it('returns null when a row is incomplete', () => {
    const marked = new Set(['0', '1']); // missing '2'
    expect(getWinningLine(grid3, marked, 3)).toBeNull();
  });

  it('returns null when marks are scattered with no line', () => {
    const marked = new Set(['0', '4', '5', '7']);
    expect(getWinningLine(grid3, marked, 3)).toBeNull();
  });

  it('works correctly on a 2×2 grid', () => {
    const grid2 = ['a', 'b', 'c', 'd'];
    // Row 0: indices 0,1
    expect(getWinningLine(grid2, new Set(['a', 'b']), 2)).toEqual([0, 1]);
    // Column 1: indices 1,3
    expect(getWinningLine(grid2, new Set(['b', 'd']), 2)).toEqual([1, 3]);
    // Main diagonal: indices 0,3
    expect(getWinningLine(grid2, new Set(['a', 'd']), 2)).toEqual([0, 3]);
    // Anti-diagonal: indices 1,2
    expect(getWinningLine(grid2, new Set(['b', 'c']), 2)).toEqual([1, 2]);
  });

  it('works correctly on a 4×4 grid', () => {
    const grid4 = Array.from({ length: 16 }, (_, i) => `id${i}`);
    // Row 2: indices 8,9,10,11
    const marked = new Set(['id8', 'id9', 'id10', 'id11']);
    expect(getWinningLine(grid4, marked, 4)).toEqual([8, 9, 10, 11]);
  });
});

// ─── checkWin ────────────────────────────────────────────────────────────────

describe('checkWin', () => {
  const grid = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

  it('returns false with no marks', () => {
    expect(checkWin(grid, new Set(), 3)).toBe(false);
  });

  it('returns true when a row is complete', () => {
    expect(checkWin(grid, new Set(['a', 'b', 'c']), 3)).toBe(true);
  });

  it('returns false for a near-win', () => {
    expect(checkWin(grid, new Set(['a', 'b']), 3)).toBe(false);
  });
});
