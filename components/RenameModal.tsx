import { useEffect, useRef, useState } from 'react';
import {
	KeyboardAvoidingView,
	Modal,
	Platform,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

interface Props {
	visible: boolean;
	initialValue: string;
	maxLength?: number;
	submitting?: boolean;
	onClose: () => void;
	onSubmit: (nickname: string) => void;
}

export function RenameModal({
	visible,
	initialValue,
	maxLength = 20,
	submitting = false,
	onClose,
	onSubmit,
}: Props) {
	const [value, setValue] = useState(initialValue);
	const inputRef = useRef<TextInput>(null);
	const trimmed = value.trim();
	const canSubmit = trimmed.length > 0 && trimmed.length <= maxLength && !submitting;

	useEffect(() => {
		if (!visible) return;
		setValue(initialValue);
		const timer = setTimeout(() => inputRef.current?.focus(), 150);
		return () => clearTimeout(timer);
	}, [initialValue, visible]);

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
			<KeyboardAvoidingView
				style={styles.overlay}
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			>
				<TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
					<TouchableOpacity style={styles.card} activeOpacity={1}>
						<Text style={styles.title}>Change your name</Text>
						<Text style={styles.subtitle}>Enter a new nickname.</Text>
						<TextInput
							ref={inputRef}
							style={styles.input}
							value={value}
							onChangeText={setValue}
							autoCapitalize="words"
							autoCorrect={false}
							maxLength={maxLength}
							placeholder="Nickname"
							placeholderTextColor={colors.textLight}
							returnKeyType="done"
							onSubmitEditing={() => {
								if (canSubmit) onSubmit(trimmed);
							}}
							editable={!submitting}
						/>
						<Text style={styles.helper}>{trimmed.length}/{maxLength}</Text>
						<TouchableOpacity
							style={[styles.saveButton, !canSubmit && styles.buttonDisabled]}
							onPress={() => onSubmit(trimmed)}
							disabled={!canSubmit}
						>
							<Text style={styles.saveButtonText}>
								{submitting ? 'Saving…' : 'Save'}
							</Text>
						</TouchableOpacity>
						<TouchableOpacity style={styles.cancelButton} onPress={onClose}>
							<Text style={styles.cancelText}>Cancel</Text>
						</TouchableOpacity>
					</TouchableOpacity>
				</TouchableOpacity>
			</KeyboardAvoidingView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	overlay: { flex: 1 },
	backdrop: {
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
	title: {
		fontSize: fontSize.lg,
		fontWeight: '700',
		color: colors.text,
		textAlign: 'center',
	},
	subtitle: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		textAlign: 'center',
	},
	input: {
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radius.md,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		fontSize: fontSize.md,
		color: colors.text,
	},
	helper: {
		fontSize: fontSize.sm,
		color: colors.textLight,
		textAlign: 'right',
	},
	saveButton: {
		backgroundColor: colors.primary,
		borderRadius: radius.md,
		paddingVertical: spacing.md,
		alignItems: 'center',
	},
	saveButtonText: {
		fontSize: fontSize.md,
		fontWeight: '700',
		color: '#fff',
	},
	buttonDisabled: { opacity: 0.5 },
	cancelButton: { alignItems: 'center', paddingTop: spacing.xs },
	cancelText: { fontSize: fontSize.md, color: colors.textLight },
});
