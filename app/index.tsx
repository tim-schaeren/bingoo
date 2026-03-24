import React, { useState, useRef, useEffect } from 'react';
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
	getGameByCode,
	isGameBannedError,
	joinGame,
	leaveGame,
} from '../lib/firestore';
import { useGameStore } from '../store/gameStore';

const PRIVACY_POLICY_URL =
	'https://tim-schaeren.github.io/bingoo/privacy-policy.html';
const COMMUNITY_GUIDELINES_URL =
	'https://tim-schaeren.github.io/bingoo/community-guidelines.html';
const FEEDBACK_EMAIL = 'argyles.twigs9p@icloud.com';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

type Mode = 'home' | 'create' | 'join';

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

export default function HomeScreen() {
	const [mode, setMode] = useState<Mode>('home');
	const [nickname, setNickname] = useState('');
	const [joinCode, setJoinCode] = useState('');
	const [loading, setLoading] = useState(false);
	const [rulesOpen, setRulesOpen] = useState(false);
	const [infoOpen, setInfoOpen] = useState(false);
	const [acceptedPolicies, setAcceptedPolicies] = useState(false);

	const { setSession, pushToken, gameId, playerId, reset } = useGameStore();

	const clearRemovedSession = () => {
		reset();
		Alert.alert('Removed from game', 'The host of the game removed you.', [
			{ text: 'OK' },
		]);
	};

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

	const handleContinue = async () => {
		if (!gameId) return;
		setLoading(true);
		try {
			const snap = await getDoc(doc(db, 'games', gameId));
			if (!snap.exists() || snap.data().status === 'cancelled') {
				reset();
				return;
			}
			const status = snap.data().status;
			if (!playerId) {
				reset();
				return;
			}

			if (status === 'lobby' || status === 'active' || status === 'finished') {
				try {
					await getDoc(doc(db, 'games', gameId, 'players', playerId));
				} catch (error) {
					const code =
						error instanceof Error && 'code' in error
							? (error as Error & { code?: string }).code
							: undefined;
					if (code === 'permission-denied') {
						clearRemovedSession();
						return;
					}
					throw error;
				}
			}

			if (status === 'lobby') router.replace(`/game/${gameId}/lobby`);
			else if (status === 'active') router.replace(`/game/${gameId}/play`);
			else if (status === 'finished') router.replace(`/game/${gameId}/winner`);
			else reset();
		} catch (error) {
			const code =
				error instanceof Error && 'code' in error
					? (error as Error & { code?: string }).code
					: undefined;
			if (code === 'permission-denied') {
				clearRemovedSession();
				return;
			}
			Alert.alert('Error', 'Could not resume game. Check your connection.');
		} finally {
			setLoading(false);
		}
	};

	const handleCreate = async () => {
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
		setLoading(true);
		try {
			const { gameId: newGameId, playerId } = await createGame(
				nickname.trim(),
				pushToken,
			);
			setSession(playerId, nickname.trim(), newGameId, true);
			router.replace(`/game/${newGameId}/lobby`);
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
			const { playerId } = await joinGame(game.id, nickname.trim(), pushToken);
			setSession(playerId, nickname.trim(), game.id, false);
			router.replace(`/game/${game.id}/lobby`);
		} catch (error) {
			if (isGameBannedError(error)) {
				Alert.alert('Removed from game', error.message);
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

	const handleLeaveCurrentSession = async () => {
		if (!gameId || !playerId) {
			reset();
			return;
		}

		setLoading(true);
		try {
			const snap = await getDoc(doc(db, 'games', gameId));
			if (!snap.exists()) {
				reset();
				return;
			}

			if (snap.data().status === 'lobby') {
				try {
					await leaveGame(gameId, playerId);
				} catch (error) {
					const code =
						error instanceof Error && 'code' in error
							? (error as Error & { code?: string }).code
							: undefined;
					if (code === 'permission-denied') {
						reset();
						return;
					}
					throw error;
				}
			}
			reset();
		} catch (error) {
			const code =
				error instanceof Error && 'code' in error
					? (error as Error & { code?: string }).code
					: undefined;
			if (code === 'permission-denied') {
				reset();
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

							<View style={styles.actions}>
								{gameId ? (
									<>
										<TouchableOpacity
											style={[
												styles.primaryButton,
												loading && styles.buttonDisabled,
											]}
											onPress={handleContinue}
											disabled={loading}
										>
											{loading ? (
												<ActivityIndicator color="#fff" />
											) : (
												<Text style={styles.primaryButtonText}>
													continue game
												</Text>
											)}
										</TouchableOpacity>
										<TouchableOpacity
											onPress={() =>
												Alert.alert(
													'leave?',
													'If the game is still in the lobby, your spot will be removed. Otherwise this clears it from this device.',
													[
														{ text: 'Stay', style: 'cancel' },
														{
															text: 'Leave game',
															style: 'destructive',
															onPress: handleLeaveCurrentSession,
														},
													],
												)
											}
											style={styles.backButton}
										>
											<Text style={styles.backButtonText}>leave game</Text>
										</TouchableOpacity>
									</>
								) : (
									<>
										<TouchableOpacity
											style={styles.primaryButton}
											onPress={() => setMode('create')}
										>
											<Text style={styles.primaryButtonText}>create</Text>
										</TouchableOpacity>
										<TouchableOpacity
											style={styles.secondaryButton}
											onPress={() => setMode('join')}
										>
											<Text style={styles.secondaryButtonText}>join</Text>
										</TouchableOpacity>
									</>
								)}
							</View>
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
								onChangeText={(t) => setJoinCode(t.toUpperCase())}
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
									{loading ? 'Joining…' : 'Join game'}
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

					{/* Accordions — pinned to bottom */}
					{mode === 'home' && (
						<View style={styles.accordions}>
							<View style={styles.rules}>
								<TouchableOpacity
									style={styles.rulesToggle}
									onPress={() => setRulesOpen((o) => !o)}
								>
									<Text style={styles.rulesToggleText}>how to play</Text>
									<Text style={styles.rulesChevron}>
										{rulesOpen ? '▲' : '▼'}
									</Text>
								</TouchableOpacity>
								{rulesOpen && (
									<View style={styles.rulesList}>
										{RULES.map((r, i) => (
											<View key={i} style={styles.ruleRow}>
												<Text style={styles.ruleEmoji}>{r.emoji}</Text>
												<Text style={styles.ruleText}>{r.text}</Text>
											</View>
										))}
									</View>
								)}
							</View>
							<View style={[styles.rules, { marginTop: spacing.sm }]}>
								<TouchableOpacity
									style={styles.rulesToggle}
									onPress={() => setInfoOpen((o) => !o)}
								>
									<Text style={styles.rulesToggleText}>about</Text>
									<Text style={styles.rulesChevron}>
										{infoOpen ? '▲' : '▼'}
									</Text>
								</TouchableOpacity>
								{infoOpen && (
									<View style={styles.rulesList}>
										<Text style={styles.ruleText}>
											No account needed. bingoo uses anonymous sign-in — your
											real identity is never collected or stored.
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
	policyLinks: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
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
	actions: {
		gap: spacing.md,
		alignItems: 'center',
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
