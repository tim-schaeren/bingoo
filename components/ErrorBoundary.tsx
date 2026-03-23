import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, fontSize, radius } from '../constants/theme';
import { useGameStore } from '../store/gameStore';

interface State { hasError: boolean }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  handleReturnHome = () => {
    useGameStore.getState().reset();
    this.setState({ hasError: false });
    router.replace('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>An unexpected error occurred.</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReturnHome}>
            <Text style={styles.buttonText}>Return home</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  message: { fontSize: fontSize.md, color: colors.textLight, textAlign: 'center' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  buttonText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
});
