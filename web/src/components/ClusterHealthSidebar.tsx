import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  HardDrive,
  HeartPulse,
  Network,
  RefreshCw,
} from 'lucide-react';
import type { WorkerNode } from '../types/pummel';
import {
  computeClusterHealthSummary,
  type NodeHealthSeverity,
} from '../engine/clusterHealth';

interface ClusterHealthSidebarProps {
  workers: readonly WorkerNode[];
  chaosFaultActive: boolean;
  isRunning: boolean;
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
  onCycleWorkerStatus: (workerId: string) => void;
}

function getBarColorClass(pct: number): string {
  if (pct >= 80) return 'bg-red-600 dark:bg-red-500';
  if (pct >= 60) return 'bg-amber-500 dark:bg-amber-400';
  return 'bg-emerald-600 dark:bg-emerald-500';
}

function getSeverityMeta(severity: NodeHealthSeverity): {
  label: string;
  badgeClass: string;
} {
  switch (severity) {
    case 'bottleneck':
      return {
        label: 'Bottleneck',
        badgeClass:
          'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300',
      };
    case 'elevated':
      return {
        label: 'Elevated',
        badgeClass:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300',
      };
    case 'offline':
      return {
        label: 'Offline',
        badgeClass:
          'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
      };
    default:
      return {
        label: 'Healthy',
        badgeClass:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
      };
  }
}

export function ClusterHealthSidebar({
  workers,
  chaosFaultActive,
  isRunning,
  selectedWorkerId,
  onSelectWorker,
  onCycleWorkerStatus,
}: ClusterHealthSidebarProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'alerts'>('all');

  const summary = useMemo(
    () => computeClusterHealthSummary(workers, chaosFaultActive),
    [workers, chaosFaultActive]
  );

  const visibleNodes = useMemo(() => {
    if (filterMode === 'all') return summary.nodes;
    return summary.nodes.filter((n) => n.severity !== 'healthy');
  }, [summary.nodes, filterMode]);

  const alertCount = summary.bottleneckCount + summary.elevatedCount + summary.offlineCount;

  return (
    <aside
      aria-label="Cluster Health Sidebar"
      data-testid="cluster-health-sidebar"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HeartPulse
              className={`h-4 w-4 ${
                summary.bottleneckCount > 0 || summary.offlineCount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
              aria-hidden="true"
            />
            <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Cluster Health
            </h2>
          </div>

          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-slate-600'
              }`}
              aria-hidden="true"
            />
            {summary.onlineNodes}/{summary.totalNodes} online
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Real-time CPU, RAM, and network usage per worker node for bottleneck diagnosis.
        </p>

        {/* Aggregate Resource Summary */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-center font-mono tabular-nums dark:border-slate-800 dark:bg-slate-950/60">
          <div>
            <div className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Avg CPU</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
              {summary.avgCpuPct}%
            </div>
          </div>
          <div className="border-x border-slate-200/80 dark:border-slate-800">
            <div className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Avg RAM</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
              {summary.avgRamPct}%
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Total Net</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
              {summary.totalNetworkMbps.toFixed(0)} Mbps
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div
            className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
            role="tablist"
            aria-label="Filter worker health nodes"
          >
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'all'}
              onClick={() => setFilterMode('all')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                filterMode === 'all'
                  ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-950 dark:text-slate-50'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              All ({summary.totalNodes})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'alerts'}
              onClick={() => setFilterMode('alerts')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                filterMode === 'alerts'
                  ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-950 dark:text-slate-50'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Alerts ({alertCount})
            </button>
          </div>

          {summary.bottleneckCount > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {summary.bottleneckCount} bottleneck{summary.bottleneckCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {/* Per-Worker Node Cards */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
        {visibleNodes.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            All worker nodes are operating within nominal CPU, RAM, and NIC headroom.
          </div>
        ) : (
          visibleNodes.map((node) => {
            const sev = getSeverityMeta(node.severity);
            const isSelected = selectedWorkerId === node.workerId;

            return (
              <div
                key={node.workerId}
                data-testid={`cluster-health-node-${node.workerId}`}
                className={`p-4 transition-colors ${
                  isSelected
                    ? 'bg-orange-50/60 dark:bg-orange-950/25'
                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectWorker(node.workerId)}
                    className="min-w-0 text-left group"
                  >
                    <div className="truncate font-mono text-xs font-semibold text-slate-950 group-hover:text-orange-700 dark:text-slate-100 dark:group-hover:text-orange-400">
                      {node.workerId}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {node.region} · {node.cpuCores}c · hb {node.lastHeartbeatMs}ms
                    </div>
                  </button>

                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${sev.badgeClass}`}
                  >
                    {node.bottleneckResource && node.severity === 'bottleneck'
                      ? `${node.bottleneckResource} HOT`
                      : sev.label}
                  </span>
                </div>

                {/* Resource Bars: CPU, RAM, Network */}
                <div className="mt-3 space-y-2.5 font-mono text-[11px] tabular-nums">
                  {/* CPU */}
                  <div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <Cpu className="h-3 w-3 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        CPU
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {node.cpuPct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getBarColorClass(node.cpuPct)}`}
                        style={{ width: `${node.cpuPct}%` }}
                      />
                    </div>
                  </div>

                  {/* RAM */}
                  <div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <HardDrive className="h-3 w-3 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        RAM
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {node.ramUsedMb}/{node.ramTotalMb} MB ({node.ramPct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getBarColorClass(node.ramPct)}`}
                        style={{ width: `${node.ramPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Network */}
                  <div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <Network className="h-3 w-3 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        NET
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {node.networkMbps.toFixed(1)} Mbps ({node.networkPct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getBarColorClass(node.networkPct)}`}
                        style={{ width: `${node.networkPct}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span>TX {node.txMbps.toFixed(1)} Mbps</span>
                      <span>RX {node.rxMbps.toFixed(1)} Mbps</span>
                    </div>
                  </div>
                </div>

                {/* Node Diagnosis & Quick State Action */}
                <div className="mt-2.5 flex items-start justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800/80">
                  <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                    {node.diagnosis}
                  </p>
                  <button
                    type="button"
                    onClick={() => onCycleWorkerStatus(node.workerId)}
                    aria-label={`Cycle health state for ${node.workerId}`}
                    className="inline-flex h-6 shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />
                    {node.status === 'offline' ? 'Restore' : 'Fault'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
