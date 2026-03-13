# TypeFlow — Typing Analysis & Training App
Type-Fast is a typing performance analyzer that allows users to freely type any text while tracking WPM, accuracy, errors, and detailed typing behavior statistics.
Every keystroke is recorded — speed, accuracy, pauses, modifiers, backspaces — and
analyzed in real time.

---

## Quick start

```bash
pnpm install
pnpm run dev
```

Then open http://localhost:5173

---

## File map

```
Type/
└───app
    │   index.html
    │   package.json
    │   pnpm-lock.yaml
    │   postcss.config.js
    │   README.md
    │   tailwind.config.js
    │   tsconfig.json
    │   vite.config.ts
    │
    └───src/
        │   App.tsx
        │   main.tsx
        │
        ├───components/
        │       StatsCard.tsx
        │       Timer.tsx
        │       TypingTracker.tsx
        │
        ├───hooks/
        │       useTimer.ts
        │
        ├───pages/
        │       AnalyticsDashboard.tsx
        │       HistoryPage.tsx
        │       HomePage.tsx
        │       TrainingPage.tsx
        │
        └───styles/
                index.css
```

---

## Architecture overview

### State & data flow

```
HomePage (language + duration config)
    │  onStart(HomeConfig)
    ▼
TrainingPage
    │  captures KeyEvent[] via onKeyDown
    │  uses useTimer for countdown
    │  on finish → buildAnalytics(keyEvents) → saveSession()
    │  onFinish(TypingSession)
    ▼
AnalyticsDashboard
    │  reads session prop or loadSessions()[0]
    │  renders WPM chart, pause bar chart, keyboard heatmap
    │
HistoryPage
    │  reads all sessions from localStorage
    │  renders progress LineChart, scatter, distribution
    │  onViewSession(session) → AnalyticsDashboard
```

### localStorage keys

| Key | Content |
|-----|---------|
| `typing_tracker_sessions` | `TypingSession[]` (max 50, newest first) |
| `typing_home_config` | `HomeConfig` (last selected language + duration) |

### Key types

```typescript
interface KeyEvent {
  key: string;          // "a", "Shift", "Backspace", etc.
  code: string;         // "KeyA", "ShiftLeft" — physical key
  timestamp: number;    // performance.now() — sub-ms precision
  isModifier: boolean;  // Shift | Ctrl | Alt | Meta
  isBackspace: boolean;
  isTypeable: boolean;  // counts toward WPM & accuracy
}

interface SessionAnalytics {
  wpm: number;
  accuracy: number;           // 0–100
  totalKeystrokes: number;
  typeableKeystrokes: number;
  backspaceCount: number;
  correctedMistakes: number;
  uncorrectedMistakes: number;
  pauseCount: number;         // gaps > 2s
  totalPauseMs: number;
  avgPauseMs: number;
  longestPauseMs: number;
  activeTypingMs: number;     // total - pauses
  durationMs: number;
}
```

---

## Analytics functions (TypingTracker.tsx)

| Function | Description |
|----------|-------------|
| `calcWPM(events, activeMs)` | Gross WPM: (typeable chars / 5) / active minutes |
| `calcAccuracy(events)` | Correct keystrokes / typeable × 100 |
| `calcPauses(events)` | Detects gaps > 2s, returns counts & ms totals |
| `buildAnalytics(events, durationMs)` | Composes all three into `SessionAnalytics` |
| `saveSession(session)` | Prepends to localStorage array, caps at 50 |
| `loadSessions()` | Returns `TypingSession[]`, newest first |

---

## Keyboard heatmap

`AnalyticsDashboard.tsx` renders a full QWERTY SVG keyboard. Each backspace
event is attributed to the previously typed key's `code` field, building a
`Record<code, errorCount>` map. Key fill colors interpolate:

```
green (#2d5a2d) → amber (#7a5a1a) → orange (#7a2a10) → red (#a01515)
```

based on error count relative to the session maximum.

---

## Recharts charts

| Component | Chart type | Data |
|-----------|-----------|------|
| AnalyticsDashboard | `AreaChart` | Rolling WPM over time |
| AnalyticsDashboard | `BarChart` | Pause intervals |
| HistoryPage | `ComposedChart` | WPM + accuracy trend + 7-session avg |
| HistoryPage | `ScatterChart` | WPM vs accuracy correlation |
| HistoryPage | `BarChart` | WPM distribution (10 wpm buckets) |

---

## Navigation (React Router v6 alternative)

```tsx
// Install: pnpm add react-router-dom
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

function HomeRoute() {
  const navigate = useNavigate();
  return (
    <HomePage
      onStart={(cfg) => {
        sessionStorage.setItem('training_config', JSON.stringify(cfg));
        navigate('/training');
      }}
      onViewHistory={() => navigate('/history')}
      onViewAnalytics={() => navigate('/analytics')}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<HomeRoute />} />
        <Route path="/training"  element={<TrainingPage />} />
        <Route path="/analytics" element={<AnalyticsDashboard />} />
        <Route path="/history"   element={<HistoryPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## Supported languages

English · Arabic (RTL) · French · German · Spanish · Portuguese ·
Russian · Chinese · Japanese · Korean · Hindi · Turkish

RTL languages automatically show a notice in the UI. Wire `language.dir`
into the Training page's `<textarea dir={language.dir}>` for proper text flow.
