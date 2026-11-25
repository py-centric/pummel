import React, { useMemo } from 'react';
import { CheckCircle2, Globe2, Server, ShieldAlert } from 'lucide-react';
import type { RunStatus, WorkerNode } from '../types/pummel';
import { TEST_CLUSTER_PROFILES } from '../engine/testClusters';
import { buildGlobalClusterHealth } from '../engine/globalHealth';

interface GlobalHealthViewProps {
  activeClusterId: string;
  activeWorkers: readonly WorkerNode[];
  activeRunStatus: RunStatus;
  activeRps: number;
  chaosFaultActive: boolean;
  onSelectCluster: (clusterId: string) => void;
}

export function GlobalHealthView({
  activeClusterId,
  activeWorkers,
  activeRunStatus,
  activeRps,
  chaosFaultActive,
  onSelectCluster,
}: GlobalHealthViewProps) {
  const globalHealth = useMemo(
    () =>
      buildGlobalClusterHealth({
        profiles: TEST_CLUSTER_PROFILES,
        activeClusterId,
        activeWorkers,
        activeRunStatus,
        activeRps,
        chaosFaultActive,
      }),
    [activeClusterId, activeWorkers, activeRunStatus, activeRps, chaosFaultActive]
  );

  return (
    <section
      aria-label="Global Multi-Cluster Infrastructure Health"
      data-testid="global-health-view"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <Globe2 className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Global Health &amp; Multi-Cluster Capacity
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Unified capacity across {globalHealth.totalClusters} load-testing clusters ·{' '}
              {globalHealth.onlineWorkers}/{globalHealth.totalWorkers} workers online ·{' '}
              {globalHealth.totalCpuCores} total vCPUs
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {globalHealth.healthyClusters} Healthy
          </span>
          {globalHealth.degradedClusters > 0 && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {globalHealth.degradedClusters} Degraded
            </span>
          )}
        </div>
      </div>

      {/* Global Capacity Summary Strip */}
      <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800">
        <div className="bg-slate-50/60 px-4 py-3 dark:bg-slate-950/50">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Fleet VU Capacity
          </div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-950 dark:text-slate-50">
            {globalHealth.totalActiveVUs.toLocaleString()} /{' '}
            {globalHealth.totalMaxVuCapacity.toLocaleString()} VUs
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-sky-600 transition-all dark:bg-sky-400"
              style={{ width: `${globalHealth.capacityUtilizationPct}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-50/60 px-4 py-3 dark:bg-slate-950/50">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Global Throughput
          </div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-950 dark:text-slate-50">
            {globalHealth.aggregateRps.toLocaleString()} req/s
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {globalHealth.aggregateNetworkMbps.toFixed(1)} Mbps total NIC
          </div>
        </div>

        <div className="bg-slate-50/60 px-4 py-3 dark:bg-slate-950/50">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Mean Cluster CPU
          </div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-950 dark:text-slate-50">
            {globalHealth.avgClusterCpuPct}%
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            Across {globalHealth.totalCpuCores} vCPUs
          </div>
        </div>

        <div className="bg-slate-50/60 px-4 py-3 dark:bg-slate-950/50">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Mean Cluster RAM
          </div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-950 dark:text-slate-50">
            {globalHealth.avgClusterRamPct}%
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {globalHealth.capacityUtilizationPct}% VU headroom used
          </div>
        </div>
      </div>

      {/* Multi-Cluster Fleet Grid */}
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
        {globalHealth.clusters.map((cluster) => {
          const stateBadge =
            cluster.operationalState === 'degraded' || cluster.operationalState === 'offline'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300'
              : cluster.operationalState === 'active'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';

          return (
            <button
              key={cluster.clusterId}
              type="button"
              onClick={() => onSelectCluster(cluster.clusterId)}
              aria-pressed={cluster.isActiveTarget}
              data-testid={`global-cluster-card-${cluster.clusterId}`}
              className={`flex flex-col rounded-lg border p-3.5 text-left transition-colors ${
                cluster.isActiveTarget
                  ? 'border-orange-500 bg-orange-50/40 dark:border-orange-500/80 dark:bg-orange-950/25'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="truncate text-xs font-semibold text-slate-950 dark:text-slate-100">
                      {cluster.name}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    {cluster.region} · {cluster.tlsMode.toUpperCase()}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${stateBadge}`}
                >
                  {cluster.operationalState}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-y-1.5 font-mono text-[11px] tabular-nums">
                <div>
                  <dt className="text-[10px] text-slate-500 dark:text-slate-400">Workers</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {cluster.onlineWorkers}/{cluster.totalWorkers} ({cluster.totalCpuCores}c)
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-500 dark:text-slate-400">Throughput</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {cluster.currentRps.toLocaleString()} rps
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-500 dark:text-slate-400">CPU / RAM</dt>
                  <dd className="text-slate-700 dark:text-slate-300">
                    {cluster.avgCpuPct}% / {cluster.avgRamPct}%
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-500 dark:text-slate-400">Capacity</dt>
                  <dd className="text-slate-700 dark:text-slate-300">
                    {cluster.maxVuCapacity.toLocaleString()} VUs
                  </dd>
                </div>
              </dl>

              <div className="mt-2.5 border-t border-slate-100 pt-2 font-mono text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {cluster.isActiveTarget ? (
                  <span className="font-semibold text-orange-700 dark:text-orange-400">
                    Active target · {cluster.coordinatorBind}
                  </span>
                ) : (
                  <span>Click to switch target · {cluster.coordinatorBind}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
