import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, fontSize, radius } from '../constants/theme';
import { ensureSignedIn } from '../lib/auth';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGameStore } from '../store/gameStore';
import { registerForPushNotifications } from '../lib/notifications';
import { savePushToken } from '../lib/firestore';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';

async function waitForHydration(): Promise<void> {
  if (useGameStore.persist.hasHydrated()) return;
  return new Promise(resolve => {
    const unsub = useGameStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

async function syncPushToken(): Promise<void> {
  const { pushToken, setPushToken, gameId, playerId } = useGameStore.getState();
  if (!gameId || !playerId) return;
  const token = await registerForPushNotifications();
  if (!token) return;
  if (token !== pushToken) {
    setPushToken(token);
    savePushToken(gameId, playerId, token).catch(() => {});
  }
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState(false);

  const init = useCallback(async () => {
    setInitError(false);
    setReady(false);
    await waitForHydration();

    try {
      await ensureSignedIn();
    } catch {
      setInitError(true);
      return;
    }

    const { gameId, reset } = useGameStore.getState();

    if (gameId) {
      try {
        const snap = await getDoc(doc(db, 'games', gameId));
        if (snap.exists()) {
          const status = snap.data().status;
          if (status === 'lobby') {
            setReady(true);
            router.replace(`/game/${gameId}/lobby`);
            return;
          } else if (status === 'active') {
            setReady(true);
            router.replace(`/game/${gameId}/play`);
            return;
          } else if (status === 'finished') {
            setReady(true);
            router.replace(`/game/${gameId}/winner`);
            return;
          }
        }
        reset();
      } catch {
        // Preserve the local session if we can't reach Firestore yet.
        setReady(true);
        return;
      }
    }

    setReady(true);
  }, []);

  useEffect(() => {
    init();
  }, []);

  // Refresh push token on cold start and whenever the app returns to foreground
  useEffect(() => {
    if (!ready) return;
    syncPushToken().catch(() => {});
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') syncPushToken().catch(() => {});
    });
    return () => sub.remove();
  }, [ready]);

  if (initError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Couldn't connect</Text>
          <Text style={styles.errorMessage}>Check your internet connection and try again.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={init}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <ErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        />
        <OfflineBanner />
      </ErrorBoundary>
      {!ready && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  errorMessage: { fontSize: fontSize.md, color: colors.textLight, textAlign: 'center' },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  retryButtonText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
