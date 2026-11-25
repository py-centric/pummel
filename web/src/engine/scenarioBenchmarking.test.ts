import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPresetConfig } from './configEngine';
import {
  applyBenchmarkScenarioToConfig,
  buildBenchmarkScenarioFromConfig,
  buildComparisonMatrix,
  computeScenarioMetrics,
  createSeededBenchmarkScenarios,
  loadBenchmarkScenarios,
  saveBenchmarkScenarios,
} from './scenarioBenchmarking';

test('seeded benchmark scenarios include Baseline, Stress, and Spike with distinct loads', () => {
  const seeds = createSeededBenchmarkScenarios();
  assert.equal(seeds.length, 3);
  assert.deepEqual(
    seeds.map((s) => s.name),
    ['Baseline', 'Stress', 'Spike']
  );
  assert.ok(seeds[2].concurrencyVUs > seeds[1].concurrencyVUs);
  assert.ok(seeds[1].concurrencyVUs > seeds[0].concurrencyVUs);
});

test('computeScenarioMetrics estimates duration and capped/uncapped throughput', () => {
  const seeds = createSeededBenchmarkScenarios();
  const baselineMetrics = computeScenarioMetrics(seeds[0]);
  const spikeMetrics = computeScenarioMetrics(seeds[2]);

  assert.equal(baselineMetrics.totalDurationSec, 210);
  assert.ok(baselineMetrics.estimatedPeakRps <= 900);
  assert.equal(spikeMetrics.totalDurationSec, 70);
  assert.ok(spikeMetrics.estimatedPeakRps > baselineMetrics.estimatedPeakRps);
});

test('buildComparisonMatrix marks max and min across compared scenarios', () => {
  const seeds = createSeededBenchmarkScenarios();
  const matrix = buildComparisonMatrix(seeds);
  const vuRow = matrix.find((r) => r.key === 'concurrencyVUs');
  assert.ok(vuRow);
  assert.equal(vuRow.values[0].isMin, true);
  assert.equal(vuRow.values[2].isMax, true);
});

test('buildBenchmarkScenarioFromConfig and applyBenchmarkScenarioToConfig roundtrip parameters', () => {
  const base = createDefaultPresetConfig();
  const captured = buildBenchmarkScenarioFromConfig({
    config: base,
    name: 'Canary Capture',
    profileTag: 'custom',
  });
  assert.equal(captured.name, 'Canary Capture');
  assert.equal(captured.concurrencyVUs, base.execution[0].concurrency);

  const modified = applyBenchmarkScenarioToConfig(base, {
    ...captured,
    concurrencyVUs: 1200,
    rampUpSec: 20,
    holdForSec: 90,
    p95SlaMs: 310,
    workerShards: 5,
  });

  assert.equal(modified.execution[0].concurrency, 1200);
  assert.equal(modified.execution[0].rampUpSec, 20);
  assert.equal(modified.distributed.quorumWorkers, 5);
  assert.equal(
    modified.sla.find((s) => s.metric === 'p95-response-time')?.threshold,
    310
  );
});

test('benchmark scenarios persist cleanly to StorageLike', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  const seeds = createSeededBenchmarkScenarios();
  saveBenchmarkScenarios(seeds.slice(0, 2), mockStorage);
  const loaded = loadBenchmarkScenarios(mockStorage);
  assert.equal(loaded.length, 2);
});
