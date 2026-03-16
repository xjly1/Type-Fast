import { useState, useCallback } from "react";
import { useTimer, type TimerStatus } from "../hooks/useTimer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimerProps {
  /** Called when the countdown reaches zero */
  onFinish?: () => void;
  /** Called when the user manually starts the timer */
  onStart?: () => void;
  /** Called when the user pauses */
  onPause?: () => void;
  /** Called when the user resumes */
  onResume?: () => void;
  /** Called when the user resets the timer */
  onReset?: () => void;
  /** Whether typing has begun (disables preset selection mid-session) */
  typingStarted?: boolean;
}

// ─── Preset Options ───────────────────────────────────────────────────────────

const PRESETS = [
  { label: "1 min",  secs: 60 },
  { label: "3 min",  secs: 180 },
  { label: "5 min",  secs: 300 },
  { label: "Custom", secs: -1 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Describe an SVG arc path on a circle */
function arcPath(cx: number, cy: number, r: number, progress: number): string {
  const clamped = Math.min(0.9999, Math.max(0, progress));
  const angle = clamped * 2 * Math.PI - Math.PI / 2;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  const large = clamped > 0.5 ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${x} ${y}`;
}

// ─── Arc Ring ─────────────────────────────────────────────────────────────────

interface ArcRingProps {
  progress: number;   // 0 → 1
  status: TimerStatus;
  remainingMs: number;
  size?: number;
}

function ArcRing({ progress, status, remainingMs, size = 200 }: ArcRingProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 10;
  const strokeW = 5;

  const isWarning = remainingMs < 30_000 && remainingMs > 0;
  const isCritical = remainingMs < 10_000 && remainingMs > 0;
  const isFinished = status === "finished";

  const trackColor = "#1e1c18";
  const arcColor = isFinished ? "#7eb87e"
    : isCritical ? "#d4856a"
    : isWarning  ? "#c9a96e"
    : "#7ab5d4";

  const displayProgress = isFinished ? 1 : progress;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block" }}
    >
      {/* Track ring */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeW}
      />

      {/* Filled arc — sweeps clockwise as time is consumed */}
      {displayProgress > 0 && (
        <path
          d={arcPath(cx, cy, R, displayProgress)}
          fill="none"
          stroke={arcColor}
          strokeWidth={strokeW}
          strokeLinecap="round"
          style={{ transition: "stroke 0.4s ease" }}
        />
      )}

      {/* Subtle pulsing dot at arc head when critical */}
      {isCritical && !isFinished && (
        <circle
          cx={cx + R * Math.cos(displayProgress * 2 * Math.PI - Math.PI / 2)}
          cy={cy + R * Math.sin(displayProgress * 2 * Math.PI - Math.PI / 2)}
          r={strokeW / 2 + 1}
          fill={arcColor}
          style={{
            animation: "pulse-dot 0.8s ease-in-out infinite",
          }}
        />
      )}

      {/* Time display */}
      <text
        x={cx} y={cy - 10}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={arcColor}
        fontSize={size * 0.2}
        fontFamily="'DM Mono', monospace"
        fontWeight={500}
        style={{ transition: "fill 0.4s ease" }}
      >
        {isFinished ? "Done" : formatTime(remainingMs)}
      </text>

      {/* Status label */}
      <text
        x={cx} y={cy + size * 0.17}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#4a4742"
        fontSize={size * 0.065}
        fontFamily="'DM Sans', sans-serif"
        letterSpacing="0.1em"
      >
        {isFinished ? "SESSION COMPLETE" :
         status === "paused"  ? "PAUSED" :
         status === "running" ? "RUNNING" : "READY"}
      </text>
    </svg>
  );
}

// ─── Timer Component ──────────────────────────────────────────────────────────

export default function Timer({
  onFinish,
  onStart,
  onPause,
  onResume,
  onReset,
  typingStarted = false,
}: TimerProps) {
  const [selectedPreset, setSelectedPreset] = useState(0); // index into PRESETS
  const [customMinutes, setCustomMinutes] = useState("2");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const resolvedSecs = showCustomInput
    ? Math.max(1, Math.min(60, parseInt(customMinutes, 10) || 2)) * 60
    : PRESETS[selectedPreset].secs;

  const handleFinish = useCallback(() => {
    onFinish?.();
  }, [onFinish]);

  const { status, remainingMs, progress, start, pause, resume, reset } = useTimer({
    durationSecs: resolvedSecs,
    onFinish: handleFinish,
  });

  const isIdle     = status === "idle";
  const isRunning  = status === "running";
  const isPaused   = status === "paused";
  const isFinished = status === "finished";

  const isWarning  = remainingMs < 30_000 && remainingMs > 0 && !isFinished;
  const isCritical = remainingMs < 10_000 && remainingMs > 0 && !isFinished;

  const accentColor = isCritical ? "#d4856a" : isWarning ? "#c9a96e" : "#7ab5d4";

  const handlePresetClick = (idx: number) => {
    if (!isIdle) return; // can't change while running
    if (PRESETS[idx].secs === -1) {
      setShowCustomInput(true);
      setSelectedPreset(idx);
    } else {
      setShowCustomInput(false);
      setSelectedPreset(idx);
      reset(PRESETS[idx].secs);
    }
  };

  const handleCustomConfirm = () => {
    const mins = Math.max(1, Math.min(60, parseInt(customMinutes, 10) || 2));
    setCustomMinutes(String(mins));
    reset(mins * 60);
  };

  const handleStart  = () => { start();  onStart?.();  };
  const handlePause  = () => { pause();  onPause?.();  };
  const handleResume = () => { resume(); onResume?.(); };
  const handleReset  = () => {
    reset(resolvedSecs);
    onReset?.();
  };

  return (
    <>
      {/* Pulse animation for critical dot */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { r: 4; opacity: 1; }
          50%       { r: 6; opacity: 0.6; }
        }
        @keyframes timer-warn {
          0%, 100% { box-shadow: 0 0 0 0 rgba(212, 133, 106, 0); }
          50%       { box-shadow: 0 0 0 4px rgba(212, 133, 106, 0.12); }
        }
      `}</style>

      <div style={{
        background: "#141210",
        border: `1px solid ${isCritical ? "#3d2820" : isWarning ? "#3d3420" : "#1e1c18"}`,
        borderRadius: 16,
        padding: "28px 24px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        transition: "border-color 0.4s",
        animation: isCritical ? "timer-warn 1s ease-in-out infinite" : "none",
        userSelect: "none",
      }}>

        {/* Preset selector — disabled while running/paused */}
        <div style={{
          display: "flex",
          gap: 6,
          opacity: isIdle ? 1 : 0.35,
          pointerEvents: isIdle ? "auto" : "none",
          transition: "opacity 0.2s",
        }}>
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => handlePresetClick(i)}
              style={{
                background: selectedPreset === i ? "#2a2822" : "transparent",
                border: `1px solid ${selectedPreset === i ? accentColor : "#2e2b26"}`,
                color: selectedPreset === i ? accentColor : "#4a4742",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                fontFamily: "'DM Mono', monospace",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom minutes input */}
        {showCustomInput && isIdle && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={1}
              max={60}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              onBlur={handleCustomConfirm}
              onKeyDown={(e) => e.key === "Enter" && handleCustomConfirm()}
              style={{
                width: 64,
                background: "#1a1814",
                border: "1px solid #3d3830",
                borderRadius: 8,
                color: "#c8c2ba",
                fontFamily: "'DM Mono', monospace",
                fontSize: 14,
                padding: "6px 10px",
                outline: "none",
                textAlign: "center",
              }}
            />
            <span style={{ fontSize: 12, color: "#4a4742" }}>minutes</span>
            <button
              onClick={handleCustomConfirm}
              style={{
                background: "#2a2822",
                border: "1px solid #3d3830",
                color: "#c8c2ba",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Set
            </button>
          </div>
        )}

        {/* SVG Arc Ring */}
        <ArcRing
          progress={progress}
          status={status}
          remainingMs={remainingMs}
          size={200}
        />

        {/* Controls */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {isIdle && (
            <ControlButton
              onClick={handleStart}
              label="Start"
              primary
              accentColor={accentColor}
            />
          )}

          {isRunning && (
            <>
              <ControlButton onClick={handlePause} label="Pause" />
              <ControlButton onClick={handleReset} label="Reset" muted />
            </>
          )}

          {isPaused && (
            <>
              <ControlButton
                onClick={handleResume}
                label="Resume"
                primary
                accentColor={accentColor}
              />
              <ControlButton onClick={handleReset} label="Reset" muted />
            </>
          )}

          {isFinished && (
            <ControlButton
              onClick={handleReset}
              label="New session"
              primary
              accentColor="#7eb87e"
            />
          )}
        </div>

        {/* Hint */}
        {isIdle && !typingStarted && (
          <p style={{
            margin: 0,
            fontSize: 11,
            color: "#2e2b26",
            letterSpacing: "0.05em",
            textAlign: "center",
          }}>
            Select a duration, then press Start
          </p>
        )}

        {isRunning && typingStarted && (
          <p style={{
            margin: 0,
            fontSize: 11,
            color: "#3d3830",
            letterSpacing: "0.05em",
            textAlign: "center",
          }}>
            Keep typing — session ends automatically
          </p>
        )}
      </div>
    </>
  );
}

// ─── Control Button ───────────────────────────────────────────────────────────

interface ControlButtonProps {
  onClick: () => void;
  label: string;
  primary?: boolean;
  muted?: boolean;
  accentColor?: string;
}

function ControlButton({
  onClick,
  label,
  primary = false,
  muted = false,
  accentColor = "#7ab5d4",
}: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        background: primary ? "#1e1c18" : "transparent",
        border: `1px solid ${primary ? accentColor : muted ? "#1e1c18" : "#2e2b26"}`,
        color: primary ? accentColor : muted ? "#3d3830" : "#6b6660",
        borderRadius: 10,
        padding: "10px 22px",
        fontSize: 13,
        fontWeight: primary ? 500 : 400,
        fontFamily: "'DM Sans', sans-serif",
        cursor: "pointer",
        letterSpacing: "0.02em",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.opacity = "0.8";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.opacity = "1";
      }}
    >
      {label}
    </button>
  );
}
