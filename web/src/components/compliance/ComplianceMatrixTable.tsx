import React from 'react';
import { Search } from 'lucide-react';
import type { ComplianceRequirement } from '../../types/pummel';

export type GroupFilter = 'all' | 'Functional' | 'Non-Functional';
export type StatusFilter = 'all' | 'pass' | 'warning' | 'fail';

interface ComplianceMatrixTableProps {
  filteredItems: ComplianceRequirement[];
  searchQuery: string;
  groupFilter: GroupFilter;
  statusFilter: StatusFilter;
  onSearchChange: (value: string) => void;
  onGroupFilterChange: (value: GroupFilter) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onResetFilters: () => void;
}

export function ComplianceMatrixTable({
  filteredItems,
  searchQuery,
  groupFilter,
  statusFilter,
  onSearchChange,
  onGroupFilterChange,
  onStatusFilterChange,
  onResetFilters,
}: ComplianceMatrixTableProps) {
  return (
    <section
      aria-label="Requirements compliance matrix"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <label htmlFor="compliance-search" className="sr-only">
            Filter compliance requirements
          </label>
          <input
            id="compliance-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search FR-16, distributed, secret..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80">
            {(['all', 'Functional', 'Non-Functional'] as const).map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => onGroupFilterChange(grp)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  groupFilter === grp
                    ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {grp === 'all' ? 'All Groups' : grp}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80">
            {(['all', 'pass', 'warning', 'fail'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => onStatusFilterChange(st)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {st === 'all' ? 'All States' : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        {filteredItems.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No requirements match the current filters.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Clear the search term or reset the group and status filters to view all controls.
            </p>
            <button
              type="button"
              onClick={onResetFilters}
              className="mt-4 inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">ID</th>
                <th className="px-4 py-3">Requirement</th>
                <th className="px-4 py-3">Live Verification Evidence</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="font-mono font-semibold text-slate-950 dark:text-slate-100">
                      {item.id}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {item.category}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 max-w-md">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </div>
                    <p className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-400">
                      {item.requirement}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 max-w-sm font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                    {item.evidence}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">
                    {item.verificationMethod}
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <span
                      className={`font-mono font-semibold uppercase ${
                        item.status === 'pass'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : item.status === 'warning'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {item.status === 'pass'
                        ? 'PASS'
                        : item.status === 'warning'
                          ? 'WARN'
                          : 'FAIL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
