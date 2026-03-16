import { useState, useMemo, useCallback } from "react";
import {
  ComposedChart, Area, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ScatterChart, Scatter, ZAxis,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  keyEvents: Array<{
    key: string; code: string; timestamp: number;
    isModifier: boolean; isBackspace: boolean; isTypeable: boolean;
  }>;
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

export function deleteSession(id: string): void {
  try {
    const sessions = loadSessions().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch { /* noop */ }
}

export function clearAllSessions(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Derived / Stat Helpers ───────────────────────────────────────────────────

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtDate(iso: string, short = false): string {
  const d = new Date(iso);
  if (short) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

/** Compute current streak: consecutive calendar days with at least one session */
function computeStreak(sessions: TypingSession[]): number {
  if (sessions.length === 0) return 0;
  const days = [...new Set(sessions.map(s => dayKey(s.startedAt)))].sort().reverse();
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (const day of days) {
    const d = new Date(day);
    const diff = Math.round((cursor.getTime() - d.getTime()) / 86_400_000);
    if (diff > 1) break;
    streak++;
    cursor = d;
  }
  return streak;
}

/** Rolling 7-session moving average */
function movingAvg(data: number[], window = 7): (number | null)[] {
  return data.map((_, i) => {
    if (i < window - 1) return null;
    const slice = data.slice(i - window + 1, i + 1);
    return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
  });
}

// ─── Chart Tooltip Components ─────────────────────────────────────────────────

const tooltipStyle: React.CSSProperties = {
  background: "#141210",
  border: "1px solid #2e2b26",
  borderRadius: 9,
  padding: "10px 14px",
  fontSize: 12,
  fontFamily: "'DM Mono', monospace",
  color: "#c8c2ba",
  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
};

function ProgressTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle}>
      <div style={{ color: "#4a4742", marginBottom: 6, fontSize: 11 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <span style={{ color: "#e8e0d4" }}>{p.value}{p.dataKey === "acc" ? "%" : " wpm"}</span>
        </div>
      ))}
    </div>
  );
}

function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={tooltipStyle}>
      <div style={{ color: "#c9a96e", marginBottom: 2 }}>{d.wpm} wpm</div>
      <div style={{ color: "#7eb87e" }}>{d.acc}% accuracy</div>
      <div style={{ color: "#4a4742", marginTop: 4, fontSize: 11 }}>{d.date}</div>
    </div>
  );
}

function DistributionTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle}>
      <div style={{ color: "#4a4742", fontSize: 11, marginBottom: 4 }}>{label} wpm</div>
      <div style={{ color: "#7ab5d4" }}>{payload[0].value} session{payload[0].value !== 1 ? "s" : ""}</div>
    </div>
  );
}

// ─── Small UI Atoms ───────────────────────────────────────────────────────────

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

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: 10, letterSpacing: "0.14em",
      color: "#3d3830", textTransform: "uppercase",
      marginBottom: 16, paddingBottom: 8,
      borderBottom: "1px solid #1a1814",
    }}>
      <span>{children}</span>
      {action}
    </div>
  );
}

interface StatChipProps {
  label: string;
  value: string | number;
  accent?: string;
  sub?: string;
  crown?: boolean;
}

function StatChip({ label, value, accent = "#c8c2ba", sub, crown }: StatChipProps) {
  return (
    <div style={{
      background: "#1a1814",
      border: "1px solid #1e1c18",
      borderRadius: 12,
      padding: "16px 18px",
      position: "relative",
    }}>
      {crown && (
        <div style={{
          position: "absolute", top: -8, right: 10,
          fontSize: 14, lineHeight: 1,
        }}>👑</div>
      )}
      <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "#3d3830", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: accent, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "#2e2b26", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ─── Sort / Filter Types ──────────────────────────────────────────────────────

type SortKey = "date" | "wpm" | "accuracy" | "duration";
type SortDir = "asc" | "desc";
type FilterRange = "all" | "7d" | "30d" | "90d";

// ─── Main History Page ────────────────────────────────────────────────────────

interface HistoryPageProps {
  /** Inject sessions (for testing / Storybook). Falls back to localStorage. */
  initialSessions?: TypingSession[];
  onBack?: () => void;
  /** Called when user clicks "View" on a session */
  onViewSession?: (session: TypingSession) => void;
}

export default function HistoryPage({
  initialSessions,
  onBack,
  onViewSession,
}: HistoryPageProps) {
  // ── State ──────────────────────────────────────────────────────────────────

  const [sessions, setSessions] = useState<TypingSession[]>(
    () => initialSessions ?? loadSessions()
  );
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterRange, setFilterRange] = useState<FilterRange>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [activeChart, setActiveChart] = useState<"progress" | "scatter" | "distribution">("progress");

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff: Record<FilterRange, number> = {
      all: 0,
      "7d": now - 7 * 86_400_000,
      "30d": now - 30 * 86_400_000,
      "90d": now - 90 * 86_400_000,
    };
    return sessions.filter(s => new Date(s.startedAt).getTime() >= cutoff[filterRange]);
  }, [sessions, filterRange]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "date":     av = new Date(a.startedAt).getTime(); bv = new Date(b.startedAt).getTime(); break;
        case "wpm":      av = a.analytics.wpm;       bv = b.analytics.wpm;       break;
        case "accuracy": av = a.analytics.accuracy;  bv = b.analytics.accuracy;  break;
        case "duration": av = a.analytics.durationMs; bv = b.analytics.durationMs; break;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  // Stats derived from ALL filtered sessions
  const stats = useMemo(() => {
    if (filtered.length === 0) return null;
    const wpms = filtered.map(s => s.analytics.wpm);
    const accs = filtered.map(s => s.analytics.accuracy);
    const best = filtered.reduce((b, s) => s.analytics.wpm > b.analytics.wpm ? s : b);
    const worstAcc = filtered.reduce((w, s) => s.analytics.accuracy < w.analytics.accuracy ? s : w);
    return {
      totalSessions: filtered.length,
      avgWpm: Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length),
      avgAcc: Math.round(accs.reduce((a, b) => a + b, 0) / accs.length),
      bestWpm: Math.max(...wpms),
      bestWpmSession: best,
      bestAcc: Math.max(...accs),
      lowestAcc: Math.min(...accs),
      lowestAccSession: worstAcc,
      totalTime: filtered.reduce((s, sess) => s + sess.analytics.durationMs, 0),
      streak: computeStreak(filtered),
    };
  }, [filtered]);

  // Chart data — chronological (oldest first)
  const chronological = useMemo(() => {
    return [...filtered]
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  }, [filtered]);

  const progressChartData = useMemo(() => {
    const wpms = chronological.map(s => s.analytics.wpm);
    const avg7 = movingAvg(wpms, Math.min(7, wpms.length));
    return chronological.map((s, i) => ({
      date: fmtDate(s.startedAt, true),
      wpm: s.analytics.wpm,
      acc: s.analytics.accuracy,
      avg7: avg7[i],
    }));
  }, [chronological]);

  const scatterData = useMemo(() =>
    chronological.map(s => ({
      wpm: s.analytics.wpm,
      acc: s.analytics.accuracy,
      date: fmtDate(s.startedAt),
      isBest: s.id === stats?.bestWpmSession?.id,
    })), [chronological, stats]);

  const distributionData = useMemo(() => {
    const bucketSize = 10;
    const buckets: Record<number, number> = {};
    for (const s of filtered) {
      const bucket = Math.floor(s.analytics.wpm / bucketSize) * bucketSize;
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([wpm, count]) => ({ wpm: `${wpm}–${Number(wpm) + bucketSize}`, count }));
  }, [filtered]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const toggleSort = useCallback((key: SortKey) => {
    if (key === sortKey) setDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
    function setDir(fn: (d: SortDir) => SortDir) { setSortDir(fn(sortDir)); }
  }, [sortKey, sortDir]);

  const handleDelete = useCallback((id: string) => {
    deleteSession(id);
    setSessions(loadSessions());
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const handleClearAll = useCallback(() => {
    clearAllSessions();
    setSessions([]);
    setConfirmClear(false);
    setSelectedId(null);
  }, []);

  // ── Empty State ────────────────────────────────────────────────────────────

  if (sessions.length === 0) {
    return (
      <div style={{
        minHeight: "100vh", background: "#111009",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16,
      }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
        <div style={{ fontSize: 64, opacity: 0.15 }}>⌨</div>
        <div style={{ fontSize: 18, color: "#3d3830", fontWeight: 500 }}>No sessions recorded yet</div>
        <div style={{ fontSize: 13, color: "#2a2822" }}>Complete a typing session to see your history here</div>
        {onBack && (
          <button onClick={onBack} style={{
            marginTop: 8, background: "#1a1814", border: "1px solid #2e2b26",
            color: "#c8c2ba", borderRadius: 10, padding: "10px 22px",
            fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>
            ← Back to training
          </button>
        )}
      </div>
    );
  }

  // ── Main Render ────────────────────────────────────────────────────────────

  const selectedSession = selectedId ? sessions.find(s => s.id === selectedId) : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#111009",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      color: "#c8c2ba",
      padding: "36px 24px 80px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1020, margin: "0 auto" }}>

        {/* ── Page Header ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
          <div>
            {onBack && (
              <button onClick={onBack} style={{
                background: "transparent", border: "none",
                color: "#3d3830", fontSize: 12, cursor: "pointer",
                padding: 0, marginBottom: 8, letterSpacing: "0.04em",
                fontFamily: "'DM Sans', sans-serif",
              }}>← Back to training</button>
            )}
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "#e8e0d4", letterSpacing: "-0.02em" }}>
              Session History
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#3d3830", fontFamily: "'DM Mono', monospace" }}>
              {sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded
              {stats && ` · ${fmt(stats.totalTime)} total`}
            </p>
          </div>

          {/* Date range filter */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {(["all", "7d", "30d", "90d"] as FilterRange[]).map(r => (
              <button
                key={r}
                onClick={() => setFilterRange(r)}
                style={{
                  background: filterRange === r ? "#2a2822" : "transparent",
                  border: `1px solid ${filterRange === r ? "#3d3830" : "#1e1c18"}`,
                  color: filterRange === r ? "#c8c2ba" : "#4a4742",
                  borderRadius: 8, padding: "6px 12px",
                  fontSize: 11, cursor: "pointer",
                  fontFamily: "'DM Mono', monospace",
                  transition: "all 0.15s",
                }}
              >
                {r === "all" ? "All time" : `Last ${r}`}
              </button>
            ))}
          </div>
        </div>

        {/* ── Summary Cards ────────────────────────────────────────────── */}
        {stats && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10,
            marginBottom: 20,
          }}>
            <StatChip label="Sessions" value={stats.totalSessions} accent="#c8c2ba" sub={filterRange !== "all" ? `in ${filterRange}` : "total"} />
            <StatChip label="Avg WPM" value={stats.avgWpm} accent="#c9a96e" sub="mean speed" />
            <StatChip label="Best WPM" value={stats.bestWpm} accent="#e8b86e" sub={fmtDate(stats.bestWpmSession.startedAt, true)} crown />
            <StatChip label="Avg accuracy" value={`${stats.avgAcc}%`} accent="#7eb87e" sub="mean score" />
            <StatChip label="Best accuracy" value={`${stats.bestAcc}%`} accent="#a8d8a8" sub="personal best" />
            <StatChip label="Streak" value={`${stats.streak}d`} accent="#7ab5d4" sub="consecutive days" />
            <StatChip label="Total time" value={fmt(stats.totalTime)} accent="#6b6660" sub="all sessions" />
          </div>
        )}

        {/* ── Charts Section ───────────────────────────────────────────── */}
        <Panel style={{ marginBottom: 12 }}>
          <SectionLabel
            action={
              <div style={{ display: "flex", gap: 4 }}>
                {(["progress", "scatter", "distribution"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setActiveChart(c)}
                    style={{
                      background: activeChart === c ? "#2a2822" : "transparent",
                      border: `1px solid ${activeChart === c ? "#3d3830" : "transparent"}`,
                      color: activeChart === c ? "#c8c2ba" : "#3d3830",
                      borderRadius: 6, padding: "3px 10px",
                      fontSize: 10, cursor: "pointer",
                      letterSpacing: "0.08em",
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {c === "progress" ? "PROGRESS" : c === "scatter" ? "WPM vs ACC" : "DIST"}
                  </button>
                ))}
              </div>
            }
          >
            {activeChart === "progress" ? "WPM & accuracy over time"
              : activeChart === "scatter" ? "Speed vs accuracy correlation"
              : "WPM distribution"}
          </SectionLabel>

          {/* Progress Chart */}
          {activeChart === "progress" && (
            <>
              {progressChartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={progressChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="wpmFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c9a96e" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#c9a96e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="accFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7eb87e" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#7eb87e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="#1a1814" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      axisLine={false} tickLine={false}
                      interval={Math.max(0, Math.floor(progressChartData.length / 8) - 1)}
                    />
                    <YAxis
                      yAxisId="wpm"
                      tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      yAxisId="acc"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      axisLine={false} tickLine={false} unit="%"
                    />
                    <Tooltip content={<ProgressTooltip />} />
                    {stats && <ReferenceLine yAxisId="wpm" y={stats.avgWpm} stroke="#2a2822" strokeDasharray="3 3" />}
                    <Area
                      yAxisId="wpm" type="monotone" dataKey="wpm"
                      stroke="#c9a96e" strokeWidth={2}
                      fill="url(#wpmFill)" dot={false}
                      activeDot={{ r: 4, fill: "#c9a96e", strokeWidth: 0 }}
                      name="WPM"
                    />
                    <Line
                      yAxisId="wpm" type="monotone" dataKey="avg7"
                      stroke="#7a6a40" strokeWidth={1.5} strokeDasharray="4 3"
                      dot={false} connectNulls name="7-session avg"
                    />
                    <Line
                      yAxisId="acc" type="monotone" dataKey="acc"
                      stroke="#7eb87e" strokeWidth={1.5}
                      dot={false} activeDot={{ r: 4, fill: "#7eb87e", strokeWidth: 0 }}
                      name="Accuracy"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartPlaceholder msg="Need at least 2 sessions to show trends" height={240} />
              )}
              <div style={{ display: "flex", gap: 20, marginTop: 12, justifyContent: "flex-end" }}>
                {[
                  { color: "#c9a96e", label: "WPM" },
                  { color: "#7a6a40", label: "7-session avg", dashed: true },
                  { color: "#7eb87e", label: "Accuracy %" },
                ].map(l => (
                  <span key={l.label} style={{ fontSize: 10, color: "#4a4742", display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{
                      display: "inline-block", width: 20, height: 2,
                      background: l.color, verticalAlign: "middle",
                      borderStyle: l.dashed ? "dashed" : "solid", borderBottom: `2px ${l.dashed ? "dashed" : "solid"} ${l.color}`,
                      borderTop: "none", borderLeft: "none", borderRight: "none",
                    }} />
                    {l.label}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* WPM vs Accuracy Scatter */}
          {activeChart === "scatter" && (
            <>
              {scatterData.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#1a1814" />
                    <XAxis
                      type="number" dataKey="wpm" name="WPM"
                      tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      axisLine={false} tickLine={false} unit=" wpm"
                    />
                    <YAxis
                      type="number" dataKey="acc" name="Accuracy"
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      axisLine={false} tickLine={false} unit="%"
                    />
                    <ZAxis range={[40, 40]} />
                    <Tooltip content={<ScatterTooltip />} />
                    <Scatter
                      data={scatterData}
                      fill="#c9a96e"
                      opacity={0.7}
                      shape={(props: any) => {
                        const { cx, cy, payload } = props;
                        const isBest = payload?.isBest;
                        return (
                          <circle
                            cx={cx} cy={cy} r={isBest ? 7 : 5}
                            fill={isBest ? "#e8b86e" : "#c9a96e"}
                            stroke={isBest ? "#fff2" : "none"}
                            strokeWidth={2}
                            opacity={isBest ? 1 : 0.65}
                          />
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartPlaceholder msg="Need at least 2 sessions to show correlation" height={240} />
              )}
              <p style={{ fontSize: 10, color: "#2e2b26", marginTop: 8, textAlign: "right" }}>
                Highlighted dot = best WPM session · Each dot = one session
              </p>
            </>
          )}

          {/* WPM Distribution */}
          {activeChart === "distribution" && (
            <>
              {distributionData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={distributionData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#1a1814" vertical={false} />
                    <XAxis
                      dataKey="wpm"
                      tick={{ fontSize: 9, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "#3d3830", fontFamily: "'DM Mono', monospace" }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip content={<DistributionTooltip />} />
                    <Bar dataKey="count" fill="#7ab5d4" radius={[4, 4, 0, 0]} maxBarSize={40}
                      // Highlight the modal bucket
                      label={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartPlaceholder msg="No data to display" height={240} />
              )}
              <p style={{ fontSize: 10, color: "#2e2b26", marginTop: 8, textAlign: "right" }}>
                Number of sessions per WPM range
              </p>
            </>
          )}
        </Panel>

        {/* ── Session Table ─────────────────────────────────────────────── */}
        <Panel>
          <SectionLabel
            action={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#2e2b26" }}>{sorted.length} shown</span>
                {confirmClear ? (
                  <>
                    <span style={{ fontSize: 10, color: "#d4856a" }}>Delete all?</span>
                    <button onClick={handleClearAll} style={dangerBtnStyle}>Yes, clear</button>
                    <button onClick={() => setConfirmClear(false)} style={mutedBtnStyle}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmClear(true)} style={mutedBtnStyle}>Clear all</button>
                )}
              </div>
            }
          >
            Sessions
          </SectionLabel>

          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 80px 80px 60px 80px 32px",
            gap: 8,
            padding: "0 8px 10px",
            borderBottom: "1px solid #1a1814",
            marginBottom: 4,
          }}>
            {([
              ["date", "Date"],
              ["wpm", "WPM"],
              ["accuracy", "Accuracy"],
              ["duration", "Duration"],
              [null, "Keys"],
              [null, "Pauses"],
              [null, ""],
            ] as [SortKey | null, string][]).map(([key, label]) => (
              <button
                key={label}
                onClick={key ? () => toggleSort(key) : undefined}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  textAlign: "left", cursor: key ? "pointer" : "default",
                  fontSize: 9, letterSpacing: "0.12em",
                  color: sortKey === key ? "#c8c2ba" : "#3d3830",
                  textTransform: "uppercase",
                  display: "flex", alignItems: "center", gap: 4,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {label}
                {key && sortKey === key && (
                  <span style={{ fontSize: 8, opacity: 0.6 }}>
                    {sortDir === "desc" ? "▼" : "▲"}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Rows */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sorted.map((session, i) => {
              const a = session.analytics;
              const isBest = session.id === stats?.bestWpmSession?.id;
              const isSelected = session.id === selectedId;
              const isOdd = i % 2 === 1;

              return (
                <div
                  key={session.id}
                  onClick={() => setSelectedId(isSelected ? null : session.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 80px 80px 60px 80px 32px",
                    gap: 8,
                    padding: "10px 8px",
                    borderRadius: 8,
                    background: isSelected
                      ? "#1e1c18"
                      : isOdd ? "#0e0d0b" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.1s",
                    alignItems: "center",
                    borderLeft: isBest ? "2px solid #c9a96e" : "2px solid transparent",
                    paddingLeft: isBest ? "6px" : "8px",
                  }}
                  onMouseEnter={e => !isSelected && ((e.currentTarget as HTMLDivElement).style.background = "#161410")}
                  onMouseLeave={e => !isSelected && ((e.currentTarget as HTMLDivElement).style.background = isOdd ? "#0e0d0b" : "transparent")}
                >
                  {/* Date */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {isBest && <span style={{ fontSize: 11, flexShrink: 0 }}>👑</span>}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, color: "#c8c2ba",
                        fontFamily: "'DM Mono', monospace",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {fmtDate(session.startedAt)}
                      </div>
                      {session.text && (
                        <div style={{
                          fontSize: 10, color: "#2e2b26",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          marginTop: 1,
                        }}>
                          {session.text.slice(0, 40)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WPM */}
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 13,
                    color: a.wpm >= (stats?.avgWpm ?? 0) ? "#c9a96e" : "#6b6660",
                    fontWeight: isBest ? 600 : 400,
                  }}>
                    {a.wpm}
                  </div>

                  {/* Accuracy */}
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 13,
                    color: a.accuracy >= 90 ? "#7eb87e" : a.accuracy >= 75 ? "#c9a96e" : "#d4856a",
                  }}>
                    {a.accuracy}%
                  </div>

                  {/* Duration */}
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#4a4742" }}>
                    {fmt(a.durationMs)}
                  </div>

                  {/* Keystrokes */}
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#3d3830" }}>
                    {a.totalKeystrokes}
                  </div>

                  {/* Pauses */}
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#3d3830" }}>
                    {a.pauseCount > 0 ? `${a.pauseCount}×` : "—"}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(session.id); }}
                    title="Delete session"
                    style={{
                      background: "transparent", border: "none",
                      color: "#2a2822", fontSize: 14, cursor: "pointer",
                      padding: "2px 4px", borderRadius: 4,
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#d4856a"}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#2a2822"}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {sorted.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", fontSize: 12, color: "#2e2b26" }}>
              No sessions in this date range
            </div>
          )}
        </Panel>

        {/* ── Expanded Session Detail ───────────────────────────────────── */}
        {selectedSession && (
          <Panel style={{ marginTop: 12 }}>
            <SectionLabel
              action={
                onViewSession && (
                  <button
                    onClick={() => onViewSession(selectedSession)}
                    style={{
                      background: "#1a1814", border: "1px solid #3d3830",
                      color: "#c8c2ba", borderRadius: 8,
                      padding: "5px 14px", fontSize: 11,
                      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Full analytics →
                  </button>
                )
              }
            >
              {fmtDate(selectedSession.startedAt)} · {fmt(selectedSession.analytics.durationMs)}
            </SectionLabel>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              {[
                { label: "WPM",           value: selectedSession.analytics.wpm,          color: "#c9a96e" },
                { label: "Accuracy",      value: `${selectedSession.analytics.accuracy}%`, color: "#7eb87e" },
                { label: "Backspaces",    value: selectedSession.analytics.backspaceCount,  color: "#d4856a" },
                { label: "Keystrokes",    value: selectedSession.analytics.totalKeystrokes, color: "#6b6660" },
                { label: "Pauses",        value: selectedSession.analytics.pauseCount,      color: "#7ab5d4" },
                { label: "Avg pause",     value: fmt(selectedSession.analytics.avgPauseMs), color: "#7ab5d4" },
                { label: "Active time",   value: fmt(selectedSession.analytics.activeTypingMs), color: "#4a4742" },
                { label: "Longest pause", value: fmt(selectedSession.analytics.longestPauseMs), color: "#4a4742" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: "#1a1814", border: "1px solid #1e1c18",
                  borderRadius: 8, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", color: "#3d3830", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'DM Mono', monospace", color }}>{value}</div>
                </div>
              ))}
            </div>

            {selectedSession.text && (
              <div style={{
                marginTop: 14,
                background: "#0e0d0b",
                border: "1px solid #1a1814",
                borderRadius: 8,
                padding: "12px 14px",
                fontFamily: "'DM Mono', monospace",
                fontSize: 12,
                color: "#4a4742",
                lineHeight: 1.8,
                maxHeight: 100,
                overflow: "hidden",
              }}>
                {selectedSession.text.slice(0, 200)}{selectedSession.text.length > 200 ? "…" : ""}
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

// ─── Mini Components ──────────────────────────────────────────────────────────

function EmptyChartPlaceholder({ msg, height }: { msg: string; height: number }) {
  return (
    <div style={{
      height, display: "flex", alignItems: "center",
      justifyContent: "center", color: "#2e2b26", fontSize: 12,
      fontFamily: "'DM Mono', monospace",
    }}>
      {msg}
    </div>
  );
}

const dangerBtnStyle: React.CSSProperties = {
  background: "transparent", border: "1px solid #4a2820",
  color: "#d4856a", borderRadius: 6,
  padding: "3px 10px", fontSize: 10,
  cursor: "pointer", fontFamily: "'DM Mono', monospace",
};

const mutedBtnStyle: React.CSSProperties = {
  background: "transparent", border: "1px solid #1e1c18",
  color: "#3d3830", borderRadius: 6,
  padding: "3px 10px", fontSize: 10,
  cursor: "pointer", fontFamily: "'DM Mono', monospace",
};
