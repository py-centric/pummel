import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSimulatedBreachSnapshot,
  createDefaultAlertRules,
  evaluateAlertThresholds,
  type AlertThresholdRule,
} from './alertingEngine';

test('evaluateAlertThresholds triggers visual notifications and execution logs when thresholds are exceeded', () => {
  const rules = createDefaultAlertRules();
  const result = evaluateAlertThresholds({
    rules,
    snapshot: {
      avgLatencyMs: 90,
      p95LatencyMs: 184.5, // breaches 150ms warning rule
      p99LatencyMs: 210.0, // below 240ms critical rule
      errorRatePct: 3.4, // breaches 2.5% critical rule
    },
    timestampSec: 12,
    now: new Date('2026-11-22T01:30:00Z'),
  });

  assert.deepEqual(result.breachedRuleIds, ['alert-rule-p95', 'alert-rule-err']);
  assert.equal(result.notifications.length, 2);
  assert.equal(result.logEntries.length, 2);

  const p95Log = result.logEntries[0];
  assert.equal(p95Log.level, 'WARN');
  assert.equal(p95Log.source, 'alert-monitor');
  assert.ok(p95Log.message.includes('184.5ms exceeded threshold > 150.0ms'));

  const errLog = result.logEntries[1];
  assert.equal(errLog.level, 'SLA');
  assert.ok(errLog.message.includes('3.40% exceeded threshold > 2.50%'));
});

test('evaluateAlertThresholds respects disabled rules and channel scoping (visual vs log)', () => {
  const customRules: AlertThresholdRule[] = [
    {
      id: 'r-visual-only',
      name: 'Visual Only Latency',
      metric: 'p95-latency',
      threshold: 100,
      severity: 'warning',
      channel: 'visual',
      enabled: true,
    },
    {
      id: 'r-log-only',
      name: 'Log Only Error Rate',
      metric: 'error-rate',
      threshold: 1.0,
      severity: 'critical',
      channel: 'log',
      enabled: true,
    },
    {
      id: 'r-disabled',
      name: 'Disabled Rule',
      metric: 'p99-latency',
      threshold: 50,
      severity: 'critical',
      channel: 'both',
      enabled: false,
    },
  ];

  const output = evaluateAlertThresholds({
    rules: customRules,
    snapshot: {
      avgLatencyMs: 60,
      p95LatencyMs: 130,
      p99LatencyMs: 300,
      errorRatePct: 2.0,
    },
    timestampSec: 5,
  });

  assert.deepEqual(output.breachedRuleIds, ['r-visual-only', 'r-log-only']);
  assert.equal(output.notifications.length, 1);
  assert.equal(output.notifications[0].ruleId, 'r-visual-only');
  assert.equal(output.logEntries.length, 1);
  assert.ok(output.logEntries[0].message.includes('Log Only Error Rate'));
});

test('buildSimulatedBreachSnapshot produces telemetry exceeding enabled thresholds', () => {
  const rules = createDefaultAlertRules();
  const snap = buildSimulatedBreachSnapshot(rules);
  const result = evaluateAlertThresholds({
    rules,
    snapshot: snap,
    timestampSec: 0,
  });

  assert.equal(result.breachedRuleIds.length, 3);
  assert.equal(result.notifications.length, 3);
  assert.equal(result.logEntries.length, 3);
});
