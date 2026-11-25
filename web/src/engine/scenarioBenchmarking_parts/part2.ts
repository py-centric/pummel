import type { PummelConfig } from '../../types/pummel';
import type { StorageLike } from '../scheduledTests';
import { BenchmarkParameterRow, BenchmarkScenario, BenchmarkScenarioMetrics, SCENARIO_BENCHMARKS_STORAGE_KEY, computeScenarioMetrics, createSeededBenchmarkScenarios } from './part1';


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

export function getDefaultStorage(): StorageLike | null {
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
