import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Player } from '../../lib/firestore';
import { colors, spacing, radius, fontSize } from '../../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  players: Player[];
  globalCountBySubject: Map<string, number>;
  predictionsPerPlayer: number;
  onSelect: (playerId: string) => void;
}

export function SubjectPickerModal({
  visible,
  onClose,
  players,
  globalCountBySubject,
  predictionsPerPlayer,
  onSelect,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          <Text style={styles.title}>Write about…</Text>
          {players.map((p) => {
            const count = globalCountBySubject.get(p.id) ?? 0;
            const full = count >= predictionsPerPlayer;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.item, full && styles.itemFull]}
                onPress={() => { if (!full) onSelect(p.id); }}
                disabled={full}
              >
                <Text style={[styles.itemName, full && styles.itemNameFull]}>{p.nickname}</Text>
                <Text style={[styles.itemCount, full && styles.itemCountFull]}>
                  {full ? '✓ done' : `${count}/${predictionsPerPlayer}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemFull: { opacity: 0.4 },
  itemName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  itemNameFull: { color: colors.textLight },
  itemCount: { fontSize: fontSize.sm, color: colors.textLight },
  itemCountFull: { color: colors.success, fontWeight: '600' },
});
