import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TIMINGS,
  appendBoundedTimings,
  calculatePercentile,
  createDefaultWorkers,
  createInitialClusterState,
  distributeVUs,
  evaluateSlaCriteria,
  startDistributedRun,
  stepDistributedRun,
  stopDistributedRun,
} from './distributedSim';
import { createDefaultPresetConfig } from './configEngine';

test('distributeVUs allocates exact total concurrency using weighted-capacity and excludes offline nodes', () => {
  const workers = createDefaultWorkers(); // weights: 2, 2, 1
  const allocated = distributeVUs(500, workers, 'weighted-capacity');
  assert.equal(allocated[0].assignedVUs, 200);
  assert.equal(allocated[1].assignedVUs, 200);
  assert.equal(allocated[2].assignedVUs, 100);

  workers[2].status = 'offline';
  const rebalanced = distributeVUs(500, workers, 'weighted-capacity');
  assert.equal(rebalanced[0].assignedVUs, 250);
  assert.equal(rebalanced[1].assignedVUs, 250);
  assert.equal(rebalanced[2].assignedVUs, 0);
});

test('appendBoundedTimings enforces MAX_TIMINGS (10,000) memory bound (NFR-PERF-02)', () => {
  const existing = Array.from({ length: 9_990 }, (_, i) => i + 1);
  const incoming = Array.from({ length: 50 }, (_, i) => 10_000 + i);
  const bounded = appendBoundedTimings(existing, incoming);
  assert.equal(bounded.length, MAX_TIMINGS);
  assert.equal(bounded[bounded.length - 1], 10_049);
  assert.equal(bounded[0], 41);
});

test('calculatePercentile computes accurate p50, p95, p99 latencies', () => {
  const samples = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(calculatePercentile(samples, 50), 50);
  assert.equal(calculatePercentile(samples, 95), 95);
  assert.equal(calculatePercentile(samples, 99), 99);
  assert.equal(calculatePercentile([], 95), 0);
});

test('SLA stop breach aborts distributed run and guarantees chaos shutdown hook execution (NFR-REL-03)', () => {
  const config = createDefaultPresetConfig();
  config.sla = [
    {
      id: 'strict-fail',
      metric: 'fail-rate',
      comparator: '>',
      threshold: 2.0,
      unit: '%',
      action: 'stop',
    },
  ];
  let state = createInitialClusterState(config);
  state.chaosFaultActive = true; // triggers >2% failure rate
  state = startDistributedRun(state, config);
  assert.equal(state.status, 'running');

  // Step until SLA stop triggers
  for (let i = 0; i < 5; i += 1) {
    if (state.status !== 'running') break;
    state = stepDistributedRun(state, config, 1);
  }

  assert.equal(state.status, 'aborted_sla');
  assert.equal(state.activeVUs, 0);
  const shutdownHooks = state.hookExecutions.filter((h) => h.phase === 'shutdown');
  assert.ok(shutdownHooks.length > 0);
  assert.ok(shutdownHooks.every((h) => h.status === 'completed'));
});

test('evaluateSlaCriteria evaluates global and subject-scoped metrics', () => {
  const results = evaluateSlaCriteria(
    [
      { id: 'g1', metric: 'p95-response-time', comparator: '>', threshold: 100, unit: 'ms', action: 'warn' },
      { id: 'e1', metric: 'fail-rate', comparator: '>', threshold: 5, unit: '%', subject: 'POST /pay', action: 'stop' },
    ],
    { failRatePct: 1, avgMs: 50, p90Ms: 90, p95Ms: 140, p99Ms: 200, throughputRps: 500 },
    [
      {
        label: 'POST /pay',
        protocol: 'http',
        totalRequests: 100,
        failedRequests: 8,
        timingsMs: [50, 80],
        avgMs: 65,
        p50Ms: 50,
        p90Ms: 80,
        p95Ms: 80,
        p99Ms: 80,
        currentRps: 20,
      },
    ]
  );

  assert.equal(results[0].breached, true);
  assert.equal(results[1].breached, true);
  assert.equal(results[1].currentValue, 8);
});

test('stopDistributedRun transitions workers back to ready and runs shutdown hooks', () => {
  const config = createDefaultPresetConfig();
  let state = createInitialClusterState(config);
  state = startDistributedRun(state, config);
  state = stepDistributedRun(state, config, 1);
  state = stopDistributedRun(state, 'user');
  assert.equal(state.status, 'completed');
  assert.equal(state.activeVUs, 0);
  assert.ok(state.hookExecutions.filter((h) => h.phase === 'shutdown').every((h) => h.status === 'completed'));
});
