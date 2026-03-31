import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Game, Player, Prediction, Mark } from '../lib/firestore';

export const MAX_MEMBERSHIPS = 3;

export interface SavedMembership {
  gameId: string;
  playerId: string;
  nickname: string;
  isHost: boolean;
}

interface GameState {
  // Persisted state
  memberships: SavedMembership[];
  currentGameId: string | null;
  pushToken: string | null;

  // Live game data (for the currently opened game screen only)
  game: Game | null;
  players: Player[];
  predictions: Prediction[];
  marks: Mark[];
  myCard: string[] | null;

  // Demo mode (never persisted)
  isDemoMode: boolean;

  // Actions
  setPushToken: (token: string | null) => void;
  upsertMembership: (membership: SavedMembership) => void;
  removeMembership: (gameId: string) => void;
  pruneMemberships: (gameIdsToRemove: string[]) => void;
  setCurrentGame: (gameId: string | null) => void;
  clearLiveGame: () => void;
  resetAll: () => void;
  setGame: (game: Game | null) => void;
  setPlayers: (players: Player[]) => void;
  setPredictions: (predictions: Prediction[]) => void;
  appendPredictions: (preds: Prediction[]) => void;
  setMarks: (marks: Mark[]) => void;
  setMyCard: (grid: string[] | null) => void;
  setDemoMode: (v: boolean) => void;
}

const emptyLiveState = {
  game: null,
  players: [],
  predictions: [],
  marks: [],
  myCard: null,
};

function upsertMembershipList(
  memberships: SavedMembership[],
  nextMembership: SavedMembership,
): SavedMembership[] {
  const existingWithoutCurrent = memberships.filter(
    (membership) => membership.gameId !== nextMembership.gameId,
  );
  return [...existingWithoutCurrent, nextMembership].slice(-MAX_MEMBERSHIPS);
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      memberships: [],
      currentGameId: null,
      pushToken: null,
      isDemoMode: false,
      ...emptyLiveState,

      setPushToken: (token) => set({ pushToken: token }),
      upsertMembership: (membership) =>
        set((state) => ({
          memberships: upsertMembershipList(state.memberships, membership),
          currentGameId: membership.gameId,
        })),
      removeMembership: (gameId) =>
        set((state) => {
          const memberships = state.memberships.filter(
            (membership) => membership.gameId !== gameId,
          );
          const isCurrent = state.currentGameId === gameId;
          return {
            memberships,
            currentGameId: isCurrent ? memberships.at(-1)?.gameId ?? null : state.currentGameId,
            ...(isCurrent ? emptyLiveState : {}),
          };
        }),
      pruneMemberships: (gameIdsToRemove) =>
        set((state) => {
          if (gameIdsToRemove.length === 0) return state;
          const removed = new Set(gameIdsToRemove);
          const memberships = state.memberships.filter(
            (membership) => !removed.has(membership.gameId),
          );
          const currentRemoved =
            state.currentGameId != null && removed.has(state.currentGameId);
          return {
            memberships,
            currentGameId: currentRemoved
              ? memberships.at(-1)?.gameId ?? null
              : state.currentGameId,
            ...(currentRemoved ? emptyLiveState : {}),
          };
        }),
      setCurrentGame: (gameId) => {
        if (gameId === get().currentGameId) return;
        set({ currentGameId: gameId, ...emptyLiveState });
      },
      clearLiveGame: () => set({ ...emptyLiveState }),
      resetAll: () =>
        set({
          memberships: [],
          currentGameId: null,
          pushToken: null,
          ...emptyLiveState,
        }),
      setGame: (game) => set({ game }),
      setPlayers: (players) => set({ players }),
      setPredictions: (predictions) => set({ predictions }),
      appendPredictions: (preds) => set((state) => ({ predictions: [...state.predictions, ...preds] })),
      setMarks: (marks) => set({ marks }),
      setMyCard: (myCard) => set({ myCard }),
      setDemoMode: (v) => set(v ? { isDemoMode: true } : { isDemoMode: false, ...emptyLiveState }),
    }),
    {
      name: 'bingoo-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        memberships: state.memberships,
        currentGameId: state.currentGameId,
        pushToken: state.pushToken,
      }),
    },
  ),
);
