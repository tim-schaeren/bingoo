import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Prediction, REACTION_EMOJIS, ReactionEmoji } from '../../lib/firestore';
import { colors, spacing, radius, fontSize } from '../../constants/theme';
import { feedbackSelection } from '../../lib/feedback';

interface Props {
  prediction: Prediction;
  playerId: string;
  submitted: boolean;
  getPlayerName: (pid: string | undefined) => string;
  onDelete: (predictionId: string) => void;
  onReact: (prediction: Prediction, emoji: ReactionEmoji) => void;
  reactionPickerOpen: boolean;
  onTogglePicker: () => void;
  onOpenActions: (prediction: Prediction) => void;
}

export function PredictionCard({
  prediction,
  playerId,
  submitted,
  getPlayerName,
  onDelete,
  onReact,
  reactionPickerOpen,
  onTogglePicker,
  onOpenActions,
}: Props) {
  const myReaction =
    (Object.entries(prediction.reactions ?? {}) as [ReactionEmoji, string[]][]).find(
      ([, uids]) => uids.includes(playerId),
    )?.[0] ?? null;

  const allReactions = (Object.entries(prediction.reactions ?? {}) as [ReactionEmoji, string[]][])
    .map(([emoji, uids]) => ({ emoji, count: uids.length }))
    .filter(({ count }) => count > 0);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onLongPress={() => {
        feedbackSelection();
        onOpenActions(prediction);
      }}
      delayLongPress={250}
    >
      <View style={styles.header}>
        <Text style={styles.about}>{getPlayerName(prediction.subjectId)}</Text>
        {prediction.authorId === playerId && !submitted && (
          <TouchableOpacity
            onPress={() => onDelete(prediction.id)}
            hitSlop={8}
            style={styles.deleteButton}
          >
            <Text style={styles.delete}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.text}>{prediction.text}</Text>
      <Text style={styles.author}>
        {prediction.authorId === playerId ? 'by you' : `by ${getPlayerName(prediction.authorId)}`}
      </Text>

      {/* Reaction area — always absolute so it never affects card height */}
      {reactionPickerOpen ? (
        <View style={styles.reactionPicker}>
          {REACTION_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[
                styles.reactionOptionButton,
                myReaction === emoji && styles.reactionOptionActive,
              ]}
              onPress={() => onReact(prediction, emoji)}
            >
              <Text style={styles.reactionOption}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.reactionRow}>
          {allReactions.map(({ emoji, count }) => {
            const isMine = myReaction === emoji;
            return (
              <TouchableOpacity
                key={emoji}
                style={[styles.reactionPill, isMine && styles.reactionPillMine]}
                onPress={isMine ? () => onReact(prediction, emoji) : undefined}
                disabled={!isMine}
              >
                <Text style={styles.reactionPillText}>{emoji} {count}</Text>
              </TouchableOpacity>
            );
          })}
          {!myReaction && (
            <TouchableOpacity style={styles.reactionAddButton} onPress={onTogglePicker}>
              <Text style={styles.reactionAddText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    paddingBottom: spacing.md + 28,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
    width: '48%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  about: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  deleteButton: {
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  delete: { color: colors.textLight, fontSize: fontSize.md, paddingLeft: spacing.sm },
  text: { fontSize: fontSize.md, color: colors.text },
  author: { fontSize: fontSize.sm, color: colors.textLight, marginTop: 2 },

  // Both reactionRow and reactionPicker are absolutely positioned at the
  // same spot so swapping between them never changes the card's height.
  reactionRow: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reactionPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reactionPillMine: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
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
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  reactionOptionButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionOptionActive: {
    backgroundColor: colors.primaryLight,
  },
  reactionOption: { fontSize: 18 },
});
