import React, { useEffect, useState } from 'react';
import {
  CalendarClock,
  Pause,
  Play,
  Repeat,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { ConfigFormat } from '../types/pummel';
import {
  combineLocalDateAndTime,
  formatCountdownLabel,
  RECURRENCE_LABELS,
  toLocalDateAndTimeInputs,
  type ScheduledTestTask,
  type ScheduleRecurrence,
} from '../engine/scheduledTests';
import { TEST_CLUSTER_PROFILES } from '../engine/testClusters';

interface ScheduleTestPanelProps {
  tasks: readonly ScheduledTestTask[];
  activeSpecName: string;
  activeConcurrency: number;
  activeFormat: ConfigFormat;
  defaultClusterId: string;
  onCreateSchedule: (input: {
    label: string;
    clusterId: string;
    scheduledAtIso: string;
    recurrence: ScheduleRecurrence;
  }) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onRunTaskNow: (taskId: string) => void;
  onClose: () => void;
}

export function ScheduleTestPanel({
  tasks,
  activeSpecName,
  activeConcurrency,
  activeFormat,
  defaultClusterId,
  onCreateSchedule,
  onToggleTask,
  onDeleteTask,
  onRunTaskNow,
  onClose,
}: ScheduleTestPanelProps) {
  const [label, setLabel] = useState('');
  const [dateInput, setDateInput] = useState(() => {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    return toLocalDateAndTimeInputs(nextHour).date;
  });
  const [timeInput, setTimeInput] = useState(() => {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    return toLocalDateAndTimeInputs(nextHour).time;
  });
  const [recurrence, setRecurrence] = useState<ScheduleRecurrence>('daily');
  const [clusterId, setClusterId] = useState(defaultClusterId);
  const [formError, setFormError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setClusterId(defaultClusterId);
  }, [defaultClusterId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const combined = combineLocalDateAndTime(dateInput, timeInput);
    if (!combined.iso) {
      setFormError(combined.error ?? 'Provide a valid date and time.');
      return;
    }

    setFormError(null);
    onCreateSchedule({
      label,
      clusterId,
      scheduledAtIso: combined.iso,
      recurrence,
    });
    setLabel('');
  };

  return (
    <section
      aria-label="Schedule Recurring Quick Run Tests"
      data-testid="schedule-test-panel"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <CalendarClock className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Schedule Recurring Quick Run
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Saves active {activeFormat.toUpperCase()} spec ({activeSpecName} ·{' '}
              {activeConcurrency.toLocaleString()} VUs) to browser localStorage for automated dispatch.
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label="Close Schedule Test panel"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Creation Form */}
      <form
        onSubmit={handleSubmit}
        className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-12 sm:px-5 dark:border-slate-800 dark:bg-slate-950/50"
      >
        <div className="lg:col-span-3">
          <label
            htmlFor="schedule-label-input"
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Schedule Name
          </label>
          <input
            id="schedule-label-input"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nightly Checkout Regression"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="lg:col-span-2">
          <label
            htmlFor="schedule-date-input"
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Start Date
          </label>
          <input
            id="schedule-date-input"
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            required
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="lg:col-span-2">
          <label
            htmlFor="schedule-time-input"
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Start Time
          </label>
          <input
            id="schedule-time-input"
            type="time"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            required
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="lg:col-span-2">
          <label
            htmlFor="schedule-recurrence-select"
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Recurrence
          </label>
          <select
            id="schedule-recurrence-select"
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as ScheduleRecurrence)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="daily">Daily</option>
            <option value="hourly">Every hour</option>
            <option value="weekly">Weekly</option>
            <option value="once">One-time</option>
          </select>
        </div>

        <div className="lg:col-span-3 flex flex-col justify-end">
          <label
            htmlFor="schedule-cluster-select"
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Target Cluster
          </label>
          <div className="mt-1 flex items-center gap-2">
            <select
              id="schedule-cluster-select"
              value={clusterId}
              onChange={(e) => setClusterId(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {TEST_CLUSTER_PROFILES.map((cluster) => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              data-testid="save-schedule-button"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              Save Schedule
            </button>
          </div>
        </div>

        {formError && (
          <div className="sm:col-span-2 lg:col-span-12 text-xs font-medium text-red-700 dark:text-red-400">
            {formError}
          </div>
        )}
      </form>

      {/* Persisted Schedules List */}
      <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800/80">
        {tasks.length === 0 ? (
          <div className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
            No scheduled Quick Runs stored yet. Pick a date, time, and recurrence above to persist a
            recurring test task in localStorage.
          </div>
        ) : (
          tasks.map((task) => {
            const formattedNext = new Date(task.scheduledAtIso).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            const countdown = task.enabled
              ? formatCountdownLabel(task.scheduledAtIso, nowMs)
              : 'Paused';

            return (
              <div
                key={task.id}
                data-testid="scheduled-task-row"
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-semibold ${
                        task.enabled
                          ? 'text-slate-950 dark:text-slate-100'
                          : 'text-slate-400 line-through dark:text-slate-500'
                      }`}
                    >
                      {task.label}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <Repeat className="h-2.5 w-2.5" aria-hidden="true" />
                      {RECURRENCE_LABELS[task.recurrence]}
                    </span>
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {task.clusterName}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      {task.concurrency.toLocaleString()} VUs
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    <span>Next: {formattedNext}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        task.enabled
                          ? 'font-semibold text-orange-700 dark:text-orange-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }
                    >
                      {countdown}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Spec: {task.specName} ({task.format.toUpperCase()})
                    </span>
                    {task.runCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Runs: {task.runCount}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onRunTaskNow(task.id)}
                    aria-label={`Run scheduled test ${task.label} now`}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-orange-600 px-2.5 text-[11px] font-semibold text-white hover:bg-orange-700 whitespace-nowrap"
                  >
                    <Zap className="h-3 w-3" aria-hidden="true" />
                    Run Now
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTask(task.id)}
                    aria-label={
                      task.enabled
                        ? `Pause scheduled test ${task.label}`
                        : `Resume scheduled test ${task.label}`
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {task.enabled ? (
                      <>
                        <Pause className="h-3 w-3" aria-hidden="true" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" aria-hidden="true" />
                        Resume
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    aria-label={`Delete scheduled test ${task.label}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
