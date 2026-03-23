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

async function waitForHydration(): Promise<void> {
  if (useGameStore.persist.hasHydrated()) return;
  return new Promise(resolve => {
    const unsub = useGameStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await waitForHydration();

      try {
        await ensureSignedIn();
      } catch (err) {
        setReady(true);
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
        } catch (err) {
          // ignore, fall through to home
        }
        reset();
      }

      setReady(true);
    };

    init();
  }, []);

  // Register for push notifications separately — never blocks startup
  useEffect(() => {
    if (!ready) return;
    registerForPushNotifications().then(token => {
      if (!token) return;
      const { pushToken, setPushToken, gameId, playerId } = useGameStore.getState();
      if (token !== pushToken) {
        setPushToken(token);
        if (gameId && playerId) {
          savePushToken(gameId, playerId, token).catch(() => {});
        }
      }
    }).catch(() => {});
  }, [ready]);

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
      {!ready && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </SafeAreaProvider>
  );
}
