import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Player } from '../../lib/firestore';
import { colors, spacing, radius, fontSize } from '../../constants/theme';

const COMPACT_THRESHOLD = 5;
const AVATAR_SIZE = 52;


function getInitials(nickname: string): string {
  const parts = nickname.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nickname.slice(0, 2).toUpperCase();
}

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
  const compact = players.length >= COMPACT_THRESHOLD;
  const sorted = [...players].sort((a, b) => {
    const rank = (p: Player) => p.id === hostId ? 0 : p.id === playerId ? 1 : 2;
    return rank(a) - rank(b);
  });

  return (
    <View style={styles.container}>

      {compact ? (
        <View style={styles.avatarWrap}>
          {sorted.map((p) => {
            const isMe = p.id === playerId;
            const isHostPlayer = p.id === hostId;
            const done = p.predictionsSubmitted;

            const bgColor = isHostPlayer ? colors.primaryLight : colors.border;

            const textColor = isHostPlayer ? colors.primary : colors.text;

            return (
              <TouchableOpacity
                key={p.id}
                style={styles.avatarItem}
                onPress={() => { if (!isMe) onPressPlayer?.(p); }}
                disabled={isMe || !onPressPlayer}
                activeOpacity={0.75}
              >
                <View style={[styles.avatar, { backgroundColor: bgColor }, isMe && styles.avatarMe, isHostPlayer && styles.avatarHost, done && styles.avatarDone]}>
                  <Text style={[styles.avatarText, { color: textColor }]}>
                    {getInitials(p.nickname)}
                  </Text>
                  {done && (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeText}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.avatarName} numberOfLines={1}>
                  {p.nickname}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.list}>
          {players.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.row}
              onPress={() => { if (p.id !== playerId) onPressPlayer?.(p); }}
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
              <Text style={[styles.status, p.predictionsSubmitted && styles.statusDone]}>
                {statusLabel ? statusLabel(p) : p.predictionsSubmitted ? 'Done ✓' : 'Writing…'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },

  // ── Avatar layout (≥5 players) ───────────────────────────────────────────
  avatarWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  avatarItem: {
    alignItems: 'center',
    gap: 4,
    width: AVATAR_SIZE,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMe: {
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  avatarHost: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarDone: {
    borderWidth: 2,
    borderColor: colors.success,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  doneBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  avatarName: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textLight,
    textAlign: 'center',
    maxWidth: AVATAR_SIZE,
  },

  // ── Full row layout (≤4 players) ─────────────────────────────────────────
  list: { gap: spacing.sm },
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
  name: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  pillYou: {
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pillYouText: { fontSize: 11, fontWeight: '700', color: colors.text },
  pillHost: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pillHostText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  status: { fontSize: fontSize.sm, color: colors.textLight },
  statusDone: { color: colors.success, fontWeight: '600' },
});
