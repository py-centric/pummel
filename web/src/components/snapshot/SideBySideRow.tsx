import React from 'react';
import type { SideBySideDiffRow } from '../../engine/snapshotDiff';

export function SideBySideRow({ row }: { row: SideBySideDiffRow }) {
  const leftCellTone =
    row.kind === 'removed'
      ? 'bg-rose-50/90 text-rose-950 dark:bg-rose-950/35 dark:text-rose-200'
      : row.kind === 'modified'
        ? 'bg-amber-50/85 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
        : row.leftText === null
          ? 'bg-slate-50/60 text-slate-400 dark:bg-slate-950/40 dark:text-slate-600'
          : 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-300';

  const rightCellTone =
    row.kind === 'added'
      ? 'bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/35 dark:text-emerald-200'
      : row.kind === 'modified'
        ? 'bg-amber-50/85 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
        : row.rightText === null
          ? 'bg-slate-50/60 text-slate-400 dark:bg-slate-950/40 dark:text-slate-600'
          : 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-300';

  const leftMarker = row.kind === 'removed' ? '-' : row.kind === 'modified' ? '~' : ' ';
  const rightMarker = row.kind === 'added' ? '+' : row.kind === 'modified' ? '~' : ' ';

  return (
    <div
      data-diff-kind={row.kind}
      className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800"
    >
      {/* Left Base Column */}
      <div className={`flex min-w-0 items-baseline ${leftCellTone}`}>
        <span className="w-10 shrink-0 select-none border-r border-slate-200/70 px-2 py-1 text-right text-[11px] tabular-nums text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
          {row.leftLineNumber ?? ''}
        </span>
        <span
          className={`w-5 shrink-0 select-none text-center font-bold ${
            row.kind === 'removed'
              ? 'text-rose-600 dark:text-rose-400'
              : row.kind === 'modified'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-400'
          }`}
        >
          {leftMarker}
        </span>
        <pre className="min-w-0 flex-1 overflow-x-auto py-1 pr-3 whitespace-pre">
          {row.leftText ?? ''}
        </pre>
      </div>

      {/* Right Target Column */}
      <div className={`flex min-w-0 items-baseline ${rightCellTone}`}>
        <span className="w-10 shrink-0 select-none border-r border-slate-200/70 px-2 py-1 text-right text-[11px] tabular-nums text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
          {row.rightLineNumber ?? ''}
        </span>
        <span
          className={`w-5 shrink-0 select-none text-center font-bold ${
            row.kind === 'added'
              ? 'text-emerald-600 dark:text-emerald-400'
              : row.kind === 'modified'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-400'
          }`}
        >
          {rightMarker}
        </span>
        <pre className="min-w-0 flex-1 overflow-x-auto py-1 pr-3 whitespace-pre">
          {row.rightText ?? ''}
        </pre>
      </div>
    </div>
  );
}
