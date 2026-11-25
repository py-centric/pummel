import test from 'node:test';
import assert from 'node:assert/strict';
import type { EndpointMetrics } from '../types/pummel';
import {
  buildLatencyHeatmap,
  LATENCY_HEATMAP_BUCKETS,
  resolveLatencyBucketIndex,
} from './latencyHeatmap';

const SAMPLE_ENDPOINTS: EndpointMetrics[] = [
  {
    label: 'POST /v1/auth/session',
    protocol: 'http',
    totalRequests: 100,
    failedRequests: 1,
    timingsMs: [18, 22, 42, 48, 65, 80, 95, 130, 210, 340],
    avgMs: 105,
    p50Ms: 72.5,
    p90Ms: 210,
    p95Ms: 275,
    p99Ms: 340,
    currentRps: 50,
  },
  {
    label: 'gRPC OrderService/ReserveInventory',
    protocol: 'grpc',
    totalRequests: 50,
    failedRequests: 0,
    timingsMs: [12, 16, 19, 28, 34],
    avgMs: 21.8,
    p50Ms: 19,
    p90Ms: 34,
    p95Ms: 34,
    p99Ms: 34,
    currentRps: 25,
  },
];

test('resolveLatencyBucketIndex maps values accurately across open and closed bounds', () => {
  assert.equal(resolveLatencyBucketIndex(0), 0);
  assert.equal(resolveLatencyBucketIndex(24.9), 0);
  assert.equal(resolveLatencyBucketIndex(25), 1);
  assert.equal(resolveLatencyBucketIndex(199.9), 4);
  assert.equal(resolveLatencyBucketIndex(200), 5);
  assert.equal(resolveLatencyBucketIndex(550), LATENCY_HEATMAP_BUCKETS.length - 1);
});

test('buildLatencyHeatmap bins frequencies across endpoints and flags tail outliers', () => {
  const matrix = buildLatencyHeatmap(SAMPLE_ENDPOINTS, {
    scaleMode: 'global',
    outlierThresholdMs: 180,
  });

  assert.equal(matrix.rows.length, 2);
  assert.equal(matrix.totalSamples, 15);
  assert.equal(matrix.maxCellCount, 3); // gRPC has 3 samples in 0-25ms

  const httpRow = matrix.rows[0];
  assert.equal(httpRow.p95Ms, 275);
  assert.equal(httpRow.p99Ms, 340);
  assert.equal(httpRow.cells[0].count, 2); // 18, 22
  assert.equal(httpRow.cells[5].count, 1); // 210 (200-300ms)
  assert.equal(httpRow.cells[5].isOutlier, true);
  assert.equal(httpRow.cells[6].count, 1); // 340 (300ms+)
  assert.equal(httpRow.cells[6].isOutlier, true);
  assert.equal(httpRow.outlierCount, 2);

  const grpcRow = matrix.rows[1];
  assert.equal(grpcRow.cells[0].count, 3);
  assert.equal(grpcRow.cells[0].intensity, 1);
  assert.equal(grpcRow.outlierCount, 0);
});

test('buildLatencyHeatmap supports row-normalized scale mode', () => {
  const matrix = buildLatencyHeatmap(SAMPLE_ENDPOINTS, { scaleMode: 'row' });
  const httpRow = matrix.rows[0];
  // HTTP max cell count is 3 (50-100ms has 65, 80, 95) -> intensity 1.0
  assert.equal(httpRow.cells[2].count, 3);
  assert.equal(httpRow.cells[2].intensity, 1);
});
