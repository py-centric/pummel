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
