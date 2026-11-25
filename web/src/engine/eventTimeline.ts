import type { RunLogEntry } from '../types/pummel';

export type TimelineEventCategory = 'sla' | 'worker' | 'chaos' | 'anomaly' | 'lifecycle';
export type TimelineEventSeverity = 'critical' | 'warning' | 'info';

export interface TimelineEvent {
  id: string;
  logId: string;
  timestampSec: number;
  category: TimelineEventCategory;
  severity: TimelineEventSeverity;
  title: string;
  source: string;
  message: string;
  positionPct: number;
}

export interface TimelineSummary {
  events: TimelineEvent[];
  maxTimeSec: number;
  counts: Record<TimelineEventCategory, number>;
  criticalCount: number;
}

const SIGNIFICANT_WORKER_REGEX =
  /\b(offline|degraded|detached|drained|registered|rebalanced|attached)\b/i;
const SIGNIFICANT_LIFECYCLE_REGEX =
  /\b(dispatched|scheduled|started|completed|aborted|transitioned|paused|resumed|stopped)\b/i;
const ANOMALY_REGEX = /\b(anomal|outlier|deviation|z-score|moving average)\b/i;

function classifyLogEntry(entry: RunLogEntry): {
  category: TimelineEventCategory;
  severity: TimelineEventSeverity;
  title: string;
} | null {
  const msg = entry.message;

  if (entry.source === 'anomaly-detector' || ANOMALY_REGEX.test(msg)) {
    return {
      category: 'anomaly',
      severity: 'critical',
      title: 'Metric Anomaly',
    };
  }

  if (entry.level === 'SLA') {
    const isAbort = /\babort/i.test(msg);
    return {
      category: 'sla',
      severity: 'critical',
      title: isAbort ? 'SLA Abort' : 'SLA Breach',
    };
  }

  if (entry.level === 'CHAOS') {
    const injected = /\binjected\b/i.test(msg);
    return {
      category: 'chaos',
      severity: injected ? 'warning' : 'info',
      title: injected ? 'Chaos Fault Injected' : 'Chaos Fault Cleared',
    };
  }

  if (entry.level === 'WARN' || SIGNIFICANT_WORKER_REGEX.test(msg)) {
    const isFailure = /\b(offline|fail|error|missed|partition|quorum)\b/i.test(msg);
    const isDegraded = /\bdegraded\b/i.test(msg);
    return {
      category: 'worker',
      severity: isFailure ? 'critical' : isDegraded ? 'warning' : 'info',
      title: isFailure
        ? 'Worker Failure'
        : isDegraded
          ? 'Worker Degraded'
          : 'Worker Fleet Event',
    };
  }

  if (SIGNIFICANT_LIFECYCLE_REGEX.test(msg) || entry.source === 'quick-run' || entry.source === 'scheduler') {
    const isQuickRun = entry.source === 'quick-run' || entry.source === 'scheduler';
    return {
      category: 'lifecycle',
      severity: /\baborted\b/i.test(msg) ? 'critical' : 'info',
      title: entry.source === 'scheduler'
        ? 'Scheduled Quick Run'
        : isQuickRun
          ? 'Quick Run Dispatched'
          : 'Execution Event',
    };
  }

  return null;
}

/**
 * Extracts significant system events (SLA breaches, worker failures/rebalances,
 * chaos faults, metric anomalies, and lifecycle transitions) from Execution Logs
 * and computes normalized timeline axis positions.
 */
export function deriveSystemEventTimeline(
  logs: readonly RunLogEntry[],
  elapsedSec: number = 0
): TimelineSummary {
  const counts: Record<TimelineEventCategory, number> = {
    sla: 0,
    worker: 0,
    chaos: 0,
    anomaly: 0,
    lifecycle: 0,
  };

  const matched: {
    entry: RunLogEntry;
    category: TimelineEventCategory;
    severity: TimelineEventSeverity;
    title: string;
  }[] = [];

  for (const entry of logs) {
    const classified = classifyLogEntry(entry);
    if (!classified) continue;
    matched.push({ entry, ...classified });
    counts[classified.category] += 1;
  }

  // Chronological order (oldest left -> newest right)
  matched.sort((a, b) => a.entry.timestampSec - b.entry.timestampSec);

  const highestLogSec = matched.reduce((max, m) => Math.max(max, m.entry.timestampSec), 0);
  const maxTimeSec = Math.max(1, elapsedSec, highestLogSec);

  // Spread overlapping events at the same second slightly so markers stay selectable
  const countAtSec = new Map<number, number>();
  const events: TimelineEvent[] = matched.map((item, idx) => {
    const sec = Math.max(0, item.entry.timestampSec);
    const seen = countAtSec.get(sec) ?? 0;
    countAtSec.set(sec, seen + 1);

    const rawPct = (sec / maxTimeSec) * 100;
    const jitterPct = seen > 0 ? Math.min(4, seen * 1.4) : 0;
    const positionPct = Number(Math.max(2, Math.min(98, rawPct + jitterPct)).toFixed(2));

    return {
      id: `tl-${item.entry.id}-${idx}`,
      logId: item.entry.id,
      timestampSec: sec,
      category: item.category,
      severity: item.severity,
      title: item.title,
      source: item.entry.source,
      message: item.entry.message,
      positionPct,
    };
  });

  return {
    events,
    maxTimeSec,
    counts,
    criticalCount: events.filter((e) => e.severity === 'critical').length,
  };
}
