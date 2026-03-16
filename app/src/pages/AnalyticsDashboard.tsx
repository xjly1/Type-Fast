import { useState, useMemo } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ─── Types (mirror TypingTracker.tsx) ─────────────────────────────────────────

export interface KeyEvent {
  key: string;
  code: string;
  timestamp: number;
  isModifier: boolean;
  isBackspace: boolean;
  isTypeable: boolean;
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
  startedAt: string;
  endedAt: string;
  text: string;
  keyEvents: KeyEvent[];
  analytics: SessionAnalytics;
}

// ─── localStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "typing_tracker_sessions";

export function loadSessions(): TypingSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TypingSession[]) : [];
  } catch { return []; }
}

// ─── Derived Data Builders ────────────────────────────────────────────────────

const PAUSE_THRESHOLD_MS = 2000;
const WINDOW_CHARS = 20; // rolling window for WPM-over-time

/** Slice keyEvents into time windows and compute rolling WPM per window */
function buildWpmTimeline(events: KeyEvent[]): { t: number; wpm: number }[] {
  const typeable = events.filter(e => e.isTypeable);
  if (typeable.length < 5) return [];
  const t0 = typeable[0].timestamp;
  const points: { t: number; wpm: number }[] = [];

  for (let i = WINDOW_CHARS; i <= typeable.length; i += Math.max(1, Math.floor(WINDOW_CHARS / 4))) {
    const slice = typeable.slice(Math.max(0, i - WINDOW_CHARS), i);
    const spanMs = slice[slice.length - 1].timestamp - slice[0].timestamp;
    if (spanMs < 100) continue;
    const wpm = Math.round((slice.length / 5) / (spanMs / 60_000));
    const tSec = Math.round((typeable[i - 1].timestamp - t0) / 1000);
    points.push({ t: tSec, wpm: Math.min(wpm, 250) }); // cap outliers
  }
  return points;
}

/** Detect pause intervals from event timestamps */
function buildPauseTimeline(events: KeyEvent[]): { t: number; pause: number }[] {
  if (events.length < 2) return [];
  const t0 = events[0].timestamp;
  const result: { t: number; pause: number }[] = [];
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].timestamp - events[i - 1].timestamp;
    if (gap > PAUSE_THRESHOLD_MS) {
      result.push({
        t: Math.round((events[i - 1].timestamp - t0) / 1000),
        pause: Math.round(gap / 100) / 10, // seconds, 1dp
      });
    }
  }
  return result;
}

/** Count errors per physical key code */
function buildHeatmapData(events: KeyEvent[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const evt of events) {
    if (evt.isBackspace) {
      // attribute the error to the previous typeable key if available
      const prevTypeable = [...events]
        .slice(0, events.indexOf(evt))
        .reverse()
        .find(e => e.isTypeable);
      if (prevTypeable) {
        map[prevTypeable.code] = (map[prevTypeable.code] ?? 0) + 1;
      }
    }
  }
  return map;
}

/** WPM trend across all historical sessions */
function buildHistoryTrend(sessions: TypingSession[]): { n: number; wpm: number; acc: number }[] {
  return sessions
    .slice()
    .reverse()
    .slice(-12)
    .map((s, i) => ({ n: i + 1, wpm: s.analytics.wpm, acc: s.analytics.accuracy }));
}

// ─── Color Helpers ────────────────────────────────────────────────────────────

/** Interpolate between green → amber → red based on 0-1 intensity */
function heatColor(intensity: number): string {
  if (intensity <= 0) return "#1e2a1e";
  if (intensity < 0.33) {
    // green → amber
    const t = intensity / 0.33;
    return lerpColor("#2d5a2d", "#7a5a1a", t);
  } else if (intensity < 0.66) {
    const t = (intensity - 0.33) / 0.33;
    return lerpColor("#7a5a1a", "#7a2a10", t);
  } else {
    const t = (intensity - 0.66) / 0.34;
    return lerpColor("#7a2a10", "#a01515", t);
  }
}

function heatBorderColor(intensity: number): string {
  if (intensity <= 0) return "#2a2a1e";
  if (intensity < 0.33) return "#4a7a4a";
  if (intensity < 0.66) return "#c9a96e";
  return "#d4856a";
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${rr.toString(16).padStart(2,"0")}${rg.toString(16).padStart(2,"0")}${rb.toString(16).padStart(2,"0")}`;
}

// ─── Keyboard Layout ──────────────────────────────────────────────────────────

const KEYBOARD_ROWS: { key: string; code: string; w?: number }[][] = [
  [
    { key: "`", code: "Backquote" }, { key: "1", code: "Digit1" }, { key: "2", code: "Digit2" },
    { key: "3", code: "Digit3" }, { key: "4", code: "Digit4" }, { key: "5", code: "Digit5" },
    { key: "6", code: "Digit6" }, { key: "7", code: "Digit7" }, { key: "8", code: "Digit8" },
    { key: "9", code: "Digit9" }, { key: "0", code: "Digit0" }, { key: "-", code: "Minus" },
    { key: "=", code: "Equal" }, { key: "⌫", code: "Backspace", w: 1.8 },
  ],
  [
    { key: "Tab", code: "Tab", w: 1.4 }, { key: "Q", code: "KeyQ" }, { key: "W", code: "KeyW" },
    { key: "E", code: "KeyE" }, { key: "R", code: "KeyR" }, { key: "T", code: "KeyT" },
    { key: "Y", code: "KeyY" }, { key: "U", code: "KeyU" }, { key: "I", code: "KeyI" },
    { key: "O", code: "KeyO" }, { key: "P", code: "KeyP" }, { key: "[", code: "BracketLeft" },
    { key: "]", code: "BracketRight" }, { key: "\\", code: "Backslash", w: 1.4 },
  ],
  [
    { key: "Caps", code: "CapsLock", w: 1.7 }, { key: "A", code: "KeyA" }, { key: "S", code: "KeyS" },
    { key: "D", code: "KeyD" }, { key: "F", code: "KeyF" }, { key: "G", code: "KeyG" },
    { key: "H", code: "KeyH" }, { key: "J", code: "KeyJ" }, { key: "K", code: "KeyK" },
    { key: "L", code: "KeyL" }, { key: ";", code: "Semicolon" }, { key: "'", code: "Quote" },
    { key: "↵", code: "Enter", w: 2.1 },
  ],
  [
    { key: "⇧", code: "ShiftLeft", w: 2.3 }, { key: "Z", code: "KeyZ" }, { key: "X", code: "KeyX" },
    { key: "C", code: "KeyC" }, { key: "V", code: "KeyV" }, { key: "B", code: "KeyB" },
    { key: "N", code: "KeyN" }, { key: "M", code: "KeyM" }, { key: ",", code: "Comma" },
    { key: ".", code: "Period" }, { key: "/", code: "Slash" }, { key: "⇧", code: "ShiftRight", w: 2.5 },
  ],
  [
    { key: "⌃", code: "ControlLeft", w: 1.4 }, { key: "⌥", code: "AltLeft", w: 1.2 },
    { key: " ", code: "Space", w: 5.8 },
    { key: "⌥", code: "AltRight", w: 1.2 }, { key: "⌃", code: "ControlRight", w: 1.4 },
  ],
];

const KEY_W = 36; // base key width px
const KEY_H = 34;
const KEY_GAP = 4;
const ROW_OFFSETS = [0, 0, 6, 10, 8]; // pixel indent per row

// ─── SVG Keyboard Heatmap ─────────────────────────────────────────────────────

interface KeyboardHeatmapProps {
  heatmapData: Record<string, number>;
}

function KeyboardHeatmap({ heatmapData }: KeyboardHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; key: string; count: number } | null>(null);

  const maxErrors = Math.max(1, ...Object.values(heatmapData));

  // Pre-compute per-key metrics
  const keyMeta = useMemo(() => {
    const meta: Record<string, { count: number; intensity: number; fill: string; border: string }> = {};
    for (const row of KEYBOARD_ROWS) {
      for (const k of row) {
        const count = heatmapData[k.code] ?? 0;
        const intensity = count / maxErrors;
        meta[k.code] = {
          count,
          intensity,
          fill: heatColor(intensity),
          border: heatBorderColor(intensity),
        };
      }
    }
    return meta;
  }, [heatmapData, maxErrors]);

  // Calculate SVG dimensions
  const maxRowWidth = KEYBOARD_ROWS.reduce((best, row, ri) => {
    const w = ROW_OFFSETS[ri] + row.reduce((s, k) => s + (k.w ?? 1) * KEY_W + KEY_GAP, -KEY_GAP);
    return Math.max(best, w);
  }, 0);
  const svgW = maxRowWidth + 24;
  const svgH = KEYBOARD_ROWS.length * (KEY_H + KEY_GAP) - KEY_GAP + 24;

  return (
    <div style={{ position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setTooltip(null)}
      >
        {KEYBOARD_ROWS.map((row, ri) => {
          let x = ROW_OFFSETS[ri] + 12;
          const y = ri * (KEY_H + KEY_GAP) + 12;
          return row.map((k) => {
            const kw = (k.w ?? 1) * KEY_W + ((k.w ?? 1) - 1) * KEY_GAP;
            const meta = keyMeta[k.code] ?? { count: 0, intensity: 0, fill: "#1e1c18", border: "#2e2b26" };
            const cx = x;
            x += kw + KEY_GAP;
            const midX = cx + kw / 2;
            const midY = y + KEY_H / 2;

            return (
              <g
                key={k.code}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  const svgScale = rect.width / svgW;
                  setTooltip({
                    x: cx * svgScale + rect.left,
                    y: y * svgScale + rect.top,
                    key: k.key,
                    count: meta.count,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <rect
                  x={cx} y={y}
                  width={kw} height={KEY_H}
                  rx={5}
                  fill={meta.fill}
                  stroke={meta.border}
                  strokeWidth={1}
                />
                {/* Error intensity glow stripe at bottom of key */}
                {meta.intensity > 0 && (
                  <rect
                    x={cx + 4} y={y + KEY_H - 4}
                    width={kw - 8} height={2}
                    rx={1}
                    fill={meta.border}
                    opacity={0.8}
                  />
                )}
                <text
                  x={midX} y={midY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={k.w && k.w > 1.5 ? 9 : 11}
                  fontFamily="'DM Mono', monospace"
                  fill={meta.intensity > 0.5 ? "#e8c8b0" : "#6b6660"}
                >
                  {k.key}
                </text>
                {/* Small error count badge */}
                {meta.count > 0 && (
                  <text
                    x={cx + kw - 5} y={y + 8}
                    textAnchor="end"
                    dominantBaseline="central"
                    fontSize={7}
                    fontFamily="'DM Mono', monospace"
                    fill={meta.intensity > 0.5 ? "#d4856a" : "#c9a96e"}
                    opacity={0.9}
                  >
                    {meta.count}
                  </text>
                )}
              </g>
            );
          });
        })}
      </svg>

      {/* Tooltip (rendered in DOM, not SVG, to escape overflow:hidden) */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y - 44,
            transform: "translateX(-50%)",
            background: "#0e0d0b",
            border: "1px solid #3d3830",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontFamily: "'DM Mono', monospace",
            color: "#c8c2ba",
            pointerEvents: "none",
            zIndex: 9999,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "#e8e0d4" }}>{tooltip.key === " " ? "Space" : tooltip.key}</span>
          {" — "}
          <span style={{ color: tooltip.count > 0 ? "#d4856a" : "#4a4742" }}>
            {tooltip.count} error{tooltip.count !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 10, color: "#3d3830", letterSpacing: "0.08em" }}>ERRORS</span>
        {[0, 0.16, 0.33, 0.5, 0.66, 0.83, 1].map((v) => (
          <div
            key={v}
            style={{
              width: 18, height: 10, borderRadius: 3,
              background: heatColor(v),
              border: `1px solid ${heatBorderColor(v)}`,
            }}
          />
        ))}
        <span style={{ fontSize: 10, color: "#3d3830" }}>none → many</span>
      </div>
    </div>
  );
}

// ─── Custom Tooltip Components ────────────────────────────────────────────────

function WpmTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#141210", border: "1px solid #2e2b26",
      borderRadius: 8, padding: "8px 14px", fontSize: 12,
      fontFamily: "'DM Mono', monospace", color: "#c8c2ba",
    }}>
      <div style={{ color: "#4a4742", marginBottom: 2 }}>{label}s</div>
      <div style={{ color: "#c9a96e" }}>{payload[0].value} wpm</div>
    </div>
  );
}

function PauseTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#141210", border: "1px solid #2e2b26",
      borderRadius: 8, padding: "8px 14px", fontSize: 12,
      fontFamily: "'DM Mono', monospace", color: "#c8c2ba",
    }}>
      <div style={{ color: "#4a4742", marginBottom: 2 }}>at {label}s</div>
      <div style={{ color: "#7ab5d4" }}>{payload[0].value}s pause</div>
    </div>
  );
}

function HistoryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#141210", border: "1px solid #2e2b26",
      borderRadius: 8, padding: "8px 14px", fontSize: 12,
      fontFamily: "'DM Mono', monospace", color: "#c8c2ba",
    }}>
      <div style={{ color: "#4a4742", marginBottom: 4 }}>Session #{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.dataKey === "wpm" ? "#c9a96e" : "#7eb87e" }}>
          {p.dataKey === "wpm" ? `${p.value} wpm` : `${p.value}% acc`}
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  delta?: { value: number; positive?: boolean };
}

function StatCard({ label, value, sub, accent = "#e8e0d4", delta }: StatCardProps) {
  return (
    <div style={{
      background: "#141210",
      border: "1px solid #1e1c18",
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      <div style={{
        fontSize: 10, letterSpacing: "0.14em",
        color: "#3d3830", textTransform: "uppercase", marginBottom: 10,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 34, fontWeight: 700,
        color: accent, fontFamily: "'DM Mono', monospace",
        lineHeight: 1, marginBottom: 6,
      }}>
        {value}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {delta !== undefined && (
          <span style={{
            fontSize: 11, fontFamily: "'DM Mono', monospace",
            color: delta.positive === false ? "#d4856a"
              : delta.value > 0 ? "#7eb87e"
              : delta.value < 0 ? "#d4856a"
              : "#4a4742",
          }}>
            {delta.value > 0 ? "▲" : delta.value < 0 ? "▼" : "─"}
            {Math.abs(delta.value)}
          </span>
        )}
        {sub && <span style={{ fontSize: 11, color: "#3d3830" }}>{sub}</span>}
      </div>
    </div>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: "0.14em",
      color: "#3d3830", textTransform: "uppercase",
      marginBottom: 14, paddingBottom: 8,
      borderBottom: "1px solid #1a1814",
    }}>
      {children}
    </div>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "#141210",
      border: "1px solid #1e1c18",
      borderRadius: 14,
      padding: "20px 22px",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface AnalyticsDashboardProps {
  /** Pass the session directly, or leave undefined to load the latest from localStorage */
  session?: TypingSession;
  onBack?: () => void;
}

export default function AnalyticsDashboard({ session: propSession, onBack }: AnalyticsDashboardProps) {
  const allSessions = useMemo(() => loadSessions(), []);
  const session = propSession ?? allSessions[0];

  const [activeTab, setActiveTab] = useState<"current" | "history">("current");

  // ── Derived data ──────────────────────────────────────────────────────────

  const { wpmTimeline, pauseTimeline, heatmapData, historyTrend, prevSession } = useMemo(() => {
    if (!session) return {
      wpmTimeline: [], pauseTimeline: [],
      heatmapData: {}, historyTrend: [], prevSession: null,
    };
    const prevIdx = allSessions.findIndex(s => s.id === session.id) + 1;
    return {
      wpmTimeline: buildWpmTimeline(session.keyEvents),
      pauseTimeline: buildPauseTimeline(session.keyEvents),
      heatmapData: buildHeatmapData(session.keyEvents),
      historyTrend: buildHistoryTrend(allSessions),
      prevSession: allSessions[prevIdx] ?? null,
    };
  }, [session, allSessions]);

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!session) {
    return (
      <div style={{
        minHeight: "100vh", background: "#111009",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif", color: "#4a4742",
      }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>⌨</div>
          <div style={{ fontSize: 15, color: "#3d3830" }}>No sessions yet</div>
          <div style={{ fontSize: 12, color: "#2a2822", marginTop: 4 }}>Complete a typing session to see analytics</div>
        </div>
      </div>
    );
  }

  const a = session.analytics;
  const fmt = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  };

  const wpmDelta = prevSession ? a.wpm - prevSession.analytics.wpm : undefined;
  const accDelta = prevSession ? a.accuracy - prevSession.analytics.accuracy : undefined;

  const errorKeys = Object.entries(heatmapData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const avgWpm = wpmTimeline.length > 0
    ? Math.round(wpmTimeline.reduce((s, p) => s + p.wpm, 0) / wpmTimeline.length)
    : a.wpm;

  const peakWpm = wpmTimeline.length > 0
    ? Math.max(...wpmTimeline.map(p => p.wpm))
    : a.wpm;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh",
      background: "#111009",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      color: "#c8c2ba",
      padding: "36px 24px 60px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
          <div>
            {onBack && (
              <button
                onClick={onBack}
                style={{
                  background: "transparent", border: "none",
                  color: "#3d3830", fontSize: 12, cursor: "pointer",
                  padding: 0, marginBottom: 8, letterSpacing: "0.04em",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                ← Back to training
              </button>
            )}
            <h1 style={{
              margin: 0, fontSize: 24, fontWeight: 600,
              color: "#e8e0d4", letterSpacing: "-0.02em",
            }}>
              Analytics
            </h1>
            <p style={{
              margin: "4px 0 0", fontSize: 11,
              color: "#3d3830", fontFamily: "'DM Mono', monospace",
            }}>
              {new Date(session.startedAt).toLocaleString()} · {fmt(a.durationMs)}
              {allSessions.length > 1 && ` · session ${allSessions.length} of ${allSessions.length}`}
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{
            display: "flex", background: "#141210",
            border: "1px solid #1e1c18", borderRadius: 10, padding: 3,
          }}>
            {(["current", "history"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? "#2a2822" : "transparent",
                  border: `1px solid ${activeTab === tab ? "#3d3830" : "transparent"}`,
                  color: activeTab === tab ? "#c8c2ba" : "#4a4742",
                  borderRadius: 7, padding: "7px 16px",
                  fontSize: 12, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.15s",
                  letterSpacing: "0.02em",
                }}
              >
                {tab === "current" ? "Current session" : `History (${allSessions.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════ CURRENT SESSION TAB ═══════════════════════ */}
        {activeTab === "current" && (
          <>
            {/* ── Stat cards row ───────────────────────────────────────── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}>
              <StatCard
                label="WPM"
                value={a.wpm}
                accent="#c9a96e"
                sub="gross speed"
                delta={wpmDelta !== undefined ? { value: wpmDelta } : undefined}
              />
              <StatCard
                label="Accuracy"
                value={`${a.accuracy}%`}
                accent="#7eb87e"
                sub="incl. corrections"
                delta={accDelta !== undefined ? { value: accDelta } : undefined}
              />
              <StatCard
                label="Errors"
                value={a.backspaceCount + a.uncorrectedMistakes}
                accent="#d4856a"
                sub={`${a.backspaceCount} corrected`}
              />
              <StatCard
                label="Backspaces"
                value={a.backspaceCount}
                accent="#d4856a"
                sub="corrections made"
              />
              <StatCard
                label="Avg pause"
                value={fmt(a.avgPauseMs)}
                accent="#7ab5d4"
                sub={`${a.pauseCount} pauses total`}
              />
              <StatCard
                label="Active time"
                value={fmt(a.activeTypingMs)}
                accent="#7ab5d4"
                sub="excl. pauses"
              />
            </div>

            {/* ── WPM over time + peak/avg ──────────────────────────── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 200px",
              gap: 12,
              marginBottom: 12,
              alignItems: "stretch",
            }}>
              <Panel>
                <SectionLabel>WPM over time</SectionLabel>
                {wpmTimeline.length > 2 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={wpmTimeline} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="wpmGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#c9a96e" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#c9a96e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke="#1e1c18" vertical={false} />
                      <XAxis
                        dataKey="t" tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                        tickFormatter={(v) => `${v}s`} axisLine={false} tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                        axisLine={false} tickLine={false} domain={["auto", "auto"]}
                      />
                      <Tooltip content={<WpmTooltip />} />
                      <ReferenceLine y={avgWpm} stroke="#3d3830" strokeDasharray="3 3" />
                      <Area
                        type="monotone" dataKey="wpm"
                        stroke="#c9a96e" strokeWidth={2}
                        fill="url(#wpmGrad)" dot={false} activeDot={{ r: 4, fill: "#c9a96e" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#2e2b26", fontSize: 12 }}>
                    Not enough data — type more to see WPM trends
                  </div>
                )}
              </Panel>

              <Panel style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <SectionLabel>Speed</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#3d3830", letterSpacing: "0.1em", marginBottom: 4 }}>PEAK WPM</div>
                    <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#e8b86e" }}>{peakWpm}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#3d3830", letterSpacing: "0.1em", marginBottom: 4 }}>AVG WPM</div>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#c9a96e" }}>{avgWpm}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#3d3830", letterSpacing: "0.1em", marginBottom: 4 }}>KEYSTROKES</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#6b6660" }}>{a.totalKeystrokes}</div>
                  </div>
                </div>
              </Panel>
            </div>

            {/* ── Pause timeline ────────────────────────────────────── */}
            <Panel style={{ marginBottom: 12 }}>
              <SectionLabel>Pause timeline</SectionLabel>
              {pauseTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={pauseTimeline} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#1e1c18" vertical={false} />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      tickFormatter={(v) => `${v}s`} axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      axisLine={false} tickLine={false} unit="s"
                    />
                    <Tooltip content={<PauseTooltip />} />
                    <Bar dataKey="pause" fill="#7ab5d4" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#2e2b26", fontSize: 12 }}>
                  No pauses detected (&gt;2s gaps) — great focus!
                </div>
              )}
            </Panel>

            {/* ── Keyboard Heatmap ──────────────────────────────────── */}
            <Panel style={{ marginBottom: 12 }}>
              <SectionLabel>Error heatmap — hover any key for details</SectionLabel>
              <KeyboardHeatmap heatmapData={heatmapData} />

              {/* Top error keys */}
              {errorKeys.length > 0 && (
                <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#3d3830", letterSpacing: "0.1em", alignSelf: "center" }}>
                    TOP ERRORS
                  </span>
                  {errorKeys.map(([code, count]) => {
                    const keyLabel = KEYBOARD_ROWS.flat().find(k => k.code === code)?.key ?? code;
                    return (
                      <div
                        key={code}
                        style={{
                          background: "#2a1a14",
                          border: "1px solid #4a2820",
                          borderRadius: 7,
                          padding: "4px 10px",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#e8c8b0" }}>
                          {keyLabel === " " ? "Space" : keyLabel}
                        </span>
                        <span style={{ fontSize: 10, color: "#d4856a" }}>{count}×</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {errorKeys.length === 0 && (
                <div style={{ marginTop: 12, fontSize: 12, color: "#2e2b26" }}>
                  No errors detected — perfect session!
                </div>
              )}
            </Panel>

            {/* ── Accuracy breakdown ────────────────────────────────── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}>
              <Panel>
                <SectionLabel>Accuracy breakdown</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Correct keystrokes",    value: a.typeableKeystrokes - a.backspaceCount, color: "#7eb87e" },
                    { label: "Corrected mistakes",     value: a.correctedMistakes,                     color: "#c9a96e" },
                    { label: "Uncorrected mistakes",   value: a.uncorrectedMistakes,                   color: "#d4856a" },
                    { label: "Modifier keys",          value: a.totalKeystrokes - a.typeableKeystrokes - a.backspaceCount, color: "#4a4742" },
                  ].map(({ label, value, color }) => {
                    const pct = a.totalKeystrokes > 0 ? value / a.totalKeystrokes : 0;
                    return (
                      <div key={label}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: "#4a4742" }}>{label}</span>
                          <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color }}>{value}</span>
                        </div>
                        <div style={{ height: 3, background: "#1a1814", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, pct * 100)}%`, background: color, borderRadius: 2, transition: "width 0.5s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel>
                <SectionLabel>Session snapshot</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Characters typed",  value: session.text.length },
                    { label: "Words typed",        value: Math.round(session.text.split(/\s+/).filter(Boolean).length) },
                    { label: "Total duration",     value: fmt(a.durationMs) },
                    { label: "Longest pause",      value: fmt(a.longestPauseMs) },
                    { label: "Avg inter-key gap",  value: a.typeableKeystrokes > 1
                      ? `${Math.round(a.activeTypingMs / a.typeableKeystrokes)}ms`
                      : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 11, color: "#4a4742" }}>{label}</span>
                      <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: "#6b6660" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </>
        )}

        {/* ════════════════════════ HISTORY TAB ═════════════════════════ */}
        {activeTab === "history" && (
          <>
            {/* ── WPM + Accuracy trend ──────────────────────────── */}
            <Panel style={{ marginBottom: 12 }}>
              <SectionLabel>WPM & accuracy over sessions</SectionLabel>
              {historyTrend.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={historyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#1e1c18" vertical={false} />
                    <XAxis
                      dataKey="n" tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      tickFormatter={(v) => `#${v}`} axisLine={false} tickLine={false}
                    />
                    <YAxis yAxisId="wpm" tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="acc" orientation="right" tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip content={<HistoryTooltip />} />
                    <Line yAxisId="wpm" type="monotone" dataKey="wpm" stroke="#c9a96e" strokeWidth={2} dot={{ fill: "#c9a96e", r: 3 }} activeDot={{ r: 5 }} />
                    <Line yAxisId="acc" type="monotone" dataKey="acc" stroke="#7eb87e" strokeWidth={2} dot={{ fill: "#7eb87e", r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#2e2b26", fontSize: 12 }}>
                  Complete at least 2 sessions to see trends
                </div>
              )}
              <div style={{ display: "flex", gap: 20, marginTop: 10, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 11, color: "#4a4742" }}>
                  <span style={{ display: "inline-block", width: 20, height: 2, background: "#c9a96e", verticalAlign: "middle", marginRight: 6 }} />
                  WPM
                </span>
                <span style={{ fontSize: 11, color: "#4a4742" }}>
                  <span style={{ display: "inline-block", width: 20, height: 2, background: "#7eb87e", verticalAlign: "middle", marginRight: 6 }} />
                  Accuracy %
                </span>
              </div>
            </Panel>

            {/* ── Session list ───────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allSessions.map((s, i) => {
                const isCurrent = s.id === session.id;
                return (
                  <div
                    key={s.id}
                    style={{
                      background: isCurrent ? "#1a1814" : "#141210",
                      border: `1px solid ${isCurrent ? "#3d3830" : "#1e1c18"}`,
                      borderRadius: 10,
                      padding: "12px 16px",
                      display: "grid",
                      gridTemplateColumns: "32px 1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#2e2b26" }}>
                      #{allSessions.length - i}
                    </span>
                    <div>
                      <div style={{ fontSize: 11, color: "#3d3830", fontFamily: "'DM Mono', monospace", marginBottom: 2 }}>
                        {new Date(s.startedAt).toLocaleString()} · {fmt(s.analytics.durationMs)}
                      </div>
                      <div style={{ fontSize: 12, color: "#4a4742", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>
                        {s.text.slice(0, 60) || "(no text)"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 14, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                      <span style={{ color: "#c9a96e" }}>{s.analytics.wpm} wpm</span>
                      <span style={{ color: "#7eb87e" }}>{s.analytics.accuracy}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
