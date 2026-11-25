import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Bell, BellOff, Play, Sparkles } from 'lucide-react';
import type { SlaCriterion, TelemetryPoint } from '../types/pummel';
import { buildTelemetryChartSummary, type ChartTelemetryDatum } from '../engine/telemetryChart';
import {
  analyzeTelemetryAnomalies,
  DEFAULT_ANOMALY_CONFIG,
  type AnomalyDetectorConfig,
} from '../engine/anomalyDetector';
import { useTheme } from '../context/ThemeContext';
import type { BrowserNotificationPerm } from '../context/PummelContext';

type ChartViewMode = 'split' | 'throughput' | 'latency' | 'combined';

type MergedChartDatum = ChartTelemetryDatum & {
  p95MovingAvg: number | null;
  rpsMovingAvg: number | null;
  p95AnomalyValue: number | null;
  rpsAnomalyValue: number | null;
  anomalyReason?: string;
};

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

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: MergedChartDatum }>;
  label?: string;
}

function TelemetryTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">{label}</div>
      <dl className="mt-1.5 space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">Throughput</dt>
          <dd className="font-semibold text-sky-700 dark:text-sky-400">
            {datum.rps.toLocaleString()} req/s
          </dd>
        </div>
        {datum.rpsMovingAvg !== null && (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500 dark:text-slate-400">Throughput MA</dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {datum.rpsMovingAvg.toLocaleString()} req/s
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">Active VUs</dt>
          <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
            {datum.activeVUs.toLocaleString()}
          </dd>
        </div>
        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">p99 Latency</dt>
          <dd className="font-semibold text-rose-700 dark:text-rose-400">
            {datum.p99Ms.toFixed(1)} ms
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">p95 Latency</dt>
          <dd className="font-semibold text-orange-700 dark:text-orange-400">
            {datum.p95Ms.toFixed(1)} ms
          </dd>
        </div>
        {datum.p95MovingAvg !== null && (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500 dark:text-slate-400">p95 Moving Avg</dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {datum.p95MovingAvg.toFixed(1)} ms
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">Avg Latency</dt>
          <dd className="font-semibold text-indigo-700 dark:text-indigo-400">
            {datum.avgMs.toFixed(1)} ms
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">Fail Rate</dt>
          <dd
            className={
              datum.failRatePct > 1
                ? 'font-semibold text-red-700 dark:text-red-400'
                : 'text-slate-800 dark:text-slate-200'
            }
          >
            {datum.failRatePct.toFixed(2)}%
          </dd>
        </div>
      </dl>
      {datum.anomalyReason && (
        <div className="mt-2 border-t border-red-200 pt-1.5 font-mono text-[11px] font-semibold text-red-700 dark:border-red-900/60 dark:text-red-400">
          Outlier: {datum.anomalyReason}
        </div>
      )}
    </div>
  );
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

  const gridStroke = isDark ? '#1E293B' : '#E2E8F0';
  const axisTickColor = isDark ? '#94A3B8' : '#64748B';
  const axisLineStroke = isDark ? '#334155' : '#CBD5E1';
  const rpsColor = isDark ? '#38BDF8' : '#0284C7';
  const rpsAxisColor = isDark ? '#38BDF8' : '#0369A1';
  const vuColor = isDark ? '#34D399' : '#059669';
  const avgColor = isDark ? '#818CF8' : '#4F46E5';
  const p95Color = isDark ? '#FB923C' : '#EA580C';
  const p99Color = isDark ? '#FB7185' : '#E11D48';
  const maColor = isDark ? '#94A3B8' : '#64748B';
  const outlierColor = '#DC2626';
  const slaLabelColor = isDark ? '#F87171' : '#B91C1C';

  const renderThroughputAreaChart = (heightClass: string) => (
    <div
      className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/40 p-3.5 dark:border-slate-800 dark:bg-slate-950/40"
      data-testid="recharts-throughput-area"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Request Throughput &amp; Active VUs (Area)
          </h3>
          <p className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            Now {summary.latestRps.toLocaleString()} req/s · Peak {summary.peakRps.toLocaleString()} req/s
          </p>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2.5 rounded-xs bg-sky-600 dark:bg-sky-400" aria-hidden="true" />
            req/s
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
            VUs ({summary.latestActiveVUs.toLocaleString()})
          </span>
        </div>
      </div>

      <div className={`${heightClass} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={mergedPoints}
            syncId="pummel-telemetry"
            margin={{ top: 8, right: 8, left: 0, bottom: 2 }}
          >
            <defs>
              <linearGradient id="pummelThroughputAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={rpsColor} stopOpacity={isDark ? 0.36 : 0.24} />
                <stop offset="95%" stopColor={rpsColor} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="pummelVuAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={vuColor} stopOpacity={isDark ? 0.24 : 0.16} />
                <stop offset="95%" stopColor={vuColor} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fill: axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={{ stroke: axisLineStroke }}
              minTickGap={24}
            />
            <YAxis
              yAxisId="rps"
              orientation="left"
              tick={{ fill: rpsAxisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <YAxis
              yAxisId="vus"
              orientation="right"
              tick={{ fill: vuColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip content={<TelemetryTooltip />} />
            <Area
              yAxisId="rps"
              type="monotone"
              dataKey="rps"
              name="Throughput (req/s)"
              stroke={rpsColor}
              strokeWidth={2}
              fill="url(#pummelThroughputAreaFill)"
              isAnimationActive={false}
            />
            <Area
              yAxisId="vus"
              type="monotone"
              dataKey="activeVUs"
              name="Active VUs"
              stroke={vuColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="url(#pummelVuAreaFill)"
              isAnimationActive={false}
            />
            {anomalyConfig.enabled && (
              <Line
                yAxisId="rps"
                type="monotone"
                dataKey="rpsAnomalyValue"
                name="Throughput Drop Outlier"
                stroke="none"
                dot={{ r: 5, fill: outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderLatencyLineChart = (heightClass: string) => (
    <div
      className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/40 p-3.5 dark:border-slate-800 dark:bg-slate-950/40"
      data-testid="recharts-latency-line"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Real-Time Latency Percentiles &amp; Moving Avg (Line)
          </h3>
          <p className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            Avg {summary.latestAvgMs.toFixed(1)}ms · p95 {summary.latestP95Ms.toFixed(1)}ms · p99{' '}
            {summary.latestP99Ms.toFixed(1)}ms
          </p>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 bg-indigo-600 dark:bg-indigo-400" aria-hidden="true" />
            Avg
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 bg-orange-600 dark:bg-orange-400" aria-hidden="true" />
            p95
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 bg-rose-600 dark:bg-rose-400" aria-hidden="true" />
            p99
          </span>
          {anomalyConfig.enabled && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
              Outlier
            </span>
          )}
        </div>
      </div>

      <div className={`${heightClass} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={mergedPoints}
            syncId="pummel-telemetry"
            margin={{ top: 8, right: 12, left: 0, bottom: 2 }}
          >
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fill: axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={{ stroke: axisLineStroke }}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => `${v}ms`}
            />
            <Tooltip content={<TelemetryTooltip />} />
            {summary.p95SlaThresholdMs !== null && (
              <ReferenceLine
                y={summary.p95SlaThresholdMs}
                stroke="#DC2626"
                strokeDasharray="4 4"
                label={{
                  value: `p95 SLA ${summary.p95SlaThresholdMs}ms`,
                  position: 'insideTopRight',
                  fill: slaLabelColor,
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            )}
            {anomalyConfig.enabled && (
              <Line
                type="monotone"
                dataKey="p95MovingAvg"
                name="p95 Moving Avg (ms)"
                stroke={maColor}
                strokeWidth={1.25}
                strokeDasharray="2 3"
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="p99Ms"
              name="p99 Latency (ms)"
              stroke={p99Color}
              strokeWidth={1.75}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 3.5, fill: p99Color, stroke: '#FFFFFF', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p95Ms"
              name="p95 Latency (ms)"
              stroke={p95Color}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4, fill: p95Color, stroke: '#FFFFFF', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="avgMs"
              name="Avg Latency (ms)"
              stroke={avgColor}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3.5, fill: avgColor, stroke: '#FFFFFF', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
            {anomalyConfig.enabled && (
              <Line
                type="monotone"
                dataKey="p95AnomalyValue"
                name="p95 Statistical Outlier"
                stroke="none"
                dot={{ r: 5.5, fill: outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
                activeDot={{ r: 6.5, fill: outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderCombinedChart = () => (
    <div
      className="h-72 w-full"
      data-testid="recharts-performance-chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={mergedPoints}
          margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
        >
          <defs>
            <linearGradient id="pummelCombinedRpsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={rpsColor} stopOpacity={isDark ? 0.34 : 0.22} />
              <stop offset="95%" stopColor={rpsColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timeLabel"
            tick={{ fill: axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={{ stroke: axisLineStroke }}
            minTickGap={24}
          />
          <YAxis
            yAxisId="rps"
            orientation="left"
            tick={{ fill: rpsAxisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <YAxis
            yAxisId="latency"
            orientation="right"
            tick={{ fill: p95Color, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(v: number) => `${v}ms`}
          />
          <Tooltip content={<TelemetryTooltip />} />
          {summary.p95SlaThresholdMs !== null && (
            <ReferenceLine
              yAxisId="latency"
              y={summary.p95SlaThresholdMs}
              stroke="#DC2626"
              strokeDasharray="4 4"
              label={{
                value: `SLA ${summary.p95SlaThresholdMs}ms`,
                position: 'insideTopRight',
                fill: slaLabelColor,
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          )}
          <Area
            yAxisId="rps"
            type="monotone"
            dataKey="rps"
            name="Throughput (req/s)"
            stroke={rpsColor}
            strokeWidth={2}
            fill="url(#pummelCombinedRpsFill)"
            isAnimationActive={false}
          />
          {anomalyConfig.enabled && (
            <Line
              yAxisId="latency"
              type="monotone"
              dataKey="p95MovingAvg"
              name="p95 Moving Avg (ms)"
              stroke={maColor}
              strokeWidth={1.25}
              strokeDasharray="2 3"
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            yAxisId="latency"
            type="monotone"
            dataKey="p95Ms"
            name="p95 Latency (ms)"
            stroke={p95Color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: p95Color, stroke: '#FFFFFF', strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="latency"
            type="monotone"
            dataKey="p99Ms"
            name="p99 Latency (ms)"
            stroke={p99Color}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          {anomalyConfig.enabled && (
            <Line
              yAxisId="latency"
              type="monotone"
              dataKey="p95AnomalyValue"
              name="p95 Statistical Outlier"
              stroke="none"
              dot={{ r: 5.5, fill: outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

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
                      <Bell className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
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
                {renderThroughputAreaChart('h-64')}
                {renderLatencyLineChart('h-64')}
              </div>
            )}
            {viewMode === 'throughput' && renderThroughputAreaChart('h-72')}
            {viewMode === 'latency' && renderLatencyLineChart('h-72')}
            {viewMode === 'combined' && renderCombinedChart()}

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
