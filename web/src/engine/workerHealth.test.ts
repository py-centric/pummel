import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultWorkers } from './distributedSim';
import { summarizeWorkerFleetHealth } from './workerHealth';

test('summarizeWorkerFleetHealth reports healthy when all workers are ready/running', () => {
  const workers = createDefaultWorkers();
  const health = summarizeWorkerFleetHealth(workers, 2);

  assert.equal(health.overallState, 'healthy');
  assert.equal(health.quorumMet, true);
  assert.equal(health.onlineCount, 3);
  assert.equal(health.offlineCount, 0);
  assert.ok(health.nodes.every((n) => n.isOnline && n.shouldPulse && n.stateLabel === 'Online'));
});

test('summarizeWorkerFleetHealth transitions to degraded and quorum-lost as nodes fail', () => {
  const workers = createDefaultWorkers();
  workers[0].status = 'degraded';
  workers[1].status = 'offline';

  const quorumTwo = summarizeWorkerFleetHealth(workers, 2);
  assert.equal(quorumTwo.overallState, 'degraded');
  assert.equal(quorumTwo.quorumMet, true);
  assert.equal(quorumTwo.degradedCount, 1);
  assert.equal(quorumTwo.offlineCount, 1);
  assert.equal(quorumTwo.nodes[1].shouldPulse, false);
  assert.equal(quorumTwo.nodes[1].stateLabel, 'Offline');

  workers[2].status = 'offline';
  const quorumLost = summarizeWorkerFleetHealth(workers, 2);
  assert.equal(quorumLost.overallState, 'quorum-lost');
  assert.equal(quorumLost.quorumMet, false);
  assert.equal(quorumLost.offlineCount, 2);
});
