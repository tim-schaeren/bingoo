import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../../../constants/theme';
import { listenToGame, listenToMarks, listenToPredictions, getCard } from '../../../lib/firestore';
import { getWinningLine } from '../../../lib/gameLogic';
import { useGameStore, useGameStore as useStore } from '../../../store/gameStore';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = spacing.lg * 2;

export default function WinnerScreen() {
  const { id: gameId } = useLocalSearchParams<{ id: string }>();
  const { setGame, setMarks, setPredictions } = useGameStore();

  const game = useGameStore(s => s.game);
  const marks = useGameStore(s => s.marks);
  const predictions = useGameStore(s => s.predictions);
  const playerId = useGameStore(s => s.playerId);

  const [winnerCard, setWinnerCard] = useState<string[] | null>(null);
  const [loadingCard, setLoadingCard] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    const unsubs = [
      listenToGame(gameId, setGame),
      listenToMarks(gameId, setMarks),
      listenToPredictions(gameId, setPredictions),
    ];
    return () => unsubs.forEach(u => u());
  }, [gameId]);

  // Load the winner's card
  useEffect(() => {
    if (!gameId || !game?.winnerId) return;
    getCard(gameId, game.winnerId).then(grid => {
      setWinnerCard(grid);
      setLoadingCard(false);
    });
  }, [gameId, game?.winnerId]);

  const markedIds = new Set(marks.map(m => m.predictionId));
  const gridSize = game?.gridSize ?? 4;
  const winLine = winnerCard ? getWinningLine(winnerCard, markedIds, gridSize) : null;
  const cellSize = (SCREEN_WIDTH - GRID_PADDING) / gridSize - spacing.xs;

  const getPredictionText = (predictionId: string) =>
    predictions.find(p => p.id === predictionId)?.text ?? '…';

  const isMe = game?.winnerId === playerId;
  const reset = useGameStore(s => s.reset);

  const handlePlayAgain = () => {
    reset();
    router.replace('/');
  };

  if (!game || loadingCard) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Winner banner */}
        <View style={styles.banner}>
          <Text style={styles.emoji}>{isMe ? '🎉' : '🏆'}</Text>
          <Text style={styles.winnerLabel}>
            {isMe ? 'You won!' : `${game.winnerNickname} won!`}
          </Text>
          <Text style={styles.bingoo}>BINGOO!</Text>
        </View>

        {/* Winner's card */}
        {winnerCard && (
          <View style={styles.cardSection}>
            <Text style={styles.cardLabel}>Winning card</Text>
            <View style={styles.grid}>
              {winnerCard.map((predictionId, index) => {
                const isMarked = markedIds.has(predictionId);
                const isWinCell = winLine?.includes(index) ?? false;
                return (
                  <View
                    key={predictionId}
                    style={[
                      styles.cell,
                      { width: cellSize, height: cellSize },
                      isMarked && styles.cellMarked,
                      isWinCell && styles.cellWin,
                    ]}
                  >
                    <Text
                      style={[styles.cellText, isMarked && styles.cellTextMarked]}
                      numberOfLines={4}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {getPredictionText(predictionId)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handlePlayAgain}>
          <Text style={styles.buttonText}>Back to home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.xl, alignItems: 'center' },

  banner: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  emoji: { fontSize: 64 },
  winnerLabel: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  bingoo: {
    fontSize: 52,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: -1,
  },

  cardSection: { width: '100%', gap: spacing.md, alignItems: 'center' },
  cardLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.textLight },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },

  cell: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cellMarked: {
    backgroundColor: colors.marked,
    borderColor: colors.marked,
  },
  cellWin: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  cellText: { fontSize: 11, color: colors.text, textAlign: 'center', lineHeight: 14 },
  cellTextMarked: { color: colors.markedText, fontWeight: '600' },

  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
});
