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
	RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, spacing, radius, fontSize } from '../../../constants/theme';
import {
	listenToGame,
	listenToMarks,
	listenToPlayers,
	listenToPredictions,
	fetchGame,
	fetchMarks,
	fetchPlayers,
	fetchPredictions,
	getCard,
	type Prediction,
	type Player,
	type ReportReason,
} from '../../../lib/firestore';
import { useGameActions } from '../../../hooks/useGameActions';
import { getWinningLine, formatPlaceLabel, computeNextPlace } from '../../../lib/gameLogic';
import { useGameStore } from '../../../store/gameStore';
import { sendPushNotifications } from '../../../lib/notifications';
import {
	feedbackMark,
	feedbackWin,
	feedbackSelection,
} from '../../../lib/feedback';
import { ReportModal } from '../../../components/ReportModal';
import { Ionicons } from '@expo/vector-icons';
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
	const isDemoMode = useGameStore((s) => s.isDemoMode);
	const setDemoMode = useGameStore((s) => s.setDemoMode);
	const actions = useGameActions(gameId);

	const game = useGameStore((s) => s.game);
	const marks = useGameStore((s) => s.marks);
	const predictions = useGameStore((s) => s.predictions);
	const players = useGameStore((s) => s.players);
	const myCard = useGameStore((s) => s.myCard);

	const shareRef = useRef<View>(null);
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
	const [podiumModal, setPodiumModal] = useState<{
		place: 1 | 2 | 3;
		names: string;
		iWon: boolean;
	} | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const botWinTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
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
	const cellHeight = cellSize * 1.3;
	const cellFontSize = Math.max(11, Math.round(cellSize * 0.18));

	useEffect(() => {
		if (!gameId) return;
		if (isDemoMode) return; // DEMO: game/marks/predictions/players already in store
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
					if (g.status === 'cancelled') { removeMembership(gameId); router.replace('/'); }
				},
				onListenerError,
			),
			listenToMarks(gameId, setMarks, onListenerError),
			listenToPredictions(gameId, setPredictions, onListenerError),
			listenToPlayers(gameId, setPlayers, onListenerError),
		];
		return () => unsubs.forEach((u) => u());
	}, [gameId, setCurrentGame, setGame, setMarks, setPredictions, setPlayers]);

	// Clean up any pending bot-win timers on unmount
	useEffect(() => {
		return () => botWinTimers.current.forEach(clearTimeout);
	}, []);

	useEffect(() => {
		if (gameId && !membership) router.replace('/');
	}, [gameId, membership]);

	const handleRefresh = async () => {
		if (!gameId || isDemoMode) return;
		setRefreshing(true);
		try {
			const [nextGame, nextMarks, nextPredictions, nextPlayers] = await Promise.all([
				fetchGame(gameId, true),
				fetchMarks(gameId, true),
				fetchPredictions(gameId, true),
				fetchPlayers(gameId, true),
			]);
			if (!nextGame) {
				removeMembership(gameId);
				router.replace('/');
				return;
			}
			setGame(nextGame);
			setMarks(nextMarks);
			setPredictions(nextPredictions);
			setPlayers(nextPlayers);
			if (playerId) {
				const ownGrid = await getCard(gameId, playerId, true);
				if (ownGrid) setMyCard(ownGrid);
			}
			const cardResults = await Promise.all(
				nextPlayers.map(async (player) => {
					const grid = await getCard(gameId, player.id, true);
					return grid ? [player.id, grid] as const : null;
				}),
			);
			setAllCards(new Map(cardResults.filter(Boolean) as Array<readonly [string, string[]]>));
			if (nextGame.status === 'finished') router.replace(`/game/${gameId}/winner`);
			if (nextGame.status === 'cancelled') {
				removeMembership(gameId);
				router.replace('/');
			}
		} catch {
			Alert.alert('Refresh failed', 'Could not refresh the game right now. Try again.');
		} finally {
			setRefreshing(false);
		}
	};

	useEffect(() => {
		if (!playerId || players.length === 0 || wasRemovedRef.current) return;
		if (players.some((p) => p.id === playerId)) return;
		handleRemovedFromGame();
	}, [players, playerId]);

	// Seed announcedWinners from store on mount to prevent re-announcing after remount
	useEffect(() => {
		game?.winners.forEach((w) => announcedWinners.current.add(w.id));
	}, []);

	// Load own card for display
	useEffect(() => {
		if (!gameId || !playerId) return;
		if (isDemoMode) {
			setLoadingCard(false); // myCard already set from doStartGame
			return;
		}
		getCard(gameId, playerId).then((grid) => {
			if (grid) setMyCard(grid);
			setLoadingCard(false);
		});
	}, [gameId, playerId]);

	// Load all players' cards for universal win detection
	useEffect(() => {
		if (!gameId || players.length === 0) return;
		if (isDemoMode) {
			// In demo mode bots never win; only track the host's card
			const card = useGameStore.getState().myCard;
			if (playerId && card) setAllCards(new Map([[playerId, card]]));
			return;
		}
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
		const markedSet = new Set(marks.map((m) => m.predictionId));

		if (isDemoMode) {
			// Only the host can win in demo mode; bots win on a timer after host wins
			if (
				!myCard ||
				!playerId ||
				!nickname ||
				announcedWinners.current.has(playerId)
			)
				return;
			const line = getWinningLine(myCard, markedSet, gridSize);
			if (!line) return;
			announcedWinners.current.add(playerId);
			setWinningLine(line);
			feedbackWin();
			actions.announceWinners([{ id: playerId, nickname }]).catch(() => {});

			// Schedule up to 2 bot wins for 2nd and 3rd place
			const bots = players.filter((p) => p.id !== playerId);
			bots.slice(0, 2).forEach((bot, i) => {
				const t = setTimeout(
					() => {
						announcedWinners.current.add(bot.id);
						actions
							.announceWinners([{ id: bot.id, nickname: bot.nickname }])
							.catch(() => {});
					},
					(i + 1) * 4000,
				);
				botWinTimers.current.push(t);
			});
			return;
		}

		const activePlayerIds = new Set(players.map((p) => p.id));
		const newWinners: Array<{ id: string; nickname: string }> = [];

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
			newWinners.push({ id: pid, nickname: winner?.nickname ?? 'Someone' });
		});

		if (newWinners.length > 0) {
			const nextPlace = computeNextPlace(game.winners ?? []);
			const placeLabel = formatPlaceLabel(nextPlace);
			actions
				.announceWinners(newWinners)
				.then(() => {
					const tokens = players
						.filter((p) => !newWinners.some((w) => w.id === p.id))
						.map((p) => p.pushToken);
					const names = newWinners.map((w) => w.nickname).join(' & ');
					sendPushNotifications(tokens, 'bingoo! 🎉', `${names} got ${placeLabel} place!`);
				})
				.catch(() => {});
		}
	}, [marks, allCards]);

	const markedIds = new Set(marks.map((m) => m.predictionId));

	// Show podium modal when a place is awarded but game continues.
	// It stays visible until the player dismisses it.
	useEffect(() => {
		if (!game || game.status === 'finished') return;
		const winners = game.winners ?? [];
		if (winners.length === 0) return;
		const latestPlace = Math.max(...winners.map((w) => w.place ?? 1)) as 1 | 2 | 3;
		const atPlace = winners.filter((w) => (w.place ?? 1) === latestPlace);
		const iWon = atPlace.some((w) => w.id === playerId);
		const names = atPlace
			.filter((w) => w.id !== playerId)
			.map((w) => w.nickname)
			.join(' & ');
		setPodiumModal({ place: latestPlace, names, iWon });
	}, [game?.winners?.length]);

	// Navigate when game ends (covers both real and demo mode)
	useEffect(() => {
		if (!gameId) return;
		if (game?.status === 'finished') router.replace(`/game/${gameId}/winner`);
		if (game?.status === 'cancelled') { if (isDemoMode) setDemoMode(false); removeMembership(gameId); router.replace('/'); }
	}, [game?.status]);

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
		if (!shareRef.current) return;
		try {
			const captured = await captureRef(shareRef, {
				format: 'jpg',
				quality: 0.9,
			});
			const reencoded = await ImageManipulator.manipulateAsync(captured, [], {
				compress: 0.9,
				format: ImageManipulator.SaveFormat.JPEG,
			});
			await Sharing.shareAsync(reencoded.uri, {
				mimeType: 'image/jpeg',
				UTI: 'public.jpeg',
			});
		} catch {
			// user dismissed share sheet — not an error
		}
	};

	const doMarkPrediction = (predictionId: string) => {
		if (!gameId || !playerId || !nickname) return;
		feedbackMark();
		setSelectedPredId(null);
		const pred = getPrediction(predictionId);
		actions
			.markPrediction(predictionId, playerId, nickname)
			.then(() => {
				if (isDemoMode) return;
				const tokens = players
					.filter((p) => p.id !== playerId && p.id !== pred?.subjectId)
					.map((p) => p.pushToken);
				const predText = pred?.text ?? '';
				const subjectName = pred ? getPlayerName(pred.subjectId) : 'Someone';
				sendPushNotifications(
					tokens,
					'a prediction came true ✓',
					`${subjectName} ${predText}`,
				);
			})
			.catch(() => {
				Alert.alert('Error', 'Could not mark this prediction. Try again.');
			});
	};

	const confirmMarkPrediction = (predictionId: string) => {
		const predText = getPredictionText(predictionId);
		Alert.alert(
			'Mark as true?',
			`Are you sure this happened?\n\n"${predText}"`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Mark as true',
					onPress: () => doMarkPrediction(predictionId),
				},
			],
		);
	};

	const handleReportSelectedPrediction = async (reason: ReportReason) => {
		if (!gameId || !playerId || !reportingPrediction) return;
		try {
			await actions.reportPrediction(reportingPrediction.id, playerId, reason);
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
							await actions.removePlayer(player, false);
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

	const handleCancelGame = () => {
		Alert.alert(
			'Cancel game?',
			'This will end the game for everyone immediately.',
			[
				{ text: 'Keep playing', style: 'cancel' },
				{
					text: 'Cancel game',
					style: 'destructive',
					onPress: async () => {
						try {
							await actions.cancelGame();
						} catch {
							Alert.alert('Error', 'Could not cancel the game. Try again.');
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
			<ScrollView
				contentContainerStyle={styles.container}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
				}
			>
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
					</View>
					<TouchableOpacity
						onPress={() => {
							if (isDemoMode) {
								setDemoMode(false);
								if (gameId) removeMembership(gameId);
							}
							router.replace('/');
						}}
						style={styles.homeButton}
					>
						<Text style={styles.homeButtonText}>home</Text>
					</TouchableOpacity>
				</View>

				{/* Bingo grid */}
				<View style={styles.cardWrapper}>
					<View style={styles.grid}>
						{myCard.map((predictionId, index) => {
							const isMarked = markedIds.has(predictionId);
							const isWinCell = winningLine?.includes(index) ?? false;

							return (
								<TouchableOpacity
									key={predictionId}
									style={[
										styles.cell,
										{ width: cellSize, height: cellHeight },
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
											{ fontSize: cellFontSize },
											isMarked && styles.cellTextMarked,
											isWinCell && styles.cellTextWin,
										]}
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
						<Ionicons name="share-outline" size={24} color={colors.text} />
					</TouchableOpacity>
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
								<Text style={styles.modalPredText}>
									{getPredictionText(selectedPredId!)}
								</Text>
								{!selectedIsMarked && (
									<TouchableOpacity
										style={styles.markButton}
										onPress={() => confirmMarkPrediction(selectedPredId!)}
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
						<TouchableOpacity
							style={styles.cancelGameButton}
							onPress={() => { setShowPlayersModal(false); handleCancelGame(); }}
						>
							<Text style={styles.cancelGameButtonText}>Cancel game</Text>
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
											marked by {m.markedByNickname}
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

			{/* Off-screen non-interactive card — plain Views instead of TouchableOpacity for reliable WhatsApp sharing */}
			{myCard && (
				<View
					ref={shareRef}
					collapsable={false}
					pointerEvents="none"
					style={styles.shareCard}
				>
					<Text style={styles.shareCardLabel}>
						{winningLine ? 'Your winning card' : 'Your card'}
					</Text>
					<View style={styles.grid}>
						{myCard.map((predictionId, index) => {
							const isMarked = markedIds.has(predictionId);
							const isWinCell = winningLine?.includes(index) ?? false;
							return (
								<View
									key={predictionId}
									style={[
										styles.cell,
										{ width: cellSize, height: cellHeight },
										isMarked && styles.cellMarked,
										isWinCell && styles.cellWin,
									]}
								>
									<Text
										style={[
											styles.cellText,
											{ fontSize: cellFontSize },
											isMarked && styles.cellTextMarked,
											isWinCell && styles.cellTextWin,
										]}
									>
										{getPredictionText(predictionId)}
									</Text>
								</View>
							);
						})}
					</View>
				</View>
			)}
			<Modal
				visible={!!podiumModal}
				transparent
				animationType="fade"
				onRequestClose={() => setPodiumModal(null)}
			>
				<View style={styles.podiumOverlay}>
					<View style={styles.podiumModalCard}>
						<Text style={styles.podiumModalEmoji}>
							{podiumModal?.place === 1 ? '🥇' : podiumModal?.place === 2 ? '🥈' : '🥉'}
						</Text>
						{podiumModal?.iWon ? (
							<>
								<Text style={styles.podiumModalPlace}>
									You got {podiumModal ? formatPlaceLabel(podiumModal.place) : ''} place!
								</Text>
								{podiumModal.names.length > 0 && (
									<Text style={styles.podiumModalNames}>
										tied with {podiumModal.names}
									</Text>
								)}
							</>
						) : (
							<>
								<Text style={styles.podiumModalNames}>
									{podiumModal?.names || 'Someone'}
								</Text>
								<Text style={styles.podiumModalPlace}>
									got {podiumModal ? formatPlaceLabel(podiumModal.place) : ''} place!
								</Text>
							</>
						)}
						<Text style={styles.podiumModalSub}>the game continues…</Text>
						<TouchableOpacity
							style={styles.podiumDismissButton}
							onPress={() => setPodiumModal(null)}
						>
							<Text style={styles.podiumDismissButtonText}>Got it</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: colors.background },
	container: { padding: spacing.lg, gap: spacing.lg, alignItems: 'center' },
	podiumOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: spacing.xl,
	},
	podiumModalCard: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		padding: spacing.xl,
		alignItems: 'center',
		gap: spacing.sm,
		width: '100%',
	},
	podiumModalEmoji: { fontSize: 64 },
	podiumModalPlace: {
		fontSize: fontSize.xl,
		fontWeight: '900',
		color: colors.text,
	},
	podiumModalNames: {
		fontSize: fontSize.md,
		fontWeight: '700',
		color: colors.primary,
		textAlign: 'center',
	},
	podiumModalSub: {
		fontSize: fontSize.sm,
		color: colors.textLight,
	},
	podiumDismissButton: {
		marginTop: spacing.sm,
		backgroundColor: colors.primary,
		borderRadius: radius.md,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
	},
	podiumDismissButtonText: {
		color: '#fff',
		fontSize: fontSize.sm,
		fontWeight: '700',
	},

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
		marginTop: spacing.lg,
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
	cancelGameButton: { alignItems: 'center', padding: spacing.sm },
	cancelGameButtonText: { color: colors.error, fontSize: fontSize.sm, fontWeight: '700' },

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

	cardWrapper: {
		width: '100%',
		alignItems: 'center',
		position: 'relative',
	},
	shareButton: {
		position: 'absolute',
		bottom: -24,
		right: 0,
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: colors.surface,
		borderWidth: 1.5,
		borderColor: colors.border,
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 1,
	},
	shareCard: {
		position: 'absolute',
		left: SCREEN_WIDTH,
		top: 0,
		backgroundColor: colors.background,
		padding: spacing.lg,
		width: SCREEN_WIDTH,
	},
	shareCardLabel: {
		fontSize: fontSize.md,
		fontWeight: '600',
		color: colors.textLight,
		marginBottom: spacing.sm,
		textAlign: 'center',
	},
});
