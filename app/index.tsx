import React, { useEffect, useRef, useState } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	StyleSheet,
	ScrollView,
	Alert,
	KeyboardAvoidingView,
	Platform,
	Image,
	ActivityIndicator,
	Linking,
	Animated,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Constants from 'expo-constants';
import { colors, spacing, radius, fontSize } from '../constants/theme';
import {
	createGame,
	cancelGame,
	getGameByCode,
	isGameBannedError,
	isGameFullError,
	joinGame,
	leaveGame,
	type Game,
} from '../lib/firestore';
import {
	MAX_MEMBERSHIPS,
	type SavedMembership,
	useGameStore,
} from '../store/gameStore';

const PRIVACY_POLICY_URL =
	'https://tim-schaeren.github.io/bingoo/privacy-policy.html';
const COMMUNITY_GUIDELINES_URL =
	'https://tim-schaeren.github.io/bingoo/community-guidelines.html';
const FEEDBACK_EMAIL = 'argyles.twigs9p@icloud.com';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

type Mode = 'home' | 'create' | 'join';

interface SavedSessionSummary {
	membership: SavedMembership;
	game: Game;
}

const RULES = [
	{
		emoji: '✍️',
		text: 'Players write predictions about each other.\nYou cannot see predictions about yourself.',
	},
	{
		emoji: '🃏',
		text: 'When the game starts, everyone gets a random bingoo card filled with predictions.',
	},
	{
		emoji: '✓',
		text: 'Once a prediction comes true, mark it on the bingoo card.\nIt will also be marked for everyone else.',
	},
	{
		emoji: '🎉',
		text: 'First player to complete a row, column,\nor diagonal wins!',
	},
];

function routeForGame(gameId: string, status: string): string | null {
	if (status === 'lobby') return `/game/${gameId}/lobby`;
	if (status === 'active') return `/game/${gameId}/play`;
	return null;
}

function getGameDisplayName(game: Game): string {
	return game.name?.trim() || `Game ${game.code}`;
}

export default function HomeScreen() {
	const [mode, setMode] = useState<Mode>('home');
	const [gameName, setGameName] = useState('');
	const [nickname, setNickname] = useState('');
	const [joinCode, setJoinCode] = useState('');
	const [loading, setLoading] = useState(false);
	const [rulesOpen, setRulesOpen] = useState(false);
	const [infoOpen, setInfoOpen] = useState(false);
	const [acceptedPolicies, setAcceptedPolicies] = useState(false);
	const [sessionSummaries, setSessionSummaries] = useState<
		SavedSessionSummary[]
	>([]);
	const [loadingSessions, setLoadingSessions] = useState(true);

	const {
		memberships,
		pushToken,
		currentGameId,
		upsertMembership,
		removeMembership,
		setCurrentGame,
	} = useGameStore();

	const iconAnim = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		const timer = setTimeout(() => {
			Animated.timing(iconAnim, {
				toValue: 0,
				duration: 400,
				useNativeDriver: false,
			}).start();
		}, 800);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		let cancelled = false;

		const loadSessions = async () => {
			if (memberships.length === 0) {
				setSessionSummaries([]);
				setLoadingSessions(false);
				return;
			}

			setLoadingSessions(true);
			const nextSummaries: SavedSessionSummary[] = [];
			const staleGameIds: string[] = [];

			for (const membership of memberships) {
				try {
					const snap = await getDoc(doc(db, 'games', membership.gameId));
					if (!snap.exists()) {
						staleGameIds.push(membership.gameId);
						continue;
					}

					const game = { id: snap.id, ...snap.data() } as Game;
					if (game.status === 'finished' || game.status === 'cancelled') {
						staleGameIds.push(membership.gameId);
						continue;
					}

					nextSummaries.push({ membership, game });
				} catch (error) {
					const code =
						error instanceof Error && 'code' in error
							? (error as Error & { code?: string }).code
							: undefined;
					if (code === 'permission-denied') {
						staleGameIds.push(membership.gameId);
					}
				}
			}

			if (cancelled) return;

			if (staleGameIds.length > 0) {
				staleGameIds.forEach((gameId) => removeMembership(gameId));
			}

			setSessionSummaries(nextSummaries);
			setLoadingSessions(false);
		};

		loadSessions();

		return () => {
			cancelled = true;
		};
	}, [memberships, removeMembership]);

	const canAddMembership = memberships.length < MAX_MEMBERSHIPS;

	const showMembershipLimitAlert = () => {
		Alert.alert(
			'Game limit reached',
			`You can only be part of ${MAX_MEMBERSHIPS} games at the same time. Leave one first.`,
		);
	};

	const clearRemovedSession = (gameId: string) => {
		removeMembership(gameId);
		Alert.alert('Removed from game', 'The host of the game removed you.', [
			{ text: 'OK' },
		]);
	};

	const handleResume = async (membership: SavedMembership) => {
		setLoading(true);
		try {
			const snap = await getDoc(doc(db, 'games', membership.gameId));
			if (!snap.exists()) {
				removeMembership(membership.gameId);
				return;
			}

			const game = { id: snap.id, ...snap.data() } as Game;
			const route = routeForGame(membership.gameId, game.status);
			if (!route) {
				removeMembership(membership.gameId);
				return;
			}

			try {
				await getDoc(
					doc(db, 'games', membership.gameId, 'players', membership.playerId),
				);
			} catch (error) {
				const code =
					error instanceof Error && 'code' in error
						? (error as Error & { code?: string }).code
						: undefined;
				if (code === 'permission-denied') {
					clearRemovedSession(membership.gameId);
					return;
				}
				throw error;
			}

			setCurrentGame(membership.gameId);
			router.replace(route);
		} catch (error) {
			const code =
				error instanceof Error && 'code' in error
					? (error as Error & { code?: string }).code
					: undefined;
			if (code === 'permission-denied') {
				clearRemovedSession(membership.gameId);
				return;
			}
			Alert.alert('Error', 'Could not resume game. Check your connection.');
		} finally {
			setLoading(false);
		}
	};

	const handleLeaveSavedSession = async (membership: SavedMembership) => {
		setLoading(true);
		try {
			const snap = await getDoc(doc(db, 'games', membership.gameId));
			if (!snap.exists()) {
				removeMembership(membership.gameId);
				return;
			}

			const game = snap.data() as Game;
			if (game.status === 'lobby') {
				try {
					if (membership.isHost) {
						await cancelGame(membership.gameId);
					} else {
						await leaveGame(membership.gameId, membership.playerId);
					}
				} catch (error) {
					const code =
						error instanceof Error && 'code' in error
							? (error as Error & { code?: string }).code
							: undefined;
					if (code === 'permission-denied') {
						removeMembership(membership.gameId);
						return;
					}
					throw error;
				}
			}

			removeMembership(membership.gameId);
		} catch (error) {
			const code =
				error instanceof Error && 'code' in error
					? (error as Error & { code?: string }).code
					: undefined;
			if (code === 'permission-denied') {
				removeMembership(membership.gameId);
				return;
			}
			Alert.alert(
				'Error',
				'Could not leave the saved game. Check your connection.',
			);
		} finally {
			setLoading(false);
		}
	};

	const openSessionActions = (summary: SavedSessionSummary) => {
		const quitLabel =
			summary.membership.isHost && summary.game.status === 'lobby'
				? 'Close lobby'
				: 'Quit';
		const description =
			summary.membership.isHost && summary.game.status === 'lobby'
				? `Closing this lobby will remove all players from ${getGameDisplayName(summary.game)}.`
				: `${summary.membership.nickname} in ${summary.game.hostNickname}'s game`;
		Alert.alert(getGameDisplayName(summary.game), description, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: quitLabel,
				style: 'destructive',
				onPress: () => handleLeaveSavedSession(summary.membership),
			},
		]);
	};

	const handleCreate = async () => {
		if (!gameName.trim()) {
			Alert.alert('Missing game name', 'Enter a name before creating a game.');
			return;
		}
		if (!nickname.trim()) {
			Alert.alert(
				'Missing nickname',
				'Enter a nickname before creating a game.',
			);
			return;
		}
		if (!acceptedPolicies) {
			Alert.alert(
				'Agree first',
				'Please agree to the community rules and privacy policy before creating a game.',
			);
			return;
		}
		if (!canAddMembership) {
			showMembershipLimitAlert();
			return;
		}

		setLoading(true);
		try {
			const { gameId, playerId } = await createGame(
				gameName.trim(),
				nickname.trim(),
				pushToken,
			);
			upsertMembership({
				gameId,
				playerId,
				nickname: nickname.trim(),
				isHost: true,
			});
			router.replace(`/game/${gameId}/lobby?welcome=1`);
		} catch {
			Alert.alert(
				'Error',
				'Could not create game. Check your connection and try again.',
			);
		} finally {
			setLoading(false);
		}
	};

	const handleJoin = async () => {
		if (!nickname.trim()) {
			Alert.alert('Missing nickname', 'Enter a nickname before joining.');
			return;
		}
		if (!joinCode.trim()) {
			Alert.alert('Missing code', 'Enter the game code your friend shared.');
			return;
		}
		if (!acceptedPolicies) {
			Alert.alert(
				'Agree first',
				'Please agree to the community rules and privacy policy before joining a game.',
			);
			return;
		}

		setLoading(true);
		try {
			const game = await getGameByCode(joinCode.trim());
			if (!game) {
				Alert.alert(
					'Not found',
					'No game with that code. Double-check and try again.',
				);
				return;
			}
			if (game.status !== 'lobby') {
				Alert.alert(
					'Too late',
					'This game has already started. Ask your friends for the next one!',
				);
				return;
			}

			const existingMembership = memberships.find(
				(membership) => membership.gameId === game.id,
			);
			if (existingMembership) {
				setCurrentGame(game.id);
				router.replace(`/game/${game.id}/lobby`);
				return;
			}

			if (!canAddMembership) {
				showMembershipLimitAlert();
				return;
			}

			const { playerId } = await joinGame(game.id, nickname.trim(), pushToken);
			upsertMembership({
				gameId: game.id,
				playerId,
				nickname: nickname.trim(),
				isHost: false,
			});
			router.replace(`/game/${game.id}/lobby`);
		} catch (error) {
			if (isGameBannedError(error)) {
				Alert.alert('Removed from game', error.message);
				return;
			}
			if (isGameFullError(error)) {
				Alert.alert('Lobby full', error.message);
				return;
			}
			Alert.alert(
				'Error',
				'Could not join game. Check your connection and try again.',
			);
		} finally {
			setLoading(false);
		}
	};

	const renderHomeActions = () => (
		<View style={styles.actions}>
			{!canAddMembership && (
				<Text style={styles.sessionCount}>
					You've reached the {MAX_MEMBERSHIPS}-game limit. Leave one to join or
					create another.
				</Text>
			)}
			<TouchableOpacity
				style={[
					styles.primaryButton,
					(!canAddMembership || loading) && styles.buttonDisabled,
				]}
				onPress={() =>
					canAddMembership ? setMode('create') : showMembershipLimitAlert()
				}
				disabled={loading}
			>
				<Text style={styles.primaryButtonText}>create</Text>
			</TouchableOpacity>
			<TouchableOpacity
				style={[
					styles.secondaryButton,
					(!canAddMembership || loading) && styles.buttonDisabled,
				]}
				onPress={() =>
					canAddMembership ? setMode('join') : showMembershipLimitAlert()
				}
				disabled={loading}
			>
				<Text style={styles.secondaryButtonText}>join</Text>
			</TouchableOpacity>
		</View>
	);

	return (
		<SafeAreaView style={styles.safe}>
			<KeyboardAvoidingView
				style={styles.flex}
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			>
				<ScrollView
					contentContainerStyle={
						mode === 'home' ? styles.container : styles.containerForm
					}
					keyboardShouldPersistTaps="handled"
				>
					{mode === 'home' ? (
						<View style={styles.homeMain}>
							<View style={styles.header}>
								<Animated.View
									style={{
										opacity: iconAnim,
										height: iconAnim.interpolate({
											inputRange: [0, 1],
											outputRange: [0, 240],
										}),
										marginBottom: iconAnim.interpolate({
											inputRange: [0, 1],
											outputRange: [0, spacing.sm],
										}),
										overflow: 'hidden',
									}}
								>
									<Image
										source={require('../assets/icon_no_bg.png')}
										style={styles.logoImage}
									/>
								</Animated.View>
								<Text style={styles.logo}>bingoo</Text>
								<Text style={styles.tagline}>
									your friends know you too well.
								</Text>
							</View>

							{sessionSummaries.length > 0 ? (
								<View style={styles.sessionSection}>
									<View style={styles.sessionSectionHeader}>
										{loadingSessions && (
											<ActivityIndicator color={colors.primary} size="small" />
										)}
									</View>
									<View style={styles.sessionList}>
										{sessionSummaries.map((summary) => (
											<TouchableOpacity
												key={summary.membership.gameId}
												style={[
													styles.sessionCard,
													currentGameId === summary.membership.gameId &&
														styles.sessionCardCurrent,
												]}
												onPress={() => handleResume(summary.membership)}
												activeOpacity={0.85}
											>
												<View style={styles.sessionCardTop}>
													<View style={styles.sessionCardBody}>
														<View style={styles.sessionTitleRow}>
															<Text style={styles.sessionTitle}>
																{getGameDisplayName(summary.game)}
															</Text>
														</View>
														<Text style={styles.sessionCode}>
															{summary.game.code}
														</Text>
														<Text style={styles.sessionMeta}>
															{summary.membership.isHost
																? 'You are the host'
																: `Hosted by ${summary.game.hostNickname}`}
															{' · '}
															Playing as {summary.membership.nickname}
														</Text>
													</View>
												</View>
												<View style={styles.sessionTrashSlot}>
													<TouchableOpacity
														style={styles.sessionTrashButton}
														onPress={() => openSessionActions(summary)}
														hitSlop={8}
													>
														<View style={styles.sessionTrashIcon}>
															<View style={styles.sessionTrashLid} />
															<View style={styles.sessionTrashBody}>
																<View style={styles.sessionTrashLine} />
																<View style={styles.sessionTrashLine} />
																<View style={styles.sessionTrashLine} />
															</View>
														</View>
													</TouchableOpacity>
												</View>
											</TouchableOpacity>
										))}
									</View>
									{renderHomeActions()}
								</View>
							) : (
								renderHomeActions()
							)}
						</View>
					) : (
						<View style={styles.header}>
							<Animated.View
								style={{
									opacity: iconAnim,
									height: iconAnim.interpolate({
										inputRange: [0, 1],
										outputRange: [0, 240],
									}),
									marginBottom: iconAnim.interpolate({
										inputRange: [0, 1],
										outputRange: [0, spacing.sm],
									}),
									overflow: 'hidden',
								}}
							>
								<Image
									source={require('../assets/icon_no_bg.png')}
									style={styles.logoImage}
								/>
							</Animated.View>
							<Text style={styles.logo}>bingoo</Text>
							<Text style={styles.tagline}>
								your friends know you too well.
							</Text>
						</View>
					)}

					{mode === 'create' && (
						<View style={styles.form}>
							<Text style={styles.label}>Game name</Text>
							<TextInput
								style={styles.input}
								placeholder="e.g. Paris Trip"
								placeholderTextColor={colors.textLight}
								value={gameName}
								onChangeText={setGameName}
								maxLength={32}
								autoFocus
							/>

							<Text style={styles.label}>Your nickname</Text>
							<TextInput
								style={styles.input}
								placeholder="e.g. Tom"
								placeholderTextColor={colors.textLight}
								value={nickname}
								onChangeText={setNickname}
								maxLength={20}
							/>

							<View style={styles.policyRow}>
								<TouchableOpacity
									style={[
										styles.checkbox,
										acceptedPolicies && styles.checkboxChecked,
									]}
									onPress={() => setAcceptedPolicies((value) => !value)}
								>
									{acceptedPolicies && (
										<Text style={styles.checkboxMark}>✓</Text>
									)}
								</TouchableOpacity>
								<View style={styles.policyTextWrap}>
									<Text style={styles.policyText}>
										I agree to the community rules and privacy policy.
									</Text>
									<View style={styles.policyLinks}>
										<TouchableOpacity
											onPress={() => Linking.openURL(COMMUNITY_GUIDELINES_URL)}
										>
											<Text style={styles.policyLinkText}>Community rules</Text>
										</TouchableOpacity>
										<TouchableOpacity
											onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
										>
											<Text style={styles.policyLinkText}>Privacy policy</Text>
										</TouchableOpacity>
									</View>
								</View>
							</View>

							<TouchableOpacity
								style={[styles.primaryButton, loading && styles.buttonDisabled]}
								onPress={handleCreate}
								disabled={loading}
							>
								<Text style={styles.primaryButtonText}>
									{loading ? 'creating…' : 'create'}
								</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={styles.backButton}
								onPress={() => setMode('home')}
							>
								<Text style={styles.backButtonText}>Back</Text>
							</TouchableOpacity>
						</View>
					)}

					{mode === 'join' && (
						<View style={styles.form}>
							<Text style={styles.label}>Your nickname</Text>
							<TextInput
								style={styles.input}
								placeholder="e.g. Tom"
								placeholderTextColor={colors.textLight}
								value={nickname}
								onChangeText={setNickname}
								maxLength={20}
								autoFocus
							/>

							<Text style={styles.label}>Game code</Text>
							<TextInput
								style={[styles.input, styles.codeInput]}
								placeholder="ABC123"
								placeholderTextColor={colors.textLight}
								value={joinCode}
								onChangeText={(text) => setJoinCode(text.toUpperCase())}
								maxLength={6}
								autoCapitalize="characters"
							/>

							<View style={styles.policyRow}>
								<TouchableOpacity
									style={[
										styles.checkbox,
										acceptedPolicies && styles.checkboxChecked,
									]}
									onPress={() => setAcceptedPolicies((value) => !value)}
								>
									{acceptedPolicies && (
										<Text style={styles.checkboxMark}>✓</Text>
									)}
								</TouchableOpacity>
								<View style={styles.policyTextWrap}>
									<Text style={styles.policyText}>
										I agree to the community rules and privacy policy.
									</Text>
									<View style={styles.policyLinks}>
										<TouchableOpacity
											onPress={() => Linking.openURL(COMMUNITY_GUIDELINES_URL)}
										>
											<Text style={styles.policyLinkText}>Community rules</Text>
										</TouchableOpacity>
										<TouchableOpacity
											onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
										>
											<Text style={styles.policyLinkText}>Privacy policy</Text>
										</TouchableOpacity>
									</View>
								</View>
							</View>

							<TouchableOpacity
								style={[styles.primaryButton, loading && styles.buttonDisabled]}
								onPress={handleJoin}
								disabled={loading}
							>
								<Text style={styles.primaryButtonText}>
									{loading ? 'joining…' : 'join game'}
								</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={styles.backButton}
								onPress={() => setMode('home')}
							>
								<Text style={styles.backButtonText}>Back</Text>
							</TouchableOpacity>
						</View>
					)}

					{mode === 'home' && (
						<View style={styles.accordions}>
							<View style={styles.rules}>
								<TouchableOpacity
									style={styles.rulesToggle}
									onPress={() => setRulesOpen((open) => !open)}
								>
									<Text style={styles.rulesToggleText}>how to play</Text>
									<Text style={styles.rulesChevron}>
										{rulesOpen ? '▲' : '▼'}
									</Text>
								</TouchableOpacity>
								{rulesOpen && (
									<View style={styles.rulesList}>
										{RULES.map((rule, index) => (
											<View key={index} style={styles.ruleRow}>
												<Text style={styles.ruleEmoji}>{rule.emoji}</Text>
												<Text style={styles.ruleText}>{rule.text}</Text>
											</View>
										))}
									</View>
								)}
							</View>
							<View style={[styles.rules, { marginTop: spacing.sm }]}>
								<TouchableOpacity
									style={styles.rulesToggle}
									onPress={() => setInfoOpen((open) => !open)}
								>
									<Text style={styles.rulesToggleText}>about</Text>
									<Text style={styles.rulesChevron}>
										{infoOpen ? '▲' : '▼'}
									</Text>
								</TouchableOpacity>
								{infoOpen && (
									<View style={styles.rulesList}>
										<Text style={styles.ruleText}>
											bingoo uses anonymous sign-in. Your real identity is never
											collected or stored.
										</Text>
										<TouchableOpacity
											style={styles.infoLink}
											onPress={() => Linking.openURL(COMMUNITY_GUIDELINES_URL)}
										>
											<Text style={styles.infoLinkText}>Community Rules →</Text>
										</TouchableOpacity>
										<TouchableOpacity
											style={styles.infoLink}
											onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
										>
											<Text style={styles.infoLinkText}>Privacy Policy →</Text>
										</TouchableOpacity>
										<TouchableOpacity
											style={styles.infoLink}
											onPress={() =>
												Linking.openURL(
													`mailto:${FEEDBACK_EMAIL}?subject=bingoo%20feedback`,
												)
											}
										>
											<Text style={styles.infoLinkText}>Send Feedback →</Text>
										</TouchableOpacity>
										<Text style={[styles.ruleText, { marginTop: spacing.xs }]}>
											Version {APP_VERSION}
										</Text>
									</View>
								)}
							</View>
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
	infoLink: {
		paddingVertical: spacing.xs,
	},
	infoLinkText: {
		fontSize: fontSize.sm,
		color: colors.primary,
		fontWeight: '600',
	},
	policyRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: spacing.sm,
	},
	checkbox: {
		width: 22,
		height: 22,
		borderRadius: 6,
		borderWidth: 1.5,
		borderColor: colors.border,
		backgroundColor: colors.surface,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 1,
	},
	checkboxChecked: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	checkboxMark: { color: '#fff', fontWeight: '800', fontSize: 12 },
	policyTextWrap: { flex: 1, gap: spacing.xs },
	policyText: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		lineHeight: 18,
	},
	policyLinks: { alignItems: 'flex-start', gap: spacing.xs },
	policyLinkText: {
		fontSize: fontSize.sm,
		color: colors.primary,
		fontWeight: '600',
	},
	container: {
		flexGrow: 1,
		padding: spacing.lg,
		paddingTop: spacing.xxl + spacing.lg,
		paddingBottom: spacing.lg,
	},
	containerForm: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.lg },
	homeMain: {
		flexGrow: 1,
		justifyContent: 'center',
		paddingBottom: spacing.xl,
	},
	accordions: { marginTop: spacing.lg },
	header: {
		alignItems: 'center',
		paddingBottom: spacing.xl,
	},
	logoImage: {
		width: 240,
		height: 240,
	},
	logo: {
		fontSize: 56,
		fontWeight: '900',
		color: colors.primary,
		letterSpacing: -2,
	},
	tagline: {
		fontSize: fontSize.md,
		color: colors.textLight,
		marginTop: spacing.xs,
	},
	sessionSection: {
		gap: spacing.lg,
	},
	sessionSectionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	sectionLabel: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	sessionList: {
		gap: spacing.sm,
	},
	sessionCard: {
		backgroundColor: colors.surface,
		borderRadius: radius.md,
		borderWidth: 1.5,
		borderColor: colors.border,
		paddingVertical: spacing.sm + 5,
		paddingLeft: spacing.sm + 4,
		paddingRight: 52,
		position: 'relative',
	},
	sessionCardCurrent: {
		borderColor: colors.primary,
		shadowColor: colors.primary,
		shadowOpacity: 0.08,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 4 },
	},
	sessionCardTop: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: spacing.sm,
	},
	sessionCardBody: {
		flex: 1,
		gap: 2,
		paddingRight: 40,
	},
	sessionTitleRow: {
		paddingRight: 56,
	},
	sessionTitle: {
		fontSize: fontSize.md,
		color: colors.text,
		fontWeight: '700',
	},
	sessionCode: {
		fontSize: fontSize.sm,
		color: colors.primary,
		fontWeight: '600',
	},
	sessionMeta: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		lineHeight: 16,
	},
	sessionTrashSlot: {
		position: 'absolute',
		right: spacing.md,
		top: 0,
		bottom: 0,
		width: 32,
		alignItems: 'center',
		justifyContent: 'center',
	},
	sessionTrashButton: {
		width: 32,
		height: 32,
		borderRadius: radius.full,
		backgroundColor: colors.background,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 1,
		borderColor: colors.border,
	},
	sessionTrashIcon: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	sessionTrashLid: {
		width: 12,
		height: 2,
		borderRadius: 2,
		backgroundColor: colors.textLight,
		marginBottom: 1,
	},
	sessionTrashBody: {
		width: 10,
		height: 11,
		borderWidth: 1.5,
		borderColor: colors.textLight,
		borderTopWidth: 2,
		borderRadius: 2,
		paddingHorizontal: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	sessionTrashLine: {
		width: 1,
		height: 6,
		backgroundColor: colors.textLight,
	},
	actions: {
		gap: spacing.md,
		alignItems: 'center',
	},
	sessionCount: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		fontWeight: '600',
	},
	form: { gap: spacing.md, marginTop: spacing.xl },
	label: {
		fontSize: fontSize.sm,
		fontWeight: '600',
		color: colors.textLight,
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	input: {
		backgroundColor: colors.surface,
		borderWidth: 1.5,
		borderColor: colors.border,
		borderRadius: radius.md,
		padding: spacing.md,
		fontSize: fontSize.md,
		color: colors.text,
	},
	codeInput: {
		letterSpacing: 4,
		fontSize: fontSize.xl,
		fontWeight: '700',
		textAlign: 'center',
	},
	primaryButton: {
		backgroundColor: colors.primary,
		borderRadius: radius.lg,
		padding: spacing.md,
		alignItems: 'center',
		alignSelf: 'center',
		minWidth: 200,
		marginTop: spacing.sm,
	},
	primaryButtonText: {
		color: '#fff',
		fontSize: fontSize.md,
		fontWeight: '700',
	},
	secondaryButton: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		padding: spacing.md,
		alignItems: 'center',
		alignSelf: 'center',
		minWidth: 200,
		borderWidth: 1.5,
		borderColor: colors.border,
	},
	secondaryButtonText: {
		color: colors.text,
		fontSize: fontSize.md,
		fontWeight: '600',
	},
	backButton: { alignItems: 'center', padding: spacing.sm },
	backButtonText: { color: colors.textLight, fontSize: fontSize.md },
	buttonDisabled: { opacity: 0.6 },

	rules: {
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: colors.border,
		overflow: 'hidden',
	},
	rulesToggle: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: spacing.md,
		backgroundColor: colors.surface,
	},
	rulesToggleText: {
		fontSize: fontSize.sm,
		fontWeight: '700',
		color: colors.text,
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	rulesChevron: {
		fontSize: 10,
		color: colors.textLight,
	},
	rulesList: {
		padding: spacing.md,
		gap: spacing.md,
		backgroundColor: colors.surface,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	ruleRow: {
		flexDirection: 'row',
		gap: spacing.sm,
		alignItems: 'flex-start',
	},
	ruleEmoji: { fontSize: 18, width: 28 },
	ruleText: {
		flex: 1,
		fontSize: fontSize.sm,
		color: colors.textLight,
		lineHeight: 20,
	},
});
