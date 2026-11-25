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
import { MAX_TIMINGS, appendBoundedTimings, calculatePercentile, distributeVUs, evaluateSlaCriteria } from './part1';
import { deterministicNoise, stopDistributedRun } from './part2';


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
