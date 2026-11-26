import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TelemetryChartSummary } from '../../engine/telemetryChart';
import {
  TelemetryTooltip,
  type MergedChartDatum,
  type TelemetryChartColors,
} from './TelemetryTooltip';

interface ThroughputAreaChartProps {
  mergedPoints: MergedChartDatum[];
  summary: TelemetryChartSummary;
  colors: TelemetryChartColors;
  anomalyEnabled: boolean;
  heightClass: string;
}

export function ThroughputAreaChart({
  mergedPoints,
  summary,
  colors,
  anomalyEnabled,
  heightClass,
}: ThroughputAreaChartProps) {
  return (
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
            Now {summary.latestRps.toLocaleString()} req/s · Peak {summary.peakRps.toLocaleString()}{' '}
            req/s
          </p>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2.5 rounded-xs bg-sky-600 dark:bg-sky-400"
              aria-hidden="true"
            />
            req/s
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-400"
              aria-hidden="true"
            />
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
                <stop offset="5%" stopColor={colors.rpsColor} stopOpacity={colors.isDark ? 0.36 : 0.24} />
                <stop offset="95%" stopColor={colors.rpsColor} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="pummelVuAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.vuColor} stopOpacity={colors.isDark ? 0.24 : 0.16} />
                <stop offset="95%" stopColor={colors.vuColor} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fill: colors.axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={{ stroke: colors.axisLineStroke }}
              minTickGap={24}
            />
            <YAxis
              yAxisId="rps"
              orientation="left"
              tick={{ fill: colors.rpsAxisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <YAxis
              yAxisId="vus"
              orientation="right"
              tick={{ fill: colors.vuColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
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
              stroke={colors.rpsColor}
              strokeWidth={2}
              fill="url(#pummelThroughputAreaFill)"
              isAnimationActive={false}
            />
            <Area
              yAxisId="vus"
              type="monotone"
              dataKey="activeVUs"
              name="Active VUs"
              stroke={colors.vuColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="url(#pummelVuAreaFill)"
              isAnimationActive={false}
            />
            {anomalyEnabled && (
              <Line
                yAxisId="rps"
                type="monotone"
                dataKey="rpsAnomalyValue"
                name="Throughput Drop Outlier"
                stroke="none"
                dot={{ r: 5, fill: colors.outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: colors.outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface LatencyLineChartProps {
  mergedPoints: MergedChartDatum[];
  summary: TelemetryChartSummary;
  colors: TelemetryChartColors;
  anomalyEnabled: boolean;
  heightClass: string;
}

export function LatencyLineChart({
  mergedPoints,
  summary,
  colors,
  anomalyEnabled,
  heightClass,
}: LatencyLineChartProps) {
  return (
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
          {anomalyEnabled && (
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
            <CartesianGrid stroke={colors.gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fill: colors.axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={{ stroke: colors.axisLineStroke }}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: colors.axisTickColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
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
                  fill: colors.slaLabelColor,
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            )}
            {anomalyEnabled && (
              <Line
                type="monotone"
                dataKey="p95MovingAvg"
                name="p95 Moving Avg (ms)"
                stroke={colors.maColor}
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
              stroke={colors.p99Color}
              strokeWidth={1.75}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 3.5, fill: colors.p99Color, stroke: '#FFFFFF', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p95Ms"
              name="p95 Latency (ms)"
              stroke={colors.p95Color}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4, fill: colors.p95Color, stroke: '#FFFFFF', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="avgMs"
              name="Avg Latency (ms)"
              stroke={colors.avgColor}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3.5, fill: colors.avgColor, stroke: '#FFFFFF', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
            {anomalyEnabled && (
              <Line
                type="monotone"
                dataKey="p95AnomalyValue"
                name="p95 Statistical Outlier"
                stroke="none"
                dot={{ r: 5.5, fill: colors.outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
                activeDot={{ r: 6.5, fill: colors.outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export { CombinedTelemetryChart } from './CombinedTelemetryChart';

