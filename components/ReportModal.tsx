import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ReportReason } from '../lib/firestore';
import { colors, fontSize, radius, spacing } from '../constants/theme';

const REPORT_OPTIONS: { label: string; value: ReportReason }[] = [
  { label: 'Harassment', value: 'harassment' },
  { label: 'Sexual content', value: 'sexual_content' },
  { label: 'Hate speech', value: 'hate_speech' },
  { label: 'Spam', value: 'spam' },
  { label: 'Other', value: 'other' },
];

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (reason: ReportReason) => void;
}

export function ReportModal({ visible, title, onClose, onSelect }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Choose a reason for this report.</Text>
          {REPORT_OPTIONS.map(({ label, value }) => (
            <TouchableOpacity
              key={value}
              style={styles.option}
              onPress={() => onSelect(value)}
            >
              <Text style={styles.optionText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
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
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: fontSize.sm, color: colors.textLight, textAlign: 'center' },
  option: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  optionText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  cancelButton: { alignItems: 'center', paddingTop: spacing.xs },
  cancelText: { fontSize: fontSize.md, color: colors.textLight },
});
