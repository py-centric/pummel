import React, { useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { PostRunAnalysisReport } from '../engine/postRunAnalysis';

interface PostRunAnalysisModalProps {
  open: boolean;
  report: PostRunAnalysisReport;
  onClose: () => void;
  onRunAgain: () => void;
}

export function PostRunAnalysisModal({
  open,
  report,
  onClose,
  onRunAgain,
}: PostRunAnalysisModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const verdictStyles =
    report.verdict === 'failed'
      ? {
          icon: <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />,
          badge:
            'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300',
          label: 'SLA FAILED / ABORTED',
        }
      : report.verdict === 'warning'
        ? {
            icon: (
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            ),
            badge:
              'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300',
            label: 'COMPLETED WITH WARNINGS',
          }
        : {
            icon: (
              <CheckCircle2
                className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            ),
            badge:
              'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300',
            label: 'ALL SLA GATES PASSED',
          };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-run-analysis-title"
      data-testid="post-run-analysis-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">{verdictStyles.icon}</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="post-run-analysis-title"
                  className="text-base font-bold text-slate-950 dark:text-slate-50"
                >
                  Post-Run Analysis
                </h2>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${verdictStyles.badge}`}
                >
                  {verdictStyles.label}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                {report.specName} · {report.clusterName} ({report.coordinatorBind}) ·{' '}
                {report.elapsedSec}s elapsed · {report.targetConcurrency.toLocaleString()} VUs
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close Post-Run Analysis modal"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Summary KPI Grid */}
        <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800">
          <div className="bg-white p-4 dark:bg-slate-900">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Peak p95 / p99
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-orange-700 dark:text-orange-400">
              {report.peakP95Ms.toFixed(1)}
              <span className="text-xs font-normal text-slate-500">ms</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-rose-700 dark:text-rose-400">
              p99 {report.peakP99Ms.toFixed(1)} ms
            </div>
          </div>

          <div className="bg-white p-4 dark:bg-slate-900">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Total Error Rate
            </div>
            <div
              className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                report.errorRatePct > 1
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {report.errorRatePct.toFixed(2)}%
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {report.totalFailures.toLocaleString()} / {report.totalRequests.toLocaleString()} reqs
            </div>
          </div>

          <div className="bg-white p-4 dark:bg-slate-900">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Peak Throughput
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-sky-700 dark:text-sky-400">
              {report.peakRps.toLocaleString()}
              <span className="ml-0.5 text-xs font-normal text-slate-500">rps</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              Avg {report.avgRps.toLocaleString()} rps
            </div>
          </div>

          <div className="bg-white p-4 dark:bg-slate-900">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              SLA Compliance
            </div>
            <div
              className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                report.breachedSlaCount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {report.passedSlaCount}/{report.slaRows.length}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {report.breachedSlaCount} breached
            </div>
          </div>
        </div>

        {/* SLA Threshold Comparison Table */}
        <div className="max-h-72 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              SLA Threshold Evaluation
            </h3>
            {report.slowestEndpointLabel && (
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                Slowest endpoint: <strong className="text-slate-800 dark:text-slate-200">{report.slowestEndpointLabel}</strong> ({report.slowestEndpointP99Ms.toFixed(1)}ms p99)
              </span>
            )}
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th className="px-3.5 py-2">Metric</th>
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2 text-right">Threshold</th>
                  <th className="px-3 py-2 text-right">Observed</th>
                  <th className="px-3.5 py-2 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800/80">
                {report.slaRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3.5 py-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">
                      {row.label}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {row.subject}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-300">
                      {row.thresholdLabel}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {row.observedLabel}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <span
                        className={`font-semibold ${
                          row.breached
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {row.breached ? `BREACH (${row.breachCount}x)` : 'PASS'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-6 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onRunAgain();
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-4 text-xs font-semibold text-white hover:bg-orange-700"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            Re-Run Test
          </button>
        </div>
      </div>
    </div>
  );
}
