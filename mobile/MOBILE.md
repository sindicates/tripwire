# Tripwire Mobile — Developer Handoff

This document covers everything you need to know to pick up development of the Tripwire mobile app.

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 54.0 |
| Routing | Expo Router v6 (file-based) |
| Language | TypeScript (strict mode) |
| React | React 19.1.0 |
| React Native | 0.81.5 |
| Animations | react-native-reanimated 4.x |
| Gestures | react-native-gesture-handler 2.28.x |
| Icons | @expo/vector-icons (Ionicons) |
| HTTP | axios |
| Build/Deploy | EAS (Expo Application Services) |

---

## 2. Project Structure

```
mobile/
├── app/                    # All screens (file-based routing via Expo Router)
│   ├── _layout.tsx         # Root layout — Stack navigator wrapping all groups
│   ├── index.tsx           # Entry point — redirects to (auth) or (tabs)
│   ├── onboarding.tsx      # Onboarding wizard (stub)
│   ├── (auth)/
│   │   ├── _layout.tsx     # Auth stack layout
│   │   ├── login.tsx       # Login screen (stub — UI shell only)
│   │   └── register.tsx    # Register screen (stub — UI shell only)
│   └── (tabs)/
│       ├── _layout.tsx     # Bottom tab bar (Dashboard / Ask / Actions)
│       ├── index.tsx       # Dashboard screen (stub)
│       ├── chat.tsx        # Ask Advisor / Chat screen (stub)
│       └── actions.tsx     # Action Center screen (stub)
├── constants/
│   └── colors.ts           # Light + dark color palette tokens
├── lib/                    # Shared utilities (currently empty — add api.ts here)
├── types/                  # TypeScript domain types
├── babel.config.js         # Babel config — uses babel-preset-expo
├── app.json                # Expo app config (name, bundle IDs, plugins)
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config — path alias @/* → ./
└── .env                    # Symlink → root /.env (auto-created by make setup)
```

### Path alias
`@/` maps to the `mobile/` root. Example:
```ts
import { Colors } from "@/constants/colors"
```

---

## 3. Environment Setup

### Prerequisites
- **Node.js** v18+ (project uses v26.3.0)
- **npm** v10+
- **Expo Go** app on your physical iOS or Android device

> ⚠️ You do **not** need Xcode, Android Studio, CocoaPods, or Java to run the app during development using Expo Go on a physical device. Only install those if you need a local simulator/emulator.

### First-time setup

```bash
# From the repo root
cp .env.example .env      # Fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, SECRET_KEY

# Install mobile dependencies (must use --legacy-peer-deps due to React 19 peer resolution)
cd mobile
npm install --legacy-peer-deps
```

> **Important:** Always use `--legacy-peer-deps` for any new packages you install in this directory. The React 19 + React Native 0.81 ecosystem still has peer dependency conflicts that require this flag.

---

## 4. Running the App

### Step 1 — Start the backend

The mobile app talks to the FastAPI backend at `EXPO_PUBLIC_API_URL` (set in `.env`).

For your physical device to reach the backend on your Mac, the server **must** bind to `0.0.0.0`, not just `localhost`:

```bash
# From repo root
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --reload
# Backend now available at http://<your-mac-ip>:8000
```

Find your Mac's local IP:
```bash
ipconfig getifaddr en0
```

Then update `.env` (in the repo root):
```
EXPO_PUBLIC_API_URL=http://<your-mac-ip>:8000
```

### Step 2 — Start the Metro bundler

```bash
cd mobile
npm start
# or for a clean cache restart:
npx expo start -c
```

This will print a **QR code** in your terminal.

### Step 3 — Open in Expo Go

- **iOS**: Open the default Camera app, point it at the QR code. Tap the Expo Go prompt.
- **Android**: Open Expo Go → tap "Scan QR Code".

Make sure your phone and Mac are on the **same Wi-Fi network**.

---

## 5. Connecting to the API

The API base URL is read from the environment:

```ts
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000"
```

All `EXPO_PUBLIC_*` variables in `.env` are automatically bundled into the JS by Expo. **Never put secrets in `EXPO_PUBLIC_*` variables** — they are visible in the bundle.

The recommended pattern for API calls (add to `lib/api.ts`):
```ts
import axios from "axios"

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
})
```

---

## 6. What's Been Built vs. What's a Stub

### ✅ Done (infrastructure)
- Expo SDK 54 + Expo Router v6 fully configured
- File-based routing: `(auth)` and `(tabs)` groups wired up
- Bottom tab bar with Dashboard / Ask / Actions tabs and Ionicons
- Color system (`constants/colors.ts`) with light + dark tokens
- TypeScript path aliases (`@/*`)
- Environment variable plumbing via `.env` symlink
- `babel-preset-expo` correctly installed and hoisted

### 🔲 Stub screens (UI shell only — need full implementation)
| Screen | File | What's missing |
|---|---|---|
| Login | `app/(auth)/login.tsx` | Form inputs, validation, `POST /auth/login`, JWT storage |
| Register | `app/(auth)/register.tsx` | Form inputs, validation, `POST /auth/register` |
| Dashboard | `app/(tabs)/index.tsx` | Risk overview cards, GPA/credit progress, alerts feed |
| Ask Advisor | `app/(tabs)/chat.tsx` | Message bubbles, text input, `POST /api/v1/chat/query` |
| Action Center | `app/(tabs)/actions.tsx` | Risk event cards, severity filter, `PUT /resolve` |
| Onboarding | `app/onboarding.tsx` | School search, GPA/credits wizard, aid package entry |

### 🔲 Not yet built
- Auth state management (JWT storage via `expo-secure-store`)
- `index.tsx` auth check (currently hardcoded to `isAuthenticated = false`)
- Push notifications
- Dark mode support (colors defined, but `useColorScheme` not wired up)

---

## 7. Key API Endpoints (Backend Reference)

All routes are under `http://<backend>/api/v1/`. See `CLAUDE.md` in the repo root for full details.

| Endpoint | Method | Purpose |
|---|---|---|
| `/auth/register` | POST | Create account |
| `/auth/login` | POST | Get JWT token |
| `/students/me` | GET | Get current student profile |
| `/chat/query` | POST | RAG-grounded Q&A (non-streaming) |
| `/chat/query/stream` | POST | RAG-grounded Q&A (SSE streaming) |
| `/risk-events/` | GET | List risk events (filter by `student_id`, `severity`) |
| `/risk-events/{id}/resolve` | PUT | Mark a risk event resolved |
| `/schools/` | GET | Search schools by name |

---

## 8. TypeScript Types

Domain types live in `mobile/types/index.ts`. They **must be kept in sync** with `frontend/types/index.ts` — they are not shared automatically.

Key types: `Student`, `School`, `RiskEvent`, `RiskType`, `Severity`, `ActionPacket`, `ActionItem`, `Alert`.

---

## 9. Adding New Packages

Always use `npx expo install <package>` to get the SDK-compatible version:
```bash
npx expo install expo-secure-store    # example
```

If you hit peer dependency conflicts, append `-- --legacy-peer-deps`:
```bash
npx expo install some-package -- --legacy-peer-deps
```

Never use plain `npm install <package>` for Expo native modules — it will likely install an incompatible version.

---

## 10. Troubleshooting

| Error | Fix |
|---|---|
| `Cannot find module 'babel-preset-expo'` | Delete `node_modules` and run `npm install --legacy-peer-deps` |
| QR code doesn't connect | Ensure phone + Mac are on the same Wi-Fi. Check `EXPO_PUBLIC_API_URL` has LAN IP, not `localhost`. |
| Backend 404/connection refused on device | Restart backend with `--host 0.0.0.0`. `localhost:8000` is unreachable from a physical device. |
| Metro cache issues after package changes | Run `npx expo start -c` to clear the Metro bundler cache. |
| `expo-doctor` failures | Run `npx expo-doctor` and follow its advice, then reinstall with `--legacy-peer-deps`. |
| TypeScript errors after package update | Check `mobile/types/index.ts` is in sync with backend model changes. |
