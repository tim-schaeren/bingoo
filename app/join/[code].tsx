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
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../../constants/theme';
import { getGameByCode, joinGame } from '../../lib/firestore';
import { useGameStore } from '../../store/gameStore';

// Handles deep links: bingoo://join/GAMECODE
export default function JoinByLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const setSession = useGameStore(s => s.setSession);

  const handleJoin = async () => {
    if (!nickname.trim()) {
      Alert.alert('Missing nickname', 'Enter a nickname to join the game.');
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
      const { playerId } = await joinGame(game.id, nickname.trim());
      setSession(playerId, nickname.trim(), game.id, false);
      router.replace(`/game/${game.id}/lobby`);
    } catch {
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
