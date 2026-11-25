import type { PummelConfig } from '../types/pummel';
import type { StorageLike } from './scheduledTests';

export type BenchmarkExecutorType = 'http' | 'grpc' | 'websocket';

export interface BenchmarkScenario {
  id: string;
  name: string;
  profileTag: 'baseline' | 'stress' | 'spike' | 'soak' | 'custom';
  concurrencyVUs: number;
  rampUpSec: number;
  holdForSec: number;
  targetRpsCap: number | null;
  executor: BenchmarkExecutorType;
  thinkTimeMs: number;
  p95SlaMs: number;
  maxErrorRatePct: number;
  workerShards: number;
  notes: string;
  createdAtIso: string;
}

export interface BenchmarkScenarioMetrics {
  scenarioId: string;
  totalDurationSec: number;
  estimatedTotalRequests: number;
  estimatedPeakRps: number;
  vusPerWorker: number;
}

export interface BenchmarkParameterRow {
  key: string;
  label: string;
  unit: string;
  highlightHighest?: boolean;
  values: Array<{
    scenarioId: string;
    display: string;
    numericValue: number | null;
    isMax: boolean;
    isMin: boolean;
  }>;
}

export const SCENARIO_BENCHMARKS_STORAGE_KEY = 'pummel_scenario_benchmarks_v1';

export function computeScenarioMetrics(scenario: BenchmarkScenario): BenchmarkScenarioMetrics {
  const totalDurationSec = Math.max(1, scenario.rampUpSec + scenario.holdForSec);
  const effectiveCycleSec = Math.max(0.08, (scenario.thinkTimeMs + 95) / 1000);
  const unconstrainedRps = Math.round(scenario.concurrencyVUs / effectiveCycleSec);
  const estimatedPeakRps =
    scenario.targetRpsCap !== null && scenario.targetRpsCap > 0
      ? Math.min(unconstrainedRps, scenario.targetRpsCap)
      : unconstrainedRps;
  const effectiveHoldRatio =
    (scenario.holdForSec + scenario.rampUpSec * 0.5) / totalDurationSec;
  const estimatedTotalRequests = Math.round(
    estimatedPeakRps * totalDurationSec * effectiveHoldRatio
  );
  const vusPerWorker = Math.round(
    scenario.concurrencyVUs / Math.max(1, scenario.workerShards)
  );

  return {
    scenarioId: scenario.id,
    totalDurationSec,
    estimatedTotalRequests,
    estimatedPeakRps,
    vusPerWorker,
  };
}

export function createSeededBenchmarkScenarios(
  nowIso: string = new Date().toISOString()
): BenchmarkScenario[] {
  return [
    {
      id: 'bench-baseline',
      name: 'Baseline',
      profileTag: 'baseline',
      concurrencyVUs: 300,
      rampUpSec: 30,
      holdForSec: 180,
      targetRpsCap: 900,
      executor: 'http',
      thinkTimeMs: 250,
      p95SlaMs: 180,
      maxErrorRatePct: 0.5,
      workerShards: 3,
      notes: 'Steady-state regression baseline for daily PR gates.',
      createdAtIso: nowIso,
    },
    {
      id: 'bench-stress',
      name: 'Stress',
      profileTag: 'stress',
      concurrencyVUs: 900,
      rampUpSec: 45,
      holdForSec: 240,
      targetRpsCap: 2800,
      executor: 'grpc',
      thinkTimeMs: 120,
      p95SlaMs: 260,
      maxErrorRatePct: 1.5,
      workerShards: 6,
      notes: 'Sustained capacity ceiling test across gRPC & HTTP backends.',
      createdAtIso: nowIso,
    },
    {
      id: 'bench-spike',
      name: 'Spike',
      profileTag: 'spike',
      concurrencyVUs: 1500,
      rampUpSec: 10,
      holdForSec: 60,
      targetRpsCap: null,
      executor: 'http',
      thinkTimeMs: 40,
      p95SlaMs: 380,
      maxErrorRatePct: 2.5,
      workerShards: 8,
      notes: 'Sudden 10s flash-crowd surge evaluating autoscaler & circuit breakers.',
      createdAtIso: nowIso,
    },
  ];
}

export function buildBenchmarkScenarioFromConfig(params: {
  config: PummelConfig;
  name?: string;
  profileTag?: BenchmarkScenario['profileTag'];
  nowIso?: string;
}): BenchmarkScenario {
  const { config, name, profileTag = 'custom', nowIso = new Date().toISOString() } = params;
  const exec = config.execution[0];
  const scenarioKey = exec?.scenario ?? Object.keys(config.scenarios)[0];
  const scenarioDef = scenarioKey ? config.scenarios[scenarioKey] : undefined;
  const firstReq = scenarioDef?.requests[0];
  const p95Rule = config.sla.find((s) => s.metric === 'p95-response-time');
  const errRule = config.sla.find((s) => s.metric === 'fail-rate');

  return {
    id: `bench-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name?.trim() || `${config.name} Snapshot`,
    profileTag,
    concurrencyVUs: exec?.concurrency ?? 250,
    rampUpSec: exec?.rampUpSec ?? 15,
    holdForSec: exec?.holdForSec ?? 60,
    targetRpsCap: exec?.throughputLimit ?? null,
    executor:
      firstReq?.protocol === 'grpc' || firstReq?.protocol === 'websocket'
        ? firstReq.protocol
        : 'http',
    thinkTimeMs: scenarioDef?.thinkTimeMs ?? 100,
    p95SlaMs: p95Rule?.threshold ?? 220,
    maxErrorRatePct: errRule?.threshold ?? 1.0,
    workerShards: Math.max(1, config.distributed.quorumWorkers || 3),
    notes: `Captured from workspace spec "${config.name}".`,
    createdAtIso: nowIso,
  };
}

export function applyBenchmarkScenarioToConfig(
  baseConfig: PummelConfig,
  scenario: BenchmarkScenario
): PummelConfig {
  const nextExec = baseConfig.execution.map((ex, idx) =>
    idx === 0
      ? {
          ...ex,
          concurrency: scenario.concurrencyVUs,
          rampUpSec: scenario.rampUpSec,
          holdForSec: scenario.holdForSec,
          throughputLimit: scenario.targetRpsCap ?? undefined,
        }
      : ex
  );

  const primaryScenarioKey = baseConfig.execution[0]?.scenario ?? Object.keys(baseConfig.scenarios)[0];
  const nextScenarios = { ...baseConfig.scenarios };
  if (primaryScenarioKey && nextScenarios[primaryScenarioKey]) {
    const targetScenario = nextScenarios[primaryScenarioKey];
    nextScenarios[primaryScenarioKey] = {
      ...targetScenario,
      thinkTimeMs: scenario.thinkTimeMs,
      requests: targetScenario.requests.map((req, idx) =>
        idx === 0 ? { ...req, protocol: scenario.executor } : req
      ),
    };
  }

  const nextSla = baseConfig.sla.map((rule) => {
    if (rule.metric === 'p95-response-time') {
      return { ...rule, threshold: scenario.p95SlaMs };
    }
    if (rule.metric === 'fail-rate') {
      return { ...rule, threshold: scenario.maxErrorRatePct };
    }
    return rule;
  });

  return {
    ...baseConfig,
    name: `${baseConfig.name.split(' [')[0]} [${scenario.name}]`,
    execution: nextExec,
    scenarios: nextScenarios,
    sla: nextSla,
    distributed: {
      ...baseConfig.distributed,
      quorumWorkers: scenario.workerShards,
    },
  };
}

export function buildComparisonMatrix(
  scenarios: readonly BenchmarkScenario[]
): BenchmarkParameterRow[] {
  if (scenarios.length === 0) return [];
  const derivedMap = new Map<string, BenchmarkScenarioMetrics>();
  for (const s of scenarios) {
    derivedMap.set(s.id, computeScenarioMetrics(s));
  }

  const buildNumericRow = (
    key: string,
    label: string,
    unit: string,
    extract: (s: BenchmarkScenario, m: BenchmarkScenarioMetrics) => number | null,
    format: (v: number | null) => string,
    highlightHighest = true
  ): BenchmarkParameterRow => {
    const rawValues = scenarios.map((s) =>
      extract(s, derivedMap.get(s.id)!)
    );
    const finite = rawValues.filter((v): v is number => v !== null && Number.isFinite(v));
    const maxVal = finite.length > 0 ? Math.max(...finite) : null;
    const minVal = finite.length > 0 ? Math.min(...finite) : null;

    return {
      key,
      label,
      unit,
      highlightHighest,
      values: scenarios.map((s, idx) => {
        const val = rawValues[idx];
        return {
          scenarioId: s.id,
          display: format(val),
          numericValue: val,
          isMax: finite.length > 1 && val !== null && val === maxVal && maxVal !== minVal,
          isMin: finite.length > 1 && val !== null && val === minVal && maxVal !== minVal,
        };
      }),
    };
  };

  return [
    buildNumericRow(
      'concurrencyVUs',
      'Concurrency',
      'VUs',
      (s) => s.concurrencyVUs,
      (v) => `${(v ?? 0).toLocaleString()} VUs`
    ),
    buildNumericRow(
      'rampUpSec',
      'Ramp-Up Window',
      'sec',
      (s) => s.rampUpSec,
      (v) => `${v ?? 0}s`,
      false
    ),
    buildNumericRow(
      'holdForSec',
      'Hold Duration',
      'sec',
      (s) => s.holdForSec,
      (v) => `${v ?? 0}s`
    ),
    buildNumericRow(
      'totalDurationSec',
      'Total Run Time',
      'sec',
      (_, m) => m.totalDurationSec,
      (v) => `${v ?? 0}s`
    ),
    buildNumericRow(
      'targetRpsCap',
      'Throughput Cap',
      'rps',
      (s) => s.targetRpsCap,
      (v) => (v === null ? 'Uncapped' : `${v.toLocaleString()} rps`)
    ),
    buildNumericRow(
      'estimatedPeakRps',
      'Est. Peak Throughput',
      'rps',
      (_, m) => m.estimatedPeakRps,
      (v) => `~${(v ?? 0).toLocaleString()} rps`
    ),
    buildNumericRow(
      'estimatedTotalRequests',
      'Est. Total Requests',
      'reqs',
      (_, m) => m.estimatedTotalRequests,
      (v) => `~${(v ?? 0).toLocaleString()}`
    ),
    {
      key: 'executor',
      label: 'Protocol Executor',
      unit: '',
      values: scenarios.map((s) => ({
        scenarioId: s.id,
        display: s.executor.toUpperCase(),
        numericValue: null,
        isMax: false,
        isMin: false,
      })),
    },
    buildNumericRow(
      'thinkTimeMs',
      'Think Time',
      'ms',
      (s) => s.thinkTimeMs,
      (v) => `${v ?? 0} ms`,
      false
    ),
    buildNumericRow(
      'p95SlaMs',
      'p95 Latency Budget',
      'ms',
      (s) => s.p95SlaMs,
      (v) => `<= ${v ?? 0} ms`,
      false
    ),
    buildNumericRow(
      'maxErrorRatePct',
      'Max Error Rate SLA',
      '%',
      (s) => s.maxErrorRatePct,
      (v) => `<= ${(v ?? 0).toFixed(2)}%`,
      false
    ),
    (() => {
      const counts = scenarios.map((s) => s.workerShards);
      const maxW = Math.max(...counts);
      const minW = Math.min(...counts);
      return {
        key: 'workerShards',
        label: 'Worker Quorum',
        unit: 'nodes',
        highlightHighest: true,
        values: scenarios.map((s) => {
          const metrics = derivedMap.get(s.id)!;
          return {
            scenarioId: s.id,
            display: `${s.workerShards} nodes (${metrics.vusPerWorker.toLocaleString()} VU/node)`,
            numericValue: s.workerShards,
            isMax: scenarios.length > 1 && s.workerShards === maxW && maxW !== minW,
            isMin: scenarios.length > 1 && s.workerShards === minW && maxW !== minW,
          };
        }),
      };
    })(),
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

export function loadBenchmarkScenarios(
  storage: StorageLike | null = getDefaultStorage()
): BenchmarkScenario[] {
  const seeds = createSeededBenchmarkScenarios();
  if (!storage) return seeds;
  try {
    const raw = storage.getItem(SCENARIO_BENCHMARKS_STORAGE_KEY);
    if (!raw) return seeds;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seeds;
    return parsed as BenchmarkScenario[];
  } catch {
    return seeds;
  }
}

export function saveBenchmarkScenarios(
  scenarios: readonly BenchmarkScenario[],
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SCENARIO_BENCHMARKS_STORAGE_KEY, JSON.stringify(scenarios));
    return true;
  } catch {
    return false;
  }
}
