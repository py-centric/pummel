import React, { useMemo, useState } from 'react';
import { Check, Copy, Flame, Pause, Play, RotateCcw, Square } from 'lucide-react';
import type { DistributedRunState, PummelConfig } from '../types/pummel';
import {
  generateDistributedProto,
  generateDistributedRust,
  generateRatatuiRust,
} from '../engine/rustArtifacts';
import {
  RatatuiPaneContent,
  renderAsciiSparkline,
  renderProgressBar,
  type TuiPane,
} from './ratatui/RatatuiPaneViews';

type ViewTab = 'tui' | 'proto' | 'distributed_rs' | 'tui_rs';

interface RatatuiDashboardProps {
  config: PummelConfig;
  runState: DistributedRunState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  onToggleChaos: () => void;
}

export function RatatuiDashboard({
  config,
  runState,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
  onToggleChaos,
}: RatatuiDashboardProps) {
  const [viewTab, setViewTab] = useState<ViewTab>('tui');
  const [tuiPane, setTuiPane] = useState<TuiPane>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const progressPct = Math.min(
    100,
    Math.round((runState.elapsedSec / Math.max(1, runState.totalDurationSec)) * 100)
  );
  const rpsSpark = useMemo(
    () => renderAsciiSparkline(runState.history.map((h) => h.rps), 44),
    [runState.history]
  );
  const p95Spark = useMemo(
    () => renderAsciiSparkline(runState.history.map((h) => h.p95Ms), 44),
    [runState.history]
  );

  const codeContent = useMemo(() => {
    if (viewTab === 'proto') return generateDistributedProto();
    if (viewTab === 'distributed_rs') return generateDistributedRust(config);
    if (viewTab === 'tui_rs') return generateRatatuiRust(config);
    return '';
  }, [viewTab, config]);

  const handleCopy = async () => {
    if (!codeContent) return;
    try {
      await navigator.clipboard.writeText(codeContent);
      setCopiedKey(viewTab);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      setCopiedKey(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (viewTab !== 'tui') return;
    if (event.key === 'q') {
      event.preventDefault();
      onStop();
    } else if (event.key === 'p') {
      event.preventDefault();
      if (runState.status === 'running') onPause();
      else if (runState.status === 'paused') onResume();
    } else if (event.key === 'c') {
      event.preventDefault();
      onToggleChaos();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const order: TuiPane[] = ['overview', 'workers', 'slas', 'logs'];
      const nextIdx = (order.indexOf(tuiPane) + 1) % order.length;
      setTuiPane(order[nextIdx]);
    }
  };

  const onlineWorkers = runState.workers.filter((w) => w.status !== 'offline').length;

  return (
    <section
      aria-label="Ratatui Terminal Dashboard and Rust Implementation"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 dark:border-slate-800">
        <div
          className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
          role="tablist"
        >
          {(
            [
              { id: 'tui', label: 'Ratatui TUI' },
              { id: 'proto', label: 'distributed.proto' },
              { id: 'distributed_rs', label: 'distributed.rs' },
              { id: 'tui_rs', label: 'dashboard.rs' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={viewTab === tab.id}
              onClick={() => setViewTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                viewTab === tab.id
                  ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-950 dark:text-slate-50'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewTab === 'tui' ? (
            <>
              {runState.status === 'running' ? (
                <button
                  type="button"
                  onClick={onPause}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  Pause
                </button>
              ) : runState.status === 'paused' ? (
                <button
                  type="button"
                  onClick={onResume}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStart}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Run
                </button>
              )}

              {(runState.status === 'running' || runState.status === 'paused') && (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap shrink-0 dark:border-red-900/80 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-950"
                >
                  <Square className="h-3 w-3 fill-current" aria-hidden="true" />
                  Stop
                </button>
              )}

              <button
                type="button"
                onClick={onToggleChaos}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  runState.chaosFaultActive
                    ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                {runState.chaosFaultActive ? 'Clear Chaos Fault' : 'Inject Chaos Fault'}
              </button>

              <button
                type="button"
                onClick={onReset}
                aria-label="Reset telemetry counters"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {copiedKey === viewTab ? (
                <>
                  <Check
                    className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy Source
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Body: Interactive Ratatui TUI OR Generated Rust Artifact */}
      {viewTab === 'tui' ? (
        <div
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label="Interactive Ratatui terminal viewport"
          className="tui-surface bg-[#0B1120] p-4 text-xs leading-relaxed text-slate-200 focus:outline-none sm:p-5"
        >
          {/* Terminal Top Title & Pane Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-700/90 bg-slate-900/70 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-slate-100">
              <span className="font-semibold text-orange-400">pummel --mode distributed --tui</span>
              <span className="text-slate-600" aria-hidden="true">
                |
              </span>
              <span className="text-slate-300">{config.name}</span>
              <span className="text-slate-600" aria-hidden="true">
                |
              </span>
              <span
                className={
                  runState.status === 'running'
                    ? 'text-emerald-400'
                    : runState.status === 'aborted_sla'
                      ? 'text-red-400'
                      : runState.status === 'paused'
                        ? 'text-amber-300'
                        : 'text-slate-400'
                }
              >
                STATE: {runState.status.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {(['overview', 'workers', 'slas', 'logs'] as const).map((pane, idx) => (
                <button
                  key={pane}
                  type="button"
                  onClick={() => setTuiPane(pane)}
                  className={`px-2 py-0.5 text-[11px] transition-colors whitespace-nowrap ${
                    tuiPane === pane
                      ? 'bg-orange-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  [{idx + 1}] {pane.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Scenario Progress Gauge */}
          <div className="mt-3 border border-slate-700/90 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>SCENARIO PROGRESS · PHASE: {runState.phase.toUpperCase()}</span>
              <span>
                {runState.elapsedSec}s / {runState.totalDurationSec}s ({progressPct}%) ·{' '}
                {runState.activeVUs}/{runState.targetConcurrency} VUs · {onlineWorkers} WORKERS
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3 overflow-x-auto">
              <span className="text-orange-400" aria-hidden="true">
                [{renderProgressBar(progressPct, 36)}]
              </span>
              <span className="text-slate-300 whitespace-nowrap">
                TOTAL REQ: {runState.totalRequests.toLocaleString()} · FAILS:{' '}
                <span className={runState.totalFailures > 0 ? 'text-amber-300' : 'text-emerald-400'}>
                  {runState.totalFailures.toLocaleString()} ({runState.globalFailRatePct.toFixed(2)}
                  %)
                </span>
              </span>
            </div>
          </div>

          {/* Pane Content */}
          <RatatuiPaneContent
            pane={tuiPane}
            config={config}
            runState={runState}
            rpsSpark={rpsSpark}
            p95Spark={p95Spark}
          />

          {/* Terminal Keybind Footer */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-400">
            <span>
              Keys (focus terminal): [q] Stop · [p] Pause/Resume · [c] Chaos · [Tab] Next Pane
            </span>
            <span>ratatui 0.29 · crossterm · MAX_TIMINGS=10,000</span>
          </div>
        </div>
      ) : (
        <div className="bg-[#0B1120] p-4 sm:p-5">
          <pre className="max-h-[420px] overflow-auto font-mono text-xs leading-relaxed text-slate-200">
            <code>{codeContent}</code>
          </pre>
        </div>
      )}
    </section>
  );
}
