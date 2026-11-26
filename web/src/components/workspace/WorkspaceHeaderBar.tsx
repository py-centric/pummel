import React from 'react';
import {
  ArrowRight,
  CalendarClock,
  Camera,
  GitCompare,
  Play,
  Square,
  Terminal,
  Zap,
} from 'lucide-react';
import { ExportConfigMenu } from '../ExportConfigMenu';
import { TEST_CLUSTER_PROFILES } from '../../engine/testClusters';
import type { DownloadExportFormat } from '../../engine/exportDownload';
import type { RunStatus } from '../../types/pummel';

interface WorkspaceHeaderBarProps {
  selectedClusterId: string;
  runStatus: RunStatus;
  logsCount: number;
  scheduledCount: number;
  schedulePanelOpen: boolean;
  logsStreamOpen: boolean;
  compareOpen: boolean;
  onSelectCluster: (clusterId: string) => void;
  onQuickRun: () => void;
  onStopRun: () => void;
  onToggleSchedulePanel: () => void;
  onToggleLogsStream: () => void;
  onSaveSnapshot: () => void;
  onToggleCompare: () => void;
  onExportDownload: (target: DownloadExportFormat) => void;
  onDryRun: () => void;
  onLoadIntoCluster: () => void;
}

export function WorkspaceHeaderBar({
  selectedClusterId,
  runStatus,
  logsCount,
  scheduledCount,
  schedulePanelOpen,
  logsStreamOpen,
  compareOpen,
  onSelectCluster,
  onQuickRun,
  onStopRun,
  onToggleSchedulePanel,
  onToggleLogsStream,
  onSaveSnapshot,
  onToggleCompare,
  onExportDownload,
  onDryRun,
  onLoadIntoCluster,
}: WorkspaceHeaderBarProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50 text-balance">
          Declarative Configuration Workspace
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Inject load-testing patterns from the Template Library, save &amp; compare IndexedDB
          iteration snapshots, edit syntax-highlighted YAML/TOML/JSON specs, and transpile across
          formats.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="sr-only">Target Test Cluster for Quick Run</span>
          <select
            id="quick-run-cluster-select"
            aria-label="Target test cluster for Quick Run"
            value={selectedClusterId}
            onChange={(e) => onSelectCluster(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {TEST_CLUSTER_PROFILES.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.name} ({cluster.region})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="workspace-quick-run-btn"
          onClick={onQuickRun}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          Quick Run
        </button>
        {runStatus === 'running' && (
          <button
            type="button"
            onClick={onStopRun}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap shrink-0"
          >
            <Square className="h-3 w-3 fill-current" aria-hidden="true" />
            Stop
          </button>
        )}
        <button
          type="button"
          data-testid="workspace-schedule-test-btn"
          aria-pressed={schedulePanelOpen}
          onClick={onToggleSchedulePanel}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
            schedulePanelOpen
              ? 'border-orange-500 bg-orange-50 text-orange-800 dark:border-orange-500/80 dark:bg-orange-950/40 dark:text-orange-300'
              : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Schedule Test
          {scheduledCount > 0 && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {scheduledCount}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-pressed={logsStreamOpen}
          onClick={onToggleLogsStream}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
          Logs ({logsCount})
        </button>
        <button
          type="button"
          onClick={onSaveSnapshot}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          Snapshot
        </button>
        <button
          type="button"
          onClick={onToggleCompare}
          aria-pressed={compareOpen}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
            compareOpen
              ? 'border-orange-500 bg-orange-50 text-orange-800 dark:border-orange-500/80 dark:bg-orange-950/40 dark:text-orange-300'
              : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
          Compare
        </button>
        <ExportConfigMenu onExportFormat={onExportDownload} />
        <button
          type="button"
          onClick={onDryRun}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          Run Dry-Run
        </button>
        <button
          type="button"
          onClick={onLoadIntoCluster}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        >
          Load into Cluster
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
