import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Game, Player, Prediction, Mark } from '../lib/firestore';

interface GameState {
  // Current session — persisted to AsyncStorage
  playerId: string | null;
  nickname: string | null;
  gameId: string | null;
  isHost: boolean;

  // Live game data (populated by Firestore listeners — not persisted)
  game: Game | null;
  players: Player[];
  predictions: Prediction[];
  marks: Mark[];
  myCard: string[] | null; // flat array of predictionIds, length = gridSize²

  // Actions
  setSession: (playerId: string, nickname: string, gameId: string, isHost: boolean) => void;
  setGame: (game: Game) => void;
  setPlayers: (players: Player[]) => void;
  setPredictions: (predictions: Prediction[]) => void;
  setMarks: (marks: Mark[]) => void;
  setMyCard: (grid: string[]) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    set => ({
      playerId: null,
      nickname: null,
      gameId: null,
      isHost: false,
      game: null,
      players: [],
      predictions: [],
      marks: [],
      myCard: null,

      setSession: (playerId, nickname, gameId, isHost) =>
        set({ playerId, nickname, gameId, isHost }),
      setGame: game => set({ game }),
      setPlayers: players => set({ players }),
      setPredictions: predictions => set({ predictions }),
      setMarks: marks => set({ marks }),
      setMyCard: myCard => set({ myCard }),
      reset: () =>
        set({
          playerId: null,
          nickname: null,
          gameId: null,
          isHost: false,
          game: null,
          players: [],
          predictions: [],
          marks: [],
          myCard: null,
        }),
    }),
    {
      name: 'bingoo-session',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the session fields — live data is always re-fetched
      partialize: state => ({
        playerId: state.playerId,
        nickname: state.nickname,
        gameId: state.gameId,
        isHost: state.isHost,
      }),
    }
  )
);
