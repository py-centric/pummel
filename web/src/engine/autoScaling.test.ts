import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAutoScaleAction,
  DEFAULT_AUTO_SCALE_CONFIG,
  evaluateAutoScaling,
} from './autoScaling';
import { createDefaultPresetConfig } from './configEngine';
import { createInitialClusterState } from './distributedSim';

test('evaluateAutoScaling triggers scale_up when RPS meets threshold and cooldown elapsed', () => {
  const result = evaluateAutoScaling({
    config: {
      ...DEFAULT_AUTO_SCALE_CONFIG,
      enabled: true,
      scaleUpRpsThreshold: 1200,
      maxWorkers: 6,
      scaleStep: 1,
      cooldownSec: 5,
    },
    currentOnlineWorkers: 3,
    currentTotalWorkers: 3,
    currentRps: 1450,
    elapsedSec: 12,
    lastScaleAtElapsedSec: 4,
  });

  assert.equal(result.action, 'scale_up');
  assert.equal(result.deltaWorkers, 1);
  assert.equal(result.targetWorkerCount, 4);
});

test('evaluateAutoScaling respects cooldown and maxWorkers cap', () => {
  const blockedCooldown = evaluateAutoScaling({
    config: { ...DEFAULT_AUTO_SCALE_CONFIG, enabled: true, cooldownSec: 5 },
    currentOnlineWorkers: 3,
    currentTotalWorkers: 3,
    currentRps: 2400,
    elapsedSec: 10,
    lastScaleAtElapsedSec: 7,
  });
  assert.equal(blockedCooldown.action, 'none');

  const blockedCap = evaluateAutoScaling({
    config: { ...DEFAULT_AUTO_SCALE_CONFIG, enabled: true, maxWorkers: 3 },
    currentOnlineWorkers: 3,
    currentTotalWorkers: 3,
    currentRps: 2400,
    elapsedSec: 20,
    lastScaleAtElapsedSec: null,
  });
  assert.equal(blockedCap.action, 'none');
});

test('applyAutoScaleAction provisions worker, rebalances VUs, and scales back down', () => {
  const cfg = createDefaultPresetConfig();
  const initial = createInitialClusterState(cfg);

  const upEval = evaluateAutoScaling({
    config: {
      ...DEFAULT_AUTO_SCALE_CONFIG,
      enabled: true,
      scaleUpRpsThreshold: 1000,
      maxWorkers: 5,
    },
    currentOnlineWorkers: initial.workers.length,
    currentTotalWorkers: initial.workers.length,
    currentRps: 1300,
    elapsedSec: 10,
    lastScaleAtElapsedSec: null,
  });

  const upOut = applyAutoScaleAction({
    evaluation: upEval,
    workers: initial.workers,
    targetConcurrency: initial.targetConcurrency,
    shardStrategy: cfg.distributed.shardStrategy,
    elapsedSec: 10,
    currentRps: 1300,
    isRunning: true,
  });

  assert.equal(upOut.workers.length, initial.workers.length + 1);
  assert.ok(upOut.workers.some((w) => w.id.startsWith('worker-autoscale-')));
  assert.ok(upOut.logEntry?.message.includes('Auto-scaled UP'));
  const sumAssigned = upOut.workers.reduce((s, w) => s + w.assignedVUs, 0);
  assert.equal(sumAssigned, initial.targetConcurrency);

  const downEval = evaluateAutoScaling({
    config: {
      ...DEFAULT_AUTO_SCALE_CONFIG,
      enabled: true,
      minWorkers: 2,
      scaleDownRpsThreshold: 400,
    },
    currentOnlineWorkers: upOut.workers.length,
    currentTotalWorkers: upOut.workers.length,
    currentRps: 250,
    elapsedSec: 25,
    lastScaleAtElapsedSec: 10,
  });

  const downOut = applyAutoScaleAction({
    evaluation: downEval,
    workers: upOut.workers,
    targetConcurrency: initial.targetConcurrency,
    shardStrategy: cfg.distributed.shardStrategy,
    elapsedSec: 25,
    currentRps: 250,
    isRunning: true,
  });

  assert.equal(downOut.workers.length, initial.workers.length);
  assert.ok(downOut.logEntry?.message.includes('Auto-scaled DOWN'));
});
