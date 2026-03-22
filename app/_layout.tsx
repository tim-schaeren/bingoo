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

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const { gameId, reset } = useGameStore();

  useEffect(() => {
    ensureSignedIn().then(async () => {
      if (gameId) {
        // There's a saved session — check if the game is still in a resumable state
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
        // Game is cancelled, missing, or unknown — clear session and go home
        reset();
      }
      setReady(true);
    }).catch(err => {
      console.error('Startup failed:', err);
      setReady(true);
    });
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
