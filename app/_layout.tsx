import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../constants/theme';
import { ensureSignedIn } from '../lib/auth';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGameStore } from '../store/gameStore';
import { registerForPushNotifications } from '../lib/notifications';
import { savePushToken } from '../lib/firestore';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Wait for Zustand to finish hydrating from AsyncStorage before reading any values
      await new Promise<void>(resolve => {
        if (useGameStore.persist.hasHydrated()) {
          resolve();
        } else {
          const unsub = useGameStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
        }
      });

      // Read directly from the store (not from the hook closure) so values are fresh
      const { gameId, playerId, pushToken, setPushToken, reset } = useGameStore.getState();

      try {
        await ensureSignedIn();
      } catch (err) {
        console.error('Auth failed:', err);
        setReady(true);
        return;
      }

      // Register for push notifications, update token if changed
      const token = await registerForPushNotifications();
      if (token && token !== pushToken) {
        setPushToken(token);
        if (gameId && playerId) {
          savePushToken(gameId, playerId, token).catch(() => {});
        }
      }

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
        } catch {
          // Network error — can't verify game status, go home safely
        }
        reset();
      }

      setReady(true);
    };

    init();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      />
    </SafeAreaProvider>
  );
}
