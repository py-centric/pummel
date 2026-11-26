import React from 'react';
import type { DistributedRunState, PummelConfig } from '../../types/pummel';

interface ClusterKpiStripProps {
  runState: DistributedRunState;
  quorumWorkers: PummelConfig['distributed']['quorumWorkers'];
  onlineWorkers: number;
  breachedSlas: number;
}

export function ClusterKpiStrip({
  runState,
  quorumWorkers,
  onlineWorkers,
  breachedSlas,
}: ClusterKpiStripProps) {
  return (
    <section
      aria-label="Live cluster metrics summary"
      className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-800 dark:bg-slate-800"
    >
      <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Active Virtual Users
        </div>
        <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">
          {runState.activeVUs.toLocaleString()}
          <span className="ml-1.5 text-sm font-normal text-slate-400 dark:text-slate-500">
            / {runState.targetConcurrency.toLocaleString()}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {onlineWorkers} online · quorum {quorumWorkers}
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Aggregate Throughput
        </div>
        <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">
          {runState.currentRps.toLocaleString()}
          <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">
            req/s
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {runState.totalRequests.toLocaleString()} total requests
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Global p95 Latency
        </div>
        <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-orange-700 dark:text-orange-400">
          {runState.globalP95Ms.toFixed(1)}
          <span className="ml-0.5 text-sm font-normal text-slate-500 dark:text-slate-400">ms</span>
        </div>
        <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
          avg {runState.globalAvgMs.toFixed(1)}ms · p90 {runState.globalP90Ms.toFixed(1)}ms
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Global p99 Latency
        </div>
        <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
          {runState.globalP99Ms.toFixed(1)}
          <span className="ml-0.5 text-sm font-normal text-slate-500 dark:text-slate-400">ms</span>
        </div>
        <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
          tail spread +{Math.max(0, runState.globalP99Ms - runState.globalP95Ms).toFixed(1)}ms vs
          p95
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Error Rate &amp; SLA Guard
        </div>
        <div
          className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
            breachedSlas > 0 || runState.status === 'aborted_sla'
              ? 'text-red-600 dark:text-red-400'
              : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {runState.globalFailRatePct.toFixed(2)}%
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {breachedSlas > 0
            ? `${breachedSlas} SLA rule${breachedSlas === 1 ? '' : 's'} breached`
            : `${runState.slaResults.length} SLA rules nominal`}
        </div>
      </div>
    </section>
  );
}
