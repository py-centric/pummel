import React from 'react';
import type { DistributedRunState, PummelConfig } from '../../types/pummel';

export type TuiPane = 'overview' | 'workers' | 'slas' | 'logs';

const SPARK_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function renderAsciiSparkline(values: number[], width: number = 42): string {
  const padded =
    values.length >= width
      ? values.slice(-width)
      : [...Array(width - values.length).fill(0), ...values];
  const maxVal = Math.max(10, ...padded);
  return padded
    .map((v) => {
      if (v <= 0) return '·';
      const idx = Math.min(SPARK_BLOCKS.length - 1, Math.floor((v / maxVal) * SPARK_BLOCKS.length));
      return SPARK_BLOCKS[idx];
    })
    .join('');
}

export function renderProgressBar(pct: number, width: number = 28): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

interface RatatuiPaneContentProps {
  pane: TuiPane;
  config: PummelConfig;
  runState: DistributedRunState;
  rpsSpark: string;
  p95Spark: string;
}

export function RatatuiPaneContent({
  pane,
  config,
  runState,
  rpsSpark,
  p95Spark,
}: RatatuiPaneContentProps) {
  if (pane === 'overview') {
    return (
      <div className="mt-3 grid gap-3 lg:grid-cols-12">
        <div className="border border-slate-700/90 p-3 lg:col-span-7">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>THROUGHPUT SPARKLINE (1s WINDOW)</span>
            <span className="text-cyan-300">
              NOW: {runState.currentRps.toLocaleString()} req/s
            </span>
          </div>
          <div className="mt-2 overflow-x-auto text-base tracking-wider text-cyan-300">
            {rpsSpark}
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400">
            <span>GLOBAL p95 LATENCY SPARKLINE</span>
            <span className={runState.globalP95Ms > 180 ? 'text-amber-300' : 'text-emerald-400'}>
              AVG {runState.globalAvgMs.toFixed(1)}ms · p95 {runState.globalP95Ms.toFixed(1)}ms ·
              p99 {runState.globalP99Ms.toFixed(1)}ms
            </span>
          </div>
          <div className="mt-2 overflow-x-auto text-base tracking-wider text-amber-300">
            {p95Spark}
          </div>
        </div>

        <div className="border border-slate-700/90 p-3 lg:col-span-5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>ACTIVE SLAS (1s EVALUATOR)</span>
            <span>
              {runState.slaResults.filter((s) => s.breached).length}/{runState.slaResults.length}{' '}
              BREACHED
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {runState.slaResults.map((res) => (
              <div
                key={res.criterion.id}
                className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-slate-100">
                    {res.criterion.metric}
                    {res.criterion.subject ? ` (${res.criterion.subject})` : ''}
                  </div>
                  <div
                    className="truncate text-[11px] text-slate-400"
                    title={`limit ${res.criterion.comparator} ${res.criterion.threshold}${res.criterion.unit} · action=${res.criterion.action}`}
                  >
                    limit {res.criterion.comparator} {res.criterion.threshold}
                    {res.criterion.unit} · action={res.criterion.action}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={res.breached ? 'font-semibold text-red-400' : 'text-emerald-400'}>
                    {res.currentValue}
                    {res.criterion.unit}
                  </div>
                  <div className={`text-[10px] ${res.breached ? 'text-red-400' : 'text-slate-500'}`}>
                    {res.breached ? 'BREACH' : 'PASS'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (pane === 'workers') {
    return (
      <div className="mt-3 overflow-x-auto border border-slate-700/90 p-3">
        <div className="mb-2 text-[11px] text-slate-400">
          GRPC COORDINATOR ({config.distributed.coordinatorBind}) · SHARDING:{' '}
          {config.distributed.shardStrategy.toUpperCase()}
        </div>
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="border-b border-slate-700 text-[11px] text-slate-400">
            <tr>
              <th className="py-1.5 pr-3">WORKER</th>
              <th className="py-1.5 pr-3">ENDPOINT</th>
              <th className="py-1.5 pr-3 text-right">SHARD</th>
              <th className="py-1.5 pr-3 text-right">RPS</th>
              <th className="py-1.5 pr-3 text-right">LAT</th>
              <th className="py-1.5 pr-3 text-right">CPU</th>
              <th className="py-1.5 text-right">STATE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {runState.workers.map((w) => (
              <tr key={w.id}>
                <td className="py-1.5 pr-3 text-slate-100">{w.id}</td>
                <td className="py-1.5 pr-3 text-slate-400">{w.grpcEndpoint}</td>
                <td className="py-1.5 pr-3 text-right text-cyan-300">
                  {w.activeVUs}/{w.assignedVUs}
                </td>
                <td className="py-1.5 pr-3 text-right">{w.currentRps.toLocaleString()}</td>
                <td className="py-1.5 pr-3 text-right">{w.avgLatencyMs.toFixed(1)}ms</td>
                <td className="py-1.5 pr-3 text-right">{w.cpuUsagePct}%</td>
                <td
                  className={`py-1.5 text-right ${
                    w.status === 'offline'
                      ? 'text-red-400'
                      : w.status === 'degraded'
                        ? 'text-amber-300'
                        : 'text-emerald-400'
                  }`}
                >
                  {w.status.toUpperCase()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (pane === 'slas') {
    return (
      <div className="mt-3 overflow-x-auto border border-slate-700/90 p-3">
        <div className="mb-2 text-[11px] text-slate-400">
          REAL-TIME SLA EVALUATOR · 1-SECOND LOCK-MINIMIZED READ LOOP
        </div>
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="border-b border-slate-700 text-[11px] text-slate-400">
            <tr>
              <th className="py-1.5 pr-3">METRIC</th>
              <th className="py-1.5 pr-3">SUBJECT</th>
              <th className="py-1.5 pr-3 text-right">OBSERVED</th>
              <th className="py-1.5 pr-3 text-right">LIMIT</th>
              <th className="py-1.5 pr-3">ACTION</th>
              <th className="py-1.5 text-right">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {runState.slaResults.map((res) => (
              <tr key={res.criterion.id}>
                <td className="py-1.5 pr-3 text-slate-100">{res.criterion.metric}</td>
                <td className="py-1.5 pr-3 text-slate-400">{res.criterion.subject ?? 'global'}</td>
                <td className="py-1.5 pr-3 text-right text-cyan-300">
                  {res.currentValue}
                  {res.criterion.unit}
                </td>
                <td className="py-1.5 pr-3 text-right">
                  {res.criterion.comparator} {res.criterion.threshold}
                  {res.criterion.unit}
                </td>
                <td className="py-1.5 pr-3 text-slate-300">{res.criterion.action}</td>
                <td
                  className={`py-1.5 text-right font-semibold ${
                    res.breached ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {res.breached ? `BREACH (${res.breachCount}x)` : 'NOMINAL'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="mt-3 max-h-56 overflow-y-auto border border-slate-700/90 p-3">
      <div className="mb-2 text-[11px] text-slate-400">
        COORDINATOR, CHAOS HOOKS &amp; SLA EVENT STREAM
      </div>
      <div className="space-y-1">
        {runState.logs.slice(0, 14).map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <span className="shrink-0 text-slate-500">
              T+{String(entry.timestampSec).padStart(3, '0')}s
            </span>
            <span
              className={`w-12 shrink-0 ${
                entry.level === 'SLA'
                  ? 'text-red-400'
                  : entry.level === 'CHAOS'
                    ? 'text-amber-300'
                    : entry.level === 'WARN'
                      ? 'text-amber-400'
                      : 'text-cyan-300'
              }`}
            >
              [{entry.level}]
            </span>
            <span className="shrink-0 text-slate-400">{entry.source}:</span>
            <span className="text-slate-200">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
