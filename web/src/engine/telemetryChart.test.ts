import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTelemetryChartSummary } from './telemetryChart';

test('buildTelemetryChartSummary handles empty history and extracts global p95 SLA threshold', () => {
  const summary = buildTelemetryChartSummary([], [
    { id: 's1', metric: 'p95-response-time', comparator: '>', threshold: 180, unit: 'ms', action: 'warn' },
  ]);
  assert.equal(summary.points.length, 0);
  assert.equal(summary.peakRps, 0);
  assert.equal(summary.peakP99Ms, 0);
  assert.equal(summary.p95SlaThresholdMs, 180);
});

test('buildTelemetryChartSummary computes throughput and multi-percentile latency summaries', () => {
  const summary = buildTelemetryChartSummary(
    [
      { elapsedSec: 1, rps: 120, activeVUs: 40, avgMs: 48.2, p95Ms: 85.44, p99Ms: 112.3, failRatePct: 0.1 },
      { elapsedSec: 2, rps: 360, activeVUs: 120, avgMs: 74.6, p95Ms: 142.87, p99Ms: 196.4, failRatePct: 0.45 },
      { elapsedSec: 3, rps: 420, activeVUs: 160, avgMs: 68.1, p95Ms: 131.2, p99Ms: 175.8, failRatePct: 0.25 },
    ],
    [
      { id: 's1', metric: 'p95-response-time', comparator: '>', threshold: 200, unit: 'ms', action: 'warn' },
    ]
  );

  assert.equal(summary.points.length, 3);
  assert.equal(summary.points[0].timeLabel, 'T+1s');
  assert.equal(summary.peakRps, 420);
  assert.equal(summary.avgRps, 300);
  assert.equal(summary.peakP95Ms, 142.9);
  assert.equal(summary.peakP99Ms, 196.4);
  assert.equal(summary.latestRps, 420);
  assert.equal(summary.latestAvgMs, 68.1);
  assert.equal(summary.latestP95Ms, 131.2);
  assert.equal(summary.latestP99Ms, 175.8);
  assert.equal(summary.latestActiveVUs, 160);
  assert.equal(summary.p95SlaThresholdMs, 200);
});

test('buildTelemetryChartSummary derives deterministic avgMs and p99Ms fallbacks when omitted', () => {
  const summary = buildTelemetryChartSummary(
    [{ elapsedSec: 1, rps: 250, activeVUs: 80, p95Ms: 100, failRatePct: 0 }],
    []
  );
  assert.equal(summary.points[0].avgMs, 62);
  assert.equal(summary.points[0].p99Ms, 124);
  assert.equal(summary.p95SlaThresholdMs, null);
});
