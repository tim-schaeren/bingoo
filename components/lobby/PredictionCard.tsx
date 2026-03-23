import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Prediction, REACTION_EMOJIS, ReactionEmoji } from '../../lib/firestore';
import { colors, spacing, radius, fontSize } from '../../constants/theme';

interface Props {
  prediction: Prediction;
  playerId: string;
  submitted: boolean;
  getPlayerName: (pid: string | undefined) => string;
  onDelete: (predictionId: string) => void;
  onReport: (prediction: Prediction) => void;
  onReact: (prediction: Prediction, emoji: ReactionEmoji) => void;
  reactionPickerOpen: boolean;
  onTogglePicker: () => void;
}

export function PredictionCard({
  prediction,
  playerId,
  submitted,
  getPlayerName,
  onDelete,
  onReport,
  onReact,
  reactionPickerOpen,
  onTogglePicker,
}: Props) {
  const myReaction =
    (Object.entries(prediction.reactions ?? {}) as [ReactionEmoji, string[]][]).find(
      ([, uids]) => uids.includes(playerId),
    )?.[0] ?? null;

  const allReactions = (Object.entries(prediction.reactions ?? {}) as [ReactionEmoji, string[]][])
    .map(([emoji, uids]) => ({ emoji, count: uids.length }))
    .filter(({ count }) => count > 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.about}>{getPlayerName(prediction.subjectId)}</Text>
        <View style={styles.headerActions}>
          {prediction.authorId === playerId && !submitted && (
            <TouchableOpacity onPress={() => onDelete(prediction.id)}>
              <Text style={styles.delete}>✕</Text>
            </TouchableOpacity>
          )}
          {prediction.authorId !== playerId && (
            <TouchableOpacity onPress={() => onReport(prediction)}>
              <Text style={styles.report}>report</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text style={styles.text}>{prediction.text}</Text>
      <Text style={styles.author}>
        {prediction.authorId === playerId ? 'by you' : `by ${getPlayerName(prediction.authorId)}`}
      </Text>

      <View style={styles.reactionRow}>
        {allReactions.map(({ emoji, count }) => {
          const isMine = myReaction === emoji;
          return isMine ? (
            <TouchableOpacity key={emoji} style={styles.reactionAddButton} onPress={onTogglePicker}>
              <Text style={styles.reactionAddText}>{emoji} {count}</Text>
            </TouchableOpacity>
          ) : (
            <View key={emoji} style={styles.reactionPill}>
              <Text style={styles.reactionPillText}>{emoji} {count}</Text>
            </View>
          );
        })}
        {!myReaction && (
          <TouchableOpacity style={styles.reactionAddButton} onPress={onTogglePicker}>
            <Text style={styles.reactionAddText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      {reactionPickerOpen && (
        <View style={styles.reactionPicker}>
          {REACTION_EMOJIS.map((emoji) => (
            <TouchableOpacity key={emoji} onPress={() => onReact(prediction, emoji)}>
              <Text style={[styles.reactionOption, myReaction === emoji && styles.reactionOptionActive]}>
                {emoji}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    paddingBottom: spacing.md + 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
    width: '48%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  about: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  delete: { color: colors.textLight, fontSize: fontSize.md, paddingLeft: spacing.sm },
  report: { color: colors.textLight, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  text: { fontSize: fontSize.md, color: colors.text },
  author: { fontSize: fontSize.sm, color: colors.textLight, marginTop: 2 },

  reactionRow: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reactionPill: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionPillText: { fontSize: fontSize.sm },
  reactionAddButton: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  reactionAddText: { fontSize: fontSize.sm, color: colors.textLight },
  reactionPicker: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  reactionOption: { fontSize: 20 },
  reactionOptionActive: { opacity: 0.4 },
});
