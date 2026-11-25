import type { RunLogEntry } from '../types/pummel';

export type LogLevelFilter = 'ALL' | RunLogEntry['level'];

export const LOG_LEVEL_FILTERS: readonly LogLevelFilter[] = [
  'ALL',
  'GRPC',
  'INFO',
  'WARN',
  'SLA',
  'CHAOS',
];

export function formatLogTimestamp(timestampSec: number): string {
  const safe = Math.max(0, Math.floor(timestampSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `T+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function filterExecutionLogs(
  logs: readonly RunLogEntry[],
  level: LogLevelFilter,
  query: string
): RunLogEntry[] {
  const trimmed = query.trim().toLowerCase();
  return logs.filter((entry) => {
    if (level !== 'ALL' && entry.level !== level) return false;
    if (!trimmed) return true;
    return (
      entry.source.toLowerCase().includes(trimmed) ||
      entry.message.toLowerCase().includes(trimmed) ||
      entry.level.toLowerCase().includes(trimmed) ||
      formatLogTimestamp(entry.timestampSec).toLowerCase().includes(trimmed)
    );
  });
}

export function countLogsByLevel(
  logs: readonly RunLogEntry[]
): Record<LogLevelFilter, number> {
  const counts: Record<LogLevelFilter, number> = {
    ALL: logs.length,
    GRPC: 0,
    INFO: 0,
    WARN: 0,
    SLA: 0,
    CHAOS: 0,
  };
  for (const entry of logs) {
    counts[entry.level] += 1;
  }
  return counts;
}

export function formatLogsForClipboard(logs: readonly RunLogEntry[]): string {
  return logs
    .map(
      (entry) =>
        `[${formatLogTimestamp(entry.timestampSec)}] [${entry.level.padEnd(5, ' ')}] [${entry.source}] ${entry.message}`
    )
    .join('\n');
}
