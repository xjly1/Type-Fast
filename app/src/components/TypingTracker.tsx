import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KeyEvent {
  key: string;
  code: string;
  timestamp: number; // performance.now()
  isModifier: boolean;
  isBackspace: boolean;
  isTypeable: boolean; // contributes to WPM / accuracy
}

export interface SessionAnalytics {
  wpm: number;
  accuracy: number;
  totalKeystrokes: number;
  typeableKeystrokes: number;
  backspaceCount: number;
  correctedMistakes: number;
  uncorrectedMistakes: number;
  pauseCount: number;
  totalPauseMs: number;
  avgPauseMs: number;
  longestPauseMs: number;
  activeTypingMs: number;
  durationMs: number;
}

export interface TypingSession {
  id: string;
  startedAt: string; // ISO string
  endedAt: string;
  text: string;
  keyEvents: KeyEvent[];
  analytics: SessionAnalytics;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "typing_tracker_sessions";
const PAUSE_THRESHOLD_MS = 2000; // gap > 2s counts as a pause
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"]);
const WORDS_PER_CHAR = 1 / 5; // standard: 5 chars = 1 word

// ─── Analytics Functions ──────────────────────────────────────────────────────

/**
 * Calculate gross WPM: (typeable chars / 5) / active-typing minutes.
 * Active time excludes pause gaps above PAUSE_THRESHOLD_MS.
 */
export function calcWPM(events: KeyEvent[], activeTypingMs: number): number {
  if (activeTypingMs <= 0) return 0;
  const typeable = events.filter((e) => e.isTypeable).length;
  const words = typeable * WORDS_PER_CHAR;
  const minutes = activeTypingMs / 60_000;
  return Math.round(words / minutes);
}

/**
 * Accuracy = (correct keystrokes / typeable keystrokes) * 100.
 * We reconstruct what the final text looks like by replaying events,
 * then compare to a naive "no-backspace" expected flow to detect
 * corrected vs uncorrected mistakes.
 */
export function calcAccuracy(events: KeyEvent[]): {
  accuracy: number;
  correctedMistakes: number;
  uncorrectedMistakes: number;
} {
  // Replay events into a virtual text buffer to detect corrections
  const buffer: string[] = [];
  let correctedMistakes = 0;
  let errorBuffer = 0; // chars typed erroneously before a backspace

  for (const evt of events) {
    if (evt.isBackspace) {
      if (buffer.length > 0) {
        buffer.pop();
        if (errorBuffer > 0) {
          correctedMistakes++;
          errorBuffer--;
        }
      }
    } else if (evt.isTypeable) {
      buffer.push(evt.key);
      // Heuristic: flag as error if the key is a non-letter-digit
      // In free-text mode we can't verify against a prompt,
      // so we track backspace-corrected chars as correctedMistakes above.
    }
  }

  const typeable = events.filter((e) => e.isTypeable).length;
  const backspaces = events.filter((e) => e.isBackspace).length;

  // Each backspace that deleted a typeable char is a corrected mistake
  const actualCorrected = Math.min(correctedMistakes + backspaces, typeable);
  const uncorrectedMistakes = 0; // in free-text mode without a prompt we can't know
  const correct = typeable - actualCorrected;
  const accuracy = typeable === 0 ? 100 : Math.round((correct / typeable) * 100);

  return {
    accuracy: Math.max(0, Math.min(100, accuracy)),
    correctedMistakes: backspaces, // each backspace = a corrected mistake
    uncorrectedMistakes,
  };
}

/**
 * Compute pause statistics from consecutive event timestamps.
 */
export function calcPauses(events: KeyEvent[]): {
  pauseCount: number;
  totalPauseMs: number;
  avgPauseMs: number;
  longestPauseMs: number;
  activeTypingMs: number;
} {
  if (events.length < 2) {
    return { pauseCount: 0, totalPauseMs: 0, avgPauseMs: 0, longestPauseMs: 0, activeTypingMs: 0 };
  }

  let totalPauseMs = 0;
  let pauseCount = 0;
  let longestPauseMs = 0;

  for (let i = 1; i < events.length; i++) {
    const gap = events[i].timestamp - events[i - 1].timestamp;
    if (gap > PAUSE_THRESHOLD_MS) {
      totalPauseMs += gap;
      pauseCount++;
      if (gap > longestPauseMs) longestPauseMs = gap;
    }
  }

  const totalSpan = events[events.length - 1].timestamp - events[0].timestamp;
  const activeTypingMs = Math.max(0, totalSpan - totalPauseMs);

  return {
    pauseCount,
    totalPauseMs: Math.round(totalPauseMs),
    avgPauseMs: pauseCount > 0 ? Math.round(totalPauseMs / pauseCount) : 0,
    longestPauseMs: Math.round(longestPauseMs),
    activeTypingMs: Math.round(activeTypingMs),
  };
}

/**
 * Build a complete SessionAnalytics object from raw key events.
 */
export function buildAnalytics(events: KeyEvent[], durationMs: number): SessionAnalytics {
  const pauseStats = calcPauses(events);
  const { accuracy, correctedMistakes, uncorrectedMistakes } = calcAccuracy(events);
  const wpm = calcWPM(events, pauseStats.activeTypingMs);

  return {
    wpm,
    accuracy,
    totalKeystrokes: events.length,
    typeableKeystrokes: events.filter((e) => e.isTypeable).length,
    backspaceCount: events.filter((e) => e.isBackspace).length,
    correctedMistakes,
    uncorrectedMistakes,
    ...pauseStats,
    durationMs,
  };
}

// ─── localStorage Helpers ─────────────────────────────────────────────────────

export function loadSessions(): TypingSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TypingSession[]) : [];
  } catch {
    return [];
  }
}

export function saveSession(session: TypingSession): void {
  try {
    const existing = loadSessions();
    const updated = [session, ...existing].slice(0, 50); // keep last 50
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save session:", e);
  }
}

export function clearSessions(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Component ────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

interface StatTileProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

function StatTile({ label, value, sub, accent = "#e8e0d4" }: StatTileProps) {
  return (
    <div style={{
      background: "#1a1814",
      border: "1px solid #2e2b26",
      borderRadius: 10,
      padding: "16px 20px",
      minWidth: 100,
    }}>
      <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#6b6660", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#4a4742", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function TypingTracker() {
  const [text, setText] = useState("");
  const [keyEvents, setKeyEvents] = useState<KeyEvent[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [sessionStartISO, setSessionStartISO] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [savedSessions, setSavedSessions] = useState<TypingSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load history on mount
  useEffect(() => {
    setSavedSessions(loadSessions());
  }, []);

  // Timer
  useEffect(() => {
    if (isActive && sessionStart !== null) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.round(performance.now() - sessionStart));
      }, 200);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, sessionStart]);

  // Live analytics (memoized, recalcs only when event list grows)
  const liveAnalytics = useMemo(() => {
    if (keyEvents.length === 0) return null;
    return buildAnalytics(keyEvents, elapsed);
  }, [keyEvents.length, elapsed]); // eslint-disable-line

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isModifier = MODIFIERS.has(e.key);
      const isBackspace = e.key === "Backspace";
      const isTypeable = !isModifier && e.key.length === 1;

      // Start session on first real keystroke
      if (!isActive && (isTypeable || isBackspace)) {
        const now = performance.now();
        setIsActive(true);
        setSessionStart(now);
        setSessionStartISO(new Date().toISOString());
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
    [isActive]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  }, []);

  const handleSave = useCallback(() => {
    if (keyEvents.length === 0) return;

    const endedAt = new Date().toISOString();
    const durationMs = sessionStart !== null ? Math.round(performance.now() - sessionStart) : 0;
    const analytics = buildAnalytics(keyEvents, durationMs);

    const session: TypingSession = {
      id: `session_${Date.now()}`,
      startedAt: sessionStartISO,
      endedAt,
      text,
      keyEvents,
      analytics,
    };

    saveSession(session);
    setSavedSessions(loadSessions());
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }, [keyEvents, sessionStart, sessionStartISO, text]);

  const handleReset = useCallback(() => {
    setText("");
    setKeyEvents([]);
    setIsActive(false);
    setSessionStart(null);
    setElapsed(0);
    setJustSaved(false);
    textareaRef.current?.focus();
  }, []);

  const elapsedDisplay = (() => {
    const s = Math.floor(elapsed / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  })();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#111009",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      color: "#c8c2ba",
      padding: "40px 24px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ maxWidth: 860, margin: "0 auto 32px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 600,
              color: "#e8e0d4",
              letterSpacing: "-0.02em",
            }}>
              Typing Tracker
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#4a4742" }}>
              Every keystroke captured — Shift, Ctrl, Alt, Backspace included
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              style={{
                background: "transparent",
                border: "1px solid #2e2b26",
                color: "#6b6660",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {showHistory ? "Hide" : "History"} ({savedSessions.length})
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Typing Area */}
        <div style={{
          position: "relative",
          marginBottom: 20,
          borderRadius: 12,
          border: isActive ? "1px solid #3d3830" : "1px solid #222019",
          background: "#141210",
          transition: "border-color 0.2s",
        }}>
          {/* Status bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderBottom: "1px solid #1e1c18",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: isActive ? "#7eb87e" : "#2e2b26",
                transition: "background 0.3s",
              }} />
              <span style={{ fontSize: 12, color: "#4a4742", fontFamily: "'DM Mono', monospace" }}>
                {isActive ? "recording" : "ready"}
              </span>
            </div>
            <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#4a4742" }}>
              {elapsedDisplay}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
            placeholder="Start typing anything — press any key to begin recording..."
            style={{
              width: "100%",
              minHeight: 260,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "vertical",
              padding: "20px",
              fontSize: 17,
              lineHeight: 1.75,
              color: "#d4cdc5",
              fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.01em",
              boxSizing: "border-box",
              caretColor: "#c9a96e",
            }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
          <button
            onClick={handleSave}
            disabled={keyEvents.length === 0}
            style={{
              background: justSaved ? "#2a3d2a" : "#1e1c18",
              border: `1px solid ${justSaved ? "#4a7a4a" : "#2e2b26"}`,
              color: justSaved ? "#7eb87e" : keyEvents.length === 0 ? "#2e2b26" : "#c8c2ba",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 500,
              cursor: keyEvents.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {justSaved ? "✓ Saved" : "Save Session"}
          </button>
          <button
            onClick={handleReset}
            style={{
              background: "transparent",
              border: "1px solid #2e2b26",
              color: "#4a4742",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </div>

        {/* Live Stats */}
        {liveAnalytics && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#4a4742", textTransform: "uppercase", marginBottom: 12 }}>
              Live Stats
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
              <StatTile label="WPM" value={liveAnalytics.wpm} sub="gross speed" accent="#c9a96e" />
              <StatTile label="Accuracy" value={`${liveAnalytics.accuracy}%`} sub="est. from backspaces" accent="#7eb87e" />
              <StatTile label="Keystrokes" value={liveAnalytics.totalKeystrokes} sub={`${liveAnalytics.typeableKeystrokes} typeable`} />
              <StatTile label="Backspaces" value={liveAnalytics.backspaceCount} sub="corrected mistakes" accent="#d4856a" />
              <StatTile label="Pauses" value={liveAnalytics.pauseCount} sub={`>${PAUSE_THRESHOLD_MS / 1000}s gaps`} />
              <StatTile label="Active Time" value={fmt(liveAnalytics.activeTypingMs)} sub="excl. pauses" accent="#7ab5d4" />
            </div>
          </div>
        )}

        {/* Pause Breakdown */}
        {liveAnalytics && liveAnalytics.pauseCount > 0 && (
          <div style={{
            background: "#141210",
            border: "1px solid #1e1c18",
            borderRadius: 10,
            padding: "16px 20px",
            marginBottom: 32,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "#4a4742", textTransform: "uppercase", marginBottom: 4 }}>Total pause time</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: "#c8c2ba" }}>{fmt(liveAnalytics.totalPauseMs)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "#4a4742", textTransform: "uppercase", marginBottom: 4 }}>Avg pause</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: "#c8c2ba" }}>{fmt(liveAnalytics.avgPauseMs)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "#4a4742", textTransform: "uppercase", marginBottom: 4 }}>Longest pause</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: "#c8c2ba" }}>{fmt(liveAnalytics.longestPauseMs)}</div>
            </div>
          </div>
        )}

        {/* Recent Key Events (last 12) */}
        {keyEvents.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#4a4742", textTransform: "uppercase", marginBottom: 12 }}>
              Recent key events (last 12)
            </div>
            <div style={{
              background: "#141210",
              border: "1px solid #1e1c18",
              borderRadius: 10,
              padding: "12px",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}>
              {keyEvents.slice(-12).map((evt, i) => (
                <div
                  key={i}
                  title={`code: ${evt.code} | ts: ${evt.timestamp.toFixed(1)}ms`}
                  style={{
                    background: evt.isBackspace ? "#2d1a18"
                      : evt.isModifier ? "#1a1e2d"
                      : "#1e1c18",
                    border: `1px solid ${evt.isBackspace ? "#5a2a25"
                      : evt.isModifier ? "#2a3050"
                      : "#2e2b26"}`,
                    color: evt.isBackspace ? "#d4856a"
                      : evt.isModifier ? "#7ab5d4"
                      : "#c8c2ba",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 12,
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  {evt.key === " " ? "␣" : evt.key.length > 6 ? evt.key.slice(0, 6) + "…" : evt.key}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#2e2b26", marginTop: 6 }}>
              orange = backspace · blue = modifier · hover for code + timestamp
            </div>
          </div>
        )}

        {/* Session History */}
        {showHistory && savedSessions.length > 0 && (
          <div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#4a4742", textTransform: "uppercase" }}>
                Saved Sessions
              </div>
              <button
                onClick={() => { clearSessions(); setSavedSessions([]); }}
                style={{
                  background: "transparent", border: "none",
                  color: "#3d3830", fontSize: 12, cursor: "pointer",
                }}
              >
                Clear all
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {savedSessions.map((s) => (
                <div key={s.id} style={{
                  background: "#141210",
                  border: "1px solid #1e1c18",
                  borderRadius: 10,
                  padding: "14px 18px",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#4a4742", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>
                      {new Date(s.startedAt).toLocaleString()} · {fmt(s.analytics.durationMs)}
                    </div>
                    <div style={{ fontSize: 13, color: "#6b6660", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
                      {s.text.slice(0, 80) || "(empty)"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
                    <span><span style={{ color: "#c9a96e" }}>{s.analytics.wpm}</span> <span style={{ color: "#2e2b26" }}>wpm</span></span>
                    <span><span style={{ color: "#7eb87e" }}>{s.analytics.accuracy}%</span> <span style={{ color: "#2e2b26" }}>acc</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showHistory && savedSessions.length === 0 && (
          <div style={{ color: "#2e2b26", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
            No saved sessions yet.
          </div>
        )}
      </div>
    </div>
  );
}
