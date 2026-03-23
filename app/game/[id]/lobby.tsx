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
	Modal,
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
	setReaction,
	REACTION_EMOJIS,
	type ReactionEmoji,
} from '../../../lib/firestore';
import { useGameStore } from '../../../store/gameStore';
import { sendPushNotifications } from '../../../lib/notifications';
import { feedbackDone, feedbackStart } from '../../../lib/feedback';

const PREDICTIONS_PER_PLAYER = 2;
const MIN_PLAYERS = 3;

export default function LobbyScreen() {
	const { id: gameId } = useLocalSearchParams<{ id: string }>();
	const { playerId, isHost, setGame, setPlayers, setPredictions } =
		useGameStore();

	const game = useGameStore((s) => s.game);
	const players = useGameStore((s) => s.players);
	const predictions = useGameStore((s) => s.predictions);

	const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
		null,
	);
	const [predText, setPredText] = useState('');
	const [adding, setAdding] = useState(false);
	const [starting, setStarting] = useState(false);
	const [showWelcome, setShowWelcome] = useState(isHost);
	const [showSubjectPicker, setShowSubjectPicker] = useState(false);
	const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(
		null,
	);

	const inputRef = useRef<TextInput>(null);
	const autoSubmittedRef = useRef(false);

	useEffect(() => {
		if (!gameId) return;
		const onListenerError = () =>
			Alert.alert('Connection error', 'Lost connection to game. Check your internet.');
		const unsubs = [
			listenToGame(gameId, (g) => {
				setGame(g);
				if (g.status === 'active') router.replace(`/game/${gameId}/play`);
				if (g.status === 'cancelled') {
					useGameStore.getState().reset();
					if (isHost) {
						router.replace('/');
					} else {
						Alert.alert('Game cancelled', 'The host cancelled the game.', [
							{ text: 'OK', onPress: () => router.replace('/') },
						]);
					}
				}
			}, onListenerError),
			listenToPlayers(gameId, setPlayers, onListenerError),
			listenToPredictions(gameId, setPredictions, onListenerError),
		];
		return () => unsubs.forEach((u) => u());
	}, [gameId]);

	const otherPlayers = players.filter((p) => p.id !== playerId);
	const me = players.find((p) => p.id === playerId);
	const submitted = me?.predictionsSubmitted ?? false;
	const allSubmitted =
		players.length >= MIN_PLAYERS &&
		players.every((p) => p.predictionsSubmitted);

	// Global prediction count per subject (from all authors)
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
			(p) => (globalCountBySubject.get(p.id) ?? 0) >= PREDICTIONS_PER_PLAYER,
		);

	// Auto-select first subject with room when players load or predictions change
	useEffect(() => {
		if (
			!selectedSubjectId ||
			(globalCountBySubject.get(selectedSubjectId) ?? 0) >=
				PREDICTIONS_PER_PLAYER
		) {
			const first = otherPlayers.find(
				(p) => (globalCountBySubject.get(p.id) ?? 0) < PREDICTIONS_PER_PLAYER,
			);
			if (first) setSelectedSubjectId(first.id);
		}
	}, [players, predictions]);

	// Auto-submit when all subjects reach the global limit
	// editingRef prevents immediate re-submit when user taps "Edit my predictions"
	const editingRef = useRef(false);
	useEffect(() => {
		if (!allSubjectsFull) {
			editingRef.current = false; // pool has gaps again — allow re-auto-submit
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

	// Pool: everything except predictions about the current player
	const visiblePredictions = predictions.filter(
		(p) => p.subjectId !== playerId,
	);

	const handleShare = () => {
		Share.share({
			message: `Join my bingoo!\nCode: ${game?.code}\nbingoo://join/${game?.code}`,
		});
	};

	const handleAddPrediction = async () => {
		if (!playerId || !gameId || !selectedSubjectId || !predText.trim()) return;
		const globalCount = globalCountBySubject.get(selectedSubjectId) ?? 0;
		if (globalCount >= PREDICTIONS_PER_PLAYER) return;
		setAdding(true);
		try {
			await addPrediction(gameId, playerId, selectedSubjectId, predText.trim());
			setPredText('');
			// Auto-advance to next subject if this one is now full
			if (globalCount + 1 >= PREDICTIONS_PER_PLAYER) {
				const next = otherPlayers.find(
					(p) =>
						p.id !== selectedSubjectId &&
						(globalCountBySubject.get(p.id) ?? 0) < PREDICTIONS_PER_PLAYER,
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
		prediction: (typeof predictions)[0],
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

	const handleStartGame = async () => {
		if (!gameId) return;
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
		} catch {
			Alert.alert('Error', 'Could not start game. Try again.');
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
					try {
						await leaveGame(gameId!, playerId!);
						useGameStore.getState().reset();
						router.replace('/');
					} catch {
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
		selectedSubjectCount < PREDICTIONS_PER_PLAYER;

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
							<Text style={styles.homeButtonText}>⌂</Text>
						</TouchableOpacity>
						<Text style={styles.gameCode}>{game.code}</Text>
						<TouchableOpacity style={styles.shareButton} onPress={handleShare}>
							<Text style={styles.shareButtonText}>invite</Text>
						</TouchableOpacity>
					</View>

					{/* Players */}
					<View style={styles.section}>
						<Text style={styles.sectionMeta}>{players.length} players</Text>
						{players.map((p) => (
							<View key={p.id} style={styles.playerRow}>
								<View style={styles.playerNameRow}>
									<Text style={styles.playerName}>{p.nickname}</Text>
									{p.id === playerId && (
										<View style={styles.pillYou}>
											<Text style={styles.pillYouText}>you</Text>
										</View>
									)}
									{p.id === game.hostId && (
										<View style={styles.pillHost}>
											<Text style={styles.pillHostText}>host</Text>
										</View>
									)}
								</View>
								<Text
									style={[
										styles.status,
										p.predictionsSubmitted && styles.statusDone,
									]}
								>
									{p.predictionsSubmitted ? 'Done ✓' : 'Writing…'}
								</Text>
							</View>
						))}
					</View>

					{/* Prediction pool */}
					{visiblePredictions.length > 0 && (
						<View style={styles.section}>
							<View style={styles.poolGrid}>
								{visiblePredictions.map((p) => {
									const myReaction =
										(
											Object.entries(p.reactions ?? {}) as [
												ReactionEmoji,
												string[],
											][]
										).find(([, uids]) => uids.includes(playerId!))?.[0] ?? null;
									const allReactions = (
										Object.entries(p.reactions ?? {}) as [
											ReactionEmoji,
											string[],
										][]
									)
										.map(([emoji, uids]) => ({ emoji, count: uids.length }))
									.filter(({ count }) => count > 0);
									const showPicker = reactionPickerFor === p.id;
									return (
										<View key={p.id} style={styles.poolItem}>
											<View style={styles.poolItemHeader}>
												<Text style={styles.poolAbout}>
													{getPlayerName(p.subjectId)}
												</Text>
												{p.authorId === playerId && !submitted && (
													<TouchableOpacity
														onPress={() => handleDeletePrediction(p.id)}
													>
														<Text style={styles.poolDelete}>✕</Text>
													</TouchableOpacity>
												)}
											</View>
											<Text style={styles.poolText}>{p.text}</Text>
											<Text style={styles.poolAuthor}>
												{p.authorId === playerId
													? 'by you'
													: `by ${getPlayerName(p.authorId)}`}
											</Text>
								<View style={styles.reactionRow}>
									{allReactions.map(({ emoji, count }) => {
										const isMine = myReaction === emoji;
										return isMine ? (
											<TouchableOpacity
												key={emoji}
												style={styles.reactionAddButton}
												onPress={() => setReactionPickerFor(showPicker ? null : p.id)}
											>
												<Text style={styles.reactionAddText}>{emoji} {count}</Text>
											</TouchableOpacity>
										) : (
											<View key={emoji} style={styles.reactionPill}>
												<Text style={styles.reactionPillText}>{emoji} {count}</Text>
											</View>
										);
									})}
									{!myReaction && (
										<TouchableOpacity
											style={styles.reactionAddButton}
											onPress={() => setReactionPickerFor(showPicker ? null : p.id)}
										>
											<Text style={styles.reactionAddText}>+</Text>
										</TouchableOpacity>
									)}
								</View>
											{showPicker && (
												<View style={styles.reactionPicker}>
													{REACTION_EMOJIS.map((emoji) => (
														<TouchableOpacity
															key={emoji}
															onPress={() => handleReaction(p, emoji)}
														>
															<Text
																style={[
																	styles.reactionOption,
																	myReaction === emoji &&
																		styles.reactionOptionActive,
																]}
															>
																{emoji}
															</Text>
														</TouchableOpacity>
													))}
												</View>
											)}
										</View>
									);
								})}
							</View>
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
									const full = count >= PREDICTIONS_PER_PLAYER;
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
												{`${count}/${PREDICTIONS_PER_PLAYER}`}
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
										maxLength={120}
										editable={
											!!selectedSubjectId &&
											selectedSubjectCount < PREDICTIONS_PER_PLAYER
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
								{allSubmitted
									? isHost
										? 'Everyone is ready. You can start the game.'
										: 'Everyone is ready. Waiting for the host to start…'
									: 'Waiting for others to finish writing…'}
							</Text>
							{isHost && (
								<TouchableOpacity
									style={[
										styles.startButton,
										starting && styles.buttonDisabled,
									]}
									onPress={handleStartGame}
									disabled={starting}
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

			{/* Subject picker modal */}
			<Modal
				visible={showSubjectPicker}
				transparent
				animationType="fade"
				onRequestClose={() => setShowSubjectPicker(false)}
			>
				<TouchableOpacity
					style={styles.pickerOverlay}
					activeOpacity={1}
					onPress={() => setShowSubjectPicker(false)}
				>
					<TouchableOpacity style={styles.pickerCard} activeOpacity={1}>
						<Text style={styles.pickerTitle}>Write about…</Text>
						{otherPlayers.map((p) => {
							const count = globalCountBySubject.get(p.id) ?? 0;
							const full = count >= PREDICTIONS_PER_PLAYER;
							return (
								<TouchableOpacity
									key={p.id}
									style={[styles.pickerItem, full && styles.pickerItemFull]}
									onPress={() => {
										if (full) return;
										setSelectedSubjectId(p.id);
										setShowSubjectPicker(false);
										setTimeout(() => inputRef.current?.focus(), 100);
									}}
									disabled={full}
								>
									<Text
										style={[
											styles.pickerItemName,
											full && styles.pickerItemNameFull,
										]}
									>
										{p.nickname}
									</Text>
									<Text
										style={[
											styles.pickerItemCount,
											full && styles.pickerItemCountFull,
										]}
									>
										{full ? '✓ done' : `${count}/${PREDICTIONS_PER_PLAYER}`}
									</Text>
								</TouchableOpacity>
							);
						})}
					</TouchableOpacity>
				</TouchableOpacity>
			</Modal>

			{/* Welcome modal */}
			<Modal
				visible={showWelcome}
				transparent
				animationType="fade"
				onRequestClose={() => setShowWelcome(false)}
			>
				<TouchableOpacity
					style={styles.welcomeOverlay}
					activeOpacity={1}
					onPress={() => setShowWelcome(false)}
				>
					<TouchableOpacity style={styles.welcomeCard} activeOpacity={1}>
						<Text style={styles.welcomeTitle}>all set! 🎉</Text>
						<Text style={styles.welcomeCode}>{game.code}</Text>
						<Text style={styles.welcomeHint}>
							Share this code with your friends so they can join.
						</Text>
						<TouchableOpacity
							style={styles.welcomeShare}
							onPress={() => {
								Share.share({
									message: `Join my bingoo!\nCode: ${game?.code}\nbingoo://join/${game?.code}`,
								}).then(() => setShowWelcome(false));
							}}
						>
							<Text style={styles.welcomeShareText}>share</Text>
						</TouchableOpacity>
						<TouchableOpacity onPress={() => setShowWelcome(false)}>
							<Text style={styles.welcomeDismiss}>got it</Text>
						</TouchableOpacity>
					</TouchableOpacity>
				</TouchableOpacity>
			</Modal>

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
	gameCode: {
		fontSize: fontSize.xl,
		fontWeight: '900',
		color: colors.primary,
		letterSpacing: 3,
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
		width: 36,
		alignItems: 'flex-start',
		justifyContent: 'center',
	},
	homeButtonText: {
		fontSize: 20,
		color: colors.textLight,
	},

	section: { gap: spacing.sm },
	sectionMeta: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},

	playerRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		backgroundColor: colors.surface,
		borderRadius: radius.md,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: colors.border,
	},
	playerNameRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.xs,
	},
	playerName: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
	pillYou: {
		backgroundColor: colors.secondary,
		borderRadius: radius.full,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
	},
	pillYouText: { fontSize: 11, fontWeight: '700', color: colors.text },
	pillHost: {
		backgroundColor: colors.primaryLight,
		borderRadius: radius.full,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
	},
	pillHostText: { fontSize: 11, fontWeight: '700', color: colors.primary },
	status: { fontSize: fontSize.sm, color: colors.textLight },
	statusDone: { color: colors.success, fontWeight: '600' },

	poolGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: spacing.sm,
	},
	poolItem: {
		backgroundColor: colors.surface,
		borderRadius: radius.md,
		padding: spacing.md,
		paddingBottom: spacing.md + 20,
		borderWidth: 1,
		borderColor: colors.border,
		gap: 2,
		width: '48%',
	},
	poolItemHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	poolAbout: {
		fontSize: fontSize.sm,
		color: colors.primary,
		fontWeight: '700',
	},
	poolDelete: {
		color: colors.textLight,
		fontSize: fontSize.md,
		paddingLeft: spacing.sm,
	},
	poolText: { fontSize: fontSize.md, color: colors.text },
	poolAuthor: { fontSize: fontSize.sm, color: colors.textLight, marginTop: 2 },

	reactionRow: {
		position: 'absolute',
		bottom: spacing.sm,
		right: spacing.sm,
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'flex-end',
		alignItems: 'center',
		gap: spacing.xs,
	},
	reactionPill: {
		backgroundColor: colors.surface,
		borderRadius: radius.full,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderWidth: 1,
		borderColor: colors.border,
	},
	reactionPillText: { fontSize: fontSize.sm },
	reactionAddButton: {
		borderRadius: radius.full,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderWidth: 1,
		borderColor: colors.border,
		backgroundColor: colors.background,
	},
	reactionAddText: { fontSize: fontSize.sm, color: colors.textLight },
	reactionPicker: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		backgroundColor: colors.surface,
		borderRadius: radius.md,
		paddingVertical: spacing.xs,
		borderWidth: 1,
		borderColor: colors.border,
		marginTop: spacing.xs,
	},
	reactionOption: { fontSize: 20 },
	reactionOptionActive: { opacity: 0.4 },

	// Progress indicators
	progressRow: {
		flexDirection: 'row',
		gap: spacing.sm,
		flexWrap: 'wrap',
	},
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

	// Bubble input
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
	doneEditingText: {
		color: '#fff',
		fontSize: fontSize.md,
		fontWeight: '700',
	},

	waitingForPlayers: {
		fontSize: fontSize.md,
		color: colors.textLight,
		textAlign: 'center',
		fontStyle: 'italic',
		paddingVertical: spacing.lg,
	},

	// Subject picker modal
	pickerOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: spacing.lg,
	},
	pickerCard: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		padding: spacing.lg,
		width: '100%',
		gap: spacing.sm,
	},
	pickerTitle: {
		fontSize: fontSize.md,
		fontWeight: '700',
		color: colors.text,
		marginBottom: spacing.xs,
	},
	pickerItem: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: spacing.md,
		borderRadius: radius.md,
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.border,
	},
	pickerItemFull: { opacity: 0.4 },
	pickerItemName: {
		fontSize: fontSize.md,
		fontWeight: '600',
		color: colors.text,
	},
	pickerItemNameFull: { color: colors.textLight },
	pickerItemCount: { fontSize: fontSize.sm, color: colors.textLight },
	pickerItemCountFull: { color: colors.success, fontWeight: '600' },

	// Welcome modal
	welcomeOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: spacing.lg,
	},
	welcomeCard: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		padding: spacing.lg,
		width: '100%',
		alignItems: 'center',
		gap: spacing.md,
	},
	welcomeTitle: {
		fontSize: fontSize.lg,
		fontWeight: '700',
		color: colors.text,
	},
	welcomeCode: {
		fontSize: 48,
		fontWeight: '900',
		color: colors.primary,
		letterSpacing: 6,
	},
	welcomeHint: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		textAlign: 'center',
	},
	welcomeShare: {
		backgroundColor: colors.primary,
		borderRadius: radius.lg,
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		alignItems: 'center',
		width: '100%',
	},
	welcomeShareText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md },
	welcomeDismiss: { color: colors.textLight, fontSize: fontSize.md },

	quitButton: {
		alignItems: 'center',
		paddingVertical: spacing.md,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	quitButtonText: {
		color: colors.error,
		fontSize: fontSize.sm,
		fontWeight: '600',
	},
});
