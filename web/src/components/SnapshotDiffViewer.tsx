import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, GitCompare, RotateCcw, Sparkles, X } from 'lucide-react';
import { formatSnapshotTimestamp, type ConfigSnapshot } from '../engine/snapshotStore';
import { buildSideBySideDiff, filterSideBySideRows } from '../engine/snapshotDiff';
import { SideBySideRow } from './snapshot/SideBySideRow';

interface SnapshotDiffViewerProps {
  snapshots: readonly ConfigSnapshot[];
  baseSnapshotId: string | null;
  targetSnapshotId: string | null;
  onSelectBase: (id: string) => void;
  onSelectTarget: (id: string) => void;
  onSwap: () => void;
  onClose: () => void;
  onRestoreSnapshot: (snapshot: ConfigSnapshot) => void;
  onSeedComparisonPair?: () => Promise<void> | void;
}

export function SnapshotDiffViewer({
  snapshots,
  baseSnapshotId,
  targetSnapshotId,
  onSelectBase,
  onSelectTarget,
  onSwap,
  onClose,
  onRestoreSnapshot,
  onSeedComparisonPair,
}: SnapshotDiffViewerProps) {
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const baseSnapshot = useMemo(
    () =>
      snapshots.find((s) => s.id === baseSnapshotId) ?? snapshots[1] ?? snapshots[0] ?? null,
    [snapshots, baseSnapshotId]
  );

  const targetSnapshot = useMemo(
    () => snapshots.find((s) => s.id === targetSnapshotId) ?? snapshots[0] ?? null,
    [snapshots, targetSnapshotId]
  );

  const diffResult = useMemo(() => {
    if (!baseSnapshot || !targetSnapshot) return null;
    return buildSideBySideDiff(baseSnapshot, targetSnapshot);
  }, [baseSnapshot, targetSnapshot]);

  const visibleRows = useMemo(() => {
    if (!diffResult) return [];
    return filterSideBySideRows(diffResult.rows, onlyChanges);
  }, [diffResult, onlyChanges]);

  const handleSeedPair = async () => {
    if (!onSeedComparisonPair) return;
    setSeeding(true);
    try {
      await onSeedComparisonPair();
    } finally {
      setSeeding(false);
    }
  };

  return (
    <section
      aria-label="Snapshot Side-by-Side Comparison"
      data-testid="snapshot-diff-viewer"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-400">
            <GitCompare className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Side-by-Side Snapshot Diff
              </h2>
              {diffResult && (
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums">
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    ~{diffResult.summary.modifiedCount} modified
                  </span>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                    +{diffResult.summary.addedCount} added
                  </span>
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                    -{diffResult.summary.removedCount} removed
                  </span>
                  {diffResult.summary.concurrencyDelta !== 0 && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      VU Δ {diffResult.summary.concurrencyDelta > 0 ? '+' : ''}
                      {diffResult.summary.concurrencyDelta.toLocaleString()} VUs
                    </span>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Compare any two IndexedDB configuration iterations line-by-line to inspect concurrency,
              SLA, and scenario changes.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshots.length >= 2 && (
            <>
              <div
                role="tablist"
                aria-label="Diff line filter"
                className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!onlyChanges}
                  onClick={() => setOnlyChanges(false)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                    !onlyChanges
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  All Lines ({diffResult?.summary.totalRows ?? 0})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={onlyChanges}
                  onClick={() => setOnlyChanges(true)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                    onlyChanges
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  Changes Only ({diffResult?.summary.changedRowCount ?? 0})
                </button>
              </div>

              <button
                type="button"
                onClick={onSwap}
                aria-label="Swap base and target snapshots"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                Swap Sides
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close snapshot comparison"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Close
          </button>
        </div>
      </div>

      {snapshots.length < 2 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              At least 2 saved IndexedDB snapshots are needed for a side-by-side diff
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Currently {snapshots.length} snapshot{snapshots.length === 1 ? ' is' : 's are'} stored
              in IndexedDB. Save another test iteration or generate a Baseline vs. Spike comparison
              pair below.
            </p>
          </div>
          {onSeedComparisonPair && (
            <button
              type="button"
              disabled={seeding}
              onClick={() => void handleSeedPair()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {seeding ? 'Saving Pair...' : 'Seed Baseline & Spike Snapshots'}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Two-Column Snapshot Selector Header */}
          <div className="grid divide-y divide-slate-200 border-b border-slate-200 bg-slate-50/70 lg:grid-cols-2 lg:divide-x lg:divide-y-0 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/50">
            {/* Left / Base Snapshot Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <label
                  htmlFor="compare-base-snapshot"
                  className="shrink-0 rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Base (A)
                </label>
                <select
                  id="compare-base-snapshot"
                  aria-label="Base snapshot (Left)"
                  value={baseSnapshot?.id ?? ''}
                  onChange={(e) => onSelectBase(e.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {snapshots.map((snap) => (
                    <option key={snap.id} value={snap.id}>
                      {snap.label} -- {snap.concurrency.toLocaleString()} VUs (
                      {snap.format.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {baseSnapshot && (
                <div className="flex items-center gap-2">
                  <span className="hidden font-mono text-[11px] tabular-nums text-slate-500 sm:inline dark:text-slate-400">
                    {formatSnapshotTimestamp(baseSnapshot.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestoreSnapshot(baseSnapshot)}
                    aria-label={`Restore base snapshot ${baseSnapshot.label}`}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Load Base
                  </button>
                </div>
              )}
            </div>

            {/* Right / Target Snapshot Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <label
                  htmlFor="compare-target-snapshot"
                  className="shrink-0 rounded bg-orange-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-orange-800 dark:bg-orange-950/60 dark:text-orange-300"
                >
                  Target (B)
                </label>
                <select
                  id="compare-target-snapshot"
                  aria-label="Target snapshot (Right)"
                  value={targetSnapshot?.id ?? ''}
                  onChange={(e) => onSelectTarget(e.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {snapshots.map((snap) => (
                    <option key={snap.id} value={snap.id}>
                      {snap.label} -- {snap.concurrency.toLocaleString()} VUs (
                      {snap.format.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {targetSnapshot && (
                <div className="flex items-center gap-2">
                  <span className="hidden font-mono text-[11px] tabular-nums text-slate-500 sm:inline dark:text-slate-400">
                    {formatSnapshotTimestamp(targetSnapshot.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestoreSnapshot(targetSnapshot)}
                    aria-label={`Restore target snapshot ${targetSnapshot.label}`}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Load Target
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Side-by-Side Diff Table */}
          {diffResult && diffResult.summary.isIdentical && onlyChanges ? (
            <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No line differences between{' '}
              <strong className="text-slate-800 dark:text-slate-200">{baseSnapshot?.label}</strong>{' '}
              and{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {targetSnapshot?.label}
              </strong>
              . Switch to{' '}
              <button
                type="button"
                onClick={() => setOnlyChanges(false)}
                className="font-semibold text-orange-600 underline hover:text-orange-700 dark:text-orange-400"
              >
                All Lines
              </button>{' '}
              to view the identical specification.
            </div>
          ) : (
            <div
              data-testid="side-by-side-diff-grid"
              className="max-h-96 overflow-auto font-mono text-xs"
            >
              <div className="min-w-[760px] divide-y divide-slate-100 dark:divide-slate-800/60">
                {visibleRows.map((row) => (
                  <SideBySideRow key={row.index} row={row} />
                ))}
              </div>
            </div>
          )}

          {/* Footer Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500 sm:px-5 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Base: {baseSnapshot?.label} ({baseSnapshot?.concurrency.toLocaleString()} VUs) ↔
              Target: {targetSnapshot?.label} ({targetSnapshot?.concurrency.toLocaleString()} VUs)
            </span>
            <div className="flex items-center gap-3 font-mono">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-xs bg-amber-400/80" aria-hidden="true" />
                Modified (~)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500/80" aria-hidden="true" />
                Added (+)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-xs bg-rose-500/80" aria-hidden="true" />
                Removed (-)
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
