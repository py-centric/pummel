import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSideBySideDiff, filterSideBySideRows } from './snapshotDiff';

test('buildSideBySideDiff pairs modified lines horizontally and counts added/removed rows', () => {
  const baseSnap = {
    rawText: [
      'name: "Baseline Checkout"',
      'execution:',
      '  - scenario: checkout',
      '    concurrency: 600',
      '    hold-for: "60s"',
    ].join('\n'),
    concurrency: 600,
    scenarioCount: 1,
  };

  const targetSnap = {
    rawText: [
      'name: "Spike Checkout"',
      'execution:',
      '  - scenario: checkout',
      '    concurrency: 1400',
      '    hold-for: "60s"',
      '    ramp-up: "10s"',
    ].join('\n'),
    concurrency: 1400,
    scenarioCount: 2,
  };

  const diff = buildSideBySideDiff(baseSnap, targetSnap);

  assert.equal(diff.summary.isIdentical, false);
  assert.equal(diff.summary.modifiedCount, 2);
  assert.equal(diff.summary.addedCount, 1);
  assert.equal(diff.summary.removedCount, 0);
  assert.equal(diff.summary.unchangedCount, 3);
  assert.equal(diff.summary.concurrencyDelta, 800);
  assert.equal(diff.summary.scenarioDelta, 1);

  const concurrencyRow = diff.rows.find(
    (r) => r.leftText?.includes('concurrency: 600')
  );
  assert.ok(concurrencyRow);
  assert.equal(concurrencyRow.kind, 'modified');
  assert.equal(concurrencyRow.rightText, '    concurrency: 1400');

  const addedRow = diff.rows.find((r) => r.rightText?.includes('ramp-up: "10s"'));
  assert.ok(addedRow);
  assert.equal(addedRow.kind, 'added');
  assert.equal(addedRow.leftLineNumber, null);
  assert.equal(addedRow.rightLineNumber, 6);
});

test('buildSideBySideDiff detects identical snapshots cleanly', () => {
  const yaml = 'name: "Same"\nconcurrency: 200';
  const diff = buildSideBySideDiff(yaml, yaml);

  assert.equal(diff.summary.isIdentical, true);
  assert.equal(diff.summary.changedRowCount, 0);
  assert.equal(diff.summary.unchangedCount, 2);
});

test('filterSideBySideRows returns only changed rows when onlyChanges is true', () => {
  const diff = buildSideBySideDiff(
    'line1\nline2: old\nline3',
    'line1\nline2: new\nline3\nline4: added'
  );

  const allRows = filterSideBySideRows(diff.rows, false);
  const changedOnly = filterSideBySideRows(diff.rows, true);

  assert.equal(allRows.length, 4);
  assert.equal(changedOnly.length, 2);
  assert.ok(changedOnly.every((r) => r.kind !== 'unchanged'));
});
