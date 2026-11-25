import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPresetConfig, serializeConfig } from './configEngine';
import {
  createSnapshotRecord,
  formatSnapshotTimestamp,
  sortSnapshotsNewestFirst,
} from './snapshotStore';

test('createSnapshotRecord extracts spec metadata and uses custom label', () => {
  const cfg = createDefaultPresetConfig();
  const yaml = serializeConfig(cfg, 'yaml');
  const snap = createSnapshotRecord({
    label: '  Baseline 600 VU  ',
    config: cfg,
    format: 'yaml',
    rawText: yaml,
    now: new Date('2026-11-21T10:15:30.000Z'),
  });

  assert.equal(snap.label, 'Baseline 600 VU');
  assert.equal(snap.specName, cfg.name);
  assert.equal(snap.format, 'yaml');
  assert.equal(snap.concurrency, 600);
  assert.equal(snap.scenarioCount, Object.keys(cfg.scenarios).length);
  assert.equal(snap.createdAt, '2026-11-21T10:15:30.000Z');
  assert.equal(snap.rawText, yaml);
});

test('createSnapshotRecord falls back to config name when label is blank', () => {
  const cfg = createDefaultPresetConfig();
  const snap = createSnapshotRecord({
    label: '   ',
    config: cfg,
    format: 'toml',
    rawText: serializeConfig(cfg, 'toml'),
    now: new Date('2026-11-21T11:00:00.000Z'),
  });

  assert.match(snap.label, /^Distributed Checkout & gRPC Fulfillment/);
  assert.equal(snap.format, 'toml');
});

test('sortSnapshotsNewestFirst orders snapshots in descending chronological order', () => {
  const cfg = createDefaultPresetConfig();
  const raw = serializeConfig(cfg, 'yaml');
  const older = createSnapshotRecord({
    label: 'Older',
    config: cfg,
    format: 'yaml',
    rawText: raw,
    now: new Date('2026-11-21T10:00:00.000Z'),
  });
  const newer = createSnapshotRecord({
    label: 'Newer',
    config: cfg,
    format: 'yaml',
    rawText: raw,
    now: new Date('2026-11-21T10:05:00.000Z'),
  });

  const sorted = sortSnapshotsNewestFirst([older, newer]);
  assert.equal(sorted[0].label, 'Newer');
  assert.equal(sorted[1].label, 'Older');
});

test('formatSnapshotTimestamp returns readable date for valid ISO and original string for invalid', () => {
  const formatted = formatSnapshotTimestamp('2026-11-21T10:15:30.000Z');
  assert.ok(formatted.length > 4);
  assert.equal(formatSnapshotTimestamp('not-a-date'), 'not-a-date');
});
