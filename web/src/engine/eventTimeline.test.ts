import test from 'node:test';
import assert from 'node:assert/strict';
import type { RunLogEntry } from '../types/pummel';
import { deriveSystemEventTimeline } from './eventTimeline';

test('deriveSystemEventTimeline extracts SLA breaches, worker failures, chaos, anomalies, and lifecycle events in chronological order', () => {
  const logs: RunLogEntry[] = [
    {
      id: 'l-5',
      timestampSec: 18,
      level: 'SLA',
      source: 'sla-engine',
      message: 'SLA breached: p95-response-time 285ms > 200ms (action: warn)',
    },
    {
      id: 'l-4',
      timestampSec: 14,
      level: 'WARN',
      source: 'anomaly-detector',
      message: 'Anomaly detected on p95 latency: 290ms deviates +2.8σ from moving average 110ms.',
    },
    {
      id: 'l-3',
      timestampSec: 10,
      level: 'WARN',
      source: 'worker-us-east-01',
      message: 'Node state set to "offline"; VU shard rebalanced to 0 VUs.',
    },
    {
      id: 'l-2',
      timestampSec: 6,
      level: 'CHAOS',
      source: 'toxiproxy',
      message: 'Injected Toxiproxy latency + packet-drop fault.',
    },
    {
      id: 'l-1',
      timestampSec: 0,
      level: 'GRPC',
      source: 'quick-run',
      message: 'Dispatched "Checkout Load" to cluster US-East Staging.',
    },
  ];

  const summary = deriveSystemEventTimeline(logs, 20);
  assert.equal(summary.events.length, 5);
  assert.equal(summary.events[0].category, 'lifecycle');
  assert.equal(summary.events[1].category, 'chaos');
  assert.equal(summary.events[2].category, 'worker');
  assert.equal(summary.events[2].severity, 'critical');
  assert.equal(summary.events[3].category, 'anomaly');
  assert.equal(summary.events[4].category, 'sla');
  assert.equal(summary.counts.sla, 1);
  assert.equal(summary.counts.worker, 1);
  assert.equal(summary.counts.chaos, 1);
  assert.equal(summary.counts.anomaly, 1);
  assert.equal(summary.counts.lifecycle, 1);
  assert.equal(summary.criticalCount, 3);
  assert.ok(summary.events[4].positionPct > summary.events[0].positionPct);
});
