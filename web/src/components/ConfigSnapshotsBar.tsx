import React, { useState } from 'react';
import { Camera, Database, GitCompare, RotateCcw, Trash2 } from 'lucide-react';
import {
  formatSnapshotTimestamp,
  type ConfigSnapshot,
} from '../engine/snapshotStore';

interface ConfigSnapshotsBarProps {
  snapshots: readonly ConfigSnapshot[];
  activeSnapshotId: string | null;
  compareOpen: boolean;
  compareBaseId: string | null;
  compareTargetId: string | null;
  loading: boolean;
  error: string | null;
  onSaveSnapshot: (label: string) => Promise<void> | void;
  onRestoreSnapshot: (snapshot: ConfigSnapshot) => void;
  onDeleteSnapshot: (id: string) => Promise<void> | void;
  onToggleCompare: () => void;
  onCompareSnapshot: (id: string) => void;
}

export function ConfigSnapshotsBar({
  snapshots,
  activeSnapshotId,
  compareOpen,
  compareBaseId,
  compareTargetId,
  loading,
  error,
  onSaveSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onToggleCompare,
  onCompareSnapshot,
}: ConfigSnapshotsBarProps) {
  const [labelInput, setLabelInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSnapshot(labelInput);
      setLabelInput('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="Configuration Snapshots (IndexedDB)"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <Database className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Iteration Snapshots
              </h2>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                IndexedDB · {snapshots.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Persist YAML/TOML/JSON iterations locally in your browser, restore them, or compare any two side-by-side.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleCompare}
            aria-pressed={compareOpen}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              compareOpen
                ? 'border-orange-500 bg-orange-50 text-orange-800 dark:border-orange-500/80 dark:bg-orange-950/40 dark:text-orange-300'
                : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
            {compareOpen ? 'Comparing' : 'Compare'}
          </button>

          <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
            <label htmlFor="snapshot-label-input" className="sr-only">
              Snapshot iteration label
            </label>
            <input
              id="snapshot-label-input"
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="Label (e.g. Baseline 600 VU)..."
              className="h-9 w-full min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none sm:w-56 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? 'Saving...' : 'Save Snapshot'}
            </button>
          </form>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-b border-red-200 bg-red-50 px-5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div className="p-4 sm:px-5">
        {loading ? (
          <p className="py-3 text-xs text-slate-500 dark:text-slate-400">
            Loading saved snapshots from IndexedDB...
          </p>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
            <span>
              No saved iterations yet. Click <strong className="text-slate-800 dark:text-slate-200">Save Snapshot</strong> to store the current YAML config in IndexedDB.
            </span>
          </div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {snapshots.map((snap) => {
              const isActive = activeSnapshotId === snap.id;
              const isCompareBase = compareOpen && compareBaseId === snap.id;
              const isCompareTarget = compareOpen && compareTargetId === snap.id;
              return (
                <li
                  key={snap.id}
                  data-snapshot-id={snap.id}
                  className={`flex flex-col justify-between gap-2.5 rounded-lg border p-3 transition-colors ${
                    isActive
                      ? 'border-orange-400 bg-orange-50/60 dark:border-orange-500/70 dark:bg-orange-950/25'
                      : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-950 dark:text-slate-100">
                        {snap.label}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isCompareBase && (
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-white dark:bg-slate-200 dark:text-slate-950">
                            Base A
                          </span>
                        )}
                        {isCompareTarget && (
                          <span className="rounded bg-orange-600 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-white">
                            Target B
                          </span>
                        )}
                        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {snap.format}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-slate-600 dark:text-slate-400">
                      {snap.specName}
                    </div>
                    <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      {snap.concurrency.toLocaleString()} VUs · {snap.scenarioCount} scenario
                      {snap.scenarioCount === 1 ? '' : 's'} · {formatSnapshotTimestamp(snap.createdAt)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5 border-t border-slate-200/70 pt-2 dark:border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => onRestoreSnapshot(snap)}
                      aria-label={`Restore snapshot ${snap.label}`}
                      className={`inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap ${
                        isActive
                          ? 'bg-orange-600 text-white hover:bg-orange-700'
                          : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      {isActive ? 'Loaded' : 'Restore'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onCompareSnapshot(snap.id)}
                      aria-label={`Compare snapshot ${snap.label}`}
                      className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <GitCompare className="h-3 w-3" aria-hidden="true" />
                      Diff
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSnapshot(snap.id)}
                      aria-label={`Delete snapshot ${snap.label}`}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
