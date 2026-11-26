import React from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { PummelConfig, WorkerNode } from '../../types/pummel';

interface WorkerFleetTableProps {
  workers: WorkerNode[];
  distributed: PummelConfig['distributed'];
  focusedWorkerId: string | null;
  onUpdateDistributedConfig: (patch: Partial<PummelConfig['distributed']>) => void;
  onAddWorker: () => void;
  onCycleWorkerStatus: (workerId: string) => void;
  onRemoveWorker: (workerId: string) => void;
}

export function WorkerFleetTable({
  workers,
  distributed,
  focusedWorkerId,
  onUpdateDistributedConfig,
  onAddWorker,
  onCycleWorkerStatus,
  onRemoveWorker,
}: WorkerFleetTableProps) {
  return (
    <section
      aria-label="Distributed gRPC Worker Fleet"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
            gRPC Coordinator &amp; Worker Fleet
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Manage worker nodes, shard allocation strategy, and simulated network partitions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="whitespace-nowrap">Sharding</span>
            <select
              aria-label="VU sharding strategy"
              value={distributed.shardStrategy}
              onChange={(e) =>
                onUpdateDistributedConfig({
                  shardStrategy: e.target.value as 'weighted-capacity' | 'round-robin',
                })
              }
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="weighted-capacity">Weighted Capacity</option>
              <option value="round-robin">Round Robin</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="whitespace-nowrap">Transport</span>
            <select
              aria-label="gRPC transport security mode"
              value={distributed.tlsMode}
              onChange={(e) =>
                onUpdateDistributedConfig({
                  tlsMode: e.target.value as 'mtls' | 'tls' | 'plaintext-local',
                })
              }
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="mtls">mTLS</option>
              <option value="tls">TLS</option>
              <option value="plaintext-local">Local Plaintext</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => onAddWorker()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Worker
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            <tr>
              <th className="px-5 py-3">Worker Node</th>
              <th className="px-4 py-3">Region / gRPC Endpoint</th>
              <th className="px-4 py-3 text-right">Weight</th>
              <th className="px-4 py-3 text-right">Assigned VUs</th>
              <th className="px-4 py-3 text-right">Throughput</th>
              <th className="px-4 py-3 text-right">Avg Latency</th>
              <th className="px-4 py-3 text-right">CPU / Mem</th>
              <th className="px-4 py-3">State</th>
              <th className="px-5 py-3 text-right">Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800/80">
            {workers.map((worker) => {
              const isFocused = focusedWorkerId === worker.id;
              return (
                <tr
                  key={worker.id}
                  id={`worker-row-${worker.id}`}
                  data-focused={isFocused ? 'true' : undefined}
                  className={`transition-colors ${
                    isFocused
                      ? 'bg-orange-50/80 dark:bg-orange-950/35'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="px-5 py-3">
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {worker.id}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">{worker.hostname}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                    <div>{worker.region}</div>
                    <div className="text-slate-400 dark:text-slate-50">{worker.grpcEndpoint}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {worker.capacityWeight}x · {worker.cpuCores}c
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                    {worker.activeVUs} / {worker.assignedVUs}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {worker.currentRps.toLocaleString()} rps
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {worker.avgLatencyMs.toFixed(1)} ms
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {worker.cpuUsagePct}% · {worker.memoryMb} MB
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-semibold ${
                        worker.status === 'offline'
                          ? 'text-red-700 dark:text-red-400'
                          : worker.status === 'degraded'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {worker.status === 'running'
                        ? 'Running'
                        : worker.status === 'ready'
                          ? 'Ready'
                          : worker.status === 'degraded'
                            ? 'Degraded'
                            : 'Offline'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onCycleWorkerStatus(worker.id)}
                        aria-label={`Cycle fault state for ${worker.id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden="true" />
                        {worker.status === 'offline'
                          ? 'Restore'
                          : worker.status === 'degraded'
                            ? 'Take Offline'
                            : 'Degrade'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveWorker(worker.id)}
                        disabled={workers.length <= 1}
                        aria-label={`Remove worker ${worker.id}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
