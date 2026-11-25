import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLatencyHeatmapOverlay,
  captureRunHeatmapSnapshot,
  createSeededRunHeatmaps,
} from './latencyComparison';

test('buildLatencyHeatmapOverlay identifies regressed and improved endpoints between two test runs', () => {
  const [baseline, canary] = createSeededRunHeatmaps();
  const overlay = buildLatencyHeatmapOverlay(baseline, canary);

  assert.equal(overlay.rows.length, 4);
  assert.ok(overlay.regressedEndpoints >= 2);
  assert.ok(overlay.avgP95DeltaMs > 0);

  const checkout = overlay.rows.find((r) => r.label === 'POST /v1/checkout');
  assert.equal(checkout?.status, 'regressed');
  assert.ok((checkout?.p95DeltaMs ?? 0) > 80);

  const slowBucketCell = checkout?.cells[4]; // 150-250ms
  assert.equal(slowBucketCell?.direction, 'regression');
  assert.ok((slowBucketCell?.deltaSharePct ?? 0) > 0);

  const catalog = overlay.rows.find((r) => r.label === 'GET /v1/catalog');
  assert.equal(catalog?.status, 'improved');
});

test('captureRunHeatmapSnapshot buckets endpoint timings into normalized percentages', () => {
  const captured = captureRunHeatmapSnapshot({
    label: 'Live Capture',
    clusterName: 'EU-West Primary',
    targetConcurrency: 500,
    globalP95Ms: 95,
    globalP99Ms: 140,
    endpoints: [
      {
        label: 'GET /health',
        protocol: 'http',
        totalRequests: 4,
        failedRequests: 0,
        timingsMs: [12, 18, 42, 180],
        avgMs: 63,
        p50Ms: 18,
        p90Ms: 180,
        p95Ms: 180,
        p99Ms: 180,
        currentRps: 4,
      },
    ],
  });

  assert.equal(captured.endpoints.length, 1);
  assert.equal(captured.endpoints[0].bucketSharesPct[0], 50); // 12ms, 18ms in 0-25ms
  assert.equal(captured.endpoints[0].bucketSharesPct[1], 25); // 42ms in 25-50ms
  assert.equal(captured.endpoints[0].bucketSharesPct[4], 25); // 180ms in 150-250ms
});
