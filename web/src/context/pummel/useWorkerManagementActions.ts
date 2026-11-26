import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type {
  DistributedConfig,
  DistributedRunState,
  PummelConfig,
  ValidationDiagnostic,
  WorkerNode,
} from '../../types/pummel';
import { runDryRunValidation, serializeConfig } from '../../engine/configEngine';
import { distributeVUs } from '../../engine/distributedSim';
import { prependLog, WORKER_REGIONS } from './types';

interface UseWorkerManagementActionsParams {
  shardStrategy: DistributedConfig['shardStrategy'];
  setConfig: Dispatch<SetStateAction<PummelConfig>>;
  setRunState: Dispatch<SetStateAction<DistributedRunState>>;
  setDiagnostics: Dispatch<SetStateAction<ValidationDiagnostic[]>>;
}

export function useWorkerManagementActions({
  shardStrategy,
  setConfig,
  setRunState,
  setDiagnostics,
}: UseWorkerManagementActionsParams) {
  const addWorker = useCallback(
    (region?: string) => {
      setRunState((prev) => {
        const nextNum = prev.workers.length + 1;
        const chosenRegion =
          region ?? WORKER_REGIONS[prev.workers.length % WORKER_REGIONS.length];
        const newWorker: WorkerNode = {
          id: `worker-${chosenRegion}-${String(nextNum).padStart(2, '0')}`,
          hostname: `pummel-wrk-${String(nextNum).padStart(2, '0')}.internal`,
          region: chosenRegion,
          grpcEndpoint: `10.42.${(nextNum % 4) + 1}.${10 + nextNum}:50052`,
          cpuCores: nextNum % 2 === 0 ? 16 : 8,
          capacityWeight: nextNum % 2 === 0 ? 2 : 1,
          assignedVUs: 0,
          activeVUs: 0,
          currentRps: 0,
          avgLatencyMs: 0,
          errorRatePct: 0,
          cpuUsagePct: 5,
          memoryMb: 104,
          lastHeartbeatMs: 21,
          status: prev.status === 'running' ? 'running' : 'ready',
        };
        const updatedWorkers = distributeVUs(
          prev.targetConcurrency,
          [...prev.workers, newWorker],
          shardStrategy
        );
        return {
          ...prev,
          workers: updatedWorkers,
          logs: prependLog(prev.logs, {
            id: `log-add-${newWorker.id}-${Date.now()}`,
            timestampSec: prev.elapsedSec,
            level: 'GRPC',
            source: 'coordinator',
            message: `Registered ${newWorker.id} (${newWorker.grpcEndpoint}) and rebalanced VU shards.`,
          }),
        };
      });
    },
    [shardStrategy, setRunState]
  );

  const cycleWorkerStatus = useCallback(
    (workerId: string) => {
      setRunState((prev) => {
        const mapped = prev.workers.map((w) => {
          if (w.id !== workerId) return w;
          const nextStatus: WorkerNode['status'] =
            w.status === 'offline'
              ? prev.status === 'running'
                ? 'running'
                : 'ready'
              : w.status === 'degraded'
                ? 'offline'
                : 'degraded';
          return { ...w, status: nextStatus };
        });
        const rebalanced = distributeVUs(prev.targetConcurrency, mapped, shardStrategy);
        const changed = rebalanced.find((w) => w.id === workerId);
        return {
          ...prev,
          workers: rebalanced,
          logs: prependLog(prev.logs, {
            id: `log-wrk-status-${workerId}-${Date.now()}`,
            timestampSec: prev.elapsedSec,
            level: changed?.status === 'offline' ? 'WARN' : 'GRPC',
            source: workerId,
            message: `Node state set to "${changed?.status ?? 'ready'}"; VU shard rebalanced to ${changed?.assignedVUs ?? 0} VUs.`,
          }),
        };
      });
    },
    [shardStrategy, setRunState]
  );

  const removeWorker = useCallback(
    (workerId: string) => {
      setRunState((prev) => {
        if (prev.workers.length <= 1) return prev;
        const filtered = prev.workers.filter((w) => w.id !== workerId);
        const rebalanced = distributeVUs(prev.targetConcurrency, filtered, shardStrategy);
        return {
          ...prev,
          workers: rebalanced,
          logs: prependLog(prev.logs, {
            id: `log-rm-${workerId}-${Date.now()}`,
            timestampSec: prev.elapsedSec,
            level: 'GRPC',
            source: 'coordinator',
            message: `Drained and detached worker ${workerId}; remaining nodes rebalanced.`,
          }),
        };
      });
    },
    [shardStrategy, setRunState]
  );

  const updateDistributedConfig = useCallback(
    (patch: Partial<DistributedConfig>) => {
      setConfig((prev) => {
        const next: PummelConfig = {
          ...prev,
          distributed: {
            ...prev.distributed,
            ...patch,
          },
        };
        setRunState((cur) => ({
          ...cur,
          workers: distributeVUs(cur.targetConcurrency, cur.workers, next.distributed.shardStrategy),
        }));
        setDiagnostics(runDryRunValidation(next, serializeConfig(next, 'yaml')));
        return next;
      });
    },
    [setConfig, setRunState, setDiagnostics]
  );

  return {
    addWorker,
    cycleWorkerStatus,
    removeWorker,
    updateDistributedConfig,
  };
}
