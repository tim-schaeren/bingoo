import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Prediction, REACTION_EMOJIS, ReactionEmoji } from '../../lib/firestore';
import { colors, spacing, radius, fontSize } from '../../constants/theme';
import { feedbackSelection } from '../../lib/feedback';

interface Props {
  prediction: Prediction;
  playerId: string;
  submitted: boolean;
  getPlayerName: (pid: string | undefined) => string;
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
    </TouchableOpacity>
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
  about: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
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
