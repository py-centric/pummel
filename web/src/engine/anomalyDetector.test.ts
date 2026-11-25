import test from 'node:test';
import assert from 'node:assert/strict';
import type { TelemetryPoint } from '../types/pummel';
import {
  analyzeTelemetryAnomalies,
  createAnomalyLogEntry,
  DEFAULT_ANOMALY_CONFIG,
} from './anomalyDetector';

function makeBaselineHistory(): TelemetryPoint[] {
  return [
    { elapsedSec: 1, rps: 1200, activeVUs: 400, avgMs: 42, p95Ms: 78, p99Ms: 96, failRatePct: 0.2 },
    { elapsedSec: 2, rps: 1220, activeVUs: 400, avgMs: 44, p95Ms: 81, p99Ms: 99, failRatePct: 0.2 },
    { elapsedSec: 3, rps: 1190, activeVUs: 400, avgMs: 41, p95Ms: 79, p99Ms: 95, failRatePct: 0.3 },
    { elapsedSec: 4, rps: 1210, activeVUs: 400, avgMs: 43, p95Ms: 82, p99Ms: 101, failRatePct: 0.2 },
    { elapsedSec: 5, rps: 1205, activeVUs: 400, avgMs: 42, p95Ms: 80, p99Ms: 98, failRatePct: 0.2 },
  ];
}

test('analyzeTelemetryAnomalies flags sharp p95 latency spikes and throughput drops against moving average', () => {
  const history: TelemetryPoint[] = [
    ...makeBaselineHistory(),
    {
      elapsedSec: 6,
      rps: 540,
      activeVUs: 400,
      avgMs: 145,
      p95Ms: 265,
      p99Ms: 340,
      failRatePct: 4.5,
    },
  ];

  const analysis = analyzeTelemetryAnomalies(history, DEFAULT_ANOMALY_CONFIG);
  assert.equal(analysis.points.length, 6);
  assert.equal(analysis.anomalies.length, 2);

  const spikePoint = analysis.points[5];
  assert.equal(spikePoint.p95AnomalyValue, 265);
  assert.equal(spikePoint.rpsAnomalyValue, 540);
  assert.ok(spikePoint.p95MovingAvg !== null && spikePoint.p95MovingAvg < 90);
  assert.ok(spikePoint.anomalyReason?.includes('p95 latency outlier'));

  const logEntry = createAnomalyLogEntry(analysis.anomalies[0]);
  assert.equal(logEntry.source, 'anomaly-detector');
  assert.equal(logEntry.level, 'WARN');
  assert.match(logEntry.message, /Anomaly detected/i);
});

test('analyzeTelemetryAnomalies produces zero anomalies on steady baseline or when disabled', () => {
  const steady = makeBaselineHistory();
  const res = analyzeTelemetryAnomalies(steady, DEFAULT_ANOMALY_CONFIG);
  assert.equal(res.anomalies.length, 0);
  assert.equal(res.latestAnomaly, null);

  const disabledRes = analyzeTelemetryAnomalies(
    [
      ...steady,
      { elapsedSec: 6, rps: 300, activeVUs: 400, avgMs: 200, p95Ms: 420, p99Ms: 510, failRatePct: 9 },
    ],
    { ...DEFAULT_ANOMALY_CONFIG, enabled: false }
  );
  assert.equal(disabledRes.anomalies.length, 0);
});
