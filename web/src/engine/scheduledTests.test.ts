import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineLocalDateAndTime,
  computeNextScheduledIso,
  createScheduledTestTask,
  findDueScheduledTests,
  formatCountdownLabel,
  loadScheduledTestsFromStorage,
  markScheduledTaskExecuted,
  saveScheduledTestsToStorage,
  SCHEDULED_TESTS_STORAGE_KEY,
  type StorageLike,
} from './scheduledTests';

test('combineLocalDateAndTime validates date/time inputs and returns ISO timestamp', () => {
  const valid = combineLocalDateAndTime('2026-11-23', '09:30');
  assert.equal(valid.error, undefined);
  assert.ok(valid.iso && !Number.isNaN(Date.parse(valid.iso)));

  const emptyDate = combineLocalDateAndTime('', '09:30');
  assert.ok(emptyDate.error);

  const invalidDay = combineLocalDateAndTime('2026-02-31', '12:00');
  assert.ok(invalidDay.error);
});

test('computeNextScheduledIso advances recurring tasks and returns null for one-time tasks', () => {
  const baseIso = '2026-11-22T10:00:00.000Z';
  const refMs = Date.parse('2026-11-22T10:05:00.000Z');

  assert.equal(computeNextScheduledIso(baseIso, 'once', refMs), null);
  assert.equal(computeNextScheduledIso(baseIso, 'hourly', refMs), '2026-11-22T11:00:00.000Z');
  assert.equal(computeNextScheduledIso(baseIso, 'daily', refMs), '2026-11-23T10:00:00.000Z');
  assert.equal(computeNextScheduledIso(baseIso, 'weekly', refMs), '2026-11-29T10:00:00.000Z');
});

test('findDueScheduledTests and markScheduledTaskExecuted handle due detection and recurring rollover', () => {
  const dueTime = '2026-11-22T10:00:00.000Z';
  const futureTime = '2026-11-22T12:00:00.000Z';
  const nowMs = Date.parse('2026-11-22T10:01:00.000Z');

  const dailyTask = createScheduledTestTask({
    label: 'Daily Regression',
    specName: 'Checkout API',
    format: 'yaml',
    rawText: 'name: Checkout API',
    concurrency: 600,
    clusterId: 'staging-us-east',
    clusterName: 'US-East Staging',
    scheduledAtIso: dueTime,
    recurrence: 'daily',
  });

  const onceTask = createScheduledTestTask({
    label: 'One-off Smoke',
    specName: 'Smoke',
    format: 'yaml',
    rawText: 'name: Smoke',
    concurrency: 50,
    clusterId: 'local-dev-mesh',
    clusterName: 'Local Sandbox Mesh',
    scheduledAtIso: dueTime,
    recurrence: 'once',
  });

  const futureTask = createScheduledTestTask({
    label: 'Later Spike',
    specName: 'Spike',
    format: 'yaml',
    rawText: 'name: Spike',
    concurrency: 1200,
    clusterId: 'prod-eu-west',
    clusterName: 'EU-West Primary',
    scheduledAtIso: futureTime,
    recurrence: 'weekly',
  });

  const due = findDueScheduledTests([dailyTask, onceTask, futureTask], nowMs);
  assert.equal(due.length, 2);

  const afterDaily = markScheduledTaskExecuted(dailyTask, nowMs);
  assert.equal(afterDaily.runCount, 1);
  assert.equal(afterDaily.enabled, true);
  assert.equal(afterDaily.scheduledAtIso, '2026-11-23T10:00:00.000Z');

  const afterOnce = markScheduledTaskExecuted(onceTask, nowMs);
  assert.equal(afterOnce.runCount, 1);
  assert.equal(afterOnce.enabled, false);
});

test('localStorage persistence round-trips scheduled tasks and filters corrupt entries', () => {
  const backing = new Map<string, string>();
  const mockStorage: StorageLike = {
    getItem: (k) => backing.get(k) ?? null,
    setItem: (k, v) => {
      backing.set(k, v);
    },
  };

  const task = createScheduledTestTask({
    label: 'Nightly Canary',
    specName: 'Canary Load',
    format: 'yaml',
    rawText: 'name: Canary Load',
    concurrency: 400,
    clusterId: 'canary-ap-south',
    clusterName: 'AP-South Canary',
    scheduledAtIso: '2026-11-23T02:00:00.000Z',
    recurrence: 'daily',
  });

  assert.equal(saveScheduledTestsToStorage([task], mockStorage), true);
  assert.ok(backing.has(SCHEDULED_TESTS_STORAGE_KEY));

  const restored = loadScheduledTestsFromStorage(mockStorage);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].label, 'Nightly Canary');
  assert.equal(restored[0].recurrence, 'daily');

  assert.equal(
    formatCountdownLabel('2026-11-22T11:30:00.000Z', Date.parse('2026-11-22T10:00:00.000Z')),
    'in 1h 30m'
  );
  assert.equal(
    formatCountdownLabel('2026-11-22T09:50:00.000Z', Date.parse('2026-11-22T10:00:00.000Z')),
    'Due now'
  );
});
