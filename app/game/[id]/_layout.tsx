import { Stack } from 'expo-router';
import { colors } from '../../../constants/theme';

export default function GameLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
        gestureEnabled: false, // prevent accidental swipe-back mid-game
      }}
    />
  );
}
