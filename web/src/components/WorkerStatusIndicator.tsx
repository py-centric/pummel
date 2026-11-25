import React, { useMemo } from 'react';
import type { WorkerNode } from '../types/pummel';
import { summarizeWorkerFleetHealth } from '../engine/workerHealth';

interface WorkerStatusIndicatorProps {
  workers: readonly WorkerNode[];
  quorumWorkers: number;
  coordinatorBind: string;
  onToggleWorker: (workerId: string) => void;
}

export function WorkerStatusIndicator({
  workers,
  quorumWorkers,
  coordinatorBind,
  onToggleWorker,
}: WorkerStatusIndicatorProps) {
  const health = useMemo(
    () => summarizeWorkerFleetHealth(workers, quorumWorkers),
    [workers, quorumWorkers]
  );

  const fleetBadgeStyles =
    health.overallState === 'healthy'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-200'
      : health.overallState === 'degraded'
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-200'
        : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800/80 dark:bg-red-950/60 dark:text-red-200';

  const fleetDotPing =
    health.overallState === 'healthy'
      ? 'bg-emerald-400'
      : health.overallState === 'degraded'
        ? 'bg-amber-400'
        : 'bg-red-400';

  const fleetDotCore =
    health.overallState === 'healthy'
      ? 'bg-emerald-600 dark:bg-emerald-400'
      : health.overallState === 'degraded'
        ? 'bg-amber-600 dark:bg-amber-400'
        : 'bg-red-600 dark:bg-red-400';

  return (
    <section
      aria-label="gRPC Worker Node Connectivity Status"
      className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 sm:px-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            data-testid="grpc-fleet-status-badge"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${fleetBadgeStyles}`}
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
              {health.overallState !== 'quorum-lost' && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none ${fleetDotPing}`}
                />
              )}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${fleetDotCore}`} />
            </span>
            <span className="whitespace-nowrap">{health.overallLabel}</span>
          </div>

          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            Coordinator {coordinatorBind} · Quorum {health.quorumWorkers}
          </span>
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400">
          Click any worker badge to simulate online / degraded / offline state
        </span>
      </div>

      {/* Individual gRPC Worker Pulsing Status Badges */}
      <div
        className="mt-3 flex flex-wrap items-center gap-2"
        role="list"
        aria-label="Connected gRPC workers"
      >
        {health.nodes.map((node) => {
          const isOffline = !node.isOnline;
          const isDegraded = node.stateLabel === 'Degraded';

          const badgeClass = isOffline
            ? 'border-red-200 bg-red-50/80 text-red-900 hover:bg-red-100/80 dark:border-red-900/80 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-950/80'
            : isDegraded
              ? 'border-amber-200 bg-amber-50/80 text-amber-900 hover:bg-amber-100/80 dark:border-amber-900/80 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950/80'
              : 'border-emerald-200 bg-emerald-50/70 text-emerald-950 hover:bg-emerald-100/80 dark:border-emerald-900/80 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950/80';

          const pingColor = isDegraded ? 'bg-amber-400' : 'bg-emerald-400';
          const coreColor = isOffline
            ? 'bg-red-600 dark:bg-red-400'
            : isDegraded
              ? 'bg-amber-500 dark:bg-amber-400'
              : 'bg-emerald-600 dark:bg-emerald-400';

          return (
            <button
              key={node.id}
              type="button"
              role="listitem"
              onClick={() => onToggleWorker(node.id)}
              aria-label={`${node.id} is ${node.stateLabel} (${node.heartbeatLabel}). Click to toggle status.`}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${badgeClass}`}
            >
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                {node.shouldPulse && (
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none ${pingColor}`}
                  />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${coreColor}`} />
              </span>
              <span className="font-mono font-semibold whitespace-nowrap">{node.id}</span>
              <span aria-hidden="true" className="opacity-40">
                ·
              </span>
              <span className="font-medium whitespace-nowrap">{node.stateLabel}</span>
              <span className="hidden font-mono text-[11px] tabular-nums opacity-75 sm:inline whitespace-nowrap">
                ({node.heartbeatLabel})
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
