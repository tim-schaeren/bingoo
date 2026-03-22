import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../../../constants/theme';
import {
  listenToGame,
  listenToPlayers,
  listenToPredictions,
  submitPredictions,
  startGame,
  Player,
  Prediction,
  Game,
} from '../../../lib/firestore';
import { requiredPredictionsPerPlayer } from '../../../lib/gameLogic';
import { useGameStore } from '../../../store/gameStore';

// Prediction inputs keyed by subjectId: string[]
type PredictionDraft = Record<string, string[]>;

export default function LobbyScreen() {
  const { id: gameId } = useLocalSearchParams<{ id: string }>();
  const { playerId, nickname, isHost, setGame, setPlayers, setPredictions } = useGameStore();

  const game = useGameStore(s => s.game);
  const players = useGameStore(s => s.players);
  const predictions = useGameStore(s => s.predictions);

  const [draft, setDraft] = useState<PredictionDraft>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);

  // Set up Firestore listeners
  useEffect(() => {
    if (!gameId) return;
    const unsubs = [
      listenToGame(gameId, g => {
        setGame(g);
        if (g.status === 'active') router.replace(`/game/${gameId}/play`);
      }),
      listenToPlayers(gameId, setPlayers),
      listenToPredictions(gameId, setPredictions),
    ];
    return () => unsubs.forEach(u => u());
  }, [gameId]);

  // Check if current player already submitted (e.g. after reconnect)
  useEffect(() => {
    const me = players.find(p => p.id === playerId);
    if (me?.predictionsSubmitted) setSubmitted(true);
  }, [players, playerId]);

  // Initialise draft entries when player list loads
  useEffect(() => {
    if (!playerId) return;
    const others = players.filter(p => p.id !== playerId);
    setDraft(prev => {
      const next = { ...prev };
      for (const p of others) {
        if (!next[p.id]) next[p.id] = [''];
      }
      return next;
    });
  }, [players, playerId]);

  const otherPlayers = players.filter(p => p.id !== playerId);
  const allSubmitted = players.length > 1 && players.every(p => p.predictionsSubmitted);
  const requiredPerPerson = game
    ? requiredPredictionsPerPlayer(game.gridSize, players.length)
    : 1;

  const inviteLink = `bingoo://join/${game?.code}`;

  const handleShare = () => {
    Share.share({
      message: `Join my bingoo game! Code: ${game?.code}\n${inviteLink}`,
      title: 'Join my bingoo game',
    });
  };

  const updatePrediction = (subjectId: string, index: number, text: string) => {
    setDraft(prev => {
      const arr = [...(prev[subjectId] ?? [''])];
      arr[index] = text;
      return { ...prev, [subjectId]: arr };
    });
  };

  const addPrediction = (subjectId: string) => {
    setDraft(prev => ({
      ...prev,
      [subjectId]: [...(prev[subjectId] ?? ['']), ''],
    }));
  };

  const removePrediction = (subjectId: string, index: number) => {
    setDraft(prev => {
      const arr = [...(prev[subjectId] ?? [''])];
      if (arr.length === 1) return prev; // keep at least one input
      arr.splice(index, 1);
      return { ...prev, [subjectId]: arr };
    });
  };

  const handleSubmit = async () => {
    if (!playerId || !gameId) return;

    // Validate: at least one non-empty prediction per player
    for (const player of otherPlayers) {
      const texts = (draft[player.id] ?? ['']).filter(t => t.trim());
      if (texts.length === 0) {
        Alert.alert(
          'Missing predictions',
          `You need at least one prediction about ${player.nickname}.`
        );
        return;
      }
    }

    const allPredictions = otherPlayers.flatMap(player =>
      (draft[player.id] ?? [])
        .filter(t => t.trim())
        .map(text => ({ subjectId: player.id, text }))
    );

    setSubmitting(true);
    try {
      await submitPredictions(gameId, playerId, allPredictions);
      setSubmitted(true);
    } catch {
      Alert.alert('Error', 'Could not submit predictions. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartGame = async () => {
    if (!gameId || !game) return;

    if (!allSubmitted) {
      Alert.alert(
        'Not everyone is ready',
        'Some players haven\'t submitted their predictions yet. Start anyway?',
        [
          { text: 'Wait', style: 'cancel' },
          { text: 'Start anyway', onPress: doStartGame },
        ]
      );
      return;
    }

    doStartGame();
  };

  const doStartGame = async () => {
    if (!gameId || !game) return;

    const totalCells = game.gridSize * game.gridSize;
    // Check if each player will have enough predictions
    for (const player of players) {
      const count = predictions.filter(p => p.subjectId === player.id).length;
      if (count < totalCells) {
        Alert.alert(
          'Not enough predictions',
          `${player.nickname} only has ${count} predictions, but the ${game.gridSize}×${game.gridSize} grid needs ${totalCells}. Add more predictions or choose a smaller grid.`
        );
        return;
      }
    }

    setStarting(true);
    try {
      await startGame(gameId, players, predictions, game.gridSize);
    } catch {
      Alert.alert('Error', 'Could not start game. Try again.');
      setStarting(false);
    }
  };

  if (!game) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.gameCode}>{game.code}</Text>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>Share invite</Text>
          </TouchableOpacity>
        </View>

        {/* Players list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Players ({players.length})</Text>
          {players.map(p => (
            <View key={p.id} style={styles.playerRow}>
              <Text style={styles.playerName}>
                {p.nickname}
                {p.id === playerId ? ' (you)' : ''}
                {p.id === game.hostId ? ' · host' : ''}
              </Text>
              <Text style={[styles.status, p.predictionsSubmitted && styles.statusDone]}>
                {p.predictionsSubmitted ? 'Ready ✓' : 'Writing…'}
              </Text>
            </View>
          ))}
          <Text style={styles.hint}>
            Grid: {game.gridSize}×{game.gridSize} — each player needs ~{requiredPerPerson} predictions per friend.
          </Text>
        </View>

        {/* Prediction form or waiting state */}
        {submitted ? (
          <View style={styles.waitingBox}>
            <Text style={styles.waitingTitle}>Predictions submitted!</Text>
            <Text style={styles.waitingText}>
              {allSubmitted
                ? isHost
                  ? 'Everyone is ready. You can start the game.'
                  : 'Everyone is ready. Waiting for the host to start.'
                : 'Waiting for others to finish their predictions…'}
            </Text>
            {isHost && (
              <TouchableOpacity
                style={[styles.startButton, starting && styles.buttonDisabled]}
                onPress={handleStartGame}
                disabled={starting}
              >
                <Text style={styles.startButtonText}>
                  {starting ? 'Starting…' : 'Start game'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your predictions</Text>
            <Text style={styles.sectionSubtitle}>
              Write at least {requiredPerPerson} prediction{requiredPerPerson > 1 ? 's' : ''} about each friend.
            </Text>

            {otherPlayers.length === 0 && (
              <Text style={styles.hint}>Waiting for friends to join…</Text>
            )}

            {otherPlayers.map(player => (
              <View key={player.id} style={styles.playerSection}>
                <Text style={styles.playerSectionTitle}>About {player.nickname}</Text>
                {(draft[player.id] ?? ['']).map((text, idx) => (
                  <View key={idx} style={styles.predictionRow}>
                    <TextInput
                      style={styles.predictionInput}
                      placeholder={`e.g. ${player.nickname} will oversleep`}
                      placeholderTextColor={colors.textLight}
                      value={text}
                      onChangeText={t => updatePrediction(player.id, idx, t)}
                      multiline
                      maxLength={120}
                    />
                    {(draft[player.id] ?? ['']).length > 1 && (
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => removePrediction(player.id, idx)}
                      >
                        <Text style={styles.removeButtonText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => addPrediction(player.id)}
                >
                  <Text style={styles.addButtonText}>+ Add another</Text>
                </TouchableOpacity>
              </View>
            ))}

            {otherPlayers.length > 0 && (
              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                <Text style={styles.submitButtonText}>
                  {submitting ? 'Submitting…' : 'Submit predictions'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gameCode: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 3,
  },
  shareButton: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  shareButtonText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.sm },

  section: { gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  sectionSubtitle: { fontSize: fontSize.sm, color: colors.textLight },

  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerName: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  status: { fontSize: fontSize.sm, color: colors.textLight },
  statusDone: { color: colors.success, fontWeight: '600' },
  hint: { fontSize: fontSize.sm, color: colors.textLight, fontStyle: 'italic' },

  playerSection: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerSectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  predictionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  predictionInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.background,
    minHeight: 44,
  },
  removeButton: { padding: spacing.xs, marginTop: spacing.xs },
  removeButtonText: { color: colors.textLight, fontSize: fontSize.md },
  addButton: { alignSelf: 'flex-start' },
  addButtonText: { color: colors.primary, fontWeight: '600', fontSize: fontSize.sm },

  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitButtonText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },

  waitingBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  waitingTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.success },
  waitingText: { fontSize: fontSize.md, color: colors.textLight, textAlign: 'center' },

  startButton: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  startButtonText: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  buttonDisabled: { opacity: 0.6 },
});
