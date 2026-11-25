import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPresetConfig } from './configEngine';
import {
  TEST_CLUSTER_PROFILES,
  applyClusterTargetToConfig,
  buildClusterWorkers,
  createQuickRunStartLogs,
  getTestClusterById,
} from './testClusters';

test('getTestClusterById resolves known clusters and falls back to primary cluster', () => {
  const staging = getTestClusterById('staging-us-east');
  assert.equal(staging.id, 'staging-us-east');
  assert.equal(staging.coordinatorBind, '10.44.8.10:50051');

  const fallback = getTestClusterById('unknown-cluster-id');
  assert.equal(fallback.id, TEST_CLUSTER_PROFILES[0].id);
});

test('applyClusterTargetToConfig updates coordinator bind, TLS mode, and clamps quorum safely', () => {
  const base = createDefaultPresetConfig();
  base.distributed.quorumWorkers = 5;

  const canary = getTestClusterById('canary-ap-south');
  const updated = applyClusterTargetToConfig(base, canary);

  assert.equal(updated.distributed.coordinatorBind, canary.coordinatorBind);
  assert.equal(updated.distributed.tlsMode, 'mtls');
  assert.equal(updated.distributed.quorumWorkers, canary.workers.length);
  // Original config must not be mutated
  assert.equal(base.distributed.quorumWorkers, 5);
});

test('buildClusterWorkers and createQuickRunStartLogs produce worker nodes and dispatch logs', () => {
  const cluster = getTestClusterById('staging-us-east');
  const workers = buildClusterWorkers(cluster);
  assert.equal(workers.length, 3);
  assert.equal(workers[0].id, 'worker-stg-use1-01');
  assert.equal(workers[0].status, 'ready');

  const cfg = applyClusterTargetToConfig(createDefaultPresetConfig(), cluster);
  const logs = createQuickRunStartLogs({ config: cfg, cluster });
  assert.equal(logs.length, 2);
  assert.equal(logs[0].source, 'quick-run');
  assert.ok(logs[0].message.includes('US-East Staging'));
  assert.ok(logs[1].message.includes('worker-stg-use1-01'));
});
