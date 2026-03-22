# bingoo

A social prediction bingo game for iOS and Android. Players write predictions about each other, receive a bingo card filled with those predictions, and mark them off in real time as they come true. First to complete a row, column, or diagonal wins.

---

## How it works

1. **Create** a game and share the 6-character code with friends.
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
| State          | Zustand                                                    |
| Build / Deploy | EAS Build (local) + EAS Submit → TestFlight                |

---

## Project structure

```
bingoo/
├── app/                        # Expo Router screens
│   ├── _layout.tsx             # Root layout (auth init)
│   ├── index.tsx               # Home screen (create / join)
│   ├── join/
│   │   └── [code].tsx          # Deep-link handler (bingoo://join/XXXXXX)
│   └── game/
│       └── [id]/
│           ├── _layout.tsx     # Game layout
│           ├── lobby.tsx       # Lobby: prediction pool, player list, start game
│           ├── play.tsx        # Active game: bingo card, mark predictions, live feed
│           └── winner.tsx      # Winner screen: winner banner + card carousel
│
├── lib/
│   ├── firebase.ts             # Firebase app initialisation
│   ├── auth.ts                 # Anonymous auth (ensureSignedIn, currentUid)
│   ├── firestore.ts            # All Firestore reads/writes/listeners + data types
│   └── gameLogic.ts            # Pure functions: card generation, win detection, grid sizing
│
├── store/
│   └── gameStore.ts            # Zustand store: session + live game state
│
├── constants/
│   └── theme.ts                # Colors, spacing, radius, font sizes
│
├── assets/                     # Icons, splash screen, favicon
├── firestore.rules             # Firestore security rules
├── app.config.js               # Expo config (bundle ID, build number, Firebase env vars)
├── eas.json                    # EAS Build + Submit profiles
├── metro.config.js             # Metro bundler config (Firebase RN compatibility)
└── ship.sh                     # One-command build + TestFlight deployment
```

---

## Firestore data model

```
games/{gameId}
  code            string       — 6-char invite code (e.g. "AB3K7Z")
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

  /predictions/{predictionId}
    authorId      string       — who wrote it
    subjectId     string       — who it's about
    text          string       — max 120 chars
    createdAt     timestamp

  /cards/{playerId}
    grid          string[]     — flat array of predictionIds, length = gridSize²

  /marks/{predictionId}
    markedBy          string   — playerId who marked it
    markedByNickname  string
    markedAt          timestamp
```

---

## Game logic

**Grid sizing** (`lib/gameLogic.ts` → `computeGridSize`): calculated automatically when the host starts the game. The algorithm finds the minimum number of visible predictions any single player has (i.e. all predictions where `subjectId !== playerId`), takes the square root, and clamps the result between 2 and 5. This ensures every player has enough predictions to fill their card.

**Card generation** (`generateCards`): each player's card is a shuffled subset of the predictions they can see (all predictions not about them), truncated to `gridSize²` cells. Cards are written to Firestore by the host at game start and never change.

**Win detection** (`getWinningLine`): runs client-side on every marks update. Checks all rows, columns, and both diagonals. When a player detects they've won, they call `announceWinner` which uses Firestore `arrayUnion` to append to the `winners` array — safe for concurrent winners.

**Game codes** (`generateGameCode`): 6 characters from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — ambiguous characters (0, O, I, 1, L) are excluded to avoid confusion when sharing verbally.

---

## Security rules (`firestore.rules`)

- **Games**: anyone can read; only the creator can start or cancel; any authenticated player can append themselves to `winners` when the game is active or already finished.
- **Players**: players can join/leave in lobby; only the player themselves or the host can update `predictionsSubmitted`.
- **Predictions**: authors can create (in lobby only) and delete their own; no updates.
- **Cards**: only the host can write; no updates or deletes.
- **Marks**: any authenticated player can create a mark during an active game; no updates or deletes.

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

> **Note:** The Metro config sets `unstable_enablePackageExports = false` — this is required for Firebase to bundle correctly with React Native.

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
2. Auto-increments the iOS build number in `app.config.js` and commits it
3. Builds the IPA locally via `eas build --local`
4. Submits to TestFlight via `eas submit`

Check App Store Connect → TestFlight ~10 minutes after the script completes.
