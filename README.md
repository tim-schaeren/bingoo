# bingoo

A social prediction bingo game for iOS and Android. Players create named private lobbies, write predictions about each other, receive a bingo card filled with those predictions, and mark them off in real time as they come true. First to complete a row, column, or diagonal wins.

---

## How it works

1. **Create** a named game and share the 6-character code with friends.
2. **Everyone joins** the lobby and writes predictions about the other players (e.g. _"Tom will show up late"_). Predictions go into a shared pool — you never see predictions written about yourself.
3. The **host starts** the game. Each player receives a unique, shuffled bingo card filled with predictions they can see.
4. During the game, anyone can **mark a prediction as true** by tapping a cell and pressing "Mark as true". Marks are visible to everyone in real time (except for ones on predictions about themselves).
5. The first player(s) to complete a full row, column, or diagonal win the game.

---

## Tech stack

| Layer          | Technology                                                 |
| -------------- | ---------------------------------------------------------- |
| Framework      | React Native + Expo SDK 54                                 |
| Navigation     | Expo Router (file-based)                                   |
| Backend        | Firebase Firestore (real-time) + Firebase Auth (anonymous) |
| State          | Zustand + AsyncStorage (up to 3 saved memberships)         |
| Notifications  | Expo Push Notifications                                    |
| Build / Deploy | EAS Build (local) + EAS Submit → TestFlight / Play Internal |

---

## Project structure

```
bingoo/
├── app/                        # Expo Router screens
│   ├── _layout.tsx             # Root layout: auth init, hydration, push tokens, offline banner
│   ├── index.tsx               # Home screen (create / join / multi-game resume)
│   ├── join/
│   │   └── [code].tsx          # Deep-link handler (bingoo://join/XXXXXX)
│   └── game/
│       └── [id]/
│           ├── _layout.tsx     # Game layout (disables swipe-back gesture)
│           ├── lobby.tsx       # Lobby: orchestrates prediction writing and game start
│           ├── play.tsx        # Active game: bingo card, mark predictions, live feed
│           └── winner.tsx      # Winner screen: winner banner + card carousel
│
├── components/
│   ├── ActionModal.tsx          # Reusable action sheet for report/remove actions
│   ├── ErrorBoundary.tsx       # Catches render errors, shows "return home" button
│   ├── OfflineBanner.tsx       # Floating banner shown when device has no connection
│   ├── ReportModal.tsx         # Reason picker for reporting users/predictions
│   └── lobby/                  # Sub-components extracted from lobby.tsx
│       ├── PlayerList.tsx
│       ├── PredictionCard.tsx
│       ├── SubjectPickerModal.tsx
│       └── WelcomeModal.tsx
│
├── lib/
│   ├── firebase.ts             # Firebase app initialisation
│   ├── auth.ts                 # Anonymous auth (ensureSignedIn, currentUid)
│   ├── firestore.ts            # All Firestore reads/writes/listeners + data types
│   ├── gameLogic.ts            # Pure functions: card generation, win detection, grid sizing
│   ├── notifications.ts        # Push notification registration and sending
│   └── feedback.ts             # Haptic + audio feedback helpers
│
├── store/
│   └── gameStore.ts            # Zustand store: saved memberships persisted, live game data transient
│
├── constants/
│   └── theme.ts                # Colors, spacing, radius, font sizes
│
├── __tests__/
│   └── gameLogic.test.ts       # Unit tests for card generation and win detection
│
├── assets/                     # Icons, splash screen, favicon, sounds
├── firestore.rules             # Firestore security rules
├── app.config.js               # Expo config (bundle ID, deep links, Firebase env vars)
├── eas.json                    # EAS Build + Submit profiles
├── metro.config.js             # Metro bundler config (Firebase RN compatibility)
├── ship.sh                     # Build iOS IPA + submit to TestFlight
└── ship-android.sh             # Build Android AAB + submit to Play Store
```

---

## Firestore data model

```
games/{gameId}
  code            string       — 6-char invite code (e.g. "AB3K7Z")
  name            string       — host-defined lobby name (e.g. "Paris Trip")
  status          string       — "lobby" | "active" | "finished" | "cancelled"
  hostId          string       — Firebase Auth UID of the host
  hostNickname    string
  gridSize        number       — 0 until game starts; then 2–5
  winners         array        — [{ id, nickname }, ...] (supports simultaneous winners)
  createdAt       timestamp

  /players/{playerId}
    nickname               string
    predictionsSubmitted   boolean
    joinedAt               timestamp
    pushToken              string?      — Expo push token, refreshed on foreground

  /predictions/{predictionId}
    authorId      string       — who wrote it
    subjectId     string       — who it's about
    text          string       — max 50 chars
    createdAt     timestamp
    reactions     object?      — { "😂": [uid, ...], "🔥": [...], ... }

  /cards/{playerId}
    grid          string[]     — flat array of predictionIds, length = gridSize²

  /marks/{predictionId}
    markedBy          string   — playerId who marked it
    markedByNickname  string
    markedAt          timestamp

  /reports/{reportId}
    targetType        string       — "prediction" | "player"
    targetId          string
    reason            string       — harassment | sexual_content | hate_speech | spam | other
    reporterId        string
    status            string       — currently always "open"
    createdAt         timestamp

  /bannedPlayers/{playerId}
    bannedAt          timestamp
    bannedBy          string       — host UID
```

---

## Game logic

**Grid sizing** (`lib/gameLogic.ts` → `computeGridSize`): calculated automatically when the host starts the game. The algorithm finds the minimum number of visible predictions any single player has (i.e. all predictions where `subjectId !== playerId`), takes the square root, and clamps the result between 2 and 5. This ensures every player has enough predictions to fill their card.

**Card generation** (`generateCards`): each player's card is a shuffled subset of the predictions they can see (all predictions not about them), truncated to `gridSize²` cells. Cards are written to Firestore by the host at game start and never change.

**Win detection** (`getWinningLine`): runs client-side on every marks update. Checks all rows, columns, and both diagonals. When a player detects they've won, they call `announceWinner` which uses Firestore `arrayUnion` to append to the `winners` array — safe for concurrent winners. All game logic functions are covered by unit tests (`npm test`).

**Game codes** (`generateGameCode`): 6 characters from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — ambiguous characters (0, O, I, 1, L) are excluded to avoid confusion when sharing verbally.

---

## Security rules (`firestore.rules`)

- **Games**: lobby games are queryable for joining by code; active/finished games are readable only by members. New games must include a non-empty `name`. Only the host can start or cancel a lobby game. Members can append themselves to `winners` when the game is active/finished.
- **Players**: readable only by members of the same game. Joining is allowed only in lobby and blocked if the player appears in `bannedPlayers`. Players can leave a lobby themselves; hosts can remove other players from a lobby or active game.
- **Predictions**: readable only by members. Authors can create in lobby only, and any member can add/remove reactions during lobby. Authors, subjects, or the host can delete a prediction in lobby.
- **Cards**: readable only by members; writable only by the host during lobby before the game starts.
- **Marks**: readable only by members; creatable only during active play, and a player cannot mark a prediction about themselves.
- **Reports**: members can create report records for players or predictions; report documents are not readable from the client.
- **Banned players**: hosts can ban removed players from rejoining the same game; the banned player and the host can read that ban record.

---

## Setup

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo`
- EAS CLI: `npm install -g eas-cli`
- A [Firebase](https://console.firebase.google.com) project with Firestore and anonymous Auth enabled
- (iOS builds) Xcode 15+ and an Apple Developer account

### 1. Clone and install

```bash
git clone https://github.com/tim-schaeren/bingoo.git
cd bingoo
npm install
```

### 2. Configure Firebase

Create a `.env` file in the project root:

```env
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

### 3. Deploy Firestore rules

```bash
firebase deploy --only firestore:rules
```

### 4. Run locally

```bash
npx expo start
```

Scan the QR code with [Expo Go](https://expo.dev/go) (iOS or Android).

> **Note:** Push notification behavior should be tested in a development build or production build, not relied on in Expo Go.

> **Note:** The Metro config sets `unstable_enablePackageExports = false` — this is required for Firebase to bundle correctly with React Native.

> **Note:** The app now persists up to 3 joined games locally. Finished and cancelled games are automatically pruned from the saved list on startup.

### 5. Run tests

```bash
npm test
```

---

## Shipping to TestFlight

Configure EAS and set your Firebase env vars as EAS secrets (one-time setup):

```bash
eas login
eas init
eas env:create --environment production --name FIREBASE_API_KEY --value "..." # repeat for each var
```

Then ship:

```bash
./ship.sh
```

This script:

1. Sources `.env` for local Firebase config
2. Builds the IPA locally via `eas build --local`
3. Submits to TestFlight via `eas submit`

For Android:

```bash
./ship-android.sh
```

Builds an AAB via EAS and submits to the Play Store internal testing track.

Check App Store Connect → TestFlight ~10 minutes after the script completes.
