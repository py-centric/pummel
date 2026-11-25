import React from 'react';
import { Camera, History, Pause, Play, Radio, RotateCcw, Trash2 } from 'lucide-react';
import type { RecordedTestSession } from '../engine/sessionReplay';

interface SessionReplayBarProps {
  sessions: readonly RecordedTestSession[];
  activeReplaySessionId: string | null;
  replayIndex: number;
  replayPlaying: boolean;
  replaySpeed: 1 | 2 | 4;
  canRecordCurrent: boolean;
  onRecordCurrentSession: () => void;
  onStartReplay: (sessionId: string) => void;
  onExitReplay: () => void;
  onScrubIndex: (index: number) => void;
  onTogglePlayReplay: () => void;
  onChangeSpeed: (speed: 1 | 2 | 4) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function SessionReplayBar({
  sessions,
  activeReplaySessionId,
  replayIndex,
  replayPlaying,
  replaySpeed,
  canRecordCurrent,
  onRecordCurrentSession,
  onStartReplay,
  onExitReplay,
  onScrubIndex,
  onTogglePlayReplay,
  onChangeSpeed,
  onDeleteSession,
}: SessionReplayBarProps) {
  const activeSession = activeReplaySessionId
    ? sessions.find((s) => s.id === activeReplaySessionId) ?? null
    : null;
  const maxIdx = activeSession ? Math.max(0, activeSession.history.length - 1) : 0;
  const currentElapsed = activeSession?.history[replayIndex]?.elapsedSec ?? 0;

  return (
    <section
      aria-label="Session Recording & Timeline Replay"
      data-testid="session-replay-bar"
      className={`rounded-xl border transition-colors ${
        activeSession
          ? 'border-orange-400 bg-orange-50/40 dark:border-orange-500/70 dark:bg-orange-950/20'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <History className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Session Recording &amp; Timeline Replay
              </h2>
              {activeSession ? (
                <span
                  data-testid="replay-active-badge"
                  className="rounded border border-orange-300 bg-orange-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200"
                >
                  REPLAY MODE · T+{currentElapsed}s / {activeSession.durationSec}s
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Radio className="h-2.5 w-2.5" aria-hidden="true" />
                  Live View · {sessions.length} Saved
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {activeSession
                ? `Replaying "${activeSession.label}" (${activeSession.targetConcurrency.toLocaleString()} VUs · Peak ${activeSession.peakRps.toLocaleString()} rps · ${activeSession.errorRatePct.toFixed(2)}% err)`
                : 'Completed runs auto-record full metadata, Recharts series, and Execution Logs for historical replay.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select recorded session to replay"
            data-testid="recorded-session-select"
            value={activeReplaySessionId ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                onExitReplay();
              } else {
                onStartReplay(val);
              }
            }}
            className="h-9 max-w-[260px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">Live Telemetry Stream</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          {activeSession ? (
            <>
              <button
                type="button"
                data-testid="replay-exit-btn"
                onClick={onExitReplay}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Return to Live
              </button>
              <button
                type="button"
                aria-label={`Delete recorded session ${activeSession.label}`}
                onClick={() => onDeleteSession(activeSession.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              {sessions.length > 0 && (
                <button
                  type="button"
                  data-testid="replay-latest-btn"
                  onClick={() => onStartReplay(sessions[0].id)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Replay Selected
                </button>
              )}
              <button
                type="button"
                data-testid="record-session-btn"
                disabled={!canRecordCurrent}
                onClick={onRecordCurrentSession}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Record Session
              </button>
            </>
          )}
        </div>
      </div>

      {/* Interactive Playback Scrubber */}
      {activeSession && (
        <div className="flex flex-wrap items-center gap-3 border-t border-orange-200/80 px-5 py-3 dark:border-orange-900/50">
          <button
            type="button"
            data-testid="replay-play-pause-btn"
            onClick={onTogglePlayReplay}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap"
          >
            {replayPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Play Replay
              </>
            )}
          </button>

          <label className="flex min-w-[200px] flex-1 items-center gap-3 text-xs">
            <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
              T+{currentElapsed}s
            </span>
            <input
              type="range"
              aria-label="Timeline replay scrubber"
              data-testid="replay-scrubber-slider"
              min={0}
              max={maxIdx}
              value={replayIndex}
              onChange={(e) => onScrubIndex(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-orange-600"
            />
            <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
              T+{activeSession.durationSec}s
            </span>
          </label>

          <div className="flex items-center gap-1 rounded-lg bg-white p-0.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900">
            {([1, 2, 4] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onChangeSpeed(spd)}
                className={`rounded-md px-2 py-1 font-mono text-[11px] font-semibold ${
                  replaySpeed === spd
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
