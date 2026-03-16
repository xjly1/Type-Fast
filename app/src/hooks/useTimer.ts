import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimerStatus = "idle" | "running" | "paused" | "finished";

export interface UseTimerOptions {
  /** Duration in seconds */
  durationSecs: number;
  /** Called exactly once when the timer reaches zero */
  onFinish?: () => void;
  /** Called every tick with remaining ms (throttled to ~100ms intervals) */
  onTick?: (remainingMs: number) => void;
}

export interface UseTimerReturn {
  status: TimerStatus;
  remainingMs: number;
  elapsedMs: number;
  progress: number; // 0 → 1 (how much has been consumed)
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (newDurationSecs?: number) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Precision countdown timer built on requestAnimationFrame.
 * Uses performance.now() so it stays accurate even when the tab is backgrounded.
 *
 * @example
 * const { status, remainingMs, start, pause, reset } = useTimer({
 *   durationSecs: 60,
 *   onFinish: () => navigate("/analytics"),
 * });
 */
export function useTimer({
  durationSecs,
  onFinish,
  onTick,
}: UseTimerOptions): UseTimerReturn {
  const totalMs = durationSecs * 1000;

  const [status, setStatus] = useState<TimerStatus>("idle");
  const [remainingMs, setRemainingMs] = useState(totalMs);

  // Refs so RAF callback always sees fresh values without re-subscribing
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);   // performance.now() when this run started
  const accumulatedRef = useRef(0);                    // ms already consumed in previous runs
  const totalMsRef = useRef(totalMs);
  const statusRef = useRef<TimerStatus>("idle");
  const onFinishRef = useRef(onFinish);
  const onTickRef = useRef(onTick);
  const lastTickRef = useRef(0);

  // Keep callback refs fresh
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  // Sync total when durationSecs prop changes (only while idle)
  useEffect(() => {
    if (statusRef.current === "idle") {
      totalMsRef.current = durationSecs * 1000;
      setRemainingMs(durationSecs * 1000);
    }
  }, [durationSecs]);

  const tick = useCallback((now: number) => {
    if (statusRef.current !== "running") return;

    const runMs = now - (startedAtRef.current ?? now);
    const consumed = accumulatedRef.current + runMs;
    const remaining = Math.max(0, totalMsRef.current - consumed);

    setRemainingMs(remaining);

    // Throttle onTick to every ~100ms
    if (now - lastTickRef.current > 100) {
      onTickRef.current?.(remaining);
      lastTickRef.current = now;
    }

    if (remaining <= 0) {
      setStatus("finished");
      statusRef.current = "finished";
      onFinishRef.current?.();
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    if (statusRef.current !== "idle") return;
    accumulatedRef.current = 0;
    startedAtRef.current = performance.now();
    setStatus("running");
    statusRef.current = "running";
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    if (statusRef.current !== "running") return;
    // Freeze accumulated time
    accumulatedRef.current += performance.now() - (startedAtRef.current ?? 0);
    startedAtRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setStatus("paused");
    statusRef.current = "paused";
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    startedAtRef.current = performance.now();
    setStatus("running");
    statusRef.current = "running";
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const reset = useCallback((newDurationSecs?: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const newTotal = (newDurationSecs ?? durationSecs) * 1000;
    totalMsRef.current = newTotal;
    accumulatedRef.current = 0;
    startedAtRef.current = null;
    setStatus("idle");
    statusRef.current = "idle";
    setRemainingMs(newTotal);
  }, [durationSecs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const elapsed = totalMsRef.current - remainingMs;

  return {
    status,
    remainingMs,
    elapsedMs: elapsed,
    progress: totalMsRef.current > 0 ? elapsed / totalMsRef.current : 0,
    start,
    pause,
    resume,
    reset,
  };
}
