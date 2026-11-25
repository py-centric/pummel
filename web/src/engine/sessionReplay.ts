import type {
  ChaosHookExecution,
  DistributedRunState,
  EndpointMetrics,
  PummelConfig,
  RunLogEntry,
  RunStatus,
  SlaEvaluationResult,
  TelemetryPoint,
  WorkerNode,
} from '../types/pummel';
import type { StorageLike } from './scheduledTests';

export interface RecordedTestSession {
  id: string;
  label: string;
  specName: string;
  clusterId: string;
  clusterName: string;
  coordinatorBind: string;
  startedAtIso: string;
  endedAtIso: string;
  endStatus: RunStatus;
  durationSec: number;
  targetConcurrency: number;
  totalRequests: number;
  totalFailures: number;
  peakRps: number;
  avgRps: number;
  peakP95Ms: number;
  peakP99Ms: number;
  errorRatePct: number;
  history: TelemetryPoint[];
  logs: RunLogEntry[];
  workersSnapshot: WorkerNode[];
  endpoints: EndpointMetrics[];
  slaResults: SlaEvaluationResult[];
  hookExecutions: ChaosHookExecution[];
}

export interface ReplayFrameProjection {
  stepIndex: number;
  totalSteps: number;
  elapsedSec: number;
  activeVUs: number;
  currentRps: number;
  globalAvgMs: number;
  globalP90Ms: number;
  globalP95Ms: number;
  globalP99Ms: number;
  globalFailRatePct: number;
  historySlice: TelemetryPoint[];
  logsSlice: RunLogEntry[];
}

export const RECORDED_SESSIONS_STORAGE_KEY = 'pummel_recorded_sessions_v1';

export function createRecordedSessionFromRun(params: {
  runState: DistributedRunState;
  config: PummelConfig;
  clusterId: string;
  clusterName: string;
  label?: string;
  now?: Date;
}): RecordedTestSession {
  const { runState, config, clusterId, clusterName, label, now = new Date() } = params;
  const history = [...runState.history];
  const durationSec =
    history.length > 0 ? history[history.length - 1].elapsedSec : runState.elapsedSec;
  const startedMs = now.getTime() - Math.max(1, durationSec) * 1000;
  const peakRps = history.reduce((m, pt) => Math.max(m, pt.rps), runState.currentRps);
  const avgRps =
    history.length > 0
      ? Math.round(history.reduce((s, pt) => s + pt.rps, 0) / history.length)
      : runState.currentRps;
  const peakP95Ms = Number(
    history.reduce((m, pt) => Math.max(m, pt.p95Ms), runState.globalP95Ms).toFixed(1)
  );
  const peakP99Ms = Number(
    history
      .reduce((m, pt) => Math.max(m, pt.p99Ms ?? pt.p95Ms * 1.26), runState.globalP99Ms)
      .toFixed(1)
  );
  const errorRatePct =
    runState.totalRequests > 0
      ? Number(((runState.totalFailures / runState.totalRequests) * 100).toFixed(2))
      : runState.globalFailRatePct;

  const stampTime = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return {
    id: `sess-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    label: label?.trim() || `${config.name} · ${clusterName} (${stampTime})`,
    specName: config.name,
    clusterId,
    clusterName,
    coordinatorBind: config.distributed.coordinatorBind,
    startedAtIso: new Date(startedMs).toISOString(),
    endedAtIso: now.toISOString(),
    endStatus: runState.status === 'idle' ? 'completed' : runState.status,
    durationSec,
    targetConcurrency: runState.targetConcurrency,
    totalRequests: runState.totalRequests,
    totalFailures: runState.totalFailures,
    peakRps,
    avgRps,
    peakP95Ms,
    peakP99Ms,
    errorRatePct,
    history,
    logs: [...runState.logs],
    workersSnapshot: runState.workers.map((w) => ({ ...w })),
    endpoints: runState.endpoints.map((ep) => ({
      ...ep,
      timingsMs: ep.timingsMs.slice(-400),
    })),
    slaResults: runState.slaResults.map((s) => ({ ...s })),
    hookExecutions: runState.hookExecutions.map((h) => ({ ...h })),
  };
}

export function buildReplayFrameAtIndex(
  session: RecordedTestSession,
  requestedIndex: number
): ReplayFrameProjection {
  const totalSteps = session.history.length;
  if (totalSteps === 0) {
    return {
      stepIndex: 0,
      totalSteps: 0,
      elapsedSec: session.durationSec,
      activeVUs: session.targetConcurrency,
      currentRps: session.avgRps,
      globalAvgMs: Number((session.peakP95Ms * 0.6).toFixed(1)),
      globalP90Ms: Number((session.peakP95Ms * 0.88).toFixed(1)),
      globalP95Ms: session.peakP95Ms,
      globalP99Ms: session.peakP99Ms,
      globalFailRatePct: session.errorRatePct,
      historySlice: [],
      logsSlice: [...session.logs],
    };
  }

  const stepIndex = Math.max(0, Math.min(totalSteps - 1, Math.round(requestedIndex)));
  const historySlice = session.history.slice(0, stepIndex + 1);
  const pt = historySlice[historySlice.length - 1];
  const p95 = Number(pt.p95Ms.toFixed(1));
  const avgMs =
    typeof pt.avgMs === 'number' ? Number(pt.avgMs.toFixed(1)) : Number((p95 * 0.64).toFixed(1));
  const p99Ms =
    typeof pt.p99Ms === 'number' ? Number(pt.p99Ms.toFixed(1)) : Number((p95 * 1.28).toFixed(1));
  const p90Ms = Number((p95 * 0.88).toFixed(1));

  const logsSlice = session.logs.filter((l) => l.timestampSec <= pt.elapsedSec);

  return {
    stepIndex,
    totalSteps,
    elapsedSec: pt.elapsedSec,
    activeVUs: pt.activeVUs,
    currentRps: pt.rps,
    globalAvgMs: avgMs,
    globalP90Ms: p90Ms,
    globalP95Ms: p95,
    globalP99Ms: p99Ms,
    globalFailRatePct: Number(pt.failRatePct.toFixed(2)),
    historySlice,
    logsSlice,
  };
}

export function createSeededRecordedSessions(): RecordedTestSession[] {
  const now = Date.now();
  const buildSeries = (count: number, baseRps: number, spikeAt: number | null): TelemetryPoint[] =>
    Array.from({ length: count }, (_, idx) => {
      const elapsedSec = idx + 1;
      const ramp = Math.min(1, elapsedSec / 4);
      const isSpike = spikeAt !== null && elapsedSec >= spikeAt && elapsedSec <= spikeAt + 3;
      const rps = Math.round(baseRps * ramp * (isSpike ? 0.72 : 0.94 + (idx % 4) * 0.03));
      const p95Ms = Number(((isSpike ? 238 : 104) + (idx % 5) * 4.2).toFixed(1));
      return {
        elapsedSec,
        rps,
        activeVUs: Math.round(600 * ramp),
        avgMs: Number((p95Ms * 0.63).toFixed(1)),
        p95Ms,
        p99Ms: Number((p95Ms * 1.29).toFixed(1)),
        failRatePct: isSpike ? 2.45 : 0.38,
      };
    });

  const canaryHistory = buildSeries(16, 1520, 10);
  const canaryLogs: RunLogEntry[] = [
    {
      id: 'seed-log-c5',
      timestampSec: 16,
      level: 'INFO',
      source: 'coordinator',
      message: 'Session completed; teardown hooks verified clean.',
    },
    {
      id: 'seed-log-c4',
      timestampSec: 11,
      level: 'SLA',
      source: 'sla-guard',
      message: 'SLA breach: p95 latency reached 246.4ms (> 200ms threshold) on POST /v1/checkout.',
    },
    {
      id: 'seed-log-c3',
      timestampSec: 10,
      level: 'CHAOS',
      source: 'toxiproxy',
      message: 'Injected Toxiproxy 80ms latency fault on eu-west worker shard.',
    },
    {
      id: 'seed-log-c2',
      timestampSec: 5,
      level: 'GRPC',
      source: 'autoscaler',
      message: 'Auto-scaled UP +1 node (worker-autoscale-eu-west-2-04): fleet 3 -> 4 workers.',
    },
    {
      id: 'seed-log-c1',
      timestampSec: 1,
      level: 'GRPC',
      source: 'coordinator',
      message: 'Started distributed session across 3 gRPC workers (600 VUs).',
    },
  ];

  const baselineHistory = buildSeries(12, 1280, null);
  const baselineLogs: RunLogEntry[] = [
    {
      id: 'seed-log-b3',
      timestampSec: 12,
      level: 'INFO',
      source: 'coordinator',
      message: 'Session completed; all SLA gates passed within threshold.',
    },
    {
      id: 'seed-log-b2',
      timestampSec: 4,
      level: 'GRPC',
      source: 'worker-eu-west-01',
      message: 'Worker shard reached steady-state 600 VUs.',
    },
    {
      id: 'seed-log-b1',
      timestampSec: 1,
      level: 'GRPC',
      source: 'coordinator',
      message: 'Started baseline verification run across EU-West Primary.',
    },
  ];

  return [
    {
      id: 'sess-seed-canary-chaos',
      label: 'Canary Chaos Spike (16s · 600 VUs)',
      specName: 'Checkout API Multi-Protocol Mix',
      clusterId: 'prod-eu-west',
      clusterName: 'EU-West Primary',
      coordinatorBind: '127.0.0.1:50051',
      startedAtIso: new Date(now - 35 * 60_000).toISOString(),
      endedAtIso: new Date(now - 34 * 60_000).toISOString(),
      endStatus: 'completed',
      durationSec: 16,
      targetConcurrency: 600,
      totalRequests: 21480,
      totalFailures: 194,
      peakRps: Math.max(...canaryHistory.map((h) => h.rps)),
      avgRps: Math.round(canaryHistory.reduce((s, h) => s + h.rps, 0) / canaryHistory.length),
      peakP95Ms: Math.max(...canaryHistory.map((h) => h.p95Ms)),
      peakP99Ms: Math.max(...canaryHistory.map((h) => h.p99Ms ?? 0)),
      errorRatePct: 0.9,
      history: canaryHistory,
      logs: canaryLogs,
      workersSnapshot: [],
      endpoints: [],
      slaResults: [],
      hookExecutions: [],
    },
    {
      id: 'sess-seed-baseline-nominal',
      label: 'Release v2.4 Nominal Baseline (12s · 600 VUs)',
      specName: 'Baseline Checkout Verification',
      clusterId: 'staging-us-east',
      clusterName: 'US-East Staging',
      coordinatorBind: '10.44.8.10:50051',
      startedAtIso: new Date(now - 2 * 3600_000).toISOString(),
      endedAtIso: new Date(now - 119 * 60_000).toISOString(),
      endStatus: 'completed',
      durationSec: 12,
      targetConcurrency: 600,
      totalRequests: 14120,
      totalFailures: 42,
      peakRps: Math.max(...baselineHistory.map((h) => h.rps)),
      avgRps: Math.round(baselineHistory.reduce((s, h) => s + h.rps, 0) / baselineHistory.length),
      peakP95Ms: Math.max(...baselineHistory.map((h) => h.p95Ms)),
      peakP99Ms: Math.max(...baselineHistory.map((h) => h.p99Ms ?? 0)),
      errorRatePct: 0.3,
      history: baselineHistory,
      logs: baselineLogs,
      workersSnapshot: [],
      endpoints: [],
      slaResults: [],
      hookExecutions: [],
    },
  ];
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return null;
}

export function loadRecordedSessions(
  storage: StorageLike | null = getDefaultStorage()
): RecordedTestSession[] {
  const seeds = createSeededRecordedSessions();
  if (!storage) return seeds;
  try {
    const raw = storage.getItem(RECORDED_SESSIONS_STORAGE_KEY);
    if (!raw) return seeds;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seeds;
    const valid = parsed.filter(
      (item): item is RecordedTestSession =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as RecordedTestSession).id === 'string' &&
        Array.isArray((item as RecordedTestSession).history) &&
        Array.isArray((item as RecordedTestSession).logs)
    );
    return valid.length > 0 ? valid : seeds;
  } catch {
    return seeds;
  }
}

export function saveRecordedSessions(
  sessions: readonly RecordedTestSession[],
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RECORDED_SESSIONS_STORAGE_KEY, JSON.stringify(sessions.slice(0, 15)));
    return true;
  } catch {
    return false;
  }
}
