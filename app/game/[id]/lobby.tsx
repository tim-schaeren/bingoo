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
} from '../../../lib/firestore';
import { useGameStore } from '../../../store/gameStore';

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
	const [markingDone, setMarkingDone] = useState(false);
	const [starting, setStarting] = useState(false);

	const inputRef = useRef<TextInput>(null);

	useEffect(() => {
		if (!gameId) return;
		const unsubs = [
			listenToGame(gameId, (g) => {
				setGame(g);
				if (g.status === 'active') router.replace(`/game/${gameId}/play`);
				if (g.status === 'cancelled') {
					Alert.alert('Game cancelled', 'The host cancelled the game.', [
						{ text: 'OK', onPress: () => router.replace('/') },
					]);
				}
			}),
			listenToPlayers(gameId, setPlayers),
			listenToPredictions(gameId, setPredictions),
		];
		return () => unsubs.forEach((u) => u());
	}, [gameId]);

	// Auto-select first other player when players load
	useEffect(() => {
		if (selectedSubjectId) return;
		const first = players.find((p) => p.id !== playerId);
		if (first) setSelectedSubjectId(first.id);
	}, [players]);

	const otherPlayers = players.filter((p) => p.id !== playerId);
	const me = players.find((p) => p.id === playerId);
	const submitted = me?.predictionsSubmitted ?? false;
	const allSubmitted =
		players.length > 1 && players.every((p) => p.predictionsSubmitted);

	const getPlayerName = (pid: string | undefined) =>
		players.find((p) => p.id === pid)?.nickname ?? '…';

	// Pool: everything except predictions about the current player
	const visiblePredictions = predictions.filter(
		(p) => p.subjectId !== playerId,
	);

	// My contributions: which other players I've written about
	const coveredIds = new Set(
		predictions.filter((p) => p.authorId === playerId).map((p) => p.subjectId),
	);

	// Enough predictions in the pool for a 2×2 minimum grid
	const minVisible = players.reduce(
		(min, p) => {
			const count = predictions.filter(
				(pred) => pred.subjectId !== p.id,
			).length;
			return Math.min(min, count);
		},
		players.length > 0 ? Infinity : 0,
	);
	const enoughPredictions = minVisible >= 4;

	const handleShare = () => {
		Share.share({
			message: `Join my bingoo!\nCode: ${game?.code}\nbingoo://join/${game?.code}`,
		});
	};

	const handleAddPrediction = async () => {
		if (!playerId || !gameId || !selectedSubjectId || !predText.trim()) return;
		setAdding(true);
		try {
			await addPrediction(gameId, playerId, selectedSubjectId, predText.trim());
			setPredText('');
			inputRef.current?.focus();
		} catch {
			Alert.alert('Error', 'Could not add prediction. Try again.');
		} finally {
			setAdding(false);
		}
	};

	const handleMarkDone = async () => {
		if (!playerId || !gameId) return;
		setMarkingDone(true);
		try {
			await markPlayerDone(gameId, playerId);
		} catch {
			Alert.alert('Error', 'Could not save. Try again.');
			setMarkingDone(false);
		}
	};

	const handleKeepWriting = async () => {
		if (!playerId || !gameId) return;
		try {
			await markPlayerWriting(gameId, playerId);
			setMarkingDone(false);
		} catch {
			Alert.alert('Error', 'Could not update. Try again.');
		}
	};

	const handleDeletePrediction = (predictionId: string) => {
		if (!gameId) return;
		Alert.alert('Remove prediction', 'Delete this from the pool?', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: () => deletePrediction(gameId, predictionId).catch(() => {
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
		setStarting(true);
		try {
			await startGame(gameId, players, predictions);
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
	const canAdd = !!selectedSubjectId && predText.trim().length > 0 && !adding;

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
						<Text style={styles.gameCode}>{game.code}</Text>
						<View style={styles.headerActions}>
							<TouchableOpacity
								style={styles.shareButton}
								onPress={handleShare}
							>
								<Text style={styles.shareButtonText}>invite</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.leaveButton}
								onPress={isHost ? handleCancel : handleLeave}
							>
								<Text style={styles.leaveButtonText}>
									{isHost ? 'Quit' : 'Leave'}
								</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Players */}
					<View style={styles.section}>
						<Text style={styles.sectionMeta}>{players.length} players</Text>
						{players.map((p) => (
							<View key={p.id} style={styles.playerRow}>
								<Text style={styles.playerName}>
									{p.nickname}
									{p.id === playerId ? ' (you)' : ''}
									{p.id === game.hostId ? ' · host' : ''}
								</Text>
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
					<View style={styles.section}>
						<Text style={styles.sectionMeta}>
							{visiblePredictions.length} predictions in pool
						</Text>
						{visiblePredictions.length === 0 ? (
							<Text style={styles.hint}>
								No predictions yet. Add the first one!
							</Text>
						) : (
							visiblePredictions.map((p) => (
								<View key={p.id} style={styles.poolItem}>
									<View style={styles.poolItemHeader}>
										<Text style={styles.poolAbout}>
											about {getPlayerName(p.subjectId)}
										</Text>
										{p.authorId === playerId && !submitted && (
											<TouchableOpacity onPress={() => handleDeletePrediction(p.id)}>
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
								</View>
							))
						)}
					</View>

					{/* Add prediction form */}
					{!submitted ? (
						<View style={styles.section}>
							{/* Subject chips */}
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								style={styles.chipScroll}
							>
								{otherPlayers.map((p) => {
									const active = selectedSubjectId === p.id;
									const covered = coveredIds.has(p.id);
									return (
										<TouchableOpacity
											key={p.id}
											style={[styles.chip, active && styles.chipActive]}
											onPress={() => {
												setSelectedSubjectId(p.id);
												inputRef.current?.focus();
											}}
										>
											<Text
												style={[
													styles.chipText,
													active && styles.chipTextActive,
												]}
											>
												about {p.nickname}
												{covered ? ' ✓' : ''}
											</Text>
										</TouchableOpacity>
									);
								})}
							</ScrollView>

							{/* Text input */}
							<View style={styles.inputRow}>
								<TextInput
									ref={inputRef}
									style={styles.predictionInput}
									placeholder={
										selectedSubject
											? `e.g. ${selectedSubject.nickname} will oversleep`
											: 'Select a player above'
									}
									placeholderTextColor={colors.textLight}
									value={predText}
									onChangeText={setPredText}
									returnKeyType="done"
									onSubmitEditing={handleAddPrediction}
									maxLength={120}
									editable={!!selectedSubjectId}
								/>
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

							{/* Done button */}
							<TouchableOpacity
								style={[
									styles.doneButton,
									markingDone && styles.buttonDisabled,
								]}
								onPress={handleMarkDone}
								disabled={markingDone}
							>
								<Text style={styles.doneButtonText}>
									{markingDone ? 'Saving…' : "I'm done writing predictions"}
								</Text>
							</TouchableOpacity>
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
							{isHost && enoughPredictions && (
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
							{isHost && !enoughPredictions && (
								<Text style={styles.notEnoughHint}>
									Waiting for more predictions before you can start (need{' '}
									{Math.max(0, 4 - minVisible)} more).
								</Text>
							)}
							<TouchableOpacity
								onPress={handleKeepWriting}
								style={styles.keepWritingButton}
							>
								<Text style={styles.keepWritingText}>
									Keep writing predictions
								</Text>
							</TouchableOpacity>
						</View>
					)}
				</ScrollView>
			</KeyboardAvoidingView>
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
	headerActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	leaveButton: {
		borderRadius: radius.full,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	leaveButtonText: {
		color: colors.error,
		fontWeight: '600',
		fontSize: fontSize.sm,
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

	section: { gap: spacing.sm },
	sectionMeta: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	hint: { fontSize: fontSize.sm, color: colors.textLight, fontStyle: 'italic' },
	notEnoughHint: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		textAlign: 'center',
		fontStyle: 'italic',
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
	playerName: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
	status: { fontSize: fontSize.sm, color: colors.textLight },
	statusDone: { color: colors.success, fontWeight: '600' },

	poolItem: {
		backgroundColor: colors.surface,
		borderRadius: radius.md,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: colors.border,
		gap: 2,
	},
	poolItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	poolAbout: {
		fontSize: fontSize.sm,
		color: colors.primary,
		fontWeight: '700',
	},
	poolDelete: { color: colors.textLight, fontSize: fontSize.md, paddingLeft: spacing.sm },
	poolText: { fontSize: fontSize.md, color: colors.text },
	poolAuthor: { fontSize: fontSize.sm, color: colors.textLight, marginTop: 2 },

	chipScroll: { marginBottom: spacing.xs },
	chip: {
		borderRadius: radius.full,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderWidth: 1.5,
		borderColor: colors.border,
		backgroundColor: colors.surface,
		marginRight: spacing.sm,
	},
	chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
	chipText: {
		fontSize: fontSize.sm,
		fontWeight: '600',
		color: colors.textLight,
	},
	chipTextActive: { color: '#fff' },

	inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
	predictionInput: {
		flex: 1,
		borderWidth: 1.5,
		borderColor: colors.border,
		borderRadius: radius.sm,
		padding: spacing.sm,
		fontSize: fontSize.md,
		color: colors.text,
		backgroundColor: colors.background,
	},
	addButton: {
		backgroundColor: colors.primary,
		borderRadius: radius.md,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm + 2,
	},
	addButtonDisabled: { opacity: 0.4 },
	addButtonText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },

	doneButton: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		padding: spacing.md,
		alignItems: 'center',
		borderWidth: 1.5,
		borderColor: colors.border,
		marginTop: spacing.xs,
	},
	doneButtonText: {
		color: colors.text,
		fontSize: fontSize.md,
		fontWeight: '600',
	},

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
});
