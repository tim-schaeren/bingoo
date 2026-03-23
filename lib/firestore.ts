import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { generateGameCode, generateId, generateCards, computeGridSize } from './gameLogic';
import { currentUid } from './auth';

export type GameStatus = 'lobby' | 'active' | 'finished' | 'cancelled';

export interface Winner {
  id: string;
  nickname: string;
}

export interface Game {
  id: string;
  code: string;
  status: GameStatus;
  hostId: string;
  hostNickname: string;
  gridSize: number;
  winners: Winner[];
  createdAt: Timestamp;
}

export interface Player {
  id: string;
  nickname: string;
  predictionsSubmitted: boolean;
  joinedAt: Timestamp;
  pushToken?: string | null;
}

export const REACTION_EMOJIS = ['😂', '🔥', '💀', '👀', '🎯'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface Prediction {
  id: string;
  authorId: string;
  subjectId: string;
  text: string;
  createdAt: Timestamp;
  reactions?: Partial<Record<ReactionEmoji, string[]>>;
}

export interface Mark {
  predictionId: string;
  markedBy: string;
  markedByNickname: string;
  markedAt: Timestamp;
}

export const REPORT_REASONS = [
  'harassment',
  'sexual_content',
  'hate_speech',
  'spam',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = 'prediction' | 'player';

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createGame(
  hostNickname: string,
  pushToken?: string | null,
): Promise<{ gameId: string; playerId: string }> {
  const gameId = generateId();
  const playerId = currentUid();
  const code = generateGameCode();

  await setDoc(doc(db, 'games', gameId), {
    code,
    status: 'lobby',
    hostId: playerId,
    hostNickname,
    gridSize: 0, // computed when the game starts
    winners: [],
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'games', gameId, 'players', playerId), {
    nickname: hostNickname,
    predictionsSubmitted: false,
    joinedAt: serverTimestamp(),
    ...(pushToken ? { pushToken } : {}),
  });

  return { gameId, playerId };
}

// ─── Join ─────────────────────────────────────────────────────────────────────

export async function getGameByCode(code: string): Promise<Game | null> {
  const q = query(collection(db, 'games'), where('code', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Game;
}

export async function joinGame(
  gameId: string,
  nickname: string,
  pushToken?: string | null,
): Promise<{ playerId: string }> {
  const playerId = currentUid();
  await setDoc(doc(db, 'games', gameId, 'players', playerId), {
    nickname,
    predictionsSubmitted: false,
    joinedAt: serverTimestamp(),
    ...(pushToken ? { pushToken } : {}),
  });
  return { playerId };
}

// ─── Predictions ──────────────────────────────────────────────────────────────

export async function addPrediction(
  gameId: string,
  authorId: string,
  subjectId: string,
  text: string
): Promise<void> {
  await setDoc(doc(db, 'games', gameId, 'predictions', generateId()), {
    authorId,
    subjectId,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}

export async function markPlayerDone(gameId: string, playerId: string): Promise<void> {
  await updateDoc(doc(db, 'games', gameId, 'players', playerId), {
    predictionsSubmitted: true,
  });
}

export async function markPlayerWriting(gameId: string, playerId: string): Promise<void> {
  await updateDoc(doc(db, 'games', gameId, 'players', playerId), {
    predictionsSubmitted: false,
  });
}

export async function deletePrediction(gameId: string, predictionId: string): Promise<void> {
  await deleteDoc(doc(db, 'games', gameId, 'predictions', predictionId));
}

export async function setReaction(
  gameId: string,
  predictionId: string,
  playerId: string,
  emoji: ReactionEmoji | null,
  currentEmoji: ReactionEmoji | null,
): Promise<void> {
  const ref = doc(db, 'games', gameId, 'predictions', predictionId);
  const batch = writeBatch(db);
  if (currentEmoji) {
    batch.update(ref, { [`reactions.${currentEmoji}`]: arrayRemove(playerId) });
  }
  if (emoji) {
    batch.update(ref, { [`reactions.${emoji}`]: arrayUnion(playerId) });
  }
  await batch.commit();
}

// ─── Start game ───────────────────────────────────────────────────────────────

export async function startGame(
  gameId: string,
  players: Player[],
  predictions: Prediction[]
): Promise<void> {
  const gridSize = computeGridSize(players, predictions);
  const cards = generateCards(players, predictions, gridSize);
  const cardWrites = Object.entries(cards).map(([playerId, grid]) =>
    setDoc(doc(db, 'games', gameId, 'cards', playerId), { grid })
  );
  await Promise.all(cardWrites);
  await updateDoc(doc(db, 'games', gameId), { status: 'active', gridSize });
}

// ─── Marking ──────────────────────────────────────────────────────────────────

export async function markPrediction(
  gameId: string,
  predictionId: string,
  markedBy: string,
  markedByNickname: string
): Promise<void> {
  await setDoc(doc(db, 'games', gameId, 'marks', predictionId), {
    markedBy,
    markedByNickname,
    markedAt: serverTimestamp(),
  });
}

export async function announceWinner(
  gameId: string,
  winnerId: string,
  winnerNickname: string
): Promise<void> {
  await updateDoc(doc(db, 'games', gameId), {
    status: 'finished',
    winners: arrayUnion({ id: winnerId, nickname: winnerNickname }),
  });
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export async function getCard(gameId: string, playerId: string): Promise<string[] | null> {
  const snap = await getDoc(doc(db, 'games', gameId, 'cards', playerId));
  if (!snap.exists()) return null;
  return (snap.data() as { grid: string[] }).grid;
}

// ─── Real-time listeners ──────────────────────────────────────────────────────

export function listenToGame(gameId: string, callback: (game: Game) => void, onError?: (err: Error) => void) {
  return onSnapshot(doc(db, 'games', gameId), snap => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() } as Game);
  }, onError);
}

export function listenToPlayers(gameId: string, callback: (players: Player[]) => void, onError?: (err: Error) => void) {
  return onSnapshot(collection(db, 'games', gameId, 'players'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Player));
  }, onError);
}

export function listenToPredictions(gameId: string, callback: (predictions: Prediction[]) => void, onError?: (err: Error) => void) {
  return onSnapshot(collection(db, 'games', gameId, 'predictions'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Prediction));
  }, onError);
}

export function listenToMarks(gameId: string, callback: (marks: Mark[]) => void, onError?: (err: Error) => void) {
  return onSnapshot(collection(db, 'games', gameId, 'marks'), snap => {
    callback(snap.docs.map(d => ({ predictionId: d.id, ...d.data() }) as Mark));
  }, onError);
}

// ─── Push token ───────────────────────────────────────────────────────────────

export async function savePushToken(
  gameId: string,
  playerId: string,
  pushToken: string,
): Promise<void> {
  await updateDoc(doc(db, 'games', gameId, 'players', playerId), { pushToken });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

async function createReport(
  gameId: string,
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
): Promise<void> {
  await setDoc(doc(db, 'games', gameId, 'reports', generateId()), {
    targetType,
    targetId,
    reason,
    reporterId,
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

export async function reportPrediction(
  gameId: string,
  predictionId: string,
  reporterId: string,
  reason: ReportReason,
): Promise<void> {
  await createReport(gameId, reporterId, 'prediction', predictionId, reason);
}

export async function reportPlayer(
  gameId: string,
  reportedPlayerId: string,
  reporterId: string,
  reason: ReportReason,
): Promise<void> {
  await createReport(gameId, reporterId, 'player', reportedPlayerId, reason);
}

// ─── Lobby management ────────────────────────────────────────────────────────

export async function cancelGame(gameId: string): Promise<void> {
  await updateDoc(doc(db, 'games', gameId), { status: 'cancelled' });
}

export async function leaveGame(gameId: string, playerId: string): Promise<void> {
  const predictionsRef = collection(db, 'games', gameId, 'predictions');
  const [asSubject, asAuthor] = await Promise.all([
    getDocs(query(predictionsRef, where('subjectId', '==', playerId))),
    getDocs(query(predictionsRef, where('authorId', '==', playerId))),
  ]);
  const batch = writeBatch(db);
  asSubject.docs.forEach((d) => batch.delete(d.ref));
  asAuthor.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'games', gameId, 'players', playerId));
  await batch.commit();
}

export async function removePlayerFromGame(
  gameId: string,
  playerId: string,
  deletePredictions: boolean,
): Promise<void> {
  const batch = writeBatch(db);

  if (deletePredictions) {
    const predictionsRef = collection(db, 'games', gameId, 'predictions');
    const [asSubject, asAuthor] = await Promise.all([
      getDocs(query(predictionsRef, where('subjectId', '==', playerId))),
      getDocs(query(predictionsRef, where('authorId', '==', playerId))),
    ]);
    asSubject.docs.forEach((d) => batch.delete(d.ref));
    asAuthor.docs.forEach((d) => batch.delete(d.ref));
  }

  batch.delete(doc(db, 'games', gameId, 'players', playerId));
  await batch.commit();
}
