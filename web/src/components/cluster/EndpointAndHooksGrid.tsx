import React from 'react';
import { MAX_TIMINGS } from '../../engine/distributedSim';
import type { DistributedRunState, EndpointMetrics } from '../../types/pummel';

interface EndpointAndHooksGridProps {
  endpoints: EndpointMetrics[];
  hookExecutions: DistributedRunState['hookExecutions'];
}

export function EndpointAndHooksGrid({ endpoints, hookExecutions }: EndpointAndHooksGridProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section
        aria-label="Per-Endpoint Protocol Telemetry"
        className="min-w-0 rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Endpoint Telemetry Summary
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Multi-protocol breakdown capped at {MAX_TIMINGS.toLocaleString()} samples per
              endpoint.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-5 py-2.5">Endpoint</th>
                <th className="px-3 py-2.5">Protocol</th>
                <th className="px-3 py-2.5 text-right">Requests</th>
                <th className="px-3 py-2.5 text-right">p95</th>
                <th className="px-3 py-2.5 text-right">p99</th>
                <th className="px-5 py-2.5 text-right">Buffer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {endpoints.map((ep) => (
                <tr key={ep.label} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {ep.label}
                  </td>
                  <td className="px-3 py-3 font-mono uppercase text-slate-600 dark:text-slate-400">
                    {ep.protocol}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {ep.totalRequests.toLocaleString()}
                    {ep.failedRequests > 0 && (
                      <span className="ml-1 text-red-600 dark:text-red-400">
                        ({ep.failedRequests} err)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {ep.p95Ms.toFixed(1)} ms
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {ep.p99Ms.toFixed(1)} ms
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {ep.timingsMs.length.toLocaleString()} / {MAX_TIMINGS.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-label="Chaos Lifecycle Hooks"
        className="min-w-0 rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
            Chaos Lifecycle Hooks
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Ordered prepare → startup → test → shutdown execution with guaranteed teardown.
          </p>
        </div>
        <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800/80">
          {hookExecutions.map((hook) => (
            <div key={`${hook.phase}-${hook.name}`} className="py-3.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {hook.phase.toUpperCase()} · {hook.name}
                </span>
                <span
                  className={`font-mono font-medium ${
                    hook.status === 'completed'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : hook.status === 'failed'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {hook.status === 'completed'
                    ? `Completed (T+${hook.timestampSec}s)`
                    : hook.status === 'failed'
                      ? 'Failed'
                      : 'Pending'}
                </span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-500 break-all dark:text-slate-400">
                $ {hook.command}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
