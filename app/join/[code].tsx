import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../../constants/theme';
import {
  getGameByCode,
  isGameBannedError,
  isGameFullError,
  joinGame,
} from '../../lib/firestore';
import { MAX_MEMBERSHIPS, useGameStore } from '../../store/gameStore';

const PRIVACY_POLICY_URL = 'https://tim-schaeren.github.io/bingoo/privacy-policy.html';
const COMMUNITY_GUIDELINES_URL = 'https://tim-schaeren.github.io/bingoo/community-guidelines.html';

// Handles deep links: bingoo://join/GAMECODE
export default function JoinByLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const memberships = useGameStore((s) => s.memberships);
  const pushToken = useGameStore((s) => s.pushToken);
  const upsertMembership = useGameStore((s) => s.upsertMembership);
  const setCurrentGame = useGameStore((s) => s.setCurrentGame);

  const handleJoin = async () => {
    if (!nickname.trim()) {
      Alert.alert('Missing nickname', 'Enter a nickname to join the game.');
      return;
    }
    if (!acceptedPolicies) {
      Alert.alert(
        'Agree first',
        'Please agree to the community rules and privacy policy before joining.',
      );
      return;
    }
    setLoading(true);
    try {
      const game = await getGameByCode(code ?? '');
      if (!game) {
        Alert.alert('Not found', 'This game link is invalid or has expired.');
        return;
      }
      if (game.status !== 'lobby') {
        Alert.alert('Too late', 'This game has already started.');
        return;
      }

      const existingMembership = memberships.find((membership) => membership.gameId === game.id);
      if (existingMembership) {
        setCurrentGame(game.id);
        router.replace(`/game/${game.id}/lobby`);
        return;
      }

      if (memberships.length >= MAX_MEMBERSHIPS) {
        Alert.alert(
          'Game limit reached',
          `You can only be part of ${MAX_MEMBERSHIPS} games at the same time. Leave one first.`,
        );
        return;
      }

      const { playerId } = await joinGame(game.id, nickname.trim(), pushToken);
      upsertMembership({ gameId: game.id, playerId, nickname: nickname.trim(), isHost: false });
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
      Alert.alert('Error', 'Could not join. Check your connection and try again.');
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
        <View style={styles.container}>
          <Text style={styles.title}>You're invited!</Text>
          <Text style={styles.subtitle}>Game code</Text>
          <Text style={styles.code}>{code?.toUpperCase()}</Text>

          <Text style={styles.label}>Your nickname</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Tim"
            placeholderTextColor={colors.textLight}
            value={nickname}
            onChangeText={setNickname}
            maxLength={20}
            autoFocus
            returnKeyType="join"
            onSubmitEditing={handleJoin}
          />

          <View style={styles.policyRow}>
            <TouchableOpacity
              style={[styles.checkbox, acceptedPolicies && styles.checkboxChecked]}
              onPress={() => setAcceptedPolicies(value => !value)}
            >
              {acceptedPolicies && <Text style={styles.checkboxMark}>✓</Text>}
            </TouchableOpacity>
            <View style={styles.policyTextWrap}>
              <Text style={styles.policyText}>
                I agree to the community rules and privacy policy.
              </Text>
              <View style={styles.policyLinks}>
                <TouchableOpacity onPress={() => Linking.openURL(COMMUNITY_GUIDELINES_URL)}>
                  <Text style={styles.policyLinkText}>Community rules</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
                  <Text style={styles.policyLinkText}>Privacy policy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Joining…' : 'Join game'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.back} onPress={() => router.replace('/')}>
            <Text style={styles.backText}>Go to home</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  code: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: spacing.lg,
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
  policyText: { fontSize: fontSize.sm, color: colors.textLight, lineHeight: 18 },
  policyLinks: { alignItems: 'flex-start', gap: spacing.xs },
  policyLinkText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
  buttonDisabled: { opacity: 0.6 },
  back: { alignItems: 'center', padding: spacing.sm },
  backText: { color: colors.textLight, fontSize: fontSize.md },
});
