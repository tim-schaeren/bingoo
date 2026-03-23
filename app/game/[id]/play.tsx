import React, { useEffect, useRef, useState } from 'react';
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	Alert,
	Dimensions,
	ScrollView,
	ActivityIndicator,
	Modal,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../../../constants/theme';
import {
	listenToGame,
	listenToMarks,
	listenToPlayers,
	listenToPredictions,
	markPrediction,
	announceWinner,
	getCard,
} from '../../../lib/firestore';
import { getWinningLine } from '../../../lib/gameLogic';
import { useGameStore } from '../../../store/gameStore';
import { sendPushNotifications } from '../../../lib/notifications';
import { feedbackMark, feedbackWin, feedbackSelection } from '../../../lib/feedback';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = spacing.lg * 2;

export default function PlayScreen() {
	const { id: gameId } = useLocalSearchParams<{ id: string }>();
	const {
		playerId,
		nickname,
		setGame,
		setMarks,
		setPredictions,
		setMyCard,
		setPlayers,
	} = useGameStore();

	const game = useGameStore((s) => s.game);
	const marks = useGameStore((s) => s.marks);
	const predictions = useGameStore((s) => s.predictions);
	const players = useGameStore((s) => s.players);
	const myCard = useGameStore((s) => s.myCard);

	const [winningLine, setWinningLine] = useState<number[] | null>(null);
	const [loadingCard, setLoadingCard] = useState(true);
	const [allCards, setAllCards] = useState<Map<string, string[]>>(new Map());
	const announcedWinners = useRef<Set<string>>(new Set());
	const [selectedPredId, setSelectedPredId] = useState<string | null>(null);
	const [showHistory, setShowHistory] = useState(false);

	const gridSize = game?.gridSize ?? 4;
	const cellSize = (SCREEN_WIDTH - GRID_PADDING) / gridSize - spacing.xs;

	useEffect(() => {
		if (!gameId) return;
		const onListenerError = () =>
			Alert.alert('Connection error', 'Lost connection to game. Check your internet.');
		const unsubs = [
			listenToGame(gameId, (g) => {
				setGame(g);
				if (g.status === 'finished') router.replace(`/game/${gameId}/winner`);
			}, onListenerError),
			listenToMarks(gameId, setMarks, onListenerError),
			listenToPredictions(gameId, setPredictions, onListenerError),
			listenToPlayers(gameId, setPlayers, onListenerError),
		];
		return () => unsubs.forEach((u) => u());
	}, [gameId]);

	// Load own card for display
	useEffect(() => {
		if (!gameId || !playerId) return;
		getCard(gameId, playerId).then((grid) => {
			if (grid) setMyCard(grid);
			setLoadingCard(false);
		});
	}, [gameId, playerId]);

	// Load all players' cards for universal win detection
	useEffect(() => {
		if (!gameId || players.length === 0) return;
		players.forEach((p) => {
			if (allCards.has(p.id)) return;
			getCard(gameId, p.id).then((grid) => {
				if (grid) setAllCards((prev) => new Map(prev).set(p.id, grid));
			});
		});
	}, [gameId, players]);

	// Check ALL cards on every marks update — so wins are detected even for players who left
	useEffect(() => {
		if (!gameId || !game || (game.status !== 'active' && game.status !== 'finished')) return;
		if (allCards.size === 0) return;
		const markedSet = new Set(marks.map((m) => m.predictionId));
		allCards.forEach((grid, pid) => {
			if (announcedWinners.current.has(pid)) return;
			const line = getWinningLine(grid, markedSet, gridSize);
			if (!line) return;
			announcedWinners.current.add(pid);
			if (pid === playerId) { setWinningLine(line); feedbackWin(); }
			const winner = players.find((p) => p.id === pid);
			const winnerNickname = winner?.nickname ?? 'Someone';
			announceWinner(gameId, pid, winnerNickname)
				.then(() => {
					const tokens = players.filter((p) => p.id !== pid).map((p) => p.pushToken);
					sendPushNotifications(tokens, 'BINGOO! 🎉', `${winnerNickname} won!`);
				})
				.catch(() => {});
		});
	}, [marks, allCards]);

	const markedIds = new Set(marks.map((m) => m.predictionId));

	const getPrediction = (predictionId: string) =>
		predictions.find((p) => p.id === predictionId);

	const getPredictionText = (predictionId: string) => {
		const pred = getPrediction(predictionId);
		if (!pred) return '…';
		const subjectName = getPlayerName(pred.subjectId);
		return `${subjectName} ${pred.text}`;
	};

	const getPlayerName = (pid: string | undefined) =>
		players.find((p) => p.id === pid)?.nickname ?? '…';

	const getMarkedByNickname = (predictionId: string) =>
		marks.find((m) => m.predictionId === predictionId)?.markedByNickname;

	// Don't show marks about the current player in the feed
	const visibleMarks = marks.filter((m) => {
		const pred = getPrediction(m.predictionId);
		return pred?.subjectId !== playerId;
	});

	const doMarkPrediction = (predictionId: string) => {
		if (!gameId || !playerId || !nickname) return;
		feedbackMark();
		const pred = getPrediction(predictionId);
		markPrediction(gameId, predictionId, playerId, nickname)
			.then(() => {
				// Notify everyone except the marker and the subject of the prediction
				const tokens = players
					.filter((p) => p.id !== playerId && p.id !== pred?.subjectId)
					.map((p) => p.pushToken);
				const predText = pred?.text ?? '';
				sendPushNotifications(
					tokens,
					'a prediction came true ✓',
					`${nickname}: "${predText}"`,
				);
			})
			.catch(() => {
				Alert.alert('Error', 'Could not mark this prediction. Try again.');
			});
		setSelectedPredId(null);
	};

	const selectedPred = selectedPredId ? getPrediction(selectedPredId) : null;
	const selectedIsMarked = selectedPredId
		? markedIds.has(selectedPredId)
		: false;

	if (loadingCard || !myCard) {
		return (
			<SafeAreaView style={styles.safe}>
				<ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.safe}>
			<ScrollView contentContainerStyle={styles.container}>
				<View style={styles.header}>
					<View style={styles.headerSpacer} />
					<View style={styles.headerCenter}>
						<Text style={styles.title}>bingoo</Text>
						<Text style={styles.subtitle}>
							{markedIds.size} / {myCard.length} marked
						</Text>
					</View>
					<TouchableOpacity onPress={() => router.replace('/')} style={styles.homeButton}>
						<Text style={styles.homeButtonText}>⌂</Text>
					</TouchableOpacity>
				</View>

				{/* Bingo grid */}
				<View style={styles.grid}>
					{myCard.map((predictionId, index) => {
						const isMarked = markedIds.has(predictionId);
						const isWinCell = winningLine?.includes(index) ?? false;

						return (
							<TouchableOpacity
								key={predictionId}
								style={[
									styles.cell,
									{ width: cellSize, height: cellSize },
									isMarked && styles.cellMarked,
									isWinCell && styles.cellWin,
								]}
								onPress={() => { feedbackSelection(); setSelectedPredId(predictionId); }}
								activeOpacity={0.7}
							>
								<Text
									style={[styles.cellText, isMarked && styles.cellTextMarked]}
									numberOfLines={5}
									adjustsFontSizeToFit
									minimumFontScale={0.5}
								>
									{getPredictionText(predictionId)}
								</Text>
								{isMarked && (
									<Text style={styles.markedBy} numberOfLines={1}>
										✓ {getMarkedByNickname(predictionId)}
									</Text>
								)}
							</TouchableOpacity>
						);
					})}
				</View>

				{/* Mark log */}
				{visibleMarks.length > 0 && (
					<TouchableOpacity
						style={styles.log}
						onPress={() => setShowHistory(true)}
						activeOpacity={0.8}
					>
						<View style={styles.logHeader}>
							<Text style={styles.logTitle}>Recent marks</Text>
							<Text style={styles.logSeeAll}>See all →</Text>
						</View>
						{[...visibleMarks]
							.reverse()
							.slice(0, 3)
							.map((m) => (
								<Text
									key={m.predictionId}
									style={styles.logEntry}
									numberOfLines={1}
								>
									<Text style={styles.logAuthor}>{m.markedByNickname}</Text>
									{' marked "'}
									{getPredictionText(m.predictionId)}
									{'"'}
								</Text>
							))}
					</TouchableOpacity>
				)}
			</ScrollView>

			{/* Cell detail modal */}
			<Modal
				visible={!!selectedPredId}
				transparent
				animationType="fade"
				onRequestClose={() => setSelectedPredId(null)}
			>
				<TouchableOpacity
					style={styles.overlay}
					activeOpacity={1}
					onPress={() => setSelectedPredId(null)}
				>
					<TouchableOpacity style={styles.modalCard} activeOpacity={1}>
						{selectedPred && (
							<>
								<Text style={styles.modalPredText}>{selectedPred.text}</Text>
								<View style={styles.modalMeta}>
									<Text style={styles.modalMetaText}>
										About {getPlayerName(selectedPred.subjectId)}
									</Text>
									<Text style={styles.modalMetaText}>
										Written by {getPlayerName(selectedPred.authorId)}
									</Text>
								</View>
								{selectedIsMarked ? (
									<View style={styles.markedBadge}>
										<Text style={styles.markedBadgeText}>
											✓ Marked by {getMarkedByNickname(selectedPredId!)}
										</Text>
									</View>
								) : (
									<TouchableOpacity
										style={styles.markButton}
										onPress={() => doMarkPrediction(selectedPredId!)}
									>
										<Text style={styles.markButtonText}>Mark as true</Text>
									</TouchableOpacity>
								)}
								<TouchableOpacity
									style={styles.closeButton}
									onPress={() => setSelectedPredId(null)}
								>
									<Text style={styles.closeButtonText}>Close</Text>
								</TouchableOpacity>
							</>
						)}
					</TouchableOpacity>
				</TouchableOpacity>
			</Modal>

			{/* Marks history modal */}
			<Modal
				visible={showHistory}
				transparent
				animationType="slide"
				onRequestClose={() => setShowHistory(false)}
			>
				<TouchableOpacity
					style={styles.overlay}
					activeOpacity={1}
					onPress={() => setShowHistory(false)}
				>
					<TouchableOpacity
						style={[styles.modalCard, styles.historyCard]}
						activeOpacity={1}
					>
						<Text style={styles.historyTitle}>All marks</Text>
						<ScrollView style={styles.historyScroll} bounces={false}>
							{[...visibleMarks].reverse().map((m) => {
								const pred = getPrediction(m.predictionId);
								return (
									<View key={m.predictionId} style={styles.historyEntry}>
										<Text style={styles.historyEntryText}>
											"{getPredictionText(m.predictionId)}"
										</Text>
										<Text style={styles.historyEntryMeta}>
											{m.markedByNickname} · about{' '}
											{getPlayerName(pred?.subjectId)}
										</Text>
									</View>
								);
							})}
						</ScrollView>
						<TouchableOpacity
							style={styles.closeButton}
							onPress={() => setShowHistory(false)}
						>
							<Text style={styles.closeButtonText}>Close</Text>
						</TouchableOpacity>
					</TouchableOpacity>
				</TouchableOpacity>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: colors.background },
	container: { padding: spacing.lg, gap: spacing.lg, alignItems: 'center' },

	header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
	headerSpacer: { width: 36 },
	headerCenter: { alignItems: 'center', gap: spacing.xs },
	homeButton: { width: 36, alignItems: 'flex-end', justifyContent: 'center' },
	homeButtonText: { fontSize: 20, color: colors.textLight },
	title: { fontSize: fontSize.xl, fontWeight: '900', color: colors.primary },
	subtitle: { fontSize: fontSize.sm, color: colors.textLight },

	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: spacing.xs,
		justifyContent: 'center',
	},

	cell: {
		backgroundColor: colors.surface,
		borderRadius: radius.sm,
		borderWidth: 1.5,
		borderColor: colors.border,
		padding: spacing.xs,
		justifyContent: 'center',
		alignItems: 'center',
		overflow: 'hidden',
	},
	cellMarked: {
		backgroundColor: colors.marked,
		borderColor: colors.marked,
	},
	cellWin: {
		backgroundColor: colors.secondary,
		borderColor: colors.secondary,
	},
	cellText: {
		fontSize: 14,
		fontWeight: '700',
		color: colors.text,
		textAlign: 'center',
		lineHeight: 18,
	},
	cellTextMarked: { color: colors.markedText, fontWeight: '600' },
	markedBy: {
		fontSize: 9,
		color: 'rgba(255,255,255,0.7)',
		marginTop: 2,
		textAlign: 'center',
	},

	log: {
		width: '100%',
		backgroundColor: colors.surface,
		borderRadius: radius.md,
		padding: spacing.md,
		gap: spacing.xs,
		borderWidth: 1,
		borderColor: colors.border,
	},
	logHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	logTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
	logSeeAll: {
		fontSize: fontSize.sm,
		color: colors.primary,
		fontWeight: '600',
	},
	logEntry: { fontSize: fontSize.sm, color: colors.textLight },
	logAuthor: { fontWeight: '700', color: colors.text },

	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: spacing.lg,
	},
	modalCard: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		padding: spacing.lg,
		width: '100%',
		gap: spacing.md,
	},
	modalPredText: {
		fontSize: fontSize.lg,
		fontWeight: '700',
		color: colors.text,
		textAlign: 'center',
		lineHeight: 28,
	},
	modalMeta: { gap: spacing.xs },
	modalMetaText: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		textAlign: 'center',
	},
	markedBadge: {
		backgroundColor: colors.marked,
		borderRadius: radius.md,
		padding: spacing.md,
		alignItems: 'center',
	},
	markedBadgeText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md },
	markButton: {
		backgroundColor: colors.primary,
		borderRadius: radius.lg,
		padding: spacing.md,
		alignItems: 'center',
	},
	markButtonText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
	closeButton: { alignItems: 'center', padding: spacing.sm },
	closeButtonText: { color: colors.textLight, fontSize: fontSize.md },

	historyCard: { maxHeight: '80%' },
	historyTitle: {
		fontSize: fontSize.lg,
		fontWeight: '700',
		color: colors.text,
		textAlign: 'center',
	},
	historyScroll: { maxHeight: 400 },
	historyEntry: {
		paddingVertical: spacing.sm,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
		gap: spacing.xs,
	},
	historyEntryText: {
		fontSize: fontSize.md,
		color: colors.text,
		fontStyle: 'italic',
	},
	historyEntryMeta: {
		fontSize: fontSize.sm,
		color: colors.textLight,
	},
});
