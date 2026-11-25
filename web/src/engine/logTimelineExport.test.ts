import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLogTimelineExportArtifact } from './logTimelineExport';
import type { RunLogEntry } from '../types/pummel';

const SAMPLE_LOGS: RunLogEntry[] = [
  {
    id: 'l2',
    timestampSec: 8,
    level: 'SLA',
    source: 'sla-guard',
    message: 'SLA breach: p95 latency 240.0ms > 200ms on "POST /v1/checkout", action=stop',
  },
  {
    id: 'l1',
    timestampSec: 1,
    level: 'GRPC',
    source: 'coordinator',
    message: 'Started distributed run across 3 workers.',
  },
];

test('buildLogTimelineExportArtifact builds escaped CSV containing timeline events and logs', () => {
  const artifact = buildLogTimelineExportArtifact({
    logs: SAMPLE_LOGS,
    elapsedSec: 10,
    specName: 'Checkout API',
    clusterName: 'EU-West Primary',
    format: 'csv',
  });

  assert.equal(artifact.format, 'csv');
  assert.ok(artifact.filename.endsWith('-logs-timeline.csv'));
  assert.equal(artifact.logCount, 2);
  assert.ok(artifact.timelineEventCount >= 2);
  assert.ok(artifact.content.includes('timeline_event'));
  assert.ok(artifact.content.includes('execution_log'));
  assert.ok(artifact.content.includes('"SLA breach: p95 latency 240.0ms > 200ms on ""POST /v1/checkout"", action=stop"'));
});

test('buildLogTimelineExportArtifact builds valid JSON report with metadata and arrays', () => {
  const artifact = buildLogTimelineExportArtifact({
    logs: SAMPLE_LOGS,
    elapsedSec: 10,
    specName: 'Checkout API',
    clusterName: 'EU-West Primary',
    sessionLabel: 'Regression #42',
    format: 'json',
  });

  assert.equal(artifact.format, 'json');
  assert.ok(artifact.filename.endsWith('-logs-timeline.json'));
  const parsed = JSON.parse(artifact.content);
  assert.equal(parsed.schema, 'pummel.logs-timeline.v1');
  assert.equal(parsed.metadata.sessionLabel, 'Regression #42');
  assert.equal(parsed.executionLogs.length, 2);
  assert.ok(parsed.timelineEvents.length >= 2);
});
