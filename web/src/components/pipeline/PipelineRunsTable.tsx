import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  GitCommit,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { PipelineConclusion, PipelineStatusReport } from '../../engine/pipelineStatus';

export function getConclusionMeta(conclusion: PipelineConclusion): {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
} {
  switch (conclusion) {
    case 'passing':
      return {
        label: 'Passing',
        badgeClass:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300',
        icon: (
          <CheckCircle2
            className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        ),
      };
    case 'failing':
      return {
        label: 'Failing',
        badgeClass:
          'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300',
        icon: <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />,
      };
    case 'running':
      return {
        label: 'Running',
        badgeClass:
          'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300',
        icon: (
          <RefreshCw
            className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400"
            aria-hidden="true"
          />
        ),
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        badgeClass:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300',
        icon: (
          <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        ),
      };
    default:
      return {
        label: 'Unknown',
        badgeClass:
          'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
        icon: <AlertCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />,
      };
  }
}

interface PipelineRunsTableProps {
  report: PipelineStatusReport;
}

export function PipelineRunsTable({ report }: PipelineRunsTableProps) {
  return (
    <div className="space-y-4">
      {/* Latest Run Banner */}
      {report.latestRun ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-950/50">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {getConclusionMeta(report.latestRun.conclusion).icon}
              <span className="font-semibold text-slate-950 dark:text-slate-50">
                Latest: {report.latestRun.name} (#{report.latestRun.runNumber})
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                {report.latestRun.branch}
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                <GitCommit className="h-3 w-3" aria-hidden="true" />
                {report.latestRun.commitSha}
              </span>
            </div>
            <p className="truncate font-mono text-[11px] text-slate-600 dark:text-slate-400">
              {report.latestRun.commitMessage}
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {report.latestRun.durationSec !== null && <span>{report.latestRun.durationSec}s</span>}
            <a
              href={report.latestRun.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-sans font-semibold text-orange-700 hover:underline dark:text-orange-400"
            >
              Inspect Run
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {report.note}
        </div>
      )}

      {/* Recent Builds Table */}
      {report.recentRuns.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Workflow / Pipeline</th>
                <th className="px-3 py-2.5">Branch &amp; SHA</th>
                <th className="px-3 py-2.5">Commit</th>
                <th className="px-3 py-2.5 text-right">Duration</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {report.recentRuns.slice(0, 5).map((run) => {
                const meta = getConclusionMeta(run.conclusion);
                return (
                  <tr key={run.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5">
                      <a
                        href={run.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-slate-900 hover:text-orange-700 dark:text-slate-100 dark:hover:text-orange-400"
                      >
                        {run.name}
                        <span className="font-mono text-[10px] font-normal text-slate-500">
                          #{run.runNumber}
                        </span>
                      </a>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {run.branch} · {run.commitSha}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {run.commitMessage}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {run.durationSec !== null ? `${run.durationSec}s` : ' -- '}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${meta.badgeClass}`}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
        <span>{report.note}</span>
        <span>
          Default branch: {report.defaultBranch} · Checked{' '}
          {new Date(report.checkedAtIso).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
