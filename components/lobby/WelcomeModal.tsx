import { Text, TouchableOpacity, Modal, StyleSheet, Share } from 'react-native';
import { colors, spacing, radius, fontSize } from '../../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  gameCode: string;
}

export function WelcomeModal({ visible, onClose, gameCode }: Props) {
  const handleShare = () => {
    Share.share({
      message: `Join my bingoo!\nCode: ${gameCode}\nbingoo://join/${gameCode}`,
    }).then(onClose);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          <Text style={styles.title}>all set! 🎉</Text>
          <Text style={styles.code}>{gameCode}</Text>
          <Text style={styles.hint}>Share this code with your friends so they can join.</Text>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>share</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.dismiss}>got it</Text>
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  code: { fontSize: 48, fontWeight: '900', color: colors.primary, letterSpacing: 6 },
  hint: { fontSize: fontSize.sm, color: colors.textLight, textAlign: 'center' },
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    width: '100%',
  },
  shareButtonText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md },
  dismiss: { color: colors.textLight, fontSize: fontSize.md },
});
