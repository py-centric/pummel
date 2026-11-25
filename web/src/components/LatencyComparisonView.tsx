import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Camera, Layers } from 'lucide-react';
import { LATENCY_BUCKETS } from '../engine/latencyHeatmap';
import {
  buildLatencyHeatmapOverlay,
  type OverlayCellComparison,
  type RecordedRunHeatmap,
} from '../engine/latencyComparison';

interface LatencyComparisonViewProps {
  runs: readonly RecordedRunHeatmap[];
  canCaptureCurrent: boolean;
  onCaptureCurrentRun: () => void;
}

function getOverlayCellClasses(cell: OverlayCellComparison): string {
  const absDelta = Math.abs(cell.deltaSharePct);
  if (cell.direction === 'regression') {
    if (absDelta >= 12) {
      return 'bg-red-600/85 text-white border-red-500 dark:bg-red-600/80 dark:text-white';
    }
    if (absDelta >= 5) {
      return 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950/70 dark:text-red-200 dark:border-red-900';
    }
    return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-900';
  }
  if (cell.direction === 'improvement') {
    if (absDelta >= 8) {
      return 'bg-emerald-600/80 text-white border-emerald-500 dark:bg-emerald-600/75 dark:text-white';
    }
    return 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-900';
  }
  return 'bg-slate-50 text-slate-600 border-slate-200/80 dark:bg-slate-950/50 dark:text-slate-400 dark:border-slate-800';
}

export function LatencyComparisonView({
  runs,
  canCaptureCurrent,
  onCaptureCurrentRun,
}: LatencyComparisonViewProps) {
  const [baselineId, setBaselineId] = useState<string>(() => runs[0]?.id ?? '');
  const [targetId, setTargetId] = useState<string>(() => runs[1]?.id ?? runs[0]?.id ?? '');

  const baselineRun = runs.find((r) => r.id === baselineId) ?? runs[0];
  const targetRun = runs.find((r) => r.id === targetId) ?? runs[1] ?? runs[0];

  const overlay = useMemo(() => {
    if (!baselineRun || !targetRun) return null;
    return buildLatencyHeatmapOverlay(baselineRun, targetRun);
  }, [baselineRun, targetRun]);

  if (!overlay) return null;

  const handleSwap = () => {
    const prevBase = baselineRun.id;
    setBaselineId(targetRun.id);
    setTargetId(prevBase);
  };

  return (
    <section
      aria-label="Latency Comparison Heatmap Overlay"
      data-testid="latency-comparison-view"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header & Run Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <Layers className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Latency Comparison (Heatmap Overlay)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Overlay two test runs to visualize latency bucket shifts (red = slower regression,
              emerald = faster shift).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold">Run A</span>
            <select
              aria-label="Select baseline test run A"
              value={baselineRun.id}
              onChange={(e) => setBaselineId(e.target.value)}
              className="h-8 max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap Baseline Run A and Target Run B"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold">Run B</span>
            <select
              aria-label="Select target test run B"
              value={targetRun.id}
              onChange={(e) => setTargetId(e.target.value)}
              className="h-8 max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          {canCaptureCurrent && (
            <button
              type="button"
              onClick={onCaptureCurrentRun}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              Save Live Run
            </button>
          )}
        </div>
      </div>

      {/* Regression Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-2.5 font-mono text-xs tabular-nums dark:border-slate-800 dark:bg-slate-950/50">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-slate-600 dark:text-slate-400">
            Regressed:{' '}
            <strong
              className={
                overlay.regressedEndpoints > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }
            >
              {overlay.regressedEndpoints}
            </strong>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Improved:{' '}
            <strong className="text-emerald-700 dark:text-emerald-400">
              {overlay.improvedEndpoints}
            </strong>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Avg p95 Δ:{' '}
            <strong
              className={
                overlay.avgP95DeltaMs > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }
            >
              {overlay.avgP95DeltaMs > 0 ? `+${overlay.avgP95DeltaMs}` : overlay.avgP95DeltaMs} ms
            </strong>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Avg p99 Δ:{' '}
            <strong
              className={
                overlay.avgP99DeltaMs > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }
            >
              {overlay.avgP99DeltaMs > 0 ? `+${overlay.avgP99DeltaMs}` : overlay.avgP99DeltaMs} ms
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-red-500" aria-hidden="true" />
            Regression shift
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" aria-hidden="true" />
            Improvement shift
          </span>
        </div>
      </div>

      {/* Overlaid 2D Difference Heatmap Grid */}
      <div className="overflow-x-auto p-4 sm:p-5">
        <table className="w-full min-w-[760px] border-separate border-spacing-1 text-left text-xs">
          <thead>
            <tr className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
              <th className="px-2 py-1.5 font-sans text-xs font-semibold text-slate-700 dark:text-slate-300">
                Endpoint (Run A → Run B)
              </th>
              {LATENCY_BUCKETS.map((b) => (
                <th key={b.id} className="px-1.5 py-1.5 text-center font-medium">
                  {b.label}
                </th>
              ))}
              <th className="px-2 py-1.5 text-right font-semibold">p95 Δ</th>
              <th className="px-2 py-1.5 text-right font-semibold">p99 Δ</th>
            </tr>
          </thead>
          <tbody>
            {overlay.rows.map((row) => (
              <tr key={row.label}>
                <td className="px-2 py-1.5">
                  <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {row.label}
                  </div>
                  <div className="font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400">
                    {row.protocol} ·{' '}
                    <span
                      className={
                        row.status === 'regressed'
                          ? 'font-semibold text-red-700 dark:text-red-400'
                          : row.status === 'improved'
                            ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500'
                      }
                    >
                      {row.status}
                    </span>
                  </div>
                </td>
                {row.cells.map((cell) => {
                  const sign = cell.deltaSharePct > 0 ? '+' : '';
                  return (
                    <td key={cell.bucketId} className="p-0">
                      <div
                        title={`${row.label} (${cell.bucketLabel}): Run A ${cell.baselineSharePct}% → Run B ${cell.targetSharePct}% (${sign}${cell.deltaSharePct}%)`}
                        className={`flex h-11 flex-col items-center justify-center rounded border px-1 font-mono tabular-nums ${getOverlayCellClasses(
                          cell
                        )}`}
                      >
                        <span className="text-[11px] font-semibold leading-tight">
                          {sign}
                          {cell.deltaSharePct.toFixed(1)}%
                        </span>
                        <span className="text-[9px] opacity-80">
                          {cell.baselineSharePct.toFixed(0)}→{cell.targetSharePct.toFixed(0)}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td
                  className={`px-2 py-1.5 text-right font-mono text-xs font-semibold tabular-nums ${
                    row.p95DeltaMs > 0
                      ? 'text-red-700 dark:text-red-400'
                      : row.p95DeltaMs < 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {row.p95DeltaMs > 0 ? `+${row.p95DeltaMs.toFixed(1)}` : row.p95DeltaMs.toFixed(1)}ms
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-mono text-xs font-semibold tabular-nums ${
                    row.p99DeltaMs > 0
                      ? 'text-red-700 dark:text-red-400'
                      : row.p99DeltaMs < 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {row.p99DeltaMs > 0 ? `+${row.p99DeltaMs.toFixed(1)}` : row.p99DeltaMs.toFixed(1)}ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
