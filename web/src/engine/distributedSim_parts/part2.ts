import type {
  ChaosHookExecution,
  DistributedRunState,
  EndpointMetrics,
  PummelConfig,
  RunLogEntry,
  SlaCriterion,
  SlaEvaluationResult,
  WorkerNode,
} from '../../types/pummel';
import { createDefaultWorkers, distributeVUs } from './part1';


export function createInitialClusterState(
  config: PummelConfig,
  customWorkers?: WorkerNode[]
): DistributedRunState {
  const plan = config.execution[0] ?? {
    scenario: Object.keys(config.scenarios)[0] ?? 'checkout',
    concurrency: 500,
    rampUpSec: 15,
    holdForSec: 45,
  };

  const totalConcurrency = config.execution.reduce((acc, e) => acc + e.concurrency, 0) || 500;
  const totalDurationSec = Math.max(10, plan.rampUpSec + plan.holdForSec);
  const rawWorkers = customWorkers ? customWorkers.map((w) => ({ ...w })) : createDefaultWorkers();
  const shardedWorkers = distributeVUs(
    totalConcurrency,
    rawWorkers.map((w) => ({
      ...w,
      activeVUs: 0,
      currentRps: 0,
      avgLatencyMs: 0,
      errorRatePct: 0,
      status: w.status === 'offline' ? 'offline' : 'ready',
    })),
    config.distributed.shardStrategy
  );

  const endpoints: EndpointMetrics[] = [];
  const seenLabels = new Set<string>();
  for (const scenario of Object.values(config.scenarios)) {
    for (const req of [...scenario.onStart, ...scenario.requests]) {
      if (!seenLabels.has(req.label)) {
        seenLabels.add(req.label);
        endpoints.push({
          label: req.label,
          protocol: req.protocol,
          totalRequests: 0,
          failedRequests: 0,
          timingsMs: [],
          avgMs: 0,
          p50Ms: 0,
          p90Ms: 0,
          p95Ms: 0,
          p99Ms: 0,
          currentRps: 0,
        });
      }
    }
  }

  if (endpoints.length === 0) {
    endpoints.push({
      label: 'GET /health',
      protocol: 'http',
      totalRequests: 0,
      failedRequests: 0,
      timingsMs: [],
      avgMs: 0,
      p50Ms: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      currentRps: 0,
    });
  }

  const hookExecutions: ChaosHookExecution[] = config.services.map((h) => ({
    phase: h.phase,
    name: h.name,
    command: h.command,
    status: 'pending',
    timestampSec: 0,
  }));

  const slaResults: SlaEvaluationResult[] = config.sla.map((criterion) => ({
    criterion,
    currentValue: 0,
    breached: false,
    breachCount: 0,
  }));

  return {
    status: 'idle',
    phase: 'idle',
    elapsedSec: 0,
    totalDurationSec,
    targetConcurrency: totalConcurrency,
    activeVUs: 0,
    totalRequests: 0,
    totalFailures: 0,
    currentRps: 0,
    globalAvgMs: 0,
    globalP90Ms: 0,
    globalP95Ms: 0,
    globalP99Ms: 0,
    globalFailRatePct: 0,
    chaosFaultActive: false,
    workers: shardedWorkers,
    endpoints,
    slaResults,
    execHooksTriggered: [],
    hookExecutions,
    history: [],
    logs: [
      {
        id: 'log-init',
        timestampSec: 0,
        level: 'GRPC',
        source: 'coordinator',
        message: `gRPC coordinator bound on ${config.distributed.coordinatorBind} (${shardedWorkers.filter((w) => w.status !== 'offline').length}/${config.distributed.quorumWorkers} quorum workers ready)`,
      },
    ],
  };
}

export function deterministicNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function startDistributedRun(
  state: DistributedRunState,
  config: PummelConfig
): DistributedRunState {
  const readyWorkers = state.workers.filter((w) => w.status !== 'offline');
  if (config.distributed.enabled && readyWorkers.length < config.distributed.quorumWorkers) {
    const warnLog: RunLogEntry = {
      id: `log-quorum-${Date.now()}`,
      timestampSec: state.elapsedSec,
      level: 'WARN',
      source: 'coordinator',
      message: `Cannot start distributed run: ${readyWorkers.length} workers online, quorum requires ${config.distributed.quorumWorkers}.`,
    };
    return {
      ...state,
      logs: [warnLog, ...state.logs].slice(0, 60),
    };
  }

  const fresh = createInitialClusterState(config, state.workers);
  const hooks = fresh.hookExecutions.map((h) =>
    h.phase === 'prepare' || h.phase === 'startup'
      ? { ...h, status: 'completed' as const, timestampSec: 0 }
      : h
  );

  const bootLogs: RunLogEntry[] = [
    {
      id: `log-start-${Date.now()}`,
      timestampSec: 0,
      level: 'GRPC',
      source: 'coordinator',
      message: `Dispatched StartExecution RPC to ${readyWorkers.length} worker nodes (target ${fresh.targetConcurrency} VUs, strategy: ${config.distributed.shardStrategy}).`,
    },
  ];

  for (const h of hooks) {
    if (h.status === 'completed') {
      bootLogs.unshift({
        id: `log-hook-${h.phase}-${h.name}`,
        timestampSec: 0,
        level: 'CHAOS',
        source: `hook:${h.phase}`,
        message: `Executed "${h.name}" -> ${h.command}`,
      });
    }
  }

  return {
    ...fresh,
    status: 'running',
    phase: 'ramp-up',
    chaosFaultActive: state.chaosFaultActive,
    workers: fresh.workers.map((w) => ({
      ...w,
      status: w.status === 'offline' ? 'offline' : 'running',
    })),
    hookExecutions: hooks,
    logs: [...bootLogs, ...fresh.logs].slice(0, 60),
  };
}

export function stopDistributedRun(
  state: DistributedRunState,
  reason: 'user' | 'sla' | 'completed' = 'user'
): DistributedRunState {
  const hooks = state.hookExecutions.map((h) =>
    h.phase === 'shutdown' && h.status === 'pending'
      ? { ...h, status: 'completed' as const, timestampSec: state.elapsedSec }
      : h
  );

  const newLogs: RunLogEntry[] = [];
  for (const h of hooks) {
    if (h.phase === 'shutdown' && h.status === 'completed') {
      newLogs.push({
        id: `log-shutdown-${h.name}-${state.elapsedSec}`,
        timestampSec: state.elapsedSec,
        level: 'CHAOS',
        source: 'hook:shutdown',
        message: `Guaranteed teardown executed: "${h.name}" -> ${h.command}`,
      });
    }
  }

  const finalStatus =
    reason === 'sla' ? 'aborted_sla' : reason === 'completed' ? 'completed' : 'completed';

  newLogs.unshift({
    id: `log-stop-${reason}-${state.elapsedSec}`,
    timestampSec: state.elapsedSec,
    level: reason === 'sla' ? 'SLA' : 'GRPC',
    source: 'coordinator',
    message:
      reason === 'sla'
        ? 'Broadcasted GracefulStop RPC across workers due to SLA stop breach.'
        : reason === 'completed'
          ? `Execution completed cleanly after ${state.elapsedSec}s (${state.totalRequests.toLocaleString()} total requests).`
          : 'Received POST /control/stop  --  broadcasted GracefulStop RPC to all workers.',
  });

  return {
    ...state,
    status: finalStatus,
    phase: 'done',
    activeVUs: 0,
    currentRps: 0,
    workers: state.workers.map((w) => ({
      ...w,
      activeVUs: 0,
      currentRps: 0,
      cpuUsagePct: w.status === 'offline' ? 0 : 6,
      status: w.status === 'offline' ? 'offline' : 'ready',
    })),
    hookExecutions: hooks,
    logs: [...newLogs, ...state.logs].slice(0, 60),
  };
}
