import React, { useState } from 'react';
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
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../constants/theme';
import { createGame, getGameByCode, joinGame } from '../lib/firestore';
import { useGameStore } from '../store/gameStore';

type Mode = 'home' | 'create' | 'join';

export default function HomeScreen() {
	const [mode, setMode] = useState<Mode>('home');
	const [nickname, setNickname] = useState('');
	const [joinCode, setJoinCode] = useState('');
	const [loading, setLoading] = useState(false);

	const setSession = useGameStore((s) => s.setSession);

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
			const { gameId, playerId } = await createGame(nickname.trim());
			setSession(playerId, nickname.trim(), gameId, true);
			router.replace(`/game/${gameId}/lobby`);
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
			const { playerId } = await joinGame(game.id, nickname.trim());
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
						<Text style={styles.logo}>bingoo</Text>
						<Text style={styles.tagline}>your friends know you too well.</Text>
					</View>

					{mode === 'home' && (
						<View style={styles.actions}>
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
									{loading ? 'Creating…' : 'Create'}
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
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: colors.background },
	flex: { flex: 1 },
	container: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
	header: {
		alignItems: 'center',
		paddingVertical: spacing.xl,
		paddingTop: spacing.xxl,
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
	formTitle: {
		fontSize: fontSize.xl,
		fontWeight: '700',
		color: colors.text,
		marginBottom: spacing.xs,
	},
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
	hint: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		lineHeight: 18,
	},
	primaryButton: {
		backgroundColor: colors.primary,
		borderRadius: radius.lg,
		padding: spacing.md,
		alignItems: 'center',
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
});
