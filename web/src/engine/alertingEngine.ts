import type { RunLogEntry } from '../types/pummel';

export type AlertMetricType =
  | 'p95-latency'
  | 'p99-latency'
  | 'avg-latency'
  | 'error-rate';

export type AlertSeverity = 'warning' | 'critical';

export type AlertChannel = 'both' | 'visual' | 'log';

export interface AlertThresholdRule {
  id: string;
  name: string;
  metric: AlertMetricType;
  threshold: number;
  severity: AlertSeverity;
  channel: AlertChannel;
  enabled: boolean;
}

export interface AlertNotification {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: AlertMetricType;
  threshold: number;
  observedValue: number;
  severity: AlertSeverity;
  channel: AlertChannel;
  message: string;
  timestampSec: number;
  createdAt: string;
}

export interface TelemetryAlertSnapshot {
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRatePct: number;
}

export interface AlertEvaluationOutput {
  breachedRuleIds: string[];
  notifications: AlertNotification[];
  logEntries: RunLogEntry[];
}

export const ALERT_METRIC_METADATA: Record<
  AlertMetricType,
  { label: string; shortLabel: string; unit: 'ms' | '%'; defaultThreshold: number }
> = {
  'p95-latency': {
    label: 'p95 Latency (ms)',
    shortLabel: 'p95 latency',
    unit: 'ms',
    defaultThreshold: 150,
  },
  'p99-latency': {
    label: 'p99 Latency (ms)',
    shortLabel: 'p99 latency',
    unit: 'ms',
    defaultThreshold: 240,
  },
  'avg-latency': {
    label: 'Avg Latency (ms)',
    shortLabel: 'avg latency',
    unit: 'ms',
    defaultThreshold: 95,
  },
  'error-rate': {
    label: 'Error Rate (%)',
    shortLabel: 'error rate',
    unit: '%',
    defaultThreshold: 2.5,
  },
};

export function createDefaultAlertRules(): AlertThresholdRule[] {
  return [
    {
      id: 'alert-rule-p95',
      name: 'p95 Latency SLA Guard',
      metric: 'p95-latency',
      threshold: 150,
      severity: 'warning',
      channel: 'both',
      enabled: true,
    },
    {
      id: 'alert-rule-p99',
      name: 'p99 Tail Latency Ceiling',
      metric: 'p99-latency',
      threshold: 240,
      severity: 'critical',
      channel: 'both',
      enabled: true,
    },
    {
      id: 'alert-rule-err',
      name: 'HTTP/gRPC Error Rate Threshold',
      metric: 'error-rate',
      threshold: 2.5,
      severity: 'critical',
      channel: 'both',
      enabled: true,
    },
  ];
}

export function getMetricValueFromSnapshot(
  metric: AlertMetricType,
  snapshot: TelemetryAlertSnapshot
): number {
  switch (metric) {
    case 'p95-latency':
      return snapshot.p95LatencyMs;
    case 'p99-latency':
      return snapshot.p99LatencyMs;
    case 'avg-latency':
      return snapshot.avgLatencyMs;
    case 'error-rate':
      return snapshot.errorRatePct;
  }
}

export function formatAlertValue(metric: AlertMetricType, value: number): string {
  const meta = ALERT_METRIC_METADATA[metric];
  if (meta.unit === '%') {
    return `${value.toFixed(2)}%`;
  }
  return `${value.toFixed(1)}ms`;
}

/**
 * Evaluates active alert rules against a telemetry snapshot and produces
 * visual notifications and Execution Log entries for every breached threshold.
 */
export function evaluateAlertThresholds(params: {
  rules: readonly AlertThresholdRule[];
  snapshot: TelemetryAlertSnapshot;
  timestampSec: number;
  now?: Date;
}): AlertEvaluationOutput {
  const { rules, snapshot, timestampSec, now = new Date() } = params;
  const breachedRuleIds: string[] = [];
  const notifications: AlertNotification[] = [];
  const logEntries: RunLogEntry[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const observedValue = getMetricValueFromSnapshot(rule.metric, snapshot);
    if (observedValue <= rule.threshold) continue;

    breachedRuleIds.push(rule.id);
    const meta = ALERT_METRIC_METADATA[rule.metric];
    const formattedObserved = formatAlertValue(rule.metric, observedValue);
    const formattedThreshold = formatAlertValue(rule.metric, rule.threshold);
    const message = `[ALERT:${rule.severity.toUpperCase()}] ${rule.name}  --  ${meta.shortLabel} ${formattedObserved} exceeded threshold > ${formattedThreshold}`;
    const uniqueSuffix = `${rule.id}-${timestampSec}-${now.getTime()}`;

    if (rule.channel === 'both' || rule.channel === 'visual') {
      notifications.push({
        id: `notif-${uniqueSuffix}`,
        ruleId: rule.id,
        ruleName: rule.name,
        metric: rule.metric,
        threshold: rule.threshold,
        observedValue,
        severity: rule.severity,
        channel: rule.channel,
        message,
        timestampSec,
        createdAt: now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      });
    }

    if (rule.channel === 'both' || rule.channel === 'log') {
      logEntries.push({
        id: `log-alert-${uniqueSuffix}`,
        timestampSec,
        level: rule.severity === 'critical' ? 'SLA' : 'WARN',
        source: 'alert-monitor',
        message,
      });
    }
  }

  return {
    breachedRuleIds,
    notifications,
    logEntries,
  };
}

/**
 * Synthesizes a breached telemetry snapshot guaranteed to exceed the active rules
 * (or a specific single rule) so users can test visual alerts and execution logs on demand.
 */
export function buildSimulatedBreachSnapshot(
  rules: readonly AlertThresholdRule[],
  targetRuleId?: string
): TelemetryAlertSnapshot {
  const relevant = targetRuleId
    ? rules.filter((r) => r.id === targetRuleId)
    : rules.filter((r) => r.enabled);

  let avgLatencyMs = 82;
  let p95LatencyMs = 140;
  let p99LatencyMs = 210;
  let errorRatePct = 1.2;

  for (const r of relevant) {
    if (r.metric === 'avg-latency') {
      avgLatencyMs = Math.max(avgLatencyMs, Number((r.threshold + 24.5).toFixed(1)));
    } else if (r.metric === 'p95-latency') {
      p95LatencyMs = Math.max(p95LatencyMs, Number((r.threshold + 38.4).toFixed(1)));
    } else if (r.metric === 'p99-latency') {
      p99LatencyMs = Math.max(p99LatencyMs, Number((r.threshold + 54.2).toFixed(1)));
    } else if (r.metric === 'error-rate') {
      errorRatePct = Math.max(errorRatePct, Number((r.threshold + 1.35).toFixed(2)));
    }
  }

  return {
    avgLatencyMs,
    p95LatencyMs,
    p99LatencyMs,
    errorRatePct,
  };
}
