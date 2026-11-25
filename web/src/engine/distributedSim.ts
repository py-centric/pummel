import type {
  ChaosHookExecution,
  DistributedRunState,
  EndpointMetrics,
  PummelConfig,
  RunLogEntry,
  SlaCriterion,
  SlaEvaluationResult,
  WorkerNode,
} from '../types/pummel';

export const MAX_TIMINGS = 10_000;

export function calculatePercentile(samples: readonly number[], percentile: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const clamped = Math.min(100, Math.max(0, percentile));
  const index = Math.ceil((clamped / 100) * sorted.length) - 1;
  return Number(sorted[Math.max(0, Math.min(sorted.length - 1, index))].toFixed(1));
}

export function appendBoundedTimings(
  existing: readonly number[],
  incoming: readonly number[],
  maxSamples: number = MAX_TIMINGS
): number[] {
  if (maxSamples <= 0) return [];
  const total = existing.length + incoming.length;
  if (total <= maxSamples) {
    return [...existing, ...incoming];
  }
  const combined = [...existing, ...incoming];
  return combined.slice(combined.length - maxSamples);
}

export function distributeVUs(
  totalConcurrency: number,
  workers: readonly WorkerNode[],
  strategy: 'weighted-capacity' | 'round-robin' = 'weighted-capacity'
): WorkerNode[] {
  const healthy = workers.filter((w) => w.status !== 'offline');
  if (healthy.length === 0 || totalConcurrency <= 0) {
    return workers.map((w) => ({ ...w, assignedVUs: 0 }));
  }

  const allocation = new Map<string, number>();

  if (strategy === 'round-robin') {
    const base = Math.floor(totalConcurrency / healthy.length);
    let rem = totalConcurrency % healthy.length;
    for (const w of healthy) {
      const extra = rem > 0 ? 1 : 0;
      if (rem > 0) rem -= 1;
      allocation.set(w.id, base + extra);
    }
  } else {
    const totalWeight = healthy.reduce((sum, w) => sum + Math.max(1, w.capacityWeight), 0);
    let assignedSum = 0;
    const fractions: { id: string; frac: number }[] = [];

    for (const w of healthy) {
      const exact = (totalConcurrency * Math.max(1, w.capacityWeight)) / totalWeight;
      const floored = Math.floor(exact);
      allocation.set(w.id, floored);
      assignedSum += floored;
      fractions.push({ id: w.id, frac: exact - floored });
    }

    let remainder = totalConcurrency - assignedSum;
    fractions.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < fractions.length && remainder > 0; i += 1) {
      const id = fractions[i].id;
      allocation.set(id, (allocation.get(id) ?? 0) + 1);
      remainder -= 1;
    }
  }

  return workers.map((w) => ({
    ...w,
    assignedVUs: w.status === 'offline' ? 0 : (allocation.get(w.id) ?? 0),
  }));
}

function compareSla(value: number, comparator: SlaCriterion['comparator'], threshold: number): boolean {
  switch (comparator) {
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
    case '<':
      return value < threshold;
    case '<=':
      return value <= threshold;
  }
}

export function evaluateSlaCriteria(
  criteria: readonly SlaCriterion[],
  globalMetrics: {
    failRatePct: number;
    avgMs: number;
    p90Ms: number;
    p95Ms: number;
    p99Ms: number;
    throughputRps: number;
  },
  endpoints: readonly EndpointMetrics[],
  previousResults: readonly SlaEvaluationResult[] = []
): SlaEvaluationResult[] {
  const prevById = new Map(previousResults.map((r) => [r.criterion.id, r]));

  return criteria.map((criterion) => {
    const targetEndpoint = criterion.subject
      ? endpoints.find((e) => e.label === criterion.subject)
      : undefined;

    let currentValue = 0;
    if (targetEndpoint) {
      const epFailRate =
        targetEndpoint.totalRequests > 0
          ? (targetEndpoint.failedRequests / targetEndpoint.totalRequests) * 100
          : 0;
      switch (criterion.metric) {
        case 'fail-rate':
          currentValue = epFailRate;
          break;
        case 'avg-response-time':
          currentValue = targetEndpoint.avgMs;
          break;
        case 'p90-response-time':
          currentValue = targetEndpoint.p90Ms;
          break;
        case 'p95-response-time':
          currentValue = targetEndpoint.p95Ms;
          break;
        case 'p99-response-time':
          currentValue = targetEndpoint.p99Ms;
          break;
        case 'throughput':
          currentValue = targetEndpoint.currentRps;
          break;
      }
    } else {
      switch (criterion.metric) {
        case 'fail-rate':
          currentValue = globalMetrics.failRatePct;
          break;
        case 'avg-response-time':
          currentValue = globalMetrics.avgMs;
          break;
        case 'p90-response-time':
          currentValue = globalMetrics.p90Ms;
          break;
        case 'p95-response-time':
          currentValue = globalMetrics.p95Ms;
          break;
        case 'p99-response-time':
          currentValue = globalMetrics.p99Ms;
          break;
        case 'throughput':
          currentValue = globalMetrics.throughputRps;
          break;
      }
    }

    const rounded = Number(currentValue.toFixed(2));
    const breached = compareSla(rounded, criterion.comparator, criterion.threshold);
    const prev = prevById.get(criterion.id);
    const breachCount = (prev?.breachCount ?? 0) + (breached ? 1 : 0);

    return {
      criterion,
      currentValue: rounded,
      breached,
      triggeredAction: breached ? criterion.action : prev?.triggeredAction,
      breachCount,
    };
  });
}

export function createDefaultWorkers(): WorkerNode[] {
  return [
    {
      id: 'worker-eu-west-01',
      hostname: 'pummel-wrk-01.internal',
      region: 'eu-west-2',
      grpcEndpoint: '10.42.1.11:50052',
      cpuCores: 16,
      capacityWeight: 2,
      assignedVUs: 0,
      activeVUs: 0,
      currentRps: 0,
      avgLatencyMs: 0,
      errorRatePct: 0,
      cpuUsagePct: 6,
      memoryMb: 118,
      lastHeartbeatMs: 14,
      status: 'ready',
    },
    {
      id: 'worker-eu-west-02',
      hostname: 'pummel-wrk-02.internal',
      region: 'eu-west-2',
      grpcEndpoint: '10.42.1.12:50052',
      cpuCores: 16,
      capacityWeight: 2,
      assignedVUs: 0,
      activeVUs: 0,
      currentRps: 0,
      avgLatencyMs: 0,
      errorRatePct: 0,
      cpuUsagePct: 5,
      memoryMb: 112,
      lastHeartbeatMs: 18,
      status: 'ready',
    },
    {
      id: 'worker-us-east-01',
      hostname: 'pummel-wrk-03.internal',
      region: 'us-east-1',
      grpcEndpoint: '10.42.2.21:50052',
      cpuCores: 8,
      capacityWeight: 1,
      assignedVUs: 0,
      activeVUs: 0,
      currentRps: 0,
      avgLatencyMs: 0,
      errorRatePct: 0,
      cpuUsagePct: 4,
      memoryMb: 96,
      lastHeartbeatMs: 39,
      status: 'ready',
    },
  ];
}

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

function deterministicNoise(seed: number): number {
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

export function stepDistributedRun(
  state: DistributedRunState,
  config: PummelConfig,
  tickStepSec: number = 1
): DistributedRunState {
  if (state.status !== 'running') return state;

  const nextElapsed = state.elapsedSec + tickStepSec;
  const plan = config.execution[0] ?? {
    scenario: 'default',
    concurrency: state.targetConcurrency,
    rampUpSec: 15,
    holdForSec: 45,
  };

  if (nextElapsed > state.totalDurationSec) {
    return stopDistributedRun(state, 'completed');
  }

  const rampRatio = plan.rampUpSec > 0 ? Math.min(1, nextElapsed / plan.rampUpSec) : 1;
  const nextPhase = nextElapsed <= plan.rampUpSec ? 'ramp-up' : 'hold-for';
  const sharded = distributeVUs(state.targetConcurrency, state.workers, config.distributed.shardStrategy);

  const chaosFactor = state.chaosFaultActive ? 2.85 : 1.0;
  const chaosErrorBoost = state.chaosFaultActive ? 0.068 : 0.004;

  let tickRpsTotal = 0;
  let tickVusTotal = 0;

  const updatedWorkers: WorkerNode[] = sharded.map((worker, wIdx) => {
    if (worker.status === 'offline') {
      return {
        ...worker,
        activeVUs: 0,
        currentRps: 0,
        cpuUsagePct: 0,
      };
    }

    const activeVUs = Math.max(1, Math.round(worker.assignedVUs * rampRatio));
    const pacingCap = plan.pacing
      ? plan.pacing.per === 'minute'
        ? plan.pacing.rate / 60
        : plan.pacing.rate
      : undefined;

    const noise = deterministicNoise(nextElapsed * 31 + wIdx * 17);
    const baseRpsPerVu = worker.status === 'degraded' ? 1.7 : 3.2;
    let workerRps = Math.round(activeVUs * baseRpsPerVu * (0.92 + noise * 0.16));
    if (pacingCap && sharded.filter((w) => w.status !== 'offline').length > 0) {
      const workerCap = Math.round(
        (pacingCap * Math.max(1, worker.capacityWeight)) /
          sharded
            .filter((w) => w.status !== 'offline')
            .reduce((s, w) => s + Math.max(1, w.capacityWeight), 0)
      );
      workerRps = Math.min(workerRps, Math.max(1, workerCap));
    }

    const workerBaseLat =
      (worker.region.startsWith('us-') ? 54 : 28) *
      (worker.status === 'degraded' ? 1.85 : 1.0) *
      chaosFactor;
    const avgLatencyMs = Number((workerBaseLat + (activeVUs / 25) * 1.4 + noise * 14).toFixed(1));
    const errPct = Number(
      ((chaosErrorBoost + (worker.status === 'degraded' ? 0.025 : 0)) * 100 * (0.85 + noise * 0.3)).toFixed(2)
    );
    const cpuUsagePct = Math.min(
      98,
      Math.round(14 + (activeVUs / Math.max(1, worker.cpuCores * 20)) * 68 + noise * 6)
    );
    const memoryMb = Math.round(110 + activeVUs * 0.42);

    tickRpsTotal += workerRps;
    tickVusTotal += activeVUs;

    return {
      ...worker,
      activeVUs,
      currentRps: workerRps,
      avgLatencyMs,
      errorRatePct: errPct,
      cpuUsagePct,
      memoryMb,
      lastHeartbeatMs: Math.round(10 + noise * (worker.region.startsWith('us-') ? 34 : 12)),
      status: worker.status === 'degraded' ? 'degraded' : 'running',
    };
  });

  const endpointCount = Math.max(1, state.endpoints.length);
  const allRecentTimings: number[] = [];
  let newTotalReqs = state.totalRequests;
  let newTotalFails = state.totalFailures;

  const updatedEndpoints: EndpointMetrics[] = state.endpoints.map((ep, idx) => {
    const share = idx === 0 ? 0.4 : 0.6 / Math.max(1, endpointCount - 1);
    const epReqs = Math.max(1, Math.round(tickRpsTotal * (endpointCount === 1 ? 1 : share)));
    const protocolBase =
      ep.protocol === 'grpc' ? 18 : ep.protocol === 'websocket' ? 24 : 42;

    const sampleCount = Math.min(48, Math.max(8, Math.round(epReqs / 10)));
    const newSamples: number[] = [];
    for (let s = 0; s < sampleCount; s += 1) {
      const n = deterministicNoise(nextElapsed * 97 + idx * 53 + s * 13);
      const tailSpike = n > 0.9 ? 2.4 : n > 0.78 ? 1.45 : 1.0;
      const sample = Number(
        ((protocolBase + idx * 9 + tickVusTotal * 0.045) * chaosFactor * tailSpike * (0.82 + n * 0.36)).toFixed(1)
      );
      newSamples.push(sample);
    }

    const failNoise = deterministicNoise(nextElapsed * 19 + idx * 7);
    const epFailRate = Math.min(0.45, chaosErrorBoost * (0.75 + failNoise * 0.55));
    const epFails = Math.round(epReqs * epFailRate);

    const boundedTimings = appendBoundedTimings(ep.timingsMs, newSamples, MAX_TIMINGS);
    const avgMs =
      boundedTimings.length > 0
        ? Number((boundedTimings.reduce((a, b) => a + b, 0) / boundedTimings.length).toFixed(1))
        : 0;

    allRecentTimings.push(...boundedTimings.slice(-200));
    newTotalReqs += epReqs;
    newTotalFails += epFails;

    return {
      ...ep,
      totalRequests: ep.totalRequests + epReqs,
      failedRequests: ep.failedRequests + epFails,
      timingsMs: boundedTimings,
      avgMs,
      p50Ms: calculatePercentile(boundedTimings, 50),
      p90Ms: calculatePercentile(boundedTimings, 90),
      p95Ms: calculatePercentile(boundedTimings, 95),
      p99Ms: calculatePercentile(boundedTimings, 99),
      currentRps: epReqs,
    };
  });

  const globalAvgMs =
    allRecentTimings.length > 0
      ? Number((allRecentTimings.reduce((a, b) => a + b, 0) / allRecentTimings.length).toFixed(1))
      : 0;
  const globalP90Ms = calculatePercentile(allRecentTimings, 90);
  const globalP95Ms = calculatePercentile(allRecentTimings, 95);
  const globalP99Ms = calculatePercentile(allRecentTimings, 99);
  const globalFailRatePct =
    newTotalReqs > 0 ? Number(((newTotalFails / newTotalReqs) * 100).toFixed(2)) : 0;

  const slaResults = evaluateSlaCriteria(
    config.sla,
    {
      failRatePct: globalFailRatePct,
      avgMs: globalAvgMs,
      p90Ms: globalP90Ms,
      p95Ms: globalP95Ms,
      p99Ms: globalP99Ms,
      throughputRps: tickRpsTotal,
    },
    updatedEndpoints,
    state.slaResults
  );

  const newLogs: RunLogEntry[] = [];
  const execHooksTriggered = [...state.execHooksTriggered];
  let shouldAbortSla = false;

  if (nextPhase !== state.phase) {
    newLogs.push({
      id: `log-phase-${nextPhase}-${nextElapsed}`,
      timestampSec: nextElapsed,
      level: 'INFO',
      source: 'coordinator',
      message: `Execution phase transitioned ${state.phase} -> ${nextPhase} (${tickVusTotal}/${state.targetConcurrency} active VUs).`,
    });
  }

  const onlineWorkers = updatedWorkers.filter((w) => w.status !== 'offline');
  if (onlineWorkers.length > 0) {
    const reportingWorker = onlineWorkers[(nextElapsed - 1) % onlineWorkers.length];
    if (reportingWorker.status === 'degraded') {
      newLogs.push({
        id: `log-grpc-deg-${reportingWorker.id}-${nextElapsed}`,
        timestampSec: nextElapsed,
        level: 'WARN',
        source: reportingWorker.id,
        message: `Degraded gRPC stream (${reportingWorker.grpcEndpoint}) · ${reportingWorker.activeVUs}/${reportingWorker.assignedVUs} VUs · ${reportingWorker.currentRps} rps · avg ${reportingWorker.avgLatencyMs.toFixed(1)}ms · err ${reportingWorker.errorRatePct.toFixed(2)}%`,
      });
    } else {
      newLogs.push({
        id: `log-grpc-hb-${reportingWorker.id}-${nextElapsed}`,
        timestampSec: nextElapsed,
        level: 'GRPC',
        source: reportingWorker.id,
        message: `Heartbeat ACK (${reportingWorker.region}) · ${reportingWorker.activeVUs}/${reportingWorker.assignedVUs} VUs · ${reportingWorker.currentRps} rps · avg ${reportingWorker.avgLatencyMs.toFixed(1)}ms · RTT ${reportingWorker.lastHeartbeatMs}ms · CPU ${reportingWorker.cpuUsagePct}%`,
      });
    }
  } else {
    newLogs.push({
      id: `log-quorum-loss-${nextElapsed}`,
      timestampSec: nextElapsed,
      level: 'WARN',
      source: 'coordinator',
      message: `No online gRPC workers available (quorum=${config.distributed.quorumWorkers}); awaiting worker reconnect.`,
    });
  }

  for (const res of slaResults) {
    if (!res.breached) continue;
    if (res.criterion.action === 'stop') {
      shouldAbortSla = true;
      newLogs.push({
        id: `log-sla-stop-${res.criterion.id}-${nextElapsed}`,
        timestampSec: nextElapsed,
        level: 'SLA',
        source: 'sla-engine',
        message: `BREACH [stop]: ${res.criterion.metric} (${res.currentValue}${res.criterion.unit} ${res.criterion.comparator} ${res.criterion.threshold}${res.criterion.unit})`,
      });
    } else if (res.criterion.action.startsWith('exec:')) {
      const cmd = res.criterion.action.slice(5);
      if (!execHooksTriggered.includes(res.criterion.id)) {
        execHooksTriggered.push(res.criterion.id);
        newLogs.push({
          id: `log-sla-exec-${res.criterion.id}-${nextElapsed}`,
          timestampSec: nextElapsed,
          level: 'SLA',
          source: 'sla-exec',
          message: `One-shot remediation triggered (${res.criterion.metric}=${res.currentValue}${res.criterion.unit}): ${cmd}`,
        });
      }
    } else if (res.criterion.action === 'warn' && res.breachCount === 1) {
      newLogs.push({
        id: `log-sla-warn-${res.criterion.id}-${nextElapsed}`,
        timestampSec: nextElapsed,
        level: 'WARN',
        source: 'sla-engine',
        message: `SLA warning on ${res.criterion.subject ?? 'global'} ${res.criterion.metric}: ${res.currentValue}${res.criterion.unit} ${res.criterion.comparator} ${res.criterion.threshold}${res.criterion.unit}`,
      });
    }
  }

  const nextState: DistributedRunState = {
    ...state,
    phase: nextPhase,
    elapsedSec: nextElapsed,
    activeVUs: tickVusTotal,
    totalRequests: newTotalReqs,
    totalFailures: newTotalFails,
    currentRps: tickRpsTotal,
    globalAvgMs,
    globalP90Ms,
    globalP95Ms,
    globalP99Ms,
    globalFailRatePct,
    workers: updatedWorkers,
    endpoints: updatedEndpoints,
    slaResults,
    execHooksTriggered,
    history: [
      ...state.history,
      {
        elapsedSec: nextElapsed,
        rps: tickRpsTotal,
        activeVUs: tickVusTotal,
        avgMs: globalAvgMs,
        p95Ms: globalP95Ms,
        p99Ms: globalP99Ms,
        failRatePct: globalFailRatePct,
      },
    ].slice(-60),
    logs: [...newLogs, ...state.logs].slice(0, 120),
  };

  if (shouldAbortSla) {
    return stopDistributedRun(nextState, 'sla');
  }

  return nextState;
}
