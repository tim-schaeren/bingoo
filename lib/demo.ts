import { generateId } from './gameLogic';
import type { Game, Player, Prediction } from './firestore';

export const DEMO_GAME_CODE = 'DEMO01';
export const DEMO_GAME_NAME = 'Demo Game';

// Round-robin formula: player at index i writes about players at (i+1)%n and (i+2)%n.
// With host at index 0 and bots at 1…N, all subjects end up with exactly 2 predictions.
// Pool is indexed by (botIndex*2 + j) so every prediction gets a unique text (up to 9 bots).
const PREDICTION_POOL: string[] = [
  'is always the loudest in the room',   // unused (index 0 = host slot)
  'has a strong opinion about everything', // unused (index 1 = host slot)
  'will claim they knew all along',
  'arrives exactly on time — never early',
  'gets way too competitive',
  'always has a better idea',
  'will make everyone laugh at least once',
  "says 'that's not what I meant'",
  'forgets what they were saying mid-sentence',
  'will sneak a snack',
  'has a conspiracy theory ready',
  'takes something personally',
  'will quote something totally obscure',
  'never admits when they are lost',
  'will suggest a completely different plan',
  'checks their phone when nobody is looking',
  'has an unusually specific opinion',
  "will say 'I told you so'",
  'talks with their hands',
  'gets distracted by the smallest thing',
];

// Up to 9 bots; first N are used based on numBots
const CHARACTER_NAMES = [
  'Mickey Mouse', 'Donald Duck', 'Elsa', 'Simba',
  'Moana', 'Buzz Lightyear', 'Woody', 'Ariel', 'Mulan',
] as const;

export interface DemoState {
  demoGameId: string;
  game: Game;
  players: Player[];
  fakePlayers: Player[];
}

export function buildDemoState(hostId: string, hostNickname: string, numBots: number): DemoState {
  const demoGameId = `demo_${generateId()}`;
  const clampedBots = Math.max(2, Math.min(9, numBots));

  const fakePlayers: Player[] = CHARACTER_NAMES.slice(0, clampedBots).map((name) => ({
    id: generateId(),
    nickname: name,
    predictionsSubmitted: false,
    joinedAt: new Date() as any,
    pushToken: null,
  }));

  const hostPlayer: Player = {
    id: hostId,
    nickname: hostNickname,
    predictionsSubmitted: false,
    joinedAt: new Date() as any,
    pushToken: null,
  };

  const game: Game = {
    id: demoGameId,
    code: DEMO_GAME_CODE,
    name: DEMO_GAME_NAME,
    status: 'lobby',
    hostId,
    hostNickname,
    gridSize: 0,
    winners: [],
    createdAt: new Date() as any,
  };

  return {
    demoGameId,
    game,
    players: [hostPlayer, ...fakePlayers],
    fakePlayers,
  };
}

// Generate the 2 predictions for a given bot player using a round-robin formula.
// allPlayers must be ordered [host, bot1, bot2, …] as produced by buildDemoState.
// Bot at index i writes about players at (i+1)%n and (i+2)%n.
// This guarantees every subject gets exactly 2 predictions for any group size.
export function buildBotPredictions(
  bot: Pick<Player, 'id' | 'nickname'>,
  allPlayers: Pick<Player, 'id' | 'nickname'>[],
  _hostId: string,
): Prediction[] {
  const n = allPlayers.length;
  const botIndex = allPlayers.findIndex((p) => p.id === bot.id);
  if (botIndex <= 0) return []; // host or not found
  return [0, 1].map((j) => ({
    id: generateId(),
    authorId: bot.id,
    subjectId: allPlayers[(botIndex + 1 + j) % n].id,
    text: PREDICTION_POOL[(botIndex * 2 + j) % PREDICTION_POOL.length],
    createdAt: new Date() as any,
  } as Prediction));
}
