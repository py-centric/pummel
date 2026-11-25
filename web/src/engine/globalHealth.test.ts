import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClusterWorkers, TEST_CLUSTER_PROFILES } from './testClusters';
import { buildGlobalClusterHealth } from './globalHealth';

test('buildGlobalClusterHealth aggregates infrastructure capacity across all configured clusters', () => {
  const activeProfile = TEST_CLUSTER_PROFILES[0];
  const activeWorkers = buildClusterWorkers(activeProfile).map((w) => ({
    ...w,
    status: 'running' as const,
    activeVUs: 200,
    assignedVUs: 200,
    currentRps: 600,
    cpuUsagePct: 55,
    memoryMb: 320,
  }));

  const global = buildGlobalClusterHealth({
    profiles: TEST_CLUSTER_PROFILES,
    activeClusterId: activeProfile.id,
    activeWorkers,
    activeRunStatus: 'running',
    activeRps: 1800,
    chaosFaultActive: false,
  });

  assert.equal(global.totalClusters, TEST_CLUSTER_PROFILES.length);
  assert.equal(global.healthyClusters, TEST_CLUSTER_PROFILES.length);
  assert.equal(global.degradedClusters, 0);
  assert.ok(global.totalCpuCores > 0);
  assert.ok(global.totalMaxVuCapacity >= global.totalActiveVUs);
  assert.ok(global.aggregateRps >= 1800);
  assert.equal(global.clusters.filter((c) => c.isActiveTarget).length, 1);
});

test('buildGlobalClusterHealth flags degraded cluster when an active worker goes offline', () => {
  const activeProfile = TEST_CLUSTER_PROFILES[1];
  const workers = buildClusterWorkers(activeProfile);
  workers[0].status = 'offline';

  const global = buildGlobalClusterHealth({
    profiles: TEST_CLUSTER_PROFILES,
    activeClusterId: activeProfile.id,
    activeWorkers: workers,
    activeRunStatus: 'running',
    activeRps: 900,
    chaosFaultActive: false,
  });

  assert.equal(global.degradedClusters, 1);
  assert.equal(global.onlineWorkers, global.totalWorkers - 1);
  const activeRow = global.clusters.find((c) => c.clusterId === activeProfile.id);
  assert.equal(activeRow?.operationalState, 'degraded');
});
