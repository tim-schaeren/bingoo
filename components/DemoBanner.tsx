import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize } from '../constants/theme';

export function DemoBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.banner, { paddingTop: insets.top + spacing.xs }]}
      pointerEvents="none"
    >
      <Text style={styles.text}>⚡ DEMO MODE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.warning,
    paddingBottom: spacing.xs,
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    fontSize: fontSize.sm,
    letterSpacing: 1,
  },
});
