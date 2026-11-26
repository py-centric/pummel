import React from 'react';
import type { ChartTelemetryDatum } from '../../engine/telemetryChart';

export type MergedChartDatum = ChartTelemetryDatum & {
  p95MovingAvg: number | null;
  rpsMovingAvg: number | null;
  p95AnomalyValue: number | null;
  rpsAnomalyValue: number | null;
  anomalyReason?: string;
};

export interface TelemetryChartColors {
  isDark: boolean;
  gridStroke: string;
  axisTickColor: string;
  axisLineStroke: string;
  rpsColor: string;
  rpsAxisColor: string;
  vuColor: string;
  avgColor: string;
  p95Color: string;
  p99Color: string;
  maColor: string;
  outlierColor: string;
  slaLabelColor: string;
}

export function getTelemetryChartColors(isDark: boolean): TelemetryChartColors {
  return {
    isDark,
    gridStroke: isDark ? '#1E293B' : '#E2E8F0',
    axisTickColor: isDark ? '#94A3B8' : '#64748B',
    axisLineStroke: isDark ? '#334155' : '#CBD5E1',
    rpsColor: isDark ? '#38BDF8' : '#0284C7',
    rpsAxisColor: isDark ? '#38BDF8' : '#0369A1',
    vuColor: isDark ? '#34D399' : '#059669',
    avgColor: isDark ? '#818CF8' : '#4F46E5',
    p95Color: isDark ? '#FB923C' : '#EA580C',
    p99Color: isDark ? '#FB7185' : '#E11D48',
    maColor: isDark ? '#94A3B8' : '#64748B',
    outlierColor: '#DC2626',
    slaLabelColor: isDark ? '#F87171' : '#B91C1C',
  };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: MergedChartDatum }>;
  label?: string;
}

export function TelemetryTooltip({ active, payload, label }: CustomTooltipProps) {
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
