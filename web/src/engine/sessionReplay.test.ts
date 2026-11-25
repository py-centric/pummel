import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReplayFrameAtIndex,
  createRecordedSessionFromRun,
  createSeededRecordedSessions,
  loadRecordedSessions,
  saveRecordedSessions,
} from './sessionReplay';
import { createDefaultPresetConfig } from './configEngine';
import {
  createInitialClusterState,
  startDistributedRun,
  stepDistributedRun,
} from './distributedSim';

test('createRecordedSessionFromRun captures full telemetry history, logs, and metadata', () => {
  const cfg = createDefaultPresetConfig();
  let state = startDistributedRun(createInitialClusterState(cfg), cfg);
  for (let i = 0; i < 4; i += 1) {
    state = stepDistributedRun(state, cfg, 1);
  }

  const recorded = createRecordedSessionFromRun({
    runState: state,
    config: cfg,
    clusterId: 'prod-eu-west',
    clusterName: 'EU-West Primary',
  });

  assert.equal(recorded.history.length, 4);
  assert.ok(recorded.logs.length > 0);
  assert.ok(recorded.totalRequests > 0);
  assert.equal(recorded.clusterName, 'EU-West Primary');

  const frame2 = buildReplayFrameAtIndex(recorded, 1);
  assert.equal(frame2.stepIndex, 1);
  assert.equal(frame2.historySlice.length, 2);
  assert.equal(frame2.elapsedSec, recorded.history[1].elapsedSec);
  assert.ok(frame2.logsSlice.every((l) => l.timestampSec <= frame2.elapsedSec));
});

test('seeded sessions and localStorage persistence round-trip cleanly', () => {
  const seeds = createSeededRecordedSessions();
  assert.ok(seeds.length >= 2);

  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  saveRecordedSessions(seeds, storage);
  const loaded = loadRecordedSessions(storage);
  assert.equal(loaded.length, seeds.length);
  assert.equal(loaded[0].id, seeds[0].id);
});
