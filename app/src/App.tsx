import { useState } from "react";
import HomePage, { type HomeConfig } from "./pages/HomePage";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import HistoryPage from "./pages/HistoryPage";
import { type TypingSession, loadSessions } from "./components/TypingTracker";
import TrainingPage from './pages/TrainingPage';

// NOTE: TrainingPage is imported separately — it contains the full typing
// session logic and Timer integration built in previous steps.
// If you have TrainingPage.tsx in the same src/ folder, uncomment:
// import TrainingPage from "./TrainingPage";

type View = "home" | "training" | "analytics" | "history";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const [completedSession, setCompletedSession] = useState<TypingSession | null>(null);

  const handleStart = (cfg: HomeConfig) => {
    setConfig(cfg);
    setView("training");
  };

  if (view === "home") {
    return (
      <HomePage
        onStart={handleStart}
        onViewHistory={() => setView("history")}
        onViewAnalytics={() => {
          // Load latest session for analytics view
          const sessions = loadSessions();
          if (sessions.length > 0) setCompletedSession(sessions[0]);
          setView("analytics");
        }}
      />
    );
  }

  if (view === "training") {
    // Swap this stub for <TrainingPage> once you have it in src/
    return <TrainingPage />;
  }

  if (view === "analytics") {
    return (
      <AnalyticsDashboard
        session={completedSession ?? undefined}
        onBack={() => setView("home")}
      />
    );
  }

  return (
    <HistoryPage
      onBack={() => setView("home")}
      onViewSession={(session) => {
        setCompletedSession(session);
        setView("analytics");
      }}
    />
  );
}
