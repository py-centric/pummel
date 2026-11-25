import type { ConfigFormat } from '../types/pummel';

export type ScheduleRecurrence = 'once' | 'hourly' | 'daily' | 'weekly';

export interface ScheduledTestTask {
  id: string;
  label: string;
  specName: string;
  format: ConfigFormat;
  rawText: string;
  concurrency: number;
  clusterId: string;
  clusterName: string;
  scheduledAtIso: string;
  recurrence: ScheduleRecurrence;
  enabled: boolean;
  createdAtIso: string;
  lastRunAtIso?: string;
  runCount: number;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const SCHEDULED_TESTS_STORAGE_KEY = 'pummel_scheduled_quick_runs_v1';

export const RECURRENCE_LABELS: Record<ScheduleRecurrence, string> = {
  once: 'One-time',
  hourly: 'Every hour',
  daily: 'Daily',
  weekly: 'Weekly',
};

const RECURRENCE_INTERVAL_MS: Record<Exclude<ScheduleRecurrence, 'once'>, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Combines HTML date ("YYYY-MM-DD") and time ("HH:MM") inputs in local time
 * into a validated ISO-8601 timestamp string.
 */
export function combineLocalDateAndTime(
  dateStr: string,
  timeStr: string
): { iso: string; error?: undefined } | { iso?: undefined; error: string } {
  const cleanDate = dateStr.trim();
  const cleanTime = timeStr.trim();

  if (!cleanDate) {
    return { error: 'Select a valid schedule date.' };
  }
  if (!cleanTime) {
    return { error: 'Select a valid schedule time.' };
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanDate);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(cleanTime);
  if (!dateMatch || !timeMatch) {
    return { error: 'Date must be YYYY-MM-DD and time must be HH:MM.' };
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = timeMatch[3] ? Number(timeMatch[3]) : 0;

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return { error: 'Date or time value is out of range.' };
  }

  const constructed = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    Number.isNaN(constructed.getTime()) ||
    constructed.getFullYear() !== year ||
    constructed.getMonth() !== month - 1 ||
    constructed.getDate() !== day
  ) {
    return { error: 'Selected calendar date does not exist.' };
  }

  return { iso: constructed.toISOString() };
}

/**
 * Formats a Date into HTML input values { date: "YYYY-MM-DD", time: "HH:MM" } in local time.
 */
export function toLocalDateAndTimeInputs(date: Date): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/**
 * Computes the next scheduled ISO timestamp for a recurring task after execution.
 * Returns null for one-time tasks.
 */
export function computeNextScheduledIso(
  currentIso: string,
  recurrence: ScheduleRecurrence,
  referenceNowMs: number = Date.now()
): string | null {
  if (recurrence === 'once') return null;
  const intervalMs = RECURRENCE_INTERVAL_MS[recurrence];
  let nextMs = Date.parse(currentIso);
  if (Number.isNaN(nextMs)) {
    nextMs = referenceNowMs;
  }
  while (nextMs <= referenceNowMs) {
    nextMs += intervalMs;
  }
  return new Date(nextMs).toISOString();
}

export function createScheduledTestTask(params: {
  label: string;
  specName: string;
  format: ConfigFormat;
  rawText: string;
  concurrency: number;
  clusterId: string;
  clusterName: string;
  scheduledAtIso: string;
  recurrence: ScheduleRecurrence;
  now?: Date;
}): ScheduledTestTask {
  const now = params.now ?? new Date();
  const trimmedLabel = params.label.trim() || `${params.specName} (${RECURRENCE_LABELS[params.recurrence]})`;
  return {
    id: `sched-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    label: trimmedLabel,
    specName: params.specName,
    format: params.format,
    rawText: params.rawText,
    concurrency: params.concurrency,
    clusterId: params.clusterId,
    clusterName: params.clusterName,
    scheduledAtIso: params.scheduledAtIso,
    recurrence: params.recurrence,
    enabled: true,
    createdAtIso: now.toISOString(),
    runCount: 0,
  };
}

export function sortScheduledTests(tasks: readonly ScheduledTestTask[]): ScheduledTestTask[] {
  return [...tasks].sort((a, b) => {
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }
    const timeA = Date.parse(a.scheduledAtIso) || 0;
    const timeB = Date.parse(b.scheduledAtIso) || 0;
    return timeA - timeB;
  });
}

export function findDueScheduledTests(
  tasks: readonly ScheduledTestTask[],
  nowMs: number = Date.now()
): ScheduledTestTask[] {
  return tasks.filter((task) => {
    if (!task.enabled) return false;
    const targetMs = Date.parse(task.scheduledAtIso);
    return !Number.isNaN(targetMs) && targetMs <= nowMs;
  });
}

export function markScheduledTaskExecuted(
  task: ScheduledTestTask,
  executedAtMs: number = Date.now()
): ScheduledTestTask {
  const executedIso = new Date(executedAtMs).toISOString();
  const nextIso = computeNextScheduledIso(task.scheduledAtIso, task.recurrence, executedAtMs);
  return {
    ...task,
    lastRunAtIso: executedIso,
    runCount: task.runCount + 1,
    scheduledAtIso: nextIso ?? task.scheduledAtIso,
    enabled: nextIso !== null ? task.enabled : false,
  };
}

export function formatCountdownLabel(scheduledAtIso: string, nowMs: number = Date.now()): string {
  const targetMs = Date.parse(scheduledAtIso);
  if (Number.isNaN(targetMs)) return 'Invalid time';
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return 'Due now';

  const totalMinutes = Math.ceil(diffMs / 60_000);
  if (totalMinutes < 60) {
    return `in ${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) {
    return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `in ${days}d ${remHours}h` : `in ${days}d`;
}

function isValidScheduledTask(item: unknown): item is ScheduledTestTask {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.label === 'string' &&
    typeof obj.specName === 'string' &&
    typeof obj.rawText === 'string' &&
    typeof obj.clusterId === 'string' &&
    typeof obj.clusterName === 'string' &&
    typeof obj.scheduledAtIso === 'string' &&
    (obj.recurrence === 'once' ||
      obj.recurrence === 'hourly' ||
      obj.recurrence === 'daily' ||
      obj.recurrence === 'weekly') &&
    typeof obj.enabled === 'boolean' &&
    typeof obj.runCount === 'number'
  );
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function loadScheduledTestsFromStorage(
  storage: StorageLike | null = getDefaultStorage()
): ScheduledTestTask[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SCHEDULED_TESTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortScheduledTests(parsed.filter(isValidScheduledTask));
  } catch {
    return [];
  }
}

export function saveScheduledTestsToStorage(
  tasks: readonly ScheduledTestTask[],
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SCHEDULED_TESTS_STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch {
    return false;
  }
}
