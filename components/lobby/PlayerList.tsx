import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Player } from '../../lib/firestore';
import { colors, spacing } from '../../constants/theme';

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
  onPressPlayer,
}: Props) {
  const sorted = [...players].sort((a, b) => {
    const rank = (p: Player) => p.id === hostId ? 0 : p.id === playerId ? 1 : 2;
    return rank(a) - rank(b);
  });

  return (
    <View style={styles.container}>
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
              onPress={() => onPressPlayer?.(p)}
              disabled={!onPressPlayer}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: bgColor },
                  isMe && styles.avatarMe,
                  isHostPlayer && styles.avatarHost,
                  done && styles.avatarDone,
                ]}
              >
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },

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
});
