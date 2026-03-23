import { View, Text, TouchableOpacity, Modal, StyleSheet, Linking } from 'react-native';
import Constants from 'expo-constants';
import { colors, spacing, radius, fontSize } from '../constants/theme';

const PRIVACY_POLICY_URL = 'https://tim-schaeren.github.io/bingoo/privacy-policy.html';
const FEEDBACK_EMAIL = 'argyles.twigs9p@icloud.com';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function InfoModal({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          <Text style={styles.title}>bingoo</Text>
          <Text style={styles.version}>Version {APP_VERSION}</Text>

          <Text style={styles.blurb}>
            No account needed. bingoo uses anonymous sign-in — your real identity
            is never collected or stored.
          </Text>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          >
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Text style={styles.rowChevron}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              Linking.openURL(
                `mailto:${FEEDBACK_EMAIL}?subject=bingoo%20feedback`,
              )
            }
          >
            <Text style={styles.rowLabel}>Send Feedback</Text>
            <Text style={styles.rowChevron}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
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
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  version: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    marginTop: -spacing.sm,
  },
  blurb: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  rowChevron: {
    fontSize: fontSize.md,
    color: colors.textLight,
  },
  closeButton: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  closeText: {
    fontSize: fontSize.md,
    color: colors.textLight,
  },
});
