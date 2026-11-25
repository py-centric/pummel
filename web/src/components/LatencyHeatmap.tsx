import React, { useMemo, useState } from 'react';
import { AlertTriangle, Grid3x3, Play } from 'lucide-react';
import type { EndpointMetrics, SlaCriterion } from '../types/pummel';
import {
  buildLatencyHeatmap,
  type HeatmapCell,
  type HeatmapEndpointRow,
  type HeatmapScaleMode,
} from '../engine/latencyHeatmap';

interface LatencyHeatmapProps {
  endpoints: readonly EndpointMetrics[];
  slaCriteria: readonly SlaCriterion[];
  isRunning: boolean;
  onStartRun: () => void;
}

function getHeatmapCellStyle(cell: HeatmapCell): string {
  if (cell.count === 0) {
    return 'bg-slate-100/70 text-slate-400 border-slate-200/70 dark:bg-slate-950/60 dark:text-slate-600 dark:border-slate-800/80';
  }
  if (cell.isOutlier) {
    if (cell.intensity >= 0.55) {
      return 'bg-red-600 text-white border-red-400 ring-1 ring-red-500/40 dark:bg-red-600/90 dark:text-white dark:border-red-400';
    }
    return 'bg-amber-500/85 text-slate-950 border-amber-400 ring-1 ring-amber-500/40 dark:bg-amber-500/80 dark:text-slate-950 dark:border-amber-300';
  }
  if (cell.intensity >= 0.75) {
    return 'bg-sky-700 text-white border-sky-600 dark:bg-sky-500 dark:text-slate-950 dark:border-sky-400';
  }
  if (cell.intensity >= 0.45) {
    return 'bg-sky-500 text-white border-sky-400 dark:bg-sky-600/85 dark:text-white dark:border-sky-500';
  }
  if (cell.intensity >= 0.2) {
    return 'bg-sky-200 text-sky-950 border-sky-300 dark:bg-sky-900/70 dark:text-sky-100 dark:border-sky-700';
  }
  return 'bg-sky-100/90 text-sky-900 border-sky-200 dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-800/80';
}

export function LatencyHeatmap({
  endpoints,
  slaCriteria,
  isRunning,
  onStartRun,
}: LatencyHeatmapProps) {
  const [scaleMode, setScaleMode] = useState<HeatmapScaleMode>('global');
  const [selectedCell, setSelectedCell] = useState<{
    endpoint: string;
    bucketId: string;
  } | null>(null);

  const p95SlaLimit = useMemo(() => {
    const rule = slaCriteria.find((s) => s.metric === 'p95-response-time' && !s.subject);
    return rule ? rule.threshold : 180;
  }, [slaCriteria]);

  const matrix = useMemo(
    () =>
      buildLatencyHeatmap(endpoints, {
        scaleMode,
        outlierThresholdMs: p95SlaLimit,
      }),
    [endpoints, scaleMode, p95SlaLimit]
  );

  const inspectedDetail = useMemo<{
    row: HeatmapEndpointRow;
    cell: HeatmapCell;
  } | null>(() => {
    if (!selectedCell) return null;
    const row = matrix.rows.find((r) => r.endpoint === selectedCell.endpoint);
    const cell = row?.cells.find((c) => c.bucketId === selectedCell.bucketId);
    if (!row || !cell) return null;
    return { row, cell };
  }, [matrix.rows, selectedCell]);

  return (
    <section
      aria-label="Endpoint Latency Distribution Heatmap"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <Grid3x3 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                Latency Distribution Heatmap &amp; Outlier Matrix
              </h2>
              {matrix.totalOutliers > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/50 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {matrix.totalOutliers.toLocaleString()} outlier samples (&ge;{matrix.outlierThresholdMs}ms)
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              2D response-time frequency grid across endpoints with p95 / p99 tail markers. Click any bucket to inspect distribution.
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
          role="tablist"
          aria-label="Heatmap normalization scale"
        >
          {(
            [
              { id: 'global', label: 'Global Scale' },
              { id: 'row', label: 'Per-Endpoint Scale' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={scaleMode === mode.id}
              onClick={() => setScaleMode(mode.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap ${
                scaleMode === mode.id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {matrix.totalSamples === 0 ? (
          <div className="flex h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center dark:border-slate-700 dark:bg-slate-950/60">
            <Grid3x3 className="h-6 w-6 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <p className="mt-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              No latency samples captured yet
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
              Run a distributed cluster test to populate the 2D latency frequency heatmap and highlight p95/p99 tail outliers per endpoint.
            </p>
            {!isRunning && (
              <button
                type="button"
                onClick={onStartRun}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Start Cluster Run
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto" data-testid="latency-heatmap-grid">
              <div className="min-w-[820px]">
                {/* Column Header */}
                <div className="grid grid-cols-[220px_repeat(7,minmax(72px,1fr))_74px_74px_76px] items-end gap-1.5 pb-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <div className="px-1">Endpoint / Protocol</div>
                  {matrix.buckets.map((bucket) => (
                    <div
                      key={bucket.id}
                      className={`text-center font-mono ${
                        bucket.minMs >= matrix.outlierThresholdMs
                          ? 'font-semibold text-amber-700 dark:text-amber-400'
                          : ''
                      }`}
                    >
                      {bucket.label}
                    </div>
                  ))}
                  <div className="text-right font-mono font-semibold text-orange-700 dark:text-orange-400">
                    p95
                  </div>
                  <div className="text-right font-mono font-semibold text-rose-700 dark:text-rose-400">
                    p99
                  </div>
                  <div className="text-right font-mono">Outliers</div>
                </div>

                {/* Endpoint Rows */}
                <div className="space-y-1.5">
                  {matrix.rows.map((row) => (
                    <div
                      key={row.endpoint}
                      className="grid grid-cols-[220px_repeat(7,minmax(72px,1fr))_74px_74px_76px] items-center gap-1.5"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {row.endpoint}
                        </div>
                        <div className="font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400">
                          {row.protocol} · {row.sampleCount.toLocaleString()} samples
                        </div>
                      </div>

                      {row.cells.map((cell) => {
                        const isSelected =
                          selectedCell?.endpoint === row.endpoint &&
                          selectedCell?.bucketId === cell.bucketId;
                        return (
                          <button
                            key={cell.bucketId}
                            type="button"
                            onClick={() =>
                              setSelectedCell({
                                endpoint: row.endpoint,
                                bucketId: cell.bucketId,
                              })
                            }
                            aria-label={`${row.endpoint} ${cell.bucketLabel}: ${cell.count} samples (${cell.sharePct}%)${cell.isOutlier ? ', outlier tail' : ''}`}
                            data-outlier={cell.isOutlier ? 'true' : undefined}
                            className={`flex h-11 flex-col items-center justify-center rounded-md border font-mono transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500 ${getHeatmapCellStyle(
                              cell
                            )} ${isSelected ? 'ring-2 ring-orange-500 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
                          >
                            <span className="text-xs font-semibold tabular-nums leading-none">
                              {cell.count > 0 ? cell.count.toLocaleString() : '·'}
                            </span>
                            {cell.count > 0 && (
                              <span className="mt-0.5 text-[10px] tabular-nums opacity-85 leading-none">
                                {cell.sharePct.toFixed(0)}%
                              </span>
                            )}
                          </button>
                        );
                      })}

                      <div className="text-right font-mono text-xs font-semibold tabular-nums text-orange-700 dark:text-orange-400">
                        {row.p95Ms.toFixed(1)}ms
                      </div>
                      <div className="text-right font-mono text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                        {row.p99Ms.toFixed(1)}ms
                      </div>
                      <div
                        className={`text-right font-mono text-xs font-semibold tabular-nums ${
                          row.outlierCount > 0
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {row.outlierCount > 0 ? `${row.outlierCount} (${row.outlierPct}%)` : '0'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected Cell Inspector + Color Legend */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
              {inspectedDetail ? (
                <div
                  data-testid="heatmap-cell-inspector"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200"
                >
                  <span className="font-semibold text-slate-950 dark:text-white">
                    {inspectedDetail.row.endpoint}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
                    {inspectedDetail.cell.bucketLabel}
                  </span>
                  <span>
                    {inspectedDetail.cell.count.toLocaleString()} samples (
                    {inspectedDetail.cell.sharePct.toFixed(1)}%)
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    avg {inspectedDetail.row.avgMs.toFixed(1)}ms · p95{' '}
                    {inspectedDetail.row.p95Ms.toFixed(1)}ms · p99{' '}
                    {inspectedDetail.row.p99Ms.toFixed(1)}ms
                  </span>
                  {inspectedDetail.cell.isOutlier && (
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      OUTLIER TAIL
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Select any cell to inspect exact bucket frequency, p95, and p99 tail breakdown.
                </span>
              )}

              {/* Density Legend */}
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                <span>Density:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-3 rounded-xs border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-950" />
                  0
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-3 rounded-xs bg-sky-200 dark:bg-sky-900" />
                  Low
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-3 rounded-xs bg-sky-500 dark:bg-sky-600" />
                  Mid
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-3 rounded-xs bg-sky-700 dark:bg-sky-400" />
                  High
                </span>
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <span className="h-3 w-3 rounded-xs bg-amber-500" />
                  Outlier (&ge;{matrix.outlierThresholdMs}ms / &ge;p95)
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
