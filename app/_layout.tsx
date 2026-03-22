import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../constants/theme';
import { ensureSignedIn } from '../lib/auth';

export default function RootLayout() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    ensureSignedIn()
      .then(() => setAuthReady(true))
      .catch(err => console.error('Anonymous sign-in failed:', err));
  }, []);

  if (!authReady) {
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
