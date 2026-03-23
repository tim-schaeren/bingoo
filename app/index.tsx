import React, { useState, useRef } from 'react';
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
import { createGame, getGameByCode, joinGame } from '../lib/firestore';
import { useGameStore } from '../store/gameStore';

const PRIVACY_POLICY_URL = 'https://tim-schaeren.github.io/bingoo/privacy-policy.html';
const FEEDBACK_EMAIL = 'argyles.twigs9p@icloud.com';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

type Mode = 'home' | 'create' | 'join';

const RULES = [
	{
		emoji: '✍️',
		text: 'Everyone writes predictions about each other — things you think will become true.',
	},
	{
		emoji: '🃏',
		text: 'When the host starts the game, everyone gets a random bingoo card filled with predictions about the other players.',
	},
	{
		emoji: '✓',
		text: 'Once a prediction comes true, mark it on the bingoo card. It will also be marked for everyone else.',
	},
	{
		emoji: '🎉',
		text: 'First player to complete a row, column, or diagonal wins!',
	},
];

export default function HomeScreen() {
	const [mode, setMode] = useState<Mode>('home');
	const [nickname, setNickname] = useState('');
	const [joinCode, setJoinCode] = useState('');
	const [loading, setLoading] = useState(false);
	const [rulesOpen, setRulesOpen] = useState(false);
	const [infoOpen, setInfoOpen] = useState(false);

	const { setSession, pushToken, gameId, reset } = useGameStore();

	const iconAnim = useRef(new Animated.Value(1)).current;

	const switchMode = (next: Mode) => {
		const toHome = next === 'home';
		if (!toHome) setMode(next);
		Animated.timing(iconAnim, {
			toValue: toHome ? 1 : 0,
			duration: 280,
			useNativeDriver: false,
		}).start(() => {
			if (toHome) setMode(next);
		});
	};

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
			if (status === 'lobby') router.replace(`/game/${gameId}/lobby`);
			else if (status === 'active') router.replace(`/game/${gameId}/play`);
			else if (status === 'finished') router.replace(`/game/${gameId}/winner`);
			else reset();
		} catch {
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
		} catch {
			Alert.alert(
				'Error',
				'Could not join game. Check your connection and try again.',
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
					contentContainerStyle={styles.container}
					keyboardShouldPersistTaps="handled"
				>
					{/* Header */}
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
						<Text style={styles.tagline}>your friends know you too well.</Text>
					</View>

					{mode === 'home' && (
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
												'You will permanently lose your spot in this game and cannot rejoin.',
												[
													{ text: 'Stay', style: 'cancel' },
													{
														text: 'Leave game',
														style: 'destructive',
														onPress: () =>
															Alert.alert(
																'Are you sure?',
																'This cannot be undone.',
																[
																	{ text: 'Cancel', style: 'cancel' },
																	{
																		text: 'Yes, leave',
																		style: 'destructive',
																		onPress: reset,
																	},
																],
															),
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
										onPress={() => switchMode('create')}
									>
										<Text style={styles.primaryButtonText}>create</Text>
									</TouchableOpacity>
									<TouchableOpacity
										style={styles.secondaryButton}
										onPress={() => switchMode('join')}
									>
										<Text style={styles.secondaryButtonText}>join</Text>
									</TouchableOpacity>
								</>
							)}
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
								onPress={() => switchMode('home')}
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
								onPress={() => switchMode('home')}
							>
								<Text style={styles.backButtonText}>Back</Text>
							</TouchableOpacity>
						</View>
					)}

					{/* Rules accordion */}
					{mode === 'home' && (
						<View style={styles.rules}>
							<TouchableOpacity
								style={styles.rulesToggle}
								onPress={() => setRulesOpen((o) => !o)}
							>
								<Text style={styles.rulesToggleText}>how to play</Text>
								<Text style={styles.rulesChevron}>{rulesOpen ? '▲' : '▼'}</Text>
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
					)}

					{/* About accordion */}
					{mode === 'home' && (
						<View style={[styles.rules, { marginTop: spacing.sm }]}>
							<TouchableOpacity
								style={styles.rulesToggle}
								onPress={() => setInfoOpen((o) => !o)}
							>
								<Text style={styles.rulesToggleText}>about</Text>
								<Text style={styles.rulesChevron}>{infoOpen ? '▲' : '▼'}</Text>
							</TouchableOpacity>
							{infoOpen && (
								<View style={styles.rulesList}>
									<Text style={styles.ruleText}>
										No account needed. bingoo uses anonymous sign-in — your real
										identity is never collected or stored.
									</Text>
									<TouchableOpacity
										style={styles.infoLink}
										onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
									>
										<Text style={styles.infoLinkText}>Privacy Policy →</Text>
									</TouchableOpacity>
									<TouchableOpacity
										style={styles.infoLink}
										onPress={() =>
											Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=bingoo%20feedback`)
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
	container: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
	header: {
		alignItems: 'center',
		paddingVertical: spacing.xl,
		paddingTop: spacing.xxl,
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
	actions: { gap: spacing.md },
	form: { gap: spacing.md },
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
		marginTop: spacing.xl,
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
