import React, { useEffect, useRef, useState } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
	Alert,
	Share,
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../../../constants/theme';
import {
	listenToGame,
	listenToPlayers,
	listenToPredictions,
	addPrediction,
	deletePrediction,
	markPlayerDone,
	markPlayerWriting,
	startGame,
	cancelGame,
	leaveGame,
	banPlayerFromGame,
	isInsufficientPredictionsError,
	reportPlayer,
	reportPrediction,
	setReaction,
	type ReactionEmoji,
	type Prediction,
	type Player,
	type ReportReason,
	MAX_PREDICTION_LENGTH,
} from '../../../lib/firestore';
import {
	getMinVisiblePredictions,
	MIN_CARD_CELLS,
	REQUIRED_PREDICTIONS_PER_PLAYER,
} from '../../../lib/gameLogic';
import { useGameStore } from '../../../store/gameStore';
import { sendPushNotifications } from '../../../lib/notifications';
import { feedbackDone, feedbackStart } from '../../../lib/feedback';
import { buildInviteMessage } from '../../../lib/invite';
import { PlayerList } from '../../../components/lobby/PlayerList';
import { PredictionCard } from '../../../components/lobby/PredictionCard';
import { SubjectPickerModal } from '../../../components/lobby/SubjectPickerModal';
import { WelcomeModal } from '../../../components/lobby/WelcomeModal';
import { ReportModal } from '../../../components/ReportModal';
import { ActionModal } from '../../../components/ActionModal';

const MIN_PLAYERS = 3;

function getGameDisplayName(code: string, name?: string): string {
	return name?.trim() || `Game ${code}`;
}

export default function LobbyScreen() {
	const { id: gameId, welcome } = useLocalSearchParams<{
		id: string;
		welcome?: string;
	}>();
	const membership = useGameStore((s) =>
		gameId ? s.memberships.find((saved) => saved.gameId === gameId) : undefined,
	);
	const playerId = membership?.playerId ?? null;
	const isHost = membership?.isHost ?? false;
	const setGame = useGameStore((s) => s.setGame);
	const setPlayers = useGameStore((s) => s.setPlayers);
	const setPredictions = useGameStore((s) => s.setPredictions);
	const removeMembership = useGameStore((s) => s.removeMembership);
	const setCurrentGame = useGameStore((s) => s.setCurrentGame);

	const game = useGameStore((s) => s.game);
	const players = useGameStore((s) => s.players);
	const predictions = useGameStore((s) => s.predictions);

	const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
		null,
	);
	const [predText, setPredText] = useState('');
	const [adding, setAdding] = useState(false);
	const [starting, setStarting] = useState(false);
	const [showWelcome, setShowWelcome] = useState(isHost && welcome === '1');
	const [showSubjectPicker, setShowSubjectPicker] = useState(false);
	const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(
		null,
	);
	const [reportingPrediction, setReportingPrediction] =
		useState<Prediction | null>(null);
	const [reportingPlayer, setReportingPlayer] = useState<Player | null>(null);
	const [actionPrediction, setActionPrediction] = useState<Prediction | null>(
		null,
	);
	const [actionPlayer, setActionPlayer] = useState<Player | null>(null);

	const inputRef = useRef<TextInput>(null);
	const autoSubmittedRef = useRef(false);
	const editingRef = useRef(false);
	const wasRemovedRef = useRef(false);
	const isLeavingRef = useRef(false);

	const handleRemovedFromGame = () => {
		if (wasRemovedRef.current || isLeavingRef.current || !gameId) return;
		wasRemovedRef.current = true;
		removeMembership(gameId);
		Alert.alert('Removed from game', 'The host of the game removed you.', [
			{ text: 'OK', onPress: () => router.replace('/') },
		]);
	};

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
					if (g.status === 'active') router.replace(`/game/${gameId}/play`);
					if (g.status === 'cancelled') {
						removeMembership(gameId);
						if (isHost) {
							router.replace('/');
						} else {
							Alert.alert('Game cancelled', 'The host cancelled the game.', [
								{ text: 'OK', onPress: () => router.replace('/') },
							]);
						}
					}
				},
				onListenerError,
			),
			listenToPlayers(gameId, setPlayers, onListenerError),
			listenToPredictions(gameId, setPredictions, onListenerError),
		];
		return () => unsubs.forEach((u) => u());
	}, [
		gameId,
		isHost,
		removeMembership,
		setCurrentGame,
		setGame,
		setPlayers,
		setPredictions,
	]);

	useEffect(() => {
		if (gameId && !membership) router.replace('/');
	}, [gameId, membership]);

	useEffect(() => {
		if (!playerId || players.length === 0 || wasRemovedRef.current) return;
		if (players.some((p) => p.id === playerId)) return;
		handleRemovedFromGame();
	}, [players, playerId]);

	const otherPlayers = players.filter((p) => p.id !== playerId);
	const me = players.find((p) => p.id === playerId);
	const submitted = me?.predictionsSubmitted ?? false;
	const allSubmitted =
		players.length >= MIN_PLAYERS &&
		players.every((p) => p.predictionsSubmitted);

	const globalCountBySubject = new Map<string, number>();
	predictions.forEach((p) => {
		globalCountBySubject.set(
			p.subjectId,
			(globalCountBySubject.get(p.subjectId) ?? 0) + 1,
		);
	});

	const allSubjectsFull =
		otherPlayers.length >= MIN_PLAYERS - 1 &&
		otherPlayers.every(
			(p) =>
				(globalCountBySubject.get(p.id) ?? 0) >=
				REQUIRED_PREDICTIONS_PER_PLAYER,
		);
	const minVisiblePredictions = getMinVisiblePredictions(players, predictions);
	const hasEnoughPredictionsToStart =
		minVisiblePredictions >= MIN_CARD_CELLS &&
		players.every(
			(player) =>
				(globalCountBySubject.get(player.id) ?? 0) >=
				REQUIRED_PREDICTIONS_PER_PLAYER,
		);

	// Auto-select first subject with room when players load or predictions change
	useEffect(() => {
		const selectedStillPresent = otherPlayers.some(
			(player) => player.id === selectedSubjectId,
		);
		const selectedHasRoom =
			selectedSubjectId != null &&
			(globalCountBySubject.get(selectedSubjectId) ?? 0) <
				REQUIRED_PREDICTIONS_PER_PLAYER;

		if (selectedStillPresent && selectedHasRoom) return;

		const nextWithRoom =
			otherPlayers.find(
				(player) =>
					(globalCountBySubject.get(player.id) ?? 0) <
					REQUIRED_PREDICTIONS_PER_PLAYER,
			) ?? null;
		const fallbackPlayer = otherPlayers[0] ?? null;
		const nextSubjectId = nextWithRoom?.id ?? fallbackPlayer?.id ?? null;

		if (nextSubjectId !== selectedSubjectId) {
			setSelectedSubjectId(nextSubjectId);
		}
	}, [players, predictions]);

	// Auto-submit when all subjects reach the global limit
	useEffect(() => {
		if (!allSubjectsFull) {
			editingRef.current = false;
			return;
		}
		if (submitted || autoSubmittedRef.current || editingRef.current) return;
		autoSubmittedRef.current = true;
		feedbackDone();
		markPlayerDone(gameId!, playerId!).catch(() => {
			autoSubmittedRef.current = false;
		});
	}, [allSubjectsFull, submitted]);

	const getPlayerName = (pid: string | undefined) =>
		players.find((p) => p.id === pid)?.nickname ?? '…';

	const visiblePredictions = predictions.filter(
		(p) => p.subjectId !== playerId,
	);

	const handleShare = () => {
		Share.share({
			message: buildInviteMessage(game?.code ?? '------', game?.name),
		});
	};

	const handleAddPrediction = async () => {
		if (!playerId || !gameId || !selectedSubjectId || !predText.trim()) return;
		const globalCount = globalCountBySubject.get(selectedSubjectId) ?? 0;
		if (globalCount >= REQUIRED_PREDICTIONS_PER_PLAYER) return;
		setAdding(true);
		try {
			await addPrediction(gameId, playerId, selectedSubjectId, predText.trim());
			setPredText('');
			if (globalCount + 1 >= REQUIRED_PREDICTIONS_PER_PLAYER) {
				const next = otherPlayers.find(
					(p) =>
						p.id !== selectedSubjectId &&
						(globalCountBySubject.get(p.id) ?? 0) <
						REQUIRED_PREDICTIONS_PER_PLAYER,
				);
				if (next) setSelectedSubjectId(next.id);
			}
			inputRef.current?.focus();
		} catch {
			Alert.alert('Error', 'Could not add prediction. Try again.');
		} finally {
			setAdding(false);
		}
	};

	const handleKeepWriting = async () => {
		if (!playerId || !gameId) return;
		editingRef.current = true;
		autoSubmittedRef.current = false;
		try {
			await markPlayerWriting(gameId, playerId);
		} catch {
			Alert.alert('Error', 'Could not update. Try again.');
		}
	};

	const handleMarkDone = async () => {
		if (!playerId || !gameId) return;
		editingRef.current = false;
		autoSubmittedRef.current = true;
		feedbackDone();
		try {
			await markPlayerDone(gameId, playerId);
		} catch {
			autoSubmittedRef.current = false;
			Alert.alert('Error', 'Could not submit. Try again.');
		}
	};

	const handleReaction = async (
		prediction: Prediction,
		emoji: ReactionEmoji,
	) => {
		if (!playerId || !gameId) return;
		const current =
			(
				Object.entries(prediction.reactions ?? {}) as [
					ReactionEmoji,
					string[],
				][]
			).find(([, uids]) => uids.includes(playerId))?.[0] ?? null;
		const next = current === emoji ? null : emoji;
		setReactionPickerFor(null);
		await setReaction(gameId, prediction.id, playerId, next, current);
	};

	const handleDeletePrediction = (predictionId: string) => {
		if (!gameId) return;
		Alert.alert('Remove prediction', 'Delete this from the pool?', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: () =>
					deletePrediction(gameId, predictionId).catch(() => {
						Alert.alert('Error', 'Could not delete. Try again.');
					}),
			},
		]);
	};

	const handleReportPrediction = (prediction: Prediction) => {
		setReportingPrediction(prediction);
	};

	const handleReportPlayer = (player: Player) => {
		setReportingPlayer(player);
	};

	const handleSubmitReport = async (reason: ReportReason) => {
		if (!gameId || !playerId) return;
		try {
			if (reportingPrediction) {
				await reportPrediction(
					gameId,
					reportingPrediction.id,
					playerId,
					reason,
				);
			} else if (reportingPlayer) {
				await reportPlayer(gameId, reportingPlayer.id, playerId, reason);
			} else {
				return;
			}
			Alert.alert('Reported', 'Thanks. We will review it.');
		} catch {
			Alert.alert('Error', 'Could not send the report. Try again.');
		} finally {
			setReportingPrediction(null);
			setReportingPlayer(null);
		}
	};

	const handleRemovePlayer = (player: Player) => {
		if (!gameId || !game || !isHost || player.id === game.hostId) return;
		Alert.alert(
			`Remove ${player.nickname}?`,
			'They will be removed from this lobby and lose access to the game.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Remove',
					style: 'destructive',
					onPress: async () => {
						try {
							await banPlayerFromGame(gameId, player.id, true);
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

	const handlePredictionAction = (prediction: Prediction) => {
		setActionPrediction(prediction);
	};

	const handlePlayerAction = (player: Player) => {
		setActionPlayer(player);
	};

	const handleStartGame = async () => {
		if (!gameId) return;
		if (!hasEnoughPredictionsToStart) {
			Alert.alert(
				'Not enough predictions',
				`Every remaining player needs at least ${MIN_CARD_CELLS} visible predictions before the game can start. Ask players to edit their predictions first.`,
			);
			return;
		}
		if (!allSubmitted) {
			Alert.alert(
				'Not everyone is ready',
				"Some players haven't finished writing yet. Start anyway?",
				[
					{ text: 'Wait', style: 'cancel' },
					{ text: 'Start anyway', onPress: doStartGame },
				],
			);
			return;
		}
		doStartGame();
	};

	const doStartGame = async () => {
		if (!gameId) return;
		feedbackStart();
		setStarting(true);
		try {
			await startGame(gameId, players, predictions);
			const tokens = players
				.filter((p) => p.id !== playerId)
				.map((p) => p.pushToken);
			sendPushNotifications(
				tokens,
				'game started! 🎰',
				'Check your bingoo card.',
			);
		} catch (error) {
			if (isInsufficientPredictionsError(error)) {
				Alert.alert('Not enough predictions', error.message);
			} else {
				Alert.alert('Error', 'Could not start game. Try again.');
			}
			setStarting(false);
		}
	};

	const handleCancel = () => {
		Alert.alert(
			'Cancel game',
			'This will end the lobby for everyone. Are you sure?',
			[
				{ text: 'Keep playing', style: 'cancel' },
				{
					text: 'Cancel game',
					style: 'destructive',
					onPress: async () => {
						try {
							await cancelGame(gameId!);
							router.replace('/');
						} catch {
							Alert.alert('Error', 'Could not cancel the game. Try again.');
						}
					},
				},
			],
		);
	};

	const handleLeave = () => {
		Alert.alert('Leave lobby', 'You will be removed from this game.', [
			{ text: 'Stay', style: 'cancel' },
			{
				text: 'Leave',
				style: 'destructive',
				onPress: async () => {
					isLeavingRef.current = true;
					try {
						await leaveGame(gameId!, playerId!);
						removeMembership(gameId!);
						router.replace('/');
					} catch {
						isLeavingRef.current = false;
						Alert.alert('Error', 'Could not leave the game. Try again.');
					}
				},
			},
		]);
	};

	if (!game) {
		return (
			<SafeAreaView style={styles.safe}>
				<ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
			</SafeAreaView>
		);
	}

	const selectedSubject = otherPlayers.find((p) => p.id === selectedSubjectId);
	const selectedSubjectCount =
		globalCountBySubject.get(selectedSubjectId ?? '') ?? 0;
	const canAdd =
		!!selectedSubjectId &&
		predText.trim().length > 0 &&
		!adding &&
		selectedSubjectCount < REQUIRED_PREDICTIONS_PER_PLAYER;

	return (
		<SafeAreaView style={styles.safe}>
			<KeyboardAvoidingView
				style={styles.flex}
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			>
				<ScrollView
					contentContainerStyle={styles.container}
					keyboardShouldPersistTaps="handled"
				>
					{/* Header */}
					<View style={styles.header}>
						<TouchableOpacity
							onPress={() => router.replace('/')}
							style={styles.homeButton}
						>
							<Text style={styles.homeButtonText}>home</Text>
						</TouchableOpacity>
						<View style={styles.headerTitleWrap}>
							<Text style={styles.gameName}>
								{getGameDisplayName(game.code, game.name)}
							</Text>
							<Text style={styles.gameCode}>{game.code}</Text>
						</View>
						<TouchableOpacity style={styles.shareButton} onPress={handleShare}>
							<Text style={styles.shareButtonText}>invite</Text>
						</TouchableOpacity>
					</View>

					<PlayerList
						players={players}
						playerId={playerId!}
						hostId={game.hostId}
						onPressPlayer={handlePlayerAction}
					/>

					{/* Prediction pool */}
					{visiblePredictions.length > 0 && (
						<View style={styles.poolGrid}>
							{visiblePredictions.map((p) => (
								<PredictionCard
									key={p.id}
									prediction={p}
									playerId={playerId!}
									submitted={submitted}
									getPlayerName={getPlayerName}
									onDelete={handleDeletePrediction}
									onReact={handleReaction}
									reactionPickerOpen={reactionPickerFor === p.id}
									onTogglePicker={() =>
										setReactionPickerFor(
											reactionPickerFor === p.id ? null : p.id,
										)
									}
									onOpenActions={handlePredictionAction}
								/>
							))}
						</View>
					)}

					{/* Prediction form */}
					{players.length < MIN_PLAYERS ? (
						<Text style={styles.waitingForPlayers}>
							{players.length === 1
								? 'Share the code above to invite your friends!'
								: `You need at least ${MIN_PLAYERS - players.length} more player${MIN_PLAYERS - players.length > 1 ? 's' : ''}.`}
						</Text>
					) : !submitted ? (
						<View style={styles.section}>
							{/* Per-subject progress */}
							<View style={styles.progressRow}>
								{otherPlayers.map((p) => {
									const count = globalCountBySubject.get(p.id) ?? 0;
									const full = count >= REQUIRED_PREDICTIONS_PER_PLAYER;
									return (
										<View
											key={p.id}
											style={[
												styles.progressItem,
												full && styles.progressItemDone,
											]}
										>
											<Text
												style={[
													styles.progressName,
													full && styles.progressNameDone,
												]}
												numberOfLines={1}
											>
												{p.nickname}
											</Text>
											<Text
												style={[
													styles.progressCount,
													full && styles.progressCountDone,
												]}
											>
												{`${count}/${REQUIRED_PREDICTIONS_PER_PLAYER}`}
											</Text>
										</View>
									);
								})}
							</View>

							{/* Bubble input row */}
							<View style={styles.inputRow}>
								<View style={styles.bubbleInputWrap}>
									<TouchableOpacity
										style={styles.subjectBubble}
										onPress={() => setShowSubjectPicker(true)}
									>
										<Text style={styles.subjectBubbleText} numberOfLines={1}>
											{selectedSubject?.nickname ?? '…'} ▾
										</Text>
									</TouchableOpacity>
									<TextInput
										ref={inputRef}
										style={styles.inlineInput}
										placeholder="will…"
										placeholderTextColor={colors.textLight}
										value={predText}
										onChangeText={setPredText}
										returnKeyType="done"
										onSubmitEditing={handleAddPrediction}
										maxLength={MAX_PREDICTION_LENGTH}
										editable={
											!!selectedSubjectId &&
											selectedSubjectCount <
												REQUIRED_PREDICTIONS_PER_PLAYER
										}
									/>
								</View>
								<TouchableOpacity
									style={[
										styles.addButton,
										!canAdd && styles.addButtonDisabled,
									]}
									onPress={handleAddPrediction}
									disabled={!canAdd}
								>
									<Text style={styles.addButtonText}>Add</Text>
								</TouchableOpacity>
							</View>
							{allSubjectsFull && (
								<TouchableOpacity
									onPress={handleMarkDone}
									style={styles.doneEditingButton}
								>
									<Text style={styles.doneEditingText}>done</Text>
								</TouchableOpacity>
							)}
						</View>
					) : (
						<View style={styles.waitingBox}>
							<Text style={styles.waitingTitle}>Predictions submitted!</Text>
							<Text style={styles.waitingText}>
								{!hasEnoughPredictionsToStart
									? `The lobby changed, so there are not enough predictions to start. Each player needs at least ${MIN_CARD_CELLS} visible predictions and enough predictions written about them.`
									: allSubmitted
									? isHost
										? 'Everyone is ready. You can start the game.'
										: 'Everyone is ready. Waiting for the host to start…'
									: 'Waiting for others to finish writing…'}
							</Text>
							{isHost && (
								<TouchableOpacity
									style={[
										styles.startButton,
										(starting || !hasEnoughPredictionsToStart) &&
											styles.buttonDisabled,
									]}
									onPress={handleStartGame}
									disabled={starting || !hasEnoughPredictionsToStart}
								>
									<Text style={styles.startButtonText}>
										{starting ? 'Starting…' : 'Start game'}
									</Text>
								</TouchableOpacity>
							)}
							<TouchableOpacity
								onPress={handleKeepWriting}
								style={styles.keepWritingButton}
							>
								<Text style={styles.keepWritingText}>Edit my predictions</Text>
							</TouchableOpacity>
						</View>
					)}
				</ScrollView>
			</KeyboardAvoidingView>

			<SubjectPickerModal
				visible={showSubjectPicker}
				onClose={() => setShowSubjectPicker(false)}
				players={otherPlayers}
				globalCountBySubject={globalCountBySubject}
				predictionsPerPlayer={REQUIRED_PREDICTIONS_PER_PLAYER}
				onSelect={(id) => {
					setSelectedSubjectId(id);
					setShowSubjectPicker(false);
					setTimeout(() => inputRef.current?.focus(), 100);
				}}
			/>

			<WelcomeModal
				visible={showWelcome}
				onClose={() => setShowWelcome(false)}
				gameCode={game.code}
			/>

			<ReportModal
				visible={!!reportingPrediction || !!reportingPlayer}
				title={
					reportingPrediction
						? 'Report prediction'
						: `Report ${reportingPlayer?.nickname ?? 'player'}`
				}
				onClose={() => {
					setReportingPrediction(null);
					setReportingPlayer(null);
				}}
				onSelect={handleSubmitReport}
			/>

			<ActionModal
				visible={!!actionPrediction}
				title="Prediction options"
				subtitle={actionPrediction ? `"${actionPrediction.text}"` : undefined}
				onClose={() => setActionPrediction(null)}
				actions={
					actionPrediction
						? actionPrediction.authorId === playerId && !submitted
							? [
									{
										label: 'Delete prediction',
										tone: 'destructive' as const,
										onPress: () => handleDeletePrediction(actionPrediction.id),
									},
								]
							: [
									{
										label: 'Report prediction',
										onPress: () => handleReportPrediction(actionPrediction),
									},
								]
						: []
				}
			/>

			<ActionModal
				visible={!!actionPlayer}
				title={actionPlayer?.nickname ?? 'Player options'}
				onClose={() => setActionPlayer(null)}
				actions={
					actionPlayer
						? [
								{
									label: 'Report player',
									onPress: () => handleReportPlayer(actionPlayer),
								},
								...(isHost && actionPlayer.id !== game.hostId
									? [
											{
												label: 'Remove from game',
												tone: 'destructive' as const,
												onPress: () => handleRemovePlayer(actionPlayer),
											},
										]
									: []),
							]
						: []
				}
			/>

			{/* Fixed bottom quit/leave */}
			<TouchableOpacity
				style={styles.quitButton}
				onPress={isHost ? handleCancel : handleLeave}
			>
				<Text style={styles.quitButtonText}>{isHost ? 'cancel' : 'leave'}</Text>
			</TouchableOpacity>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: colors.background },
	flex: { flex: 1 },
	container: { padding: spacing.lg, gap: spacing.lg },

	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	headerTitleWrap: {
		flex: 1,
		alignItems: 'center',
		paddingHorizontal: spacing.sm,
	},
	gameName: {
		fontSize: fontSize.lg,
		fontWeight: '800',
		color: colors.text,
		textAlign: 'center',
	},
	gameCode: {
		fontSize: fontSize.sm,
		fontWeight: '700',
		color: colors.primary,
		letterSpacing: 1.5,
		marginTop: 2,
	},
	shareButton: {
		backgroundColor: colors.primaryLight,
		borderRadius: radius.full,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	shareButtonText: {
		color: colors.primary,
		fontWeight: '700',
		fontSize: fontSize.sm,
	},
	homeButton: {
		backgroundColor: colors.surface,
		borderRadius: radius.full,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderWidth: 1,
		borderColor: colors.border,
	},
	homeButtonText: {
		fontSize: fontSize.sm,
		color: colors.text,
		fontWeight: '700',
	},

	poolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

	section: { gap: spacing.sm },

	progressRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
	progressItem: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.xs,
		backgroundColor: colors.surface,
		borderRadius: radius.full,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.xs,
		borderWidth: 1.5,
		borderColor: colors.border,
	},
	progressItemDone: {
		backgroundColor: colors.primaryLight,
		borderColor: colors.primaryLight,
	},
	progressName: {
		fontSize: fontSize.sm,
		fontWeight: '600',
		color: colors.textLight,
		maxWidth: 80,
	},
	progressNameDone: { color: colors.primary },
	progressCount: { fontSize: fontSize.sm, color: colors.textLight },
	progressCountDone: { color: colors.primary, fontWeight: '700' },

	inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
	bubbleInputWrap: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		borderWidth: 1.5,
		borderColor: colors.border,
		borderRadius: radius.md,
		backgroundColor: colors.background,
		paddingRight: spacing.sm,
		overflow: 'hidden',
	},
	subjectBubble: {
		backgroundColor: colors.primary,
		borderRadius: radius.sm,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs + 2,
		margin: spacing.xs,
		flexShrink: 0,
	},
	subjectBubbleText: {
		color: '#fff',
		fontWeight: '700',
		fontSize: fontSize.sm,
		maxWidth: 100,
	},
	inlineInput: {
		flex: 1,
		fontSize: fontSize.md,
		color: colors.text,
		paddingVertical: spacing.sm,
	},
	addButton: {
		backgroundColor: colors.primary,
		borderRadius: radius.md,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm + 2,
	},
	addButtonDisabled: { opacity: 0.4 },
	addButtonText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },

	waitingBox: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		padding: spacing.lg,
		gap: spacing.md,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: colors.border,
	},
	waitingTitle: {
		fontSize: fontSize.lg,
		fontWeight: '700',
		color: colors.success,
	},
	waitingText: {
		fontSize: fontSize.md,
		color: colors.textLight,
		textAlign: 'center',
	},
	startButton: {
		backgroundColor: colors.secondary,
		borderRadius: radius.lg,
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		alignItems: 'center',
		marginTop: spacing.sm,
	},
	startButtonText: {
		color: colors.text,
		fontSize: fontSize.md,
		fontWeight: '800',
	},
	buttonDisabled: { opacity: 0.6 },
	keepWritingButton: { paddingVertical: spacing.sm },
	keepWritingText: { color: colors.textLight, fontSize: fontSize.sm },

	doneEditingButton: {
		backgroundColor: colors.primary,
		borderRadius: radius.lg,
		paddingVertical: spacing.md,
		alignItems: 'center',
		marginTop: spacing.md,
	},
	doneEditingText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },

	waitingForPlayers: {
		fontSize: fontSize.md,
		color: colors.textLight,
		textAlign: 'center',
		fontStyle: 'italic',
		paddingVertical: spacing.lg,
	},

	quitButton: {
		alignSelf: 'center',
		minWidth: 140,
		paddingHorizontal: spacing.lg,
		marginBottom: spacing.lg,
		paddingVertical: spacing.sm + 2,
		borderRadius: radius.lg,
		backgroundColor: '#FDECEC',
		alignItems: 'center',
		justifyContent: 'center',
		borderTopWidth: 1,
		borderTopColor: 'transparent',
	},
	quitButtonText: {
		color: colors.error,
		fontSize: fontSize.sm,
		fontWeight: '700',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
});
