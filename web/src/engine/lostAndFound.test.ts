import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeededFoundItems,
  createSeededMissingReports,
  loadFoundItems,
  parseDataUrlBase64,
  saveFoundItems,
  validateGeminiMatchCandidates,
} from './lostAndFound';

test('parseDataUrlBase64 extracts mimeType and base64 payload safely', () => {
  const valid = parseDataUrlBase64('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  assert.deepEqual(valid, {
    mimeType: 'image/jpeg',
    data: '/9j/4AAQSkZJRg==',
  });
  assert.equal(parseDataUrlBase64('not-an-image'), null);
  assert.equal(parseDataUrlBase64(undefined), null);
});

test('validateGeminiMatchCandidates filters invalid IDs, deduplicates pairs, and sorts by confidence', () => {
  const foundIds = new Set(['found-101', 'found-102']);
  const missingIds = new Set(['miss-201', 'miss-202']);

  const validated = validateGeminiMatchCandidates(
    [
      {
        foundItemId: 'found-101',
        missingReportId: 'miss-201',
        confidencePct: 72,
        reason: 'Matches bottle description.',
        visualEvidence: 'Planet stickers on navy bottle.',
      },
      {
        foundItemId: 'found-101',
        missingReportId: 'miss-201',
        confidencePct: 90,
        reason: 'Duplicate pair should be ignored.',
      },
      {
        foundItemId: 'unknown-id',
        missingReportId: 'miss-202',
        confidencePct: 99,
        reason: 'Invalid found ID.',
      },
      {
        foundItemId: 'found-102',
        missingReportId: 'miss-202',
        confidencePct: 96,
        reason: 'Exact TI-84 Plus CE model and etched M.T. initials.',
        visualEvidence: 'Black case and initials match.',
      },
    ],
    foundIds,
    missingIds,
    '2026-11-22T00:00:00.000Z'
  );

  assert.equal(validated.length, 2);
  assert.equal(validated[0].foundItemId, 'found-102');
  assert.equal(validated[0].confidencePct, 96);
  assert.equal(validated[1].foundItemId, 'found-101');
});

test('seeded items load and persist cleanly in StorageLike', () => {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  const seeds = createSeededFoundItems();
  const missing = createSeededMissingReports();
  assert.ok(seeds.length >= 3);
  assert.ok(missing.length >= 2);

  saveFoundItems(seeds, storage);
  const reloaded = loadFoundItems(storage);
  assert.equal(reloaded.length, seeds.length);
  assert.equal(reloaded[0].id, seeds[0].id);
});
