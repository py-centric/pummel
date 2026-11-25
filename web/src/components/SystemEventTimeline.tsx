import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Flame,
  GitCommitHorizontal,
  ServerCrash,
  Sparkles,
} from 'lucide-react';
import type { RunLogEntry } from '../types/pummel';
import {
  deriveSystemEventTimeline,
  type TimelineEvent,
  type TimelineEventCategory,
} from '../engine/eventTimeline';

interface SystemEventTimelineProps {
  logs: readonly RunLogEntry[];
  elapsedSec: number;
  onInspectLogs?: () => void;
}

const CATEGORY_TABS: readonly { id: 'all' | TimelineEventCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sla', label: 'SLA' },
  { id: 'worker', label: 'Workers' },
  { id: 'anomaly', label: 'Anomalies' },
  { id: 'chaos', label: 'Chaos' },
  { id: 'lifecycle', label: 'Lifecycle' },
];

function getCategoryVisuals(category: TimelineEventCategory): {
  dotClass: string;
  badgeClass: string;
  label: string;
} {
  switch (category) {
    case 'sla':
      return {
        dotClass: 'bg-red-600 ring-red-200 dark:bg-red-500 dark:ring-red-950',
        badgeClass:
          'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300',
        label: 'SLA',
      };
    case 'worker':
      return {
        dotClass: 'bg-amber-500 ring-amber-200 dark:bg-amber-400 dark:ring-amber-950',
        badgeClass:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300',
        label: 'WORKER',
      };
    case 'anomaly':
      return {
        dotClass: 'bg-rose-600 ring-rose-200 dark:bg-rose-500 dark:ring-rose-950',
        badgeClass:
          'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300',
        label: 'ANOMALY',
      };
    case 'chaos':
      return {
        dotClass: 'bg-orange-600 ring-orange-200 dark:bg-orange-500 dark:ring-orange-950',
        badgeClass:
          'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/50 dark:text-orange-300',
        label: 'CHAOS',
      };
    case 'lifecycle':
      return {
        dotClass: 'bg-sky-600 ring-sky-200 dark:bg-sky-400 dark:ring-sky-950',
        badgeClass:
          'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300',
        label: 'LIFECYCLE',
      };
  }
}

function renderCategoryIcon(category: TimelineEventCategory) {
  switch (category) {
    case 'sla':
      return <AlertOctagon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />;
    case 'worker':
      return <ServerCrash className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />;
    case 'anomaly':
      return <Sparkles className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />;
    case 'chaos':
      return <Flame className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" aria-hidden="true" />;
    case 'lifecycle':
      return <Activity className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />;
  }
}

export function SystemEventTimeline({
  logs,
  elapsedSec,
  onInspectLogs,
}: SystemEventTimelineProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | TimelineEventCategory>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const summary = useMemo(
    () => deriveSystemEventTimeline(logs, elapsedSec),
    [logs, elapsedSec]
  );

  const visibleEvents = useMemo(() => {
    if (activeCategory === 'all') return summary.events;
    return summary.events.filter((e) => e.category === activeCategory);
  }, [summary.events, activeCategory]);

  const selectedEvent: TimelineEvent | null = useMemo(() => {
    if (visibleEvents.length === 0) return null;
    if (selectedEventId) {
      const found = visibleEvents.find((e) => e.id === selectedEventId);
      if (found) return found;
    }
    return visibleEvents[visibleEvents.length - 1];
  }, [visibleEvents, selectedEventId]);

  const midSec = Math.round(summary.maxTimeSec / 2);

  return (
    <section
      aria-label="System Event Timeline"
      data-testid="system-event-timeline"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <GitCommitHorizontal
            className="h-4 w-4 text-orange-600 dark:text-orange-400"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              System Event Timeline
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Significant SLA breaches, worker faults, anomalies, and chaos markers derived from
              Execution Logs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
            role="tablist"
            aria-label="Filter timeline events by category"
          >
            {CATEGORY_TABS.map((tab) => {
              const count =
                tab.id === 'all' ? summary.events.length : summary.counts[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === tab.id}
                  onClick={() => setActiveCategory(tab.id)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap ${
                    activeCategory === tab.id
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {tab.label}{' '}
                  <span className="font-mono text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Horizontal Timeline Track */}
      <div className="p-4 sm:px-5">
        {visibleEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
            No significant events recorded in this category yet. Start a run, trigger chaos, or
            degrade a worker to populate timeline markers.
          </div>
        ) : (
          <>
            <div className="relative pt-3 pb-6">
              {/* Rail */}
              <div className="relative h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500/30 via-orange-500/35 to-rose-500/35"
                  style={{ width: '100%' }}
                />

                {/* Event Marker Nodes */}
                {visibleEvents.map((ev) => {
                  const visuals = getCategoryVisuals(ev.category);
                  const isSelected = selectedEvent?.id === ev.id;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      data-testid="timeline-event-marker"
                      aria-label={`${ev.title} at T+${ev.timestampSec}s from ${ev.source}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedEventId(ev.id)}
                      style={{ left: `${ev.positionPct}%` }}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform focus:outline-none ${
                        isSelected
                          ? `h-4 w-4 ring-4 scale-110 z-20 ${visuals.dotClass}`
                          : `h-3 w-3 ring-2 hover:scale-125 z-10 ${visuals.dotClass}`
                      }`}
                    />
                  );
                })}
              </div>

              {/* Axis Ticks */}
              <div className="mt-2.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                <span>T+0s</span>
                <span>T+{midSec}s</span>
                <span>T+{summary.maxTimeSec}s</span>
              </div>
            </div>

            {/* Selected Event Inspector */}
            {selectedEvent && (
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <span className="mt-0.5 shrink-0">
                    {renderCategoryIcon(selectedEvent.category)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-950 dark:text-slate-100">
                        {selectedEvent.title}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                          getCategoryVisuals(selectedEvent.category).badgeClass
                        }`}
                      >
                        {getCategoryVisuals(selectedEvent.category).label}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        T+{selectedEvent.timestampSec}s · {selectedEvent.source}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      {selectedEvent.message}
                    </p>
                  </div>
                </div>

                {onInspectLogs && (
                  <button
                    type="button"
                    onClick={onInspectLogs}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    View in Logs
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
