import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Pause,
  Play,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { RunLogEntry, RunStatus } from '../types/pummel';
import {
  countLogsByLevel,
  filterExecutionLogs,
  formatLogsForClipboard,
  formatLogTimestamp,
  LOG_LEVEL_FILTERS,
  type LogLevelFilter,
} from '../engine/logStream';

interface ExecutionLogsPanelProps {
  logs: RunLogEntry[];
  runStatus: RunStatus;
  onClearLogs: () => void;
  onExportLogsTimeline?: (format: 'csv' | 'json') => void;
}

function getLevelBadgeClasses(level: RunLogEntry['level']): string {
  switch (level) {
    case 'GRPC':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    case 'INFO':
      return 'border-slate-500/30 bg-slate-500/15 text-slate-200';
    case 'WARN':
      return 'border-amber-500/35 bg-amber-500/15 text-amber-300';
    case 'SLA':
      return 'border-red-500/40 bg-red-500/15 text-red-300';
    case 'CHAOS':
      return 'border-orange-500/40 bg-orange-500/15 text-orange-300';
  }
}

export function ExecutionLogsPanel({
  logs,
  runStatus,
  onClearLogs,
  onExportLogsTimeline,
}: ExecutionLogsPanelProps) {
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [streamPaused, setStreamPaused] = useState(false);
  const [frozenLogs, setFrozenLogs] = useState<RunLogEntry[] | null>(null);
  const [copied, setCopied] = useState(false);

  const activeLogs = streamPaused && frozenLogs ? frozenLogs : logs;

  const levelCounts = useMemo(() => countLogsByLevel(activeLogs), [activeLogs]);

  const filteredLogs = useMemo(
    () => filterExecutionLogs(activeLogs, levelFilter, searchQuery),
    [activeLogs, levelFilter, searchQuery]
  );

  const isLiveStreaming = runStatus === 'running' && !streamPaused;
  const bufferedWhilePaused =
    streamPaused && frozenLogs ? Math.max(0, logs.length - frozenLogs.length) : 0;

  const handleTogglePauseStream = () => {
    if (streamPaused) {
      setStreamPaused(false);
      setFrozenLogs(null);
    } else {
      setFrozenLogs(logs);
      setStreamPaused(true);
    }
  };

  const handleClear = () => {
    if (streamPaused) {
      setFrozenLogs([]);
    }
    onClearLogs();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatLogsForClipboard(filteredLogs));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      aria-label="Real-time Execution Logs"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <Terminal className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                Execution Logs
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${
                  isLiveStreaming
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : streamPaused
                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    isLiveStreaming
                      ? 'animate-pulse bg-emerald-500'
                      : streamPaused
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                  }`}
                />
                {isLiveStreaming
                  ? 'LIVE STREAM'
                  : streamPaused
                    ? `PAUSED${bufferedWhilePaused > 0 ? ` (+${bufferedWhilePaused})` : ''}`
                    : 'IDLE'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Real-time gRPC worker status heartbeats, shard rebalances, SLA checks, and system events.
            </p>
          </div>
        </div>

        {/* Stream Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTogglePauseStream}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {streamPaused ? (
              <>
                <Play className="h-3 w-3" aria-hidden="true" />
                Resume Stream
              </>
            ) : (
              <>
                <Pause className="h-3 w-3" aria-hidden="true" />
                Pause Stream
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            disabled={filteredLogs.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" aria-hidden="true" />
                Copy
              </>
            )}
          </button>

          {onExportLogsTimeline && (
            <>
              <button
                type="button"
                data-testid="export-logs-csv-btn"
                onClick={() => onExportLogsTimeline('csv')}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Export CSV
              </button>
              <button
                type="button"
                data-testid="export-logs-json-btn"
                onClick={() => onExportLogsTimeline('json')}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Export JSON
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleClear}
            disabled={activeLogs.length === 0}
            aria-label="Clear execution logs"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
        <div
          className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800/80"
          role="tablist"
          aria-label="Filter execution logs by severity"
        >
          {LOG_LEVEL_FILTERS.map((lvl) => {
            const selected = levelFilter === lvl;
            return (
              <button
                key={lvl}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setLevelFilter(lvl)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors whitespace-nowrap ${
                  selected
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <span>{lvl}</span>
                <span
                  className={`tabular-nums ${
                    selected
                      ? 'text-slate-300 dark:text-slate-600'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {levelCounts[lvl]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <label htmlFor="execution-logs-search" className="sr-only">
            Filter execution logs by worker or message
          </label>
          <input
            id="execution-logs-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by worker, RPC, or event..."
            className="h-8 w-full rounded-md border border-slate-200 bg-white pr-3 pl-8 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Console Log Stream Viewport */}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-72 overflow-y-auto bg-[#0B1120] font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400">
            <p className="font-sans text-sm font-medium text-slate-200">
              {activeLogs.length === 0
                ? 'Execution log buffer is empty.'
                : 'No log events match the active filter.'}
            </p>
            <p className="mt-1 font-sans text-xs text-slate-400">
              {activeLogs.length === 0
                ? 'Start a distributed run or interact with worker nodes to stream gRPC telemetry.'
                : 'Reset the level tab or search term to inspect all captured events.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/70">
            {filteredLogs.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2 hover:bg-slate-900/80 sm:flex-nowrap"
              >
                <span className="shrink-0 tabular-nums text-slate-500">
                  {formatLogTimestamp(entry.timestampSec)}
                </span>
                <span
                  className={`inline-flex w-14 shrink-0 justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${getLevelBadgeClasses(
                    entry.level
                  )}`}
                >
                  {entry.level}
                </span>
                <span className="w-36 shrink-0 truncate font-semibold text-orange-300/90">
                  {entry.source}
                </span>
                <span className="min-w-0 flex-1 break-words text-slate-200">
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
        <span className="font-mono tabular-nums">
          Showing {filteredLogs.length} of {activeLogs.length} events (newest first · 120-event ring buffer)
        </span>
        <span className="font-mono">gRPC telemetry stream · mTLS / local coordinator</span>
      </div>
    </section>
  );
}
