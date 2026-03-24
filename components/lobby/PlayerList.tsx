import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Player } from '../../lib/firestore';
import { colors, spacing, radius, fontSize } from '../../constants/theme';

interface Props {
  players: Player[];
  playerId: string;
  hostId: string;
  statusLabel?: (player: Player) => string;
  onPressPlayer?: (player: Player) => void;
}

export function PlayerList({
  players,
  playerId,
  hostId,
  statusLabel,
  onPressPlayer,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.meta}>{players.length} players</Text>
      {players.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={styles.row}
          onPress={() => {
            if (p.id !== playerId) onPressPlayer?.(p);
          }}
          disabled={p.id === playerId || !onPressPlayer}
          activeOpacity={0.75}
        >
          <View style={styles.nameRow}>
            <Text style={styles.name}>{p.nickname}</Text>
            {p.id === playerId && (
              <View style={styles.pillYou}>
                <Text style={styles.pillYouText}>you</Text>
              </View>
            )}
            {p.id === hostId && (
              <View style={styles.pillHost}>
                <Text style={styles.pillHostText}>host</Text>
              </View>
            )}
          </View>
          <View style={styles.rowRight}>
            <Text
              style={[
                styles.status,
                !statusLabel && p.predictionsSubmitted && styles.statusDone,
              ]}
            >
              {statusLabel ? statusLabel(p) : p.predictionsSubmitted ? 'Done ✓' : 'Writing…'}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  meta: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  name: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  pillYou: {
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillYouText: { fontSize: 11, fontWeight: '700', color: colors.text },
  pillHost: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillHostText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  status: { fontSize: fontSize.sm, color: colors.textLight },
  statusDone: { color: colors.success, fontWeight: '600' },
});
