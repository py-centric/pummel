import test from 'node:test';
import assert from 'node:assert/strict';
import type { RunLogEntry } from '../types/pummel';
import {
  countLogsByLevel,
  filterExecutionLogs,
  formatLogsForClipboard,
  formatLogTimestamp,
} from './logStream';

const SAMPLE_LOGS: RunLogEntry[] = [
  {
    id: 'l-1',
    timestampSec: 0,
    level: 'GRPC',
    source: 'coordinator',
    message: 'Coordinator bound on 127.0.0.1:50051 with 3 workers.',
  },
  {
    id: 'l-2',
    timestampSec: 5,
    level: 'GRPC',
    source: 'worker-eu-west-01',
    message: 'Heartbeat ACK · 120/240 VUs · 384 rps · RTT 14ms',
  },
  {
    id: 'l-3',
    timestampSec: 12,
    level: 'WARN',
    source: 'worker-us-east-01',
    message: 'Node state degraded; elevated latency detected.',
  },
  {
    id: 'l-4',
    timestampSec: 65,
    level: 'SLA',
    source: 'sla-engine',
    message: 'BREACH [stop]: fail-rate exceeded 3.5%',
  },
  {
    id: 'l-5',
    timestampSec: 70,
    level: 'CHAOS',
    source: 'toxiproxy',
    message: 'Injected latency fault on checkout stream.',
  },
];

test('formatLogTimestamp pads minutes and seconds cleanly', () => {
  assert.equal(formatLogTimestamp(0), 'T+00:00');
  assert.equal(formatLogTimestamp(9), 'T+00:09');
  assert.equal(formatLogTimestamp(65), 'T+01:05');
  assert.equal(formatLogTimestamp(-4), 'T+00:00');
});

test('filterExecutionLogs filters by level and case-insensitive search query', () => {
  const grpcOnly = filterExecutionLogs(SAMPLE_LOGS, 'GRPC', '');
  assert.equal(grpcOnly.length, 2);

  const workerSearch = filterExecutionLogs(SAMPLE_LOGS, 'ALL', 'eu-west-01');
  assert.equal(workerSearch.length, 1);
  assert.equal(workerSearch[0].id, 'l-2');

  const combined = filterExecutionLogs(SAMPLE_LOGS, 'WARN', 'us-east');
  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, 'l-3');

  const timestampSearch = filterExecutionLogs(SAMPLE_LOGS, 'ALL', 'T+01:05');
  assert.equal(timestampSearch.length, 1);
  assert.equal(timestampSearch[0].id, 'l-4');
});

test('countLogsByLevel tallies all levels accurately', () => {
  const counts = countLogsByLevel(SAMPLE_LOGS);
  assert.equal(counts.ALL, 5);
  assert.equal(counts.GRPC, 2);
  assert.equal(counts.INFO, 0);
  assert.equal(counts.WARN, 1);
  assert.equal(counts.SLA, 1);
  assert.equal(counts.CHAOS, 1);
});

test('formatLogsForClipboard emits structured plain-text lines', () => {
  const output = formatLogsForClipboard(SAMPLE_LOGS.slice(0, 2));
  const lines = output.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\[T\+00:00\] \[GRPC \] \[coordinator\] /);
  assert.match(lines[1], /^\[T\+00:05\] \[GRPC \] \[worker-eu-west-01\] /);
});
