import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../../../constants/theme';
import {
  listenToGame,
  listenToMarks,
  listenToPredictions,
  markPrediction,
  announceWinner,
  getCard,
  Mark,
} from '../../../lib/firestore';
import { checkWin, getWinningLine } from '../../../lib/gameLogic';
import { useGameStore } from '../../../store/gameStore';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = spacing.lg * 2;

export default function PlayScreen() {
  const { id: gameId } = useLocalSearchParams<{ id: string }>();
  const { playerId, nickname, setGame, setMarks, setPredictions, setMyCard } = useGameStore();

  const game = useGameStore(s => s.game);
  const marks = useGameStore(s => s.marks);
  const predictions = useGameStore(s => s.predictions);
  const myCard = useGameStore(s => s.myCard);

  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [loadingCard, setLoadingCard] = useState(true);

  const gridSize = game?.gridSize ?? 4;
  const cellSize = (SCREEN_WIDTH - GRID_PADDING) / gridSize - spacing.xs;

  // Set up Firestore listeners
  useEffect(() => {
    if (!gameId) return;
    const unsubs = [
      listenToGame(gameId, g => {
        setGame(g);
        if (g.status === 'finished') {
          router.replace(`/game/${gameId}/winner`);
        }
      }),
      listenToMarks(gameId, setMarks),
      listenToPredictions(gameId, setPredictions),
    ];
    return () => unsubs.forEach(u => u());
  }, [gameId]);

  // Load this player's card
  useEffect(() => {
    if (!gameId || !playerId) return;
    getCard(gameId, playerId).then(grid => {
      if (grid) setMyCard(grid);
      setLoadingCard(false);
    });
  }, [gameId, playerId]);

  // Check for win after every marks update
  useEffect(() => {
    if (!myCard || !playerId || !gameId || !game || game.status !== 'active') return;
    const markedSet = new Set(marks.map(m => m.predictionId));
    const line = getWinningLine(myCard, markedSet, gridSize);
    if (line) {
      setWinningLine(line);
      announceWinner(gameId, playerId, nickname ?? 'Someone').catch(() => {});
    }
  }, [marks, myCard]);

  const markedIds = new Set(marks.map(m => m.predictionId));

  const handleCellPress = (predictionId: string) => {
    if (!gameId || !playerId || !nickname) return;
    if (markedIds.has(predictionId)) return; // already marked

    const pred = predictions.find(p => p.id === predictionId);
    const subject = pred?.subjectId;

    Alert.alert(
      'Mark as true?',
      'This cannot be undone. Once marked, everyone can see it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, mark it',
          onPress: () => {
            markPrediction(gameId, predictionId, playerId, nickname).catch(() => {
              Alert.alert('Error', 'Could not mark this prediction. Try again.');
            });
          },
        },
      ]
    );
  };

  const getPredictionText = (predictionId: string) => {
    return predictions.find(p => p.id === predictionId)?.text ?? '…';
  };

  const getSubjectName = (predictionId: string) => {
    const pred = predictions.find(p => p.id === predictionId);
    return pred?.subjectId; // we'll look up from players in store if needed
  };

  const getMarkedBy = (predictionId: string) => {
    return marks.find(m => m.predictionId === predictionId)?.markedByNickname;
  };

  if (loadingCard || !myCard) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>bingoo</Text>
          <Text style={styles.subtitle}>
            {markedIds.size} / {myCard.length} marked
          </Text>
        </View>

        {/* Bingo grid */}
        <View style={styles.grid}>
          {myCard.map((predictionId, index) => {
            const isMarked = markedIds.has(predictionId);
            const isWinCell = winningLine?.includes(index) ?? false;
            const markedBy = isMarked ? getMarkedBy(predictionId) : undefined;

            return (
              <TouchableOpacity
                key={predictionId}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  isMarked && styles.cellMarked,
                  isWinCell && styles.cellWin,
                ]}
                onPress={() => handleCellPress(predictionId)}
                activeOpacity={isMarked ? 1 : 0.7}
              >
                <Text
                  style={[styles.cellText, isMarked && styles.cellTextMarked]}
                  numberOfLines={4}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {getPredictionText(predictionId)}
                </Text>
                {isMarked && markedBy && (
                  <Text style={styles.markedBy} numberOfLines={1}>
                    ✓ {markedBy}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Mark log */}
        {marks.length > 0 && (
          <View style={styles.log}>
            <Text style={styles.logTitle}>Recent marks</Text>
            {[...marks].reverse().slice(0, 5).map(m => (
              <Text key={m.predictionId} style={styles.logEntry}>
                {m.markedByNickname} marked "{getPredictionText(m.predictionId)}"
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg, alignItems: 'center' },

  header: { alignItems: 'center', gap: spacing.xs },
  title: { fontSize: fontSize.xl, fontWeight: '900', color: colors.primary },
  subtitle: { fontSize: fontSize.sm, color: colors.textLight },

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
  cellText: {
    fontSize: 11,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 14,
  },
  cellTextMarked: { color: colors.markedText, fontWeight: '600' },
  markedBy: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    textAlign: 'center',
  },

  log: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  logEntry: { fontSize: fontSize.sm, color: colors.textLight },
});
