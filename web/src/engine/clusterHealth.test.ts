import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkerNode } from '../types/pummel';
import {
  computeClusterHealthSummary,
  computeWorkerHealthSnapshot,
} from './clusterHealth';

function makeWorker(overrides: Partial<WorkerNode> = {}): WorkerNode {
  return {
    id: 'worker-eu-west-01',
    hostname: 'pummel-wrk-01.internal',
    region: 'eu-west-2',
    grpcEndpoint: '10.42.1.11:50052',
    cpuCores: 16,
    capacityWeight: 2,
    assignedVUs: 240,
    activeVUs: 240,
    currentRps: 720,
    avgLatencyMs: 36.2,
    errorRatePct: 0.3,
    cpuUsagePct: 48,
    memoryMb: 280,
    lastHeartbeatMs: 14,
    status: 'running',
    ...overrides,
  };
}

test('computeWorkerHealthSnapshot classifies healthy, CPU bottleneck, network bottleneck, and offline nodes', () => {
  const healthy = computeWorkerHealthSnapshot(makeWorker({ cpuUsagePct: 38, memoryMb: 220, currentRps: 350 }));
  assert.equal(healthy.severity, 'healthy');
  assert.equal(healthy.bottleneckResource, null);
  assert.ok(healthy.networkMbps > 0);
  assert.equal(Number((healthy.txMbps + healthy.rxMbps).toFixed(1)), healthy.networkMbps);

  const cpuHot = computeWorkerHealthSnapshot(makeWorker({ cpuUsagePct: 89, memoryMb: 260, currentRps: 400 }));
  assert.equal(cpuHot.severity, 'bottleneck');
  assert.equal(cpuHot.bottleneckResource, 'CPU');
  assert.match(cpuHot.diagnosis, /CPU saturation/i);

  const netHot = computeWorkerHealthSnapshot(
    makeWorker({ cpuCores: 8, cpuUsagePct: 52, memoryMb: 210, currentRps: 980, activeVUs: 280 })
  );
  assert.equal(netHot.severity, 'bottleneck');
  assert.equal(netHot.bottleneckResource, 'NET');
  assert.match(netHot.diagnosis, /NIC saturation/i);

  const offline = computeWorkerHealthSnapshot(makeWorker({ status: 'offline' }));
  assert.equal(offline.severity, 'offline');
  assert.equal(offline.bottleneckResource, 'OFFLINE');
  assert.equal(offline.cpuPct, 0);
  assert.equal(offline.ramPct, 0);
  assert.equal(offline.networkMbps, 0);
});

test('computeClusterHealthSummary aggregates online averages, totals, and bottleneck counts', () => {
  const summary = computeClusterHealthSummary([
    makeWorker({ id: 'w1', cpuUsagePct: 40, memoryMb: 256, currentRps: 400 }),
    makeWorker({ id: 'w2', cpuUsagePct: 86, memoryMb: 512, currentRps: 600 }),
    makeWorker({ id: 'w3', status: 'offline' }),
  ]);

  assert.equal(summary.totalNodes, 3);
  assert.equal(summary.onlineNodes, 2);
  assert.equal(summary.offlineCount, 1);
  assert.equal(summary.bottleneckCount, 1);
  assert.equal(summary.avgCpuPct, 63);
  assert.equal(summary.peakCpuPct, 86);
  assert.ok(summary.totalNetworkMbps > 0);
});
