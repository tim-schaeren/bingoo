import React, { useEffect, useRef, useState } from 'react';
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	Dimensions,
	ScrollView,
	ActivityIndicator,
	Alert,
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
	getCard,
} from '../../../lib/firestore';
import { getWinningLine } from '../../../lib/gameLogic';
import { useGameStore } from '../../../store/gameStore';
import { BrandWordmark } from '../../../components/BrandWordmark';


const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = spacing.lg * 2;

interface WinnerCard {
	id: string;
	nickname: string;
	grid: string[];
}

export default function WinnerScreen() {
	const { id: gameId } = useLocalSearchParams<{ id: string }>();
	const membership = useGameStore((s) =>
		gameId ? s.memberships.find((saved) => saved.gameId === gameId) : undefined,
	);
	const playerId = membership?.playerId ?? null;
	const setGame = useGameStore((s) => s.setGame);
	const setMarks = useGameStore((s) => s.setMarks);
	const setPredictions = useGameStore((s) => s.setPredictions);
	const setPlayers = useGameStore((s) => s.setPlayers);
	const removeMembership = useGameStore((s) => s.removeMembership);
	const setCurrentGame = useGameStore((s) => s.setCurrentGame);

	const game = useGameStore((s) => s.game);
	const marks = useGameStore((s) => s.marks);
	const predictions = useGameStore((s) => s.predictions);
	const players = useGameStore((s) => s.players);

	const [winnerCards, setWinnerCards] = useState<WinnerCard[]>([]);
	const [loadingCards, setLoadingCards] = useState(true);
	const [carouselIndex, setCarouselIndex] = useState(0);
	const [showOwnCard, setShowOwnCard] = useState(false);
	const [ownCard, setOwnCard] = useState<string[] | null>(null);
	const carouselRef = useRef<ScrollView>(null);
	const cardRef = useRef<View>(null);

	useEffect(() => {
		if (!gameId) return;
		setCurrentGame(gameId);
		const unsubs = [
			listenToGame(gameId, setGame),
			listenToMarks(gameId, setMarks),
			listenToPlayers(gameId, setPlayers),
			listenToPredictions(gameId, setPredictions),
		];
		return () => unsubs.forEach((u) => u());
	}, [gameId, setCurrentGame, setGame, setMarks, setPlayers, setPredictions]);

	const winners = game?.winners ?? [];
	const isMe = winners.some((w) => w.id === playerId);

	useEffect(() => {
		if (!gameId || winners.length === 0) return;

		// Sort so current player's card comes first
		const sorted = [...winners].sort((a, b) => {
			if (a.id === playerId) return -1;
			if (b.id === playerId) return 1;
			return 0;
		});

		Promise.all(
			sorted.map((w) =>
				getCard(gameId, w.id).then((grid) => (grid ? { ...w, grid } : null)),
			),
		).then((results) => {
			setWinnerCards(results.filter(Boolean) as WinnerCard[]);
			setLoadingCards(false);
		});
	}, [gameId, winners.length]);

	useEffect(() => {
		if (!gameId || !playerId) return;
		getCard(gameId, playerId).then((grid) => {
			if (grid) setOwnCard(grid);
		});
	}, [gameId, playerId]);

	const handleShare = async () => {
		if (!cardRef.current) return;
		try {
			const captured = await captureRef(cardRef, { format: 'jpg', quality: 0.9 });
			const reencoded = await ImageManipulator.manipulateAsync(
				captured,
				[],
				{ compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
			);
			await Sharing.shareAsync(reencoded.uri, {
				mimeType: 'image/jpeg',
				UTI: 'public.jpeg',
			});
		} catch (e) {
			Alert.alert('Error', String(e));
		}
	};

	const markedIds = new Set(marks.map((m) => m.predictionId));
	const gridSize = game?.gridSize ?? 4;
	const cellSize = (SCREEN_WIDTH - GRID_PADDING) / gridSize - spacing.xs;

	const getPlayerName = (pid: string | undefined) =>
		players.find((p) => p.id === pid)?.nickname ?? '…';

	const getPredictionText = (predictionId: string) => {
		const pred = predictions.find((p) => p.id === predictionId);
		if (!pred) return '…';
		return `${getPlayerName(pred.subjectId)} ${pred.text}`;
	};

	const showToggle = !(isMe && winners.length === 1);
	const ownWinnerCard: WinnerCard | null =
		ownCard && playerId
			? { id: playerId, nickname: 'you', grid: ownCard }
			: null;

	const handlePlayAgain = () => {
		if (gameId) removeMembership(gameId);
		router.replace('/');
	};

	if (!game || loadingCards) {
		return (
			<SafeAreaView style={styles.safe}>
				<ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
			</SafeAreaView>
		);
	}

	const renderCard = (wc: WinnerCard, isWinningCard = true) => {
		const winLine = getWinningLine(wc.grid, markedIds, gridSize);
		const isMyCard = wc.id === playerId;
		const label = isMyCard
			? isWinningCard
				? 'Your winning card'
				: 'Your card'
			: `their winning card`;

		return (
			<View
				key={wc.id}
				style={[styles.cardPage, { width: SCREEN_WIDTH - spacing.lg * 2 }]}
			>
				<Text style={styles.cardLabel}>{label}</Text>
				<View style={styles.grid}>
					{wc.grid.map((predictionId, i) => {
						const isMarked = markedIds.has(predictionId);
						const isWinCell = winLine?.includes(i) ?? false;
						return (
							<View
								key={predictionId}
								style={[
									styles.cell,
									{ width: cellSize, height: cellSize },
									isMarked && styles.cellMarked,
									isWinCell && styles.cellWin,
								]}
							>
								<Text
									style={[
										styles.cellText,
										isMarked && styles.cellTextMarked,
										isWinCell && styles.cellTextWin,
									]}
									numberOfLines={4}
									adjustsFontSizeToFit
									minimumFontScale={0.6}
								>
									{getPredictionText(predictionId)}
								</Text>
							</View>
						);
					})}
				</View>
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.safe}>
			<ScrollView contentContainerStyle={styles.container}>
				<View style={styles.header}>
					<TouchableOpacity style={styles.homeButton} onPress={handlePlayAgain}>
						<Text style={styles.homeButtonText}>home</Text>
					</TouchableOpacity>
				</View>

				{/* Winner banner */}
				<View style={styles.banner}>
					<BrandWordmark style={styles.bingoo} suffix="!" />
					<Text style={styles.winnerLabel}>
						{isMe
							? winners.length > 1
								? `You tied with ${winners
										.filter((w) => w.id !== playerId)
										.map((w) => w.nickname)
										.join(' & ')}!`
								: 'You won!'
							: winners.length === 1
								? `${winners[0].nickname} won!`
								: winners.map((w) => w.nickname).join(' & ') + ' tied!'}
					</Text>
				</View>

				{/* Card(s) */}
				<View
					ref={cardRef}
					collapsable={false}
					style={{ backgroundColor: colors.background }}
				>
					{showOwnCard && ownWinnerCard ? (
						<View style={styles.cardSection}>
							{renderCard(ownWinnerCard, isMe)}
						</View>
					) : winnerCards.length === 1 ? (
						<View style={styles.cardSection}>{renderCard(winnerCards[0])}</View>
					) : winnerCards.length > 1 ? (
						<View style={styles.cardSection}>
							<ScrollView
								ref={carouselRef}
								horizontal
								pagingEnabled
								showsHorizontalScrollIndicator={false}
								onMomentumScrollEnd={(e) => {
									const page = Math.round(
										e.nativeEvent.contentOffset.x /
											(SCREEN_WIDTH - spacing.lg * 2),
									);
									setCarouselIndex(page);
								}}
							>
								{winnerCards.map((wc) => renderCard(wc))}
							</ScrollView>
							<View style={styles.dots}>
								{winnerCards.map((_, i) => (
									<View
										key={i}
										style={[
											styles.dot,
											i === carouselIndex && styles.dotActive,
										]}
									/>
								))}
							</View>
						</View>
					) : null}
				</View>

				{/* Toggle: winner's card / your card */}
				{showToggle && ownWinnerCard && (
					<View style={styles.segmentedControl}>
						<TouchableOpacity
							style={[
								styles.segment,
								!showOwnCard && styles.segmentActivePurple,
							]}
							onPress={() => setShowOwnCard(false)}
							activeOpacity={0.7}
						>
							<Text
								style={[
									styles.segmentText,
									!showOwnCard && styles.segmentTextActivePurple,
								]}
							>
								{winners.length > 1 ? "winners' cards" : "winner's card"}
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								styles.segment,
								showOwnCard && styles.segmentActiveYellow,
							]}
							onPress={() => setShowOwnCard(true)}
							activeOpacity={0.7}
						>
							<Text
								style={[
									styles.segmentText,
									showOwnCard && styles.segmentTextActiveYellow,
								]}
							>
								your card
							</Text>
						</TouchableOpacity>
					</View>
				)}

				<TouchableOpacity style={styles.shareButton} onPress={handleShare}>
					<Text style={styles.shareButtonText}>share card</Text>
				</TouchableOpacity>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: colors.background },
	container: { padding: spacing.lg, gap: spacing.xl, alignItems: 'center' },

	banner: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
	emoji: { fontSize: 64 },
	winnerLabel: {
		fontSize: fontSize.xl,
		fontWeight: '700',
		color: colors.text,
		textAlign: 'center',
	},
	bingoo: {
		fontSize: 52,
		fontWeight: '900',
		color: colors.primary,
		letterSpacing: -1,
	},

	cardSection: { width: '100%', alignItems: 'center', gap: spacing.md },
	cardPage: { alignItems: 'center', gap: spacing.sm },
	cardLabel: {
		fontSize: fontSize.md,
		fontWeight: '600',
		color: colors.textLight,
	},

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
	cellTextMarked: { color: colors.markedText, fontWeight: '700' },
	cellTextWin: { color: colors.text, fontWeight: '700' },

	dots: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' },
	dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
	dotActive: { backgroundColor: colors.primary },

	segmentedControl: {
		flexDirection: 'row',
		backgroundColor: colors.primaryLight,
		borderRadius: radius.full,
		padding: 3,
		alignSelf: 'center',
	},
	segment: {
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.lg,
		alignItems: 'center',
		borderRadius: radius.full,
	},
	segmentActivePurple: {
		backgroundColor: colors.primary,
	},
	segmentActiveYellow: {
		backgroundColor: colors.secondary,
	},
	segmentText: {
		fontSize: fontSize.md,
		fontWeight: '600',
		color: colors.primary,
	},
	segmentTextActivePurple: {
		color: '#fff',
		fontWeight: '700',
	},
	segmentTextActiveYellow: {
		color: '#fff',
		fontWeight: '700',
	},

	shareButton: {
		borderRadius: radius.lg,
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		alignItems: 'center',
		borderWidth: 1.5,
		borderColor: colors.border,
	},
	shareButtonText: {
		color: colors.text,
		fontSize: fontSize.md,
		fontWeight: '700',
	},

	header: {
		width: '100%',
		alignItems: 'flex-start',
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
});
