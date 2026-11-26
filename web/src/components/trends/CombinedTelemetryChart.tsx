import React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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

interface CombinedTelemetryChartProps {
  mergedPoints: MergedChartDatum[];
  summary: TelemetryChartSummary;
  colors: TelemetryChartColors;
  anomalyEnabled: boolean;
}

export function CombinedTelemetryChart({
  mergedPoints,
  summary,
  colors,
  anomalyEnabled,
}: CombinedTelemetryChartProps) {
  return (
    <div className="h-72 w-full" data-testid="recharts-performance-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={mergedPoints} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="pummelCombinedRpsFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={colors.rpsColor}
                stopOpacity={colors.isDark ? 0.34 : 0.22}
              />
              <stop offset="95%" stopColor={colors.rpsColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={colors.gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timeLabel"
            tick={{
              fill: colors.axisTickColor,
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
            }}
            tickLine={false}
            axisLine={{ stroke: colors.axisLineStroke }}
            minTickGap={24}
          />
          <YAxis
            yAxisId="rps"
            orientation="left"
            tick={{
              fill: colors.rpsAxisColor,
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
            }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <YAxis
            yAxisId="latency"
            orientation="right"
            tick={{
              fill: colors.p95Color,
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
            }}
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
                fill: colors.slaLabelColor,
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
            stroke={colors.rpsColor}
            strokeWidth={2}
            fill="url(#pummelCombinedRpsFill)"
            isAnimationActive={false}
          />
          {anomalyEnabled && (
            <Line
              yAxisId="latency"
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
            yAxisId="latency"
            type="monotone"
            dataKey="p95Ms"
            name="p95 Latency (ms)"
            stroke={colors.p95Color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: colors.p95Color, stroke: '#FFFFFF', strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="latency"
            type="monotone"
            dataKey="p99Ms"
            name="p99 Latency (ms)"
            stroke={colors.p99Color}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          {anomalyEnabled && (
            <Line
              yAxisId="latency"
              type="monotone"
              dataKey="p95AnomalyValue"
              name="p95 Statistical Outlier"
              stroke="none"
              dot={{ r: 5.5, fill: colors.outlierColor, stroke: '#FFFFFF', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
