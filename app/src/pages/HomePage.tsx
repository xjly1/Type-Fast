/**
 * HomePage_Tailwind.tsx
 *
 * Full Home page for the Typing Analysis & Training app.
 * Uses Tailwind CSS utility classes with dark-mode support (class strategy).
 *
 * Prerequisites in tailwind.config.js:
 *   darkMode: 'class'
 *   fontFamily: {
 *     mono: ['"DM Mono"', 'monospace'],
 *     sans: ['"DM Sans"', 'sans-serif'],
 *     display: ['"Playfair Display"', 'serif'],
 *   }
 *
 * Navigation example (React Router v6):
 *   import { useNavigate } from 'react-router-dom';
 *   const navigate = useNavigate();
 *   <HomePage onStart={(cfg) => { saveConfig(cfg); navigate('/training'); }} />
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Language {
  code: string;
  label: string;
  native: string;
  dir: "ltr" | "rtl";
  flag: string;
}

export interface HomeConfig {
  language: Language;
  durationSecs: number;
}

interface LastSession {
  wpm: number;
  accuracy: number;
  durationMs: number;
  backspaces: number;
  startedAt: string;
}

interface HomePageProps {
  /** Receives config when user clicks Start — navigate to /training here */
  onStart: (config: HomeConfig) => void;
  onViewHistory?: () => void;
  onViewAnalytics?: () => void;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const LANGUAGES: Language[] = [
  { code: "en", label: "English",    native: "English",   dir: "ltr", flag: "🇺🇸" },
  { code: "ar", label: "Arabic",     native: "العربية",   dir: "rtl", flag: "🇸🇦" },
  { code: "de", label: "German",     native: "Deutsch",   dir: "ltr", flag: "🇩🇪" },
];

const DURATIONS = [
  { label: "1 min",  secs: 60 },
  { label: "3 min",  secs: 180 },
  { label: "5 min",  secs: 300 },
  { label: "10 min", secs: 600 },
];

const STORAGE_KEY  = "typing_tracker_sessions";
const CONFIG_KEY   = "typing_home_config";

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

function loadLastSession(): LastSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const s = arr[0];
    return {
      wpm:       s.analytics.wpm,
      accuracy:  s.analytics.accuracy,
      durationMs:s.analytics.durationMs,
      backspaces:s.analytics.backspaceCount,
      startedAt: s.startedAt,
    };
  } catch { return null; }
}

function loadSavedConfig(): Partial<HomeConfig> {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveConfig(cfg: HomeConfig) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)  return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ─── Animated cursor hook ─────────────────────────────────────────────────────

const HERO_PHRASES = [
  "Train smarter.",
  "Type faster.",
  "Track every key.",
  "Beat your record.",
];

function useTypingHero() {
  const [display, setDisplay] = useState("");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const phrase = HERO_PHRASES[phraseIdx];
    const delay = deleting
      ? 45
      : charIdx === phrase.length
      ? 1800
      : 70 + Math.random() * 40;

    const t = setTimeout(() => {
      if (!deleting && charIdx < phrase.length) {
        setDisplay(phrase.slice(0, charIdx + 1));
        setCharIdx(c => c + 1);
      } else if (!deleting && charIdx === phrase.length) {
        setDeleting(true);
      } else if (deleting && charIdx > 0) {
        setDisplay(phrase.slice(0, charIdx - 1));
        setCharIdx(c => c - 1);
      } else {
        setDeleting(false);
        setPhraseIdx(i => (i + 1) % HERO_PHRASES.length);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [display, phraseIdx, charIdx, deleting]);

  // Cursor blink
  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 530);
    return () => clearInterval(t);
  }, []);

  return { display, blink };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavLink({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="
        px-3 py-1.5 rounded-lg text-xs font-mono
        text-stone-500 dark:text-stone-500
        border border-transparent
        hover:border-stone-700 hover:text-stone-300
        transition-all duration-150
      "
    >
      {label}
    </button>
  );
}

interface DurationPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function DurationPill({ label, active, onClick }: DurationPillProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 py-3 rounded-xl text-sm font-mono font-medium
        border transition-all duration-150 select-none
        ${active
          ? "bg-amber-500/10 border-amber-500/60 text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/60 dark:text-amber-400"
          : "bg-stone-900/60 border-stone-800 text-stone-500 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-500 hover:border-stone-600 hover:text-stone-300"
        }
      `}
    >
      {label}
    </button>
  );
}

interface LangOptionProps {
  lang: Language;
  selected: boolean;
  onClick: () => void;
}

function LangOption({ lang, selected, onClick }: LangOptionProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2.5 px-3 py-2.5 rounded-lg
        text-left w-full transition-all duration-100 group
        ${selected
          ? "bg-stone-800 text-stone-100"
          : "text-stone-400 hover:bg-stone-800/60 hover:text-stone-200"
        }
      `}
    >
      <span className="text-lg leading-none">{lang.flag}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight truncate">
          {lang.label}
        </div>
        <div className="text-xs font-mono text-stone-600 leading-tight mt-0.5">
          {lang.native}
          {lang.dir === "rtl" && (
            <span className="ml-1.5 text-amber-600/70 text-[10px]">RTL</span>
          )}
        </div>
      </div>
      {selected && (
        <span className="text-amber-400 text-xs flex-shrink-0">✓</span>
      )}
    </button>
  );
}

interface StatBadgeProps {
  label: string;
  value: string | number;
  color?: string;
}

function StatBadge({ label, value, color = "text-stone-200" }: StatBadgeProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-stone-600 font-mono">
        {label}
      </span>
      <span className={`text-2xl font-bold font-mono ${color} leading-none`}>
        {value}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomePage({ onStart, onViewHistory, onViewAnalytics }: HomePageProps) {
  const saved = loadSavedConfig();

  const [lang, setLang] = useState<Language>(
    LANGUAGES.find(l => l.code === saved.language?.code) ?? LANGUAGES[0]
  );
  const [duration, setDuration] = useState<number>(saved.durationSecs ?? 60);
  const [showCustom, setShowCustom] = useState(
    !DURATIONS.some(d => d.secs === (saved.durationSecs ?? 60))
  );
  const [customMins, setCustomMins] = useState("2");
  const [langOpen, setLangOpen] = useState(false);
  const [lastSession, setLastSession] = useState<LastSession | null>(null);
  const [visible, setVisible] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const { display: heroText, blink } = useTypingHero();

  useEffect(() => {
    setLastSession(loadLastSession());
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const commitCustom = useCallback(() => {
    const m = Math.max(1, Math.min(60, parseInt(customMins, 10) || 2));
    setCustomMins(String(m));
    setDuration(m * 60);
  }, [customMins]);

  const handleStart = () => {
    const cfg: HomeConfig = { language: lang, durationSecs: duration };
    saveConfig(cfg);
    onStart(cfg);
  };

  const durationLabel = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
  const accColor =
    !lastSession ? ""
    : lastSession.accuracy >= 90 ? "text-emerald-400"
    : lastSession.accuracy >= 75 ? "text-amber-400"
    : "text-red-400";

  // Stagger reveal helpers
  const reveal = (delay: number) =>
    `transition-all duration-700 ease-out ${delay}ms ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`;

  return (
    /*
     * Root: dark background (requires `class` dark-mode strategy in Tailwind).
     * To force dark mode always, add className="dark" to <html>.
     */
    <div className="min-h-screen bg-stone-950 dark:bg-stone-950 text-stone-300 font-sans antialiased overflow-x-hidden">

      {/* ── Google Fonts ─────────────────────────────────────────────────── */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap"
        rel="stylesheet"
      />

      {/* ── Ambient glow ─────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-amber-500/[0.03] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-sky-500/[0.02] blur-3xl" />
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className={`
        relative z-20 flex items-center justify-between
        px-6 sm:px-10 py-5
        border-b border-stone-900
        ${reveal(0)}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-stone-900 border border-stone-800 flex items-center justify-center text-sm select-none">
            ⌨
          </div>
          <span className="text-sm font-semibold text-stone-200 tracking-tight font-sans">
            TypeFlow
          </span>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {onViewHistory   && <NavLink label="History"   onClick={onViewHistory}   />}
          {onViewAnalytics && <NavLink label="Analytics" onClick={onViewAnalytics} />}
        </div>
      </nav>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="relative z-10 max-w-xl mx-auto px-5 sm:px-6 pt-14 pb-24">

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <div className={`mb-12 ${reveal(60)}`}>
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-600 font-mono mb-5">
            Typing Analysis &amp; Training
          </p>

          {/* Animated headline */}
          <h1 className="font-display font-black text-stone-100 leading-[1.08] tracking-tight mb-5"
            style={{ fontSize: "clamp(38px,7vw,58px)" }}
          >
            {heroText}
            <span
              className="inline-block w-[3px] h-[0.85em] bg-amber-400 ml-1 align-middle"
              style={{ opacity: blink ? 1 : 0, transition: "opacity 0.05s" }}
            />
          </h1>

          <p className="text-stone-500 text-[15px] leading-relaxed max-w-sm">
            Every keystroke recorded — speed, accuracy, pauses,
            and error patterns analyzed in real time.
          </p>
        </div>

        {/* ── Config card ────────────────────────────────────────────── */}
        <div className={`
          bg-stone-900/70 border border-stone-800/80 rounded-2xl p-6 mb-4
          backdrop-blur-sm ${reveal(120)}
        `}>

          {/* Language selector */}
          <div className="mb-7">
            <label className="block text-[10px] uppercase tracking-[0.16em] text-stone-600 font-mono mb-3">
              Language
            </label>

            {/* Trigger button */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setLangOpen(v => !v)}
                aria-expanded={langOpen}
                className={`
                  w-full flex items-center justify-between gap-3
                  px-4 py-3 rounded-xl
                  bg-stone-950/80 border transition-all duration-150 text-left
                  ${langOpen ? "border-stone-600" : "border-stone-800 hover:border-stone-700"}
                `}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl leading-none">{lang.flag}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-200 leading-tight">
                      {lang.label}
                    </div>
                    <div className="text-[11px] font-mono text-stone-600 leading-tight mt-0.5">
                      {lang.native}
                      {lang.dir === "rtl" && (
                        <span className="ml-2 text-amber-600/70">· RTL</span>
                      )}
                    </div>
                  </div>
                </div>
                <svg
                  className={`w-3 h-3 text-stone-600 flex-shrink-0 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 10 6"
                >
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Dropdown panel */}
              {langOpen && (
                <div className="
                  absolute top-[calc(100%+6px)] left-0 right-0 z-50
                  bg-stone-900 border border-stone-800 rounded-xl
                  shadow-2xl shadow-black/60 overflow-hidden
                ">
                  <div className="grid grid-cols-2 max-h-72 overflow-y-auto p-1.5 gap-0.5">
                    {LANGUAGES.map(l => (
                      <LangOption
                        key={l.code}
                        lang={l}
                        selected={lang.code === l.code}
                        onClick={() => { setLang(l); setLangOpen(false); }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RTL notice */}
            {lang.dir === "rtl" && (
              <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] font-mono text-amber-500/80">
                <span>←</span>
                <span>Text will flow right-to-left in the training area</span>
              </div>
            )}
          </div>

          {/* Duration selector */}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.16em] text-stone-600 font-mono mb-3">
              Session duration
            </label>

            {/* Preset pills */}
            <div className="flex gap-2 mb-2.5">
              {DURATIONS.map(d => (
                <DurationPill
                  key={d.secs}
                  label={d.label}
                  active={!showCustom && duration === d.secs}
                  onClick={() => { setDuration(d.secs); setShowCustom(false); }}
                />
              ))}
            </div>

            {/* Custom toggle */}
            <button
              onClick={() => setShowCustom(v => !v)}
              className={`
                w-full py-2 rounded-lg text-xs font-mono
                border transition-all duration-150
                ${showCustom
                  ? "bg-stone-800 border-stone-700 text-stone-300"
                  : "bg-transparent border-stone-800/60 text-stone-600 hover:border-stone-700 hover:text-stone-400"}
              `}
            >
              {showCustom ? "▸ Custom" : "+ Custom duration"}
            </button>

            {/* Custom input */}
            {showCustom && (
              <div className="mt-2.5 flex items-center gap-3 bg-stone-950/80 border border-stone-800 rounded-xl px-4 py-3">
                <input
                  type="number"
                  min={1} max={60}
                  value={customMins}
                  onChange={e => setCustomMins(e.target.value)}
                  onBlur={commitCustom}
                  onKeyDown={e => e.key === "Enter" && commitCustom()}
                  className="
                    w-16 bg-stone-900 border border-stone-700 rounded-lg
                    text-center text-base font-mono font-medium text-stone-100
                    px-2 py-1.5 outline-none
                    focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10
                    transition-all duration-150
                  "
                />
                <span className="text-sm text-stone-500">minutes</span>
                <button
                  onClick={commitCustom}
                  className="
                    ml-auto px-4 py-1.5 rounded-lg text-xs font-mono
                    bg-stone-800 border border-stone-700
                    text-amber-400 hover:bg-stone-700
                    transition-all duration-150
                  "
                >
                  Set →
                </button>
              </div>
            )}

            {/* Duration readout */}
            <p className="mt-2 text-right text-[11px] font-mono text-stone-700">
              {durationLabel} selected
            </p>
          </div>
        </div>

        {/* ── Start button ────────────────────────────────────────────── */}
        <button
          onClick={handleStart}
          className={`
            w-full py-[18px] rounded-[14px] mb-3
            bg-amber-500 hover:bg-amber-400 active:scale-[0.98]
            text-stone-950 text-base font-bold tracking-tight font-sans
            flex items-center justify-center gap-2.5
            transition-all duration-150 shadow-lg shadow-amber-500/20
            ${reveal(180)}
          `}
        >
          <span>Start training</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Config summary pill */}
        <p className={`text-center text-[11px] font-mono text-stone-700 mb-10 ${reveal(200)}`}>
          {lang.flag} {lang.label} · {Math.floor(duration / 60)} min
          {duration % 60 !== 0 && ` ${duration % 60}s`}
          {lang.dir === "rtl" && " · RTL"}
        </p>

        {/* ── Last session card ───────────────────────────────────────── */}
        {lastSession ? (
          <div className={`
            bg-stone-900/70 border border-stone-800/80 rounded-2xl p-5
            backdrop-blur-sm ${reveal(240)}
          `}>
            {/* Card header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] uppercase tracking-[0.16em] text-stone-600 font-mono">
                  Last session
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-stone-700">
                <span>{fmtDate(lastSession.startedAt)}</span>
                <span className="text-stone-800">·</span>
                <span>{timeAgo(lastSession.startedAt)}</span>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 mb-5 pb-5 border-b border-stone-800/60">
              <StatBadge label="WPM" value={lastSession.wpm} color="text-amber-400" />
              <StatBadge
                label="Accuracy"
                value={`${lastSession.accuracy}%`}
                color={accColor}
              />
              <StatBadge label="Duration" value={fmtMs(lastSession.durationMs)} />
            </div>

            {/* Accuracy bar */}
            <div className="mb-4">
              <div className="flex justify-between text-[10px] font-mono text-stone-700 mb-1.5">
                <span>Accuracy</span>
                <span>{lastSession.accuracy}%</span>
              </div>
              <div className="h-1 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className={`
                    h-full rounded-full transition-all duration-1000 ease-out
                    ${lastSession.accuracy >= 90 ? "bg-emerald-500"
                      : lastSession.accuracy >= 75 ? "bg-amber-500"
                      : "bg-red-500"}
                  `}
                  style={{ width: `${lastSession.accuracy}%` }}
                />
              </div>
            </div>

            {/* Secondary stats */}
            <div className="flex items-center justify-between text-[11px] font-mono mb-4">
              <span className="text-stone-600">
                {lastSession.backspaces} correction{lastSession.backspaces !== 1 ? "s" : ""}
              </span>
              <span className="text-stone-600">
                {lastSession.accuracy >= 95
                  ? "🏆 Excellent accuracy"
                  : lastSession.accuracy >= 85
                  ? "✓ Good session"
                  : "⬆ Keep practicing"}
              </span>
            </div>

            {/* CTA */}
            {onViewAnalytics && (
              <button
                onClick={onViewAnalytics}
                className="
                  w-full py-2.5 rounded-xl text-xs font-mono
                  border border-stone-800 text-stone-500
                  hover:border-stone-700 hover:text-stone-300
                  transition-all duration-150
                "
              >
                View full analytics →
              </button>
            )}
          </div>
        ) : (
          /* ── Feature callouts (first-run state) ── */
          <div className={`grid grid-cols-3 gap-3 ${reveal(240)}`}>
            {[
              { icon: "⚡", title: "Live WPM",    sub: "real-time tracking" },
              { icon: "🎯", title: "Heatmap",     sub: "error visualization" },
              { icon: "📈", title: "Progress",    sub: "session history" },
            ].map(f => (
              <div
                key={f.title}
                className="
                  bg-stone-900/60 border border-stone-800/60 rounded-xl
                  p-4 text-center
                "
              >
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="text-xs font-semibold text-stone-300 mb-1">{f.title}</div>
                <div className="text-[10px] font-mono text-stone-700">{f.sub}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
