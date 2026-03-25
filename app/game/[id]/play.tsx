import React, { useEffect, useRef, useState } from 'react';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

// react-native-share is not bundled in Expo Go — lazy require so it degrades gracefully
let RNShare: typeof import('react-native-share').default | null = null;
try {
	RNShare = require('react-native-share').default;
} catch {}
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
	banPlayerFromGame,
	reportPrediction,
	type Prediction,
	type Player,
	type ReportReason,
} from '../../../lib/firestore';
import { getWinningLine } from '../../../lib/gameLogic';
import { useGameStore } from '../../../store/gameStore';
import { sendPushNotifications } from '../../../lib/notifications';
import {
	feedbackMark,
	feedbackWin,
	feedbackSelection,
} from '../../../lib/feedback';
import { ReportModal } from '../../../components/ReportModal';
import { BrandWordmark } from '../../../components/BrandWordmark';
import { PlayerList } from '../../../components/lobby/PlayerList';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = spacing.lg * 2;

export default function PlayScreen() {
	const { id: gameId } = useLocalSearchParams<{ id: string }>();
	const membership = useGameStore((s) =>
		gameId ? s.memberships.find((saved) => saved.gameId === gameId) : undefined,
	);
	const playerId = membership?.playerId ?? null;
	const nickname = membership?.nickname ?? null;
	const setGame = useGameStore((s) => s.setGame);
	const setMarks = useGameStore((s) => s.setMarks);
	const setPredictions = useGameStore((s) => s.setPredictions);
	const setMyCard = useGameStore((s) => s.setMyCard);
	const setPlayers = useGameStore((s) => s.setPlayers);
	const removeMembership = useGameStore((s) => s.removeMembership);
	const setCurrentGame = useGameStore((s) => s.setCurrentGame);

	const game = useGameStore((s) => s.game);
	const marks = useGameStore((s) => s.marks);
	const predictions = useGameStore((s) => s.predictions);
	const players = useGameStore((s) => s.players);
	const myCard = useGameStore((s) => s.myCard);

	const gridRef = useRef<View>(null);
	const [winningLine, setWinningLine] = useState<number[] | null>(null);
	const [loadingCard, setLoadingCard] = useState(true);
	const [allCards, setAllCards] = useState<Map<string, string[]>>(new Map());
	const announcedWinners = useRef<Set<string>>(new Set());
	const [selectedPredId, setSelectedPredId] = useState<string | null>(null);
	const [showHistory, setShowHistory] = useState(false);
	const [showReportModal, setShowReportModal] = useState(false);
	const [showPlayersModal, setShowPlayersModal] = useState(false);
	const [reportingPrediction, setReportingPrediction] =
		useState<Prediction | null>(null);
	const wasRemovedRef = useRef(false);

	const handleRemovedFromGame = () => {
		if (wasRemovedRef.current || !gameId) return;
		wasRemovedRef.current = true;
		removeMembership(gameId);
		Alert.alert('Removed from game', 'The host of the game removed you.', [
			{ text: 'OK', onPress: () => router.replace('/') },
		]);
	};

	const gridSize = game?.gridSize ?? 4;
	const cellSize = (SCREEN_WIDTH - GRID_PADDING) / gridSize - spacing.xs;

	useEffect(() => {
		if (!gameId) return;
		setCurrentGame(gameId);
		const onListenerError = (error: Error & { code?: string }) => {
			if (error.code === 'permission-denied') {
				handleRemovedFromGame();
				return;
			}
			Alert.alert(
				'Connection error',
				'Lost connection to game. Check your internet.',
			);
		};
		const unsubs = [
			listenToGame(
				gameId,
				(g) => {
					setGame(g);
					if (g.status === 'finished') router.replace(`/game/${gameId}/winner`);
				},
				onListenerError,
			),
			listenToMarks(gameId, setMarks, onListenerError),
			listenToPredictions(gameId, setPredictions, onListenerError),
			listenToPlayers(gameId, setPlayers, onListenerError),
		];
		return () => unsubs.forEach((u) => u());
	}, [gameId, setCurrentGame, setGame, setMarks, setPredictions, setPlayers]);

	useEffect(() => {
		if (gameId && !membership) router.replace('/');
	}, [gameId, membership]);

	useEffect(() => {
		if (!playerId || players.length === 0 || wasRemovedRef.current) return;
		if (players.some((p) => p.id === playerId)) return;
		handleRemovedFromGame();
	}, [players, playerId]);

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
		const activePlayerIds = new Set(players.map((p) => p.id));
		setAllCards((prev) => {
			const next = new Map<string, string[]>();
			prev.forEach((grid, pid) => {
				if (activePlayerIds.has(pid)) next.set(pid, grid);
			});
			return next;
		});
		players.forEach((p) => {
			if (allCards.has(p.id)) return;
			getCard(gameId, p.id).then((grid) => {
				if (grid) setAllCards((prev) => new Map(prev).set(p.id, grid));
			});
		});
	}, [gameId, players]);

	// Check ALL cards on every marks update — so wins are detected even for players who left
	useEffect(() => {
		if (
			!gameId ||
			!game ||
			(game.status !== 'active' && game.status !== 'finished')
		)
			return;
		if (allCards.size === 0) return;
		const activePlayerIds = new Set(players.map((p) => p.id));
		const markedSet = new Set(marks.map((m) => m.predictionId));
		allCards.forEach((grid, pid) => {
			if (!activePlayerIds.has(pid)) return;
			if (announcedWinners.current.has(pid)) return;
			const line = getWinningLine(grid, markedSet, gridSize);
			if (!line) return;
			announcedWinners.current.add(pid);
			if (pid === playerId) {
				setWinningLine(line);
				feedbackWin();
			}
			const winner = players.find((p) => p.id === pid);
			const winnerNickname = winner?.nickname ?? 'Someone';
			announceWinner(gameId, pid, winnerNickname)
				.then(() => {
					const tokens = players
						.filter((p) => p.id !== pid)
						.map((p) => p.pushToken);
					sendPushNotifications(tokens, 'bingoo! 🎉', `${winnerNickname} won!`);
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

	const handleShare = async () => {
		if (!gridRef.current) return;
		try {
			if (RNShare) {
				const base64 = await captureRef(gridRef, {
					format: 'jpg',
					quality: 0.9,
					result: 'base64',
				});
				await RNShare.open({
					url: `data:image/jpeg;base64,${base64}`,
					type: 'image/jpeg',
				});
			} else {
				const uri = await captureRef(gridRef, { format: 'jpg', quality: 0.9 });
				await Sharing.shareAsync(uri, {
					mimeType: 'image/jpeg',
					UTI: 'public.jpeg',
				});
			}
		} catch {
			// user dismissed share sheet — not an error
		}
	};

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

	const handleReportSelectedPrediction = async (reason: ReportReason) => {
		if (!gameId || !playerId || !reportingPrediction) return;
		try {
			await reportPrediction(gameId, reportingPrediction.id, playerId, reason);
			Alert.alert('Reported', 'Thanks. We will review it.');
		} catch {
			Alert.alert('Error', 'Could not send the report. Try again.');
		} finally {
			setShowReportModal(false);
			setReportingPrediction(null);
		}
	};

	const handleRemovePlayer = (player: Player) => {
		if (!gameId || !game || player.id === game.hostId) return;
		Alert.alert(
			`Remove ${player.nickname}?`,
			'They will immediately lose access to this game.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Remove',
					style: 'destructive',
					onPress: async () => {
						try {
							await banPlayerFromGame(gameId, player.id, false);
						} catch (error) {
							const message =
								error instanceof Error
									? error.message
									: 'Could not remove this player. Try again.';
							Alert.alert('Error', message);
						}
					},
				},
			],
		);
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
					{game?.hostId === playerId ? (
						<TouchableOpacity
							onPress={() => setShowPlayersModal(true)}
							style={styles.manageButton}
						>
							<Text style={styles.manageButtonText}>players</Text>
						</TouchableOpacity>
					) : (
						<View style={styles.headerSpacer} />
					)}
					<View style={styles.headerCenter}>
						<BrandWordmark style={styles.title} />
						<Text style={styles.subtitle}>
							{markedIds.size} / {myCard.length} marked
						</Text>
					</View>
					<TouchableOpacity
						onPress={() => router.replace('/')}
						style={styles.homeButton}
					>
						<Text style={styles.homeButtonText}>home</Text>
					</TouchableOpacity>
				</View>

				{/* Bingo grid */}
				<View
					style={[styles.grid, { backgroundColor: colors.background }]}
					ref={gridRef}
					collapsable={false}
				>
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
								onPress={() => {
									feedbackSelection();
									setSelectedPredId(predictionId);
								}}
								activeOpacity={0.7}
							>
								<Text
									style={[
										styles.cellText,
										isMarked && styles.cellTextMarked,
										isWinCell && styles.cellTextWin,
									]}
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

				<TouchableOpacity style={styles.shareButton} onPress={handleShare}>
					<Text style={styles.shareButtonText}>share card</Text>
				</TouchableOpacity>

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
								{!selectedIsMarked && (
									<TouchableOpacity
										style={styles.markButton}
										onPress={() => doMarkPrediction(selectedPredId!)}
									>
										<Text style={styles.markButtonText}>mark as true</Text>
									</TouchableOpacity>
								)}
								<TouchableOpacity
									style={styles.reportButton}
									onPress={() => {
										setReportingPrediction(selectedPred);
										setSelectedPredId(null);
										setShowReportModal(true);
									}}
								>
									<Text style={styles.reportButtonText}>report</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={styles.closeButton}
									onPress={() => setSelectedPredId(null)}
								>
									<Text style={styles.closeButtonText}>close</Text>
								</TouchableOpacity>
							</>
						)}
					</TouchableOpacity>
				</TouchableOpacity>
			</Modal>

			<ReportModal
				visible={showReportModal}
				title="Report prediction"
				onClose={() => setShowReportModal(false)}
				onSelect={handleReportSelectedPrediction}
			/>

			<Modal
				visible={showPlayersModal}
				transparent
				animationType="slide"
				onRequestClose={() => setShowPlayersModal(false)}
			>
				<TouchableOpacity
					style={styles.overlay}
					activeOpacity={1}
					onPress={() => setShowPlayersModal(false)}
				>
					<TouchableOpacity
						style={[styles.modalCard, styles.playersCard]}
						activeOpacity={1}
					>
						<Text style={styles.historyTitle}>Players</Text>
						<ScrollView style={styles.historyScroll} bounces={false}>
							<PlayerList
								players={players}
								playerId={playerId!}
								hostId={game!.hostId}
								onPressPlayer={handleRemovePlayer}
								statusLabel={() => 'Playing'}
							/>
						</ScrollView>
						<TouchableOpacity
							style={styles.closeButton}
							onPress={() => setShowPlayersModal(false)}
						>
							<Text style={styles.closeButtonText}>Close</Text>
						</TouchableOpacity>
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

	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		width: '100%',
	},
	headerSpacer: { minWidth: 76 },
	manageButton: {
		minWidth: 76,
		backgroundColor: colors.primaryLight,
		borderRadius: radius.full,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		alignItems: 'center',
	},
	manageButtonText: {
		fontSize: fontSize.sm,
		color: colors.primary,
		fontWeight: '700',
		textTransform: 'uppercase',
	},
	headerCenter: { alignItems: 'center', gap: spacing.xs },
	homeButton: {
		minWidth: 84,
		backgroundColor: colors.surface,
		borderRadius: radius.full,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderWidth: 1,
		borderColor: colors.border,
		alignItems: 'center',
	},
	homeButtonText: {
		fontSize: fontSize.sm,
		color: colors.text,
		fontWeight: '700',
	},
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
		fontSize: 17,
		fontWeight: '700',
		color: colors.text,
		textAlign: 'center',
	},
	cellTextMarked: { color: colors.markedText, fontWeight: '600' },
	cellTextWin: { color: colors.text, fontWeight: '700' },
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
	reportButton: { alignItems: 'center', paddingVertical: spacing.xs },
	reportButtonText: {
		color: colors.textLight,
		fontSize: fontSize.sm,
		fontWeight: '700',
		textTransform: 'uppercase',
	},
	closeButton: { alignItems: 'center', padding: spacing.sm },
	closeButtonText: { color: colors.textLight, fontSize: fontSize.md },

	historyCard: { maxHeight: '80%' },
	playersCard: { maxHeight: '80%' },
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

	shareButton: {
		borderRadius: radius.lg,
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.sm,
		alignItems: 'center',
		borderWidth: 1.5,
		borderColor: colors.border,
	},
	shareButtonText: {
		color: colors.text,
		fontSize: fontSize.sm,
		fontWeight: '700',
	},
});
