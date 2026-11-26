import React, { useMemo, useState } from 'react';
import { Activity, Bell, BellOff, Play, Sparkles } from 'lucide-react';
import type { SlaCriterion, TelemetryPoint } from '../types/pummel';
import { buildTelemetryChartSummary } from '../engine/telemetryChart';
import {
  analyzeTelemetryAnomalies,
  DEFAULT_ANOMALY_CONFIG,
  type AnomalyDetectorConfig,
} from '../engine/anomalyDetector';
import { useTheme } from '../context/ThemeContext';
import type { BrowserNotificationPerm } from '../context/PummelContext';
import {
  getTelemetryChartColors,
  type MergedChartDatum,
} from './trends/TelemetryTooltip';
import {
  CombinedTelemetryChart,
  LatencyLineChart,
  ThroughputAreaChart,
} from './trends/TelemetryChartLayers';

type ChartViewMode = 'split' | 'throughput' | 'latency' | 'combined';

interface PerformanceTrendsChartProps {
  history: readonly TelemetryPoint[];
  slaCriteria: readonly SlaCriterion[];
  isRunning: boolean;
  onStartRun: () => void;
  anomalyConfig?: AnomalyDetectorConfig;
  onUpdateAnomalyConfig?: (patch: Partial<AnomalyDetectorConfig>) => void;
  notificationPermission?: BrowserNotificationPerm;
  onRequestBrowserNotifications?: () => void;
}

export function PerformanceTrendsChart({
  history,
  slaCriteria,
  isRunning,
  onStartRun,
  anomalyConfig = DEFAULT_ANOMALY_CONFIG,
  onUpdateAnomalyConfig,
  notificationPermission = 'default',
  onRequestBrowserNotifications,
}: PerformanceTrendsChartProps) {
  const [viewMode, setViewMode] = useState<ChartViewMode>('split');
  const { isDark } = useTheme();

  const summary = useMemo(
    () => buildTelemetryChartSummary(history, slaCriteria),
    [history, slaCriteria]
  );

  const anomalyAnalysis = useMemo(
    () => analyzeTelemetryAnomalies(history, anomalyConfig),
    [history, anomalyConfig]
  );

  const mergedPoints: MergedChartDatum[] = useMemo(
    () =>
      summary.points.map((pt, idx) => {
        const anom = anomalyAnalysis.points[idx];
        return {
          ...pt,
          p95MovingAvg: anom?.p95MovingAvg ?? null,
          rpsMovingAvg: anom?.rpsMovingAvg ?? null,
          p95AnomalyValue: anom?.p95AnomalyValue ?? null,
          rpsAnomalyValue: anom?.rpsAnomalyValue ?? null,
          anomalyReason: anom?.anomalyReason,
        };
      }),
    [summary.points, anomalyAnalysis.points]
  );

  const colors = useMemo(() => getTelemetryChartColors(isDark), [isDark]);

  return (
    <section
      aria-label="Real-Time Performance Metrics Visualization"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header & View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Real-Time Throughput &amp; Latency Trends
            </h2>
            {anomalyConfig.enabled && (
              <span
                data-testid="anomaly-detector-badge"
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                  anomalyAnalysis.anomalies.length > 0
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                }`}
              >
                <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                {anomalyAnalysis.anomalies.length > 0
                  ? `${anomalyAnalysis.anomalies.length} Outlier${anomalyAnalysis.anomalies.length === 1 ? '' : 's'} (${anomalyConfig.sigmaThreshold.toFixed(1)}σ)`
                  : `Anomaly Guard ${anomalyConfig.sigmaThreshold.toFixed(1)}σ`}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            <span>Peak {summary.peakRps.toLocaleString()} req/s</span>
            <span aria-hidden="true">·</span>
            <span>Avg {summary.avgRps.toLocaleString()} req/s</span>
            <span aria-hidden="true">·</span>
            <span>Peak p95 {summary.peakP95Ms.toFixed(1)} ms</span>
            <span aria-hidden="true">·</span>
            <span>Peak p99 {summary.peakP99Ms.toFixed(1)} ms</span>
            {summary.p95SlaThresholdMs !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span>p95 SLA limit {summary.p95SlaThresholdMs} ms</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Anomaly Detector Controls */}
          {onUpdateAnomalyConfig && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-pressed={anomalyConfig.enabled}
                onClick={() => onUpdateAnomalyConfig({ enabled: !anomalyConfig.enabled })}
                className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold whitespace-nowrap ${
                  anomalyConfig.enabled
                    ? 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400'
                }`}
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {anomalyConfig.enabled ? 'Anomaly On' : 'Anomaly Off'}
              </button>
              <select
                aria-label="Anomaly statistical z-score threshold"
                value={String(anomalyConfig.sigmaThreshold)}
                onChange={(e) =>
                  onUpdateAnomalyConfig({ sigmaThreshold: Number(e.target.value) })
                }
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[11px] font-medium text-slate-800 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="1.5">1.5σ (Sensitive)</option>
                <option value="2">2.0σ (Balanced)</option>
                <option value="2.5">2.5σ (Strict)</option>
                <option value="3">3.0σ (Severe)</option>
              </select>
              {onRequestBrowserNotifications && (
                <button
                  type="button"
                  onClick={onRequestBrowserNotifications}
                  title="Enable browser notifications when metrics deviate significantly from moving average"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {notificationPermission === 'granted' ? (
                    <>
                      <Bell
                        className="h-3 w-3 text-emerald-600 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                      Alerts Active
                    </>
                  ) : (
                    <>
                      <BellOff className="h-3 w-3 text-slate-400" aria-hidden="true" />
                      Notify Me
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          <div
            className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
            role="tablist"
            aria-label="Telemetry chart layout"
          >
            {(
              [
                { id: 'split', label: 'Area + Line' },
                { id: 'throughput', label: 'Throughput Area' },
                { id: 'latency', label: 'Latency Line' },
                { id: 'combined', label: 'Combined' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={viewMode === mode.id}
                onClick={() => setViewMode(mode.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap ${
                  viewMode === mode.id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Latest Anomaly Callout Strip */}
      {anomalyConfig.enabled && anomalyAnalysis.latestAnomaly && (
        <div
          role="status"
          data-testid="latest-anomaly-callout"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50/80 px-5 py-2 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
        >
          <span className="font-mono font-semibold">
            Latest Anomaly (T+{anomalyAnalysis.latestAnomaly.elapsedSec}s):{' '}
            {anomalyAnalysis.latestAnomaly.message}
          </span>
          <span className="font-mono text-[11px] opacity-80">
            {anomalyAnalysis.anomalies.length} total outlier
            {anomalyAnalysis.anomalies.length === 1 ? '' : 's'} in window
          </span>
        </div>
      )}

      {/* Chart Canvas or Empty State */}
      <div className="p-4 sm:p-5">
        {mergedPoints.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center dark:border-slate-700 dark:bg-slate-950/60">
            <Activity className="h-6 w-6 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <p className="mt-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Awaiting live telemetry frames
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
              Start a distributed cluster run to stream real-time request throughput (AreaChart) and
              Avg / p95 / p99 latency trends (LineChart) from active worker nodes.
            </p>
            {!isRunning && (
              <button
                type="button"
                onClick={onStartRun}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Start Telemetry Stream
              </button>
            )}
          </div>
        ) : (
          <>
            {viewMode === 'split' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <ThroughputAreaChart
                  mergedPoints={mergedPoints}
                  summary={summary}
                  colors={colors}
                  anomalyEnabled={anomalyConfig.enabled}
                  heightClass="h-64"
                />
                <LatencyLineChart
                  mergedPoints={mergedPoints}
                  summary={summary}
                  colors={colors}
                  anomalyEnabled={anomalyConfig.enabled}
                  heightClass="h-64"
                />
              </div>
            )}
            {viewMode === 'throughput' && (
              <ThroughputAreaChart
                mergedPoints={mergedPoints}
                summary={summary}
                colors={colors}
                anomalyEnabled={anomalyConfig.enabled}
                heightClass="h-72"
              />
            )}
            {viewMode === 'latency' && (
              <LatencyLineChart
                mergedPoints={mergedPoints}
                summary={summary}
                colors={colors}
                anomalyEnabled={anomalyConfig.enabled}
                heightClass="h-72"
              />
            )}
            {viewMode === 'combined' && (
              <CombinedTelemetryChart
                mergedPoints={mergedPoints}
                summary={summary}
                colors={colors}
                anomalyEnabled={anomalyConfig.enabled}
              />
            )}

            {/* Quiet Legend Footer */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-3 rounded-xs bg-sky-600 dark:bg-sky-400"
                    aria-hidden="true"
                  />
                  Throughput: {summary.latestRps.toLocaleString()} req/s
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-0.5 w-3 bg-indigo-600 dark:bg-indigo-400"
                    aria-hidden="true"
                  />
                  Avg: {summary.latestAvgMs.toFixed(1)} ms
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-0.5 w-3 bg-orange-600 dark:bg-orange-400"
                    aria-hidden="true"
                  />
                  p95: {summary.latestP95Ms.toFixed(1)} ms
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-0.5 w-3 bg-rose-600 dark:bg-rose-400"
                    aria-hidden="true"
                  />
                  p99: {summary.latestP99Ms.toFixed(1)} ms
                </span>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                Window: {mergedPoints.length}s / 60s rolling buffer · synced hover
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
