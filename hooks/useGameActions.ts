import {
	addPrediction as fsAddPrediction,
	deletePrediction as fsDeletePrediction,
	markPlayerDone as fsMarkPlayerDone,
	markPlayerWriting as fsMarkPlayerWriting,
	setReaction as fsSetReaction,
	reportPrediction as fsReportPrediction,
	reportPlayer as fsReportPlayer,
	startGame as fsStartGame,
	cancelGame as fsCancelGame,
	leaveGame as fsLeaveGame,
	banPlayerFromGame as fsBanPlayerFromGame,
	markPrediction as fsMarkPrediction,
	announceWinner as fsAnnounceWinner,
	type Player,
	type Prediction,
	type ReportReason,
	type ReactionEmoji,
	type Mark,
} from '../lib/firestore';
import { generateId, computeGridSize, generateCards } from '../lib/gameLogic';
import { useGameStore } from '../store/gameStore';

// Central hub for all game data operations.
// Every function has two implementations: Firestore (real) and local store (demo).
// Add new operations here when extending the game — never branch isDemoMode in screens.
export function useGameActions(gameId: string | undefined) {
	const isDemoMode = useGameStore((s) => s.isDemoMode);

	return {
		addPrediction: async (authorId: string, subjectId: string, text: string): Promise<void> => {
			if (!gameId) return;
			if (isDemoMode) {
				useGameStore.getState().appendPredictions([{
					id: generateId(),
					authorId,
					subjectId,
					text: text.trim(),
					createdAt: new Date() as any,
				} as Prediction]);
				return;
			}
			await fsAddPrediction(gameId, authorId, subjectId, text);
		},

		deletePrediction: async (predictionId: string): Promise<void> => {
			if (!gameId) return;
			if (isDemoMode) {
				const { predictions, setPredictions } = useGameStore.getState();
				setPredictions(predictions.filter((p) => p.id !== predictionId));
				return;
			}
			await fsDeletePrediction(gameId, predictionId);
		},

		markPlayerDone: async (playerId: string): Promise<void> => {
			if (!gameId) return;
			if (isDemoMode) {
				const { players, setPlayers } = useGameStore.getState();
				setPlayers(players.map((p) => p.id === playerId ? { ...p, predictionsSubmitted: true } : p));
				return;
			}
			await fsMarkPlayerDone(gameId, playerId);
		},

		markPlayerWriting: async (playerId: string): Promise<void> => {
			if (!gameId) return;
			if (isDemoMode) {
				const { players, setPlayers } = useGameStore.getState();
				setPlayers(players.map((p) => p.id === playerId ? { ...p, predictionsSubmitted: false } : p));
				return;
			}
			await fsMarkPlayerWriting(gameId, playerId);
		},

		setReaction: async (
			predictionId: string,
			playerId: string,
			next: ReactionEmoji | null,
			current: ReactionEmoji | null,
		): Promise<void> => {
			if (!gameId) return;
			if (isDemoMode) {
				const { predictions, setPredictions } = useGameStore.getState();
				setPredictions(predictions.map((p) => {
					if (p.id !== predictionId) return p;
					const reactions = { ...(p.reactions ?? {}) } as Record<ReactionEmoji, string[]>;
					if (current) {
						const filtered = (reactions[current] ?? []).filter((uid) => uid !== playerId);
						if (filtered.length === 0) delete reactions[current];
						else reactions[current] = filtered;
					}
					if (next) reactions[next] = [...(reactions[next] ?? []), playerId];
					return { ...p, reactions };
				}));
				return;
			}
			await fsSetReaction(gameId, predictionId, playerId, next, current);
		},

		// Demo: silently no-ops — caller shows the success alert regardless
		reportPrediction: async (predictionId: string, reporterId: string, reason: ReportReason): Promise<void> => {
			if (!gameId || isDemoMode) return;
			await fsReportPrediction(gameId, predictionId, reporterId, reason);
		},

		// Demo: silently no-ops — caller shows the success alert regardless
		reportPlayer: async (targetPlayerId: string, reporterId: string, reason: ReportReason): Promise<void> => {
			if (!gameId || isDemoMode) return;
			await fsReportPlayer(gameId, targetPlayerId, reporterId, reason);
		},

		banPlayer: async (player: Player, fromLobby: boolean): Promise<void> => {
			if (!gameId) return;
			if (isDemoMode) {
				const s = useGameStore.getState();
				s.setPlayers(s.players.filter((p) => p.id !== player.id));
				s.setPredictions(s.predictions.filter(
					(p) => p.authorId !== player.id && p.subjectId !== player.id,
				));
				return;
			}
			await fsBanPlayerFromGame(gameId, player.id, fromLobby);
		},

		startGame: async (players: Player[], predictions: Prediction[], hostPlayerId: string): Promise<void> => {
			if (!gameId) return;
			if (isDemoMode) {
				const gridSize = computeGridSize(players, predictions);
				const cards = generateCards(players, predictions, gridSize);
				const { setMyCard, setGame, game } = useGameStore.getState();
				setMyCard(cards[hostPlayerId] ?? null);
				setGame({ ...game!, status: 'active', gridSize });
				return;
			}
			await fsStartGame(gameId, players, predictions);
		},

		cancelGame: async (): Promise<void> => {
			if (!gameId) return;
			await fsCancelGame(gameId);
		},

		leaveGame: async (playerId: string): Promise<void> => {
			if (!gameId) return;
			await fsLeaveGame(gameId, playerId);
		},

		markPrediction: async (predictionId: string, playerId: string, nickname: string): Promise<void> => {
			if (!gameId) return;
			if (isDemoMode) {
				const { marks, setMarks } = useGameStore.getState();
				if (marks.some((m) => m.predictionId === predictionId)) return;
				setMarks([...marks, {
					predictionId,
					markedBy: playerId,
					markedByNickname: nickname,
					markedAt: new Date() as any,
				} as Mark]);
				return;
			}
			await fsMarkPrediction(gameId, predictionId, playerId, nickname);
		},

		announceWinner: async (winnerId: string, winnerNickname: string): Promise<void> => {
			if (!gameId) return;
			if (isDemoMode) {
				const { game, setGame } = useGameStore.getState();
				if (game) setGame({ ...game, status: 'finished', winners: [{ id: winnerId, nickname: winnerNickname }] });
				return;
			}
			await fsAnnounceWinner(gameId, winnerId, winnerNickname);
		},
	};
}
