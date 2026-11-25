import type { RunLogEntry } from '../types/pummel';
import { deriveSystemEventTimeline, type TimelineEvent } from './eventTimeline';
import { sanitizeExportFilename } from './exportDownload';
import { formatLogTimestamp } from './logStream';

export type LogTimelineExportFormat = 'csv' | 'json';

export interface LogTimelineExportArtifact {
  format: LogTimelineExportFormat;
  filename: string;
  mimeType: string;
  content: string;
  byteLength: number;
  logCount: number;
  timelineEventCount: number;
}

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildLogTimelineExportArtifact(params: {
  logs: readonly RunLogEntry[];
  elapsedSec: number;
  specName: string;
  clusterName: string;
  sessionLabel?: string;
  format: LogTimelineExportFormat;
  now?: Date;
}): LogTimelineExportArtifact {
  const {
    logs,
    elapsedSec,
    specName,
    clusterName,
    sessionLabel,
    format,
    now = new Date(),
  } = params;

  const timeline = deriveSystemEventTimeline(logs, elapsedSec);
  const slug = sanitizeExportFilename(sessionLabel || specName);
  const exportedAtIso = now.toISOString();

  const chronologicalLogs = [...logs].reverse();

  if (format === 'json') {
    const payload = {
      schema: 'pummel.logs-timeline.v1',
      exportedAtIso,
      metadata: {
        specName,
        clusterName,
        sessionLabel: sessionLabel ?? 'Live Cluster Stream',
        elapsedSec,
        logCount: chronologicalLogs.length,
        timelineEventCount: timeline.events.length,
      },
      timelineSummary: {
        maxTimeSec: timeline.maxTimeSec,
        counts: timeline.counts,
      },
      timelineEvents: timeline.events,
      executionLogs: chronologicalLogs.map((entry) => ({
        ...entry,
        formattedTime: formatLogTimestamp(entry.timestampSec),
      })),
    };
    const content = JSON.stringify(payload, null, 2);
    return {
      format: 'json',
      filename: `${slug}-logs-timeline.json`,
      mimeType: 'application/json;charset=utf-8',
      content,
      byteLength: new TextEncoder().encode(content).byteLength,
      logCount: chronologicalLogs.length,
      timelineEventCount: timeline.events.length,
    };
  }

  const header = [
    'record_kind',
    'timestamp_sec',
    'formatted_time',
    'level_or_category',
    'severity',
    'source',
    'title',
    'message',
  ].join(',');

  const timelineRows = timeline.events.map((ev: TimelineEvent) =>
    [
      'timeline_event',
      ev.timestampSec,
      escapeCsvField(formatLogTimestamp(ev.timestampSec)),
      escapeCsvField(ev.category),
      escapeCsvField(ev.severity),
      escapeCsvField(ev.source),
      escapeCsvField(ev.title),
      escapeCsvField(ev.message),
    ].join(',')
  );

  const logRows = chronologicalLogs.map((entry) =>
    [
      'execution_log',
      entry.timestampSec,
      escapeCsvField(formatLogTimestamp(entry.timestampSec)),
      escapeCsvField(entry.level),
      escapeCsvField(
        entry.level === 'SLA'
          ? 'critical'
          : entry.level === 'WARN' || entry.level === 'CHAOS'
            ? 'warning'
            : 'info'
      ),
      escapeCsvField(entry.source),
      escapeCsvField(`${entry.level} log`),
      escapeCsvField(entry.message),
    ].join(',')
  );

  const content = [header, ...timelineRows, ...logRows].join('\n');
  return {
    format: 'csv',
    filename: `${slug}-logs-timeline.csv`,
    mimeType: 'text/csv;charset=utf-8',
    content,
    byteLength: new TextEncoder().encode(content).byteLength,
    logCount: chronologicalLogs.length,
    timelineEventCount: timeline.events.length,
  };
}
