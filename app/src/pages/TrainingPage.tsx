// ─── Imports ───────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useMemo } from "react";
import Timer from "../components/Timer";
import HomePage from "../pages/HomePage";
import {
  type KeyEvent,
  type TypingSession,
  buildAnalytics,
  saveSession,
  loadSessions,
  clearSessions,
} from "../components/TypingTracker";

// ─── Types ────────────────────────────────────────────────────────────────────
type AppView = "home" | "training" | "analytics";

interface AnalyticsPageProps {
  session: TypingSession;
  onBack: () => void;
  allSessions: TypingSession[];
  onClearHistory: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "typing_tracker_sessions";
const PAUSE_THRESHOLD_MS = 2000;
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// ─── AnalyticsPage Component ──────────────────────────────────────────────────
function AnalyticsPage({
  session,
  onBack,
  allSessions,
  onClearHistory,
}: AnalyticsPageProps) {
  const [showRaw, setShowRaw] = useState(false);
  const a = session.analytics;

  const tiles = [
    { label: "WPM",           value: a.wpm,                   accent: "#c9a96e", sub: "gross speed" },
    { label: "Accuracy",      value: `${a.accuracy}%`,        accent: "#7eb87e", sub: "incl. backspaces" },
    { label: "Duration",      value: fmt(a.durationMs),       accent: "#7ab5d4", sub: "total session" },
    { label: "Active time",   value: fmt(a.activeTypingMs),   accent: "#7ab5d4", sub: "excl. pauses" },
    { label: "Keystrokes",    value: a.totalKeystrokes,       accent: "#c8c2ba", sub: `${a.typeableKeystrokes} typeable` },
    { label: "Backspaces",    value: a.backspaceCount,        accent: "#d4856a", sub: "corrected" },
    { label: "Pauses",        value: a.pauseCount,            accent: "#c8c2ba", sub: `>${PAUSE_THRESHOLD_MS / 1000}s gaps` },
    { label: "Longest pause", value: fmt(a.longestPauseMs),   accent: "#c8c2ba", sub: "single idle gap" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#111009",
      color: "#c8c2ba",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      padding: "40px 24px",
    }}>
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 36 }}>
          <div>
            <button
              onClick={onBack}
              style={{
                background: "transparent",
                border: "none",
                color: "#4a4742",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
                marginBottom: 8,
                letterSpacing: "0.02em",
              }}
            >
              ← Back to training
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "transparent",
                border: "none",
                color: "#4a4742",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
                marginBottom: 8,
                letterSpacing: "0.02em",
                display: "block"
              }}
              >
                ← Back to Home
              </button>
            
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: "#e8e0d4", letterSpacing: "-0.02em" }}>
              Session Analytics
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#4a4742", fontFamily: "'DM Mono', monospace" }}>
              {new Date(session.startedAt).toLocaleString()} · {fmt(a.durationMs)}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 32,
        }}>
          {tiles.map((t) => (
            <div key={t.label} style={{
              background: "#141210",
              border: "1px solid #1e1c18",
              borderRadius: 12,
              padding: "18px 20px",
            }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#4a4742", textTransform: "uppercase", marginBottom: 8 }}>
                {t.label}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: t.accent, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                {t.value}
              </div>
              <div style={{ fontSize: 11, color: "#2e2b26", marginTop: 4 }}>{t.sub}</div>
            </div>
          ))}
        </div>

        {/* Text snippet */}
        <div style={{
          background: "#141210",
          border: "1px solid #1e1c18",
          borderRadius: 12,
          padding: "20px",
          marginBottom: 32,
        }}>
          <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#4a4742", textTransform: "uppercase", marginBottom: 12 }}>
            What you typed ({session.text.length} chars)
          </div>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 14,
            lineHeight: 1.8,
            color: "#6b6660",
            maxHeight: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {session.text || "(nothing typed)"}
          </div>
        </div>

        {/* Raw key events toggle */}
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={() => setShowRaw(!showRaw)}
            style={{
              background: "transparent",
              border: "1px solid #2e2b26",
              color: "#4a4742",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {showRaw ? "Hide" : "Show"} raw key events ({session.keyEvents.length})
          </button>

          {showRaw && (
            <div style={{
              marginTop: 12,
              background: "#0e0d0b",
              border: "1px solid #1a1814",
              borderRadius: 10,
              padding: 16,
              maxHeight: 240,
              overflowY: "auto",
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: "#4a4742",
              lineHeight: 1.9,
            }}>
              {session.keyEvents.slice(0, 200).map((e, i) => (
                <span key={i} style={{ marginRight: 6, display: "inline-block" }}>
                  <span style={{ color: e.isBackspace ? "#d4856a" : e.isModifier ? "#7ab5d4" : "#6b6660" }}>
                    {e.key === " " ? "·" : e.key}
                  </span>
                  <span style={{ color: "#2e2b26" }}>@{e.timestamp.toFixed(0)}ms</span>
                </span>
              ))}
              {session.keyEvents.length > 200 && (
                <span style={{ color: "#2e2b26" }}>…and {session.keyEvents.length - 200} more</span>
              )}
            </div>
          )}
        </div>

        {/* History */}
        {allSessions.length > 1 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#4a4742", textTransform: "uppercase" }}>
                All sessions ({allSessions.length})
              </div>
              <button
                onClick={onClearHistory}
                style={{ background: "transparent", border: "none", color: "#3d3830", fontSize: 12, cursor: "pointer" }}
              >
                Clear all
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allSessions.map((s, i) => (
                <div key={s.id} style={{
                  background: s.id === session.id ? "#1a1814" : "#141210",
                  border: `1px solid ${s.id === session.id ? "#3d3830" : "#1e1c18"}`,
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 12,
                  alignItems: "center",
                }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#2e2b26" }}>
                    #{allSessions.length - i}
                  </span>
                  <span style={{ fontSize: 12, color: "#4a4742", fontFamily: "'DM Mono', monospace" }}>
                    {new Date(s.startedAt).toLocaleString()}
                  </span>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                    <span style={{ color: "#c9a96e" }}>{s.analytics.wpm} wpm</span>
                    <span style={{ color: "#7eb87e" }}>{s.analytics.accuracy}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TrainingPage Component ───────────────────────────────────────────────────
export default function TrainingPage() {
  // ─── State ───────────────────────────────────────────────────────────────
  const [view, setView] = useState<AppView>("training");
  const [text, setText] = useState("");
  const [keyEvents, setKeyEvents] = useState<KeyEvent[]>([]);
  const [typingStarted, setTypingStarted] = useState(false);
  const [sessionStartISO, setSessionStartISO] = useState("");
  const [sessionStartPerf, setSessionStartPerf] = useState<number | null>(null);
  const [completedSession, setCompletedSession] = useState<TypingSession | null>(null);
  const [allSessions, setAllSessions] = useState<TypingSession[]>(() => loadSessions());
  const [timerDurationSecs] = useState(60);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Session finalization ─────────────────────────────────────────────────
  const finalizeSession = useCallback(
    (evts: KeyEvent[], txt: string, startPerf: number | null) => {
      const durationMs = startPerf !== null ? Math.round(performance.now() - startPerf) : 0;
      const analytics = buildAnalytics(evts, durationMs);
      const session: TypingSession = {
        id: `session_${Date.now()}`,
        startedAt: sessionStartISO || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        text: txt,
        keyEvents: evts,
        analytics,
      };
      saveSession(session);
      setCompletedSession(session);
      setAllSessions(loadSessions());
      return session;
    },
    [sessionStartISO]
  );

  // ─── Timer callbacks ─────────────────────────────────────────────────────
  const handleTimerFinish = useCallback(() => {
    setKeyEvents((evts) => {
      setText((txt) => {
        setSessionStartPerf((sp) => {
          finalizeSession(evts, txt, sp);
          return sp;
        });
        return txt;
      });
      return evts;
    });
    setTimeout(() => setView("analytics"), 300);
  }, [finalizeSession]);

  const handleTimerReset = useCallback(() => {
    setText("");
    setKeyEvents([]);
    setTypingStarted(false);
    setSessionStartISO("");
    setSessionStartPerf(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  // ─── Key capture ─────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isModifier = MODIFIERS.has(e.key);
      const isBackspace = e.key === "Backspace";
      const isTypeable = !isModifier && e.key.length === 1;

      if (!typingStarted && (isTypeable || isBackspace)) {
        setTypingStarted(true);
        setSessionStartISO(new Date().toISOString());
        setSessionStartPerf(performance.now());
      }

      const event: KeyEvent = {
        key: e.key,
        code: e.code,
        timestamp: performance.now(),
        isModifier,
        isBackspace,
        isTypeable,
      };

      setKeyEvents((prev) => [...prev, event]);
    },
    [typingStarted]
  );

  // ─── Live analytics ──────────────────────────────────────────────────────
  const liveAnalytics = useMemo(() => {
    if (keyEvents.length < 2) return null;
    const elapsed = sessionStartPerf !== null ? Math.round(performance.now() - sessionStartPerf) : 0;
    return buildAnalytics(keyEvents, elapsed);
  }, [keyEvents.length, sessionStartPerf]); // eslint-disable-line

  // ─── Navigation ─────────────────────────────────────────────────────────
  const handleViewAnalytics = useCallback(() => {
    if (keyEvents.length === 0) return;
    const session = finalizeSession(keyEvents, text, sessionStartPerf);
    setCompletedSession(session);
    setView("analytics");
  }, [keyEvents, text, sessionStartPerf, finalizeSession]);

  const handleBack = useCallback(() => {
    setView("training");
    handleTimerReset();
  }, [handleTimerReset]);

  const handleClearHistory = useCallback(() => {
    clearSessions();
    setAllSessions([]);
  }, []);

  // ─── Render analytics view ──────────────────────────────────────────────
  if (view === "home") {
    return <HomePage
    onStart={() => setView("training")}
    />;
  }

  if (view === "analytics" && completedSession) {
    return (
      <AnalyticsPage
        session={completedSession}
        onBack={handleBack}
        allSessions={allSessions}
        onClearHistory={handleClearHistory}
      />
    );
  }

  // ─── Training view ──────────────────────────────────────────────────────
  const recentEvents = keyEvents.slice(-14);
  const typeableCount = keyEvents.filter((e) => e.isTypeable).length;
  const backspaceCount = keyEvents.filter((e) => e.isBackspace).length;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#111009",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      color: "#c8c2ba",
      padding: "40px 24px",
    }}>
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: "#e8e0d4", letterSpacing: "-0.02em" }}>
            Typing Training
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#3d3830" }}>
            Timer-bound session · every keystroke recorded
          </p>
        </div>

        {/* Main layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20, alignItems: "start" }}>
          {/* LEFT: Typing area + mini stats */}
          <div>
            {/* Typing area */}
            <div style={{
              borderRadius: 12,
              border: typingStarted ? "1px solid #3d3830" : "1px solid #1e1c18",
              background: "#141210",
              marginBottom: 16,
              transition: "border-color 0.3s",
            }}>
              {/* Top bar */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #1a1814" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: typingStarted ? "#7eb87e" : "#2e2b26",
                    transition: "background 0.3s",
                    display: "inline-block",
                  }} />
                  <span style={{ fontSize: 11, color: "#3d3830", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace" }}>
                    {typingStarted ? `${typeableCount} chars · ${backspaceCount} bs` : "ready"}
                  </span>
                </div>
                {liveAnalytics && (
                  <div style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                    <span style={{ color: "#c9a96e" }}>{liveAnalytics.wpm} wpm</span>
                    <span style={{ color: "#7eb87e" }}>{liveAnalytics.accuracy}%</span>
                  </div>
                )}
              </div>

              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                spellCheck={false}
                placeholder="Start typing — timer begins on first keystroke..."
                style={{
                  width: "100%",
                  minHeight: 300,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  resize: "vertical",
                  padding: "20px",
                  fontSize: 17,
                  lineHeight: 1.8,
                  color: "#d4cdc5",
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: "0.01em",
                  boxSizing: "border-box",
                  caretColor: "#c9a96e",
                }}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button
                onClick={() => { setView("home"); handleTimerReset(); }}
                style={{
                  background: "#1a1814",
                  border: "1px solid #2e2b26",
                  color: "#c8c2ba",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ← Back to Home
              </button>

              <button
                onClick={handleViewAnalytics}
                disabled={keyEvents.length === 0}
                style={{
                  background: "#1a1814",
                  border: "1px solid #2e2b26",
                  color: keyEvents.length === 0 ? "#2e2b26" : "#c8c2ba",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 12,
                  cursor: keyEvents.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                End & view analytics →
              </button>
            </div>

            {/* Recent keystrokes */}
            {recentEvents.length > 0 && (
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#2e2b26", textTransform: "uppercase", marginBottom: 8 }}>
                  Recent keys
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {recentEvents.map((evt, i) => (
                    <div
                      key={i}
                      title={`${evt.code} @ ${evt.timestamp.toFixed(0)}ms`}
                      style={{
                        background: evt.isBackspace ? "#2d1a18" : evt.isModifier ? "#1a1e2d" : "#1a1814",
                        border: `1px solid ${evt.isBackspace ? "#4a2820" : evt.isModifier ? "#252840" : "#2a2822"}`,
                        color: evt.isBackspace ? "#d4856a" : evt.isModifier ? "#7ab5d4" : "#6b6660",
                        borderRadius: 5,
                        padding: "3px 7px",
                        fontSize: 11,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {evt.key === " " ? "␣" : evt.key.length > 5 ? evt.key.slice(0, 5) + "…" : evt.key}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Timer */}
          <div>
            <Timer
              onFinish={handleTimerFinish}
              onReset={handleTimerReset}
              typingStarted={typingStarted}
            />

            {liveAnalytics && (
              <div style={{
                marginTop: 12,
                background: "#141210",
                border: "1px solid #1e1c18",
                borderRadius: 12,
                padding: "14px 16px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px 8px",
              }}>
                {[
                  { label: "Active", value: fmt(liveAnalytics.activeTypingMs) },
                  { label: "Pauses", value: liveAnalytics.pauseCount },
                  { label: "Keys", value: liveAnalytics.totalKeystrokes },
                  { label: "BkSp", value: liveAnalytics.backspaceCount },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "#3d3830", textTransform: "uppercase" }}>{s.label}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, color: "#6b6660" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}