import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPresetConfig } from './configEngine';
import { createInitialClusterState, startDistributedRun, stepDistributedRun } from './distributedSim';
import { buildPostRunAnalysisReport } from './postRunAnalysis';

test('buildPostRunAnalysisReport summarizes peak latency, throughput, error rate, and SLA compliance', () => {
  const cfg = createDefaultPresetConfig();
  let state = startDistributedRun(createInitialClusterState(cfg), cfg);
  for (let i = 0; i < 6; i += 1) {
    state = stepDistributedRun(state, cfg, 1);
  }
  state = { ...state, status: 'completed' };

  const report = buildPostRunAnalysisReport({
    runState: state,
    config: cfg,
    clusterName: 'EU-West Primary',
  });

  assert.equal(report.clusterName, 'EU-West Primary');
  assert.equal(report.endStatus, 'completed');
  assert.ok(report.peakRps > 0);
  assert.ok(report.peakP95Ms > 0);
  assert.ok(report.peakP99Ms >= report.peakP95Ms);
  assert.equal(report.slaRows.length, cfg.sla.length);
  assert.equal(report.passedSlaCount + report.breachedSlaCount, cfg.sla.length);
});

test('buildPostRunAnalysisReport marks verdict failed when run aborted by SLA', () => {
  const cfg = createDefaultPresetConfig();
  const base = createInitialClusterState(cfg);
  const aborted = {
    ...base,
    status: 'aborted_sla' as const,
    totalRequests: 1000,
    totalFailures: 80,
    globalFailRatePct: 8.0,
    globalP95Ms: 420,
    globalP99Ms: 580,
    slaResults: base.slaResults.map((r, idx) =>
      idx === 0 ? { ...r, breached: true, breachCount: 3, currentValue: 420 } : r
    ),
  };

  const report = buildPostRunAnalysisReport({
    runState: aborted,
    config: cfg,
    clusterName: 'US-East Staging',
  });

  assert.equal(report.verdict, 'failed');
  assert.equal(report.errorRatePct, 8);
  assert.ok(report.breachedSlaCount >= 1);
});
