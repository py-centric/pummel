import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, Check, ShieldAlert } from 'lucide-react';
import {
  LOAD_TEST_TEMPLATES,
  filterLoadTestTemplates,
  type LoadTestPattern,
  type LoadTestTemplate,
} from '../engine/templateLibrary';

interface TemplateLibrarySidebarProps {
  activeTemplateId: string | null;
  onSelectTemplate: (template: LoadTestTemplate) => void;
  onLoadSecurityDemo: () => void;
}

const FILTER_OPTIONS: { id: LoadTestPattern | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'smoke', label: 'Smoke' },
  { id: 'spike', label: 'Spike' },
  { id: 'stress', label: 'Stress' },
];

export function TemplateLibrarySidebar({
  activeTemplateId,
  onSelectTemplate,
  onLoadSecurityDemo,
}: TemplateLibrarySidebarProps) {
  const [patternFilter, setPatternFilter] = useState<LoadTestPattern | 'all'>('all');

  const visibleTemplates = useMemo(
    () => filterLoadTestTemplates(LOAD_TEST_TEMPLATES, patternFilter),
    [patternFilter]
  );

  return (
    <aside
      aria-label="Template Library"
      className="flex flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
          Template Library
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Inject curated load-testing patterns directly into the editor.
        </p>

        <div
          className="mt-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
          role="tablist"
        >
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={patternFilter === opt.id}
              onClick={() => setPatternFilter(opt.id)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ${
                patternFilter === opt.id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[386px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {visibleTemplates.map((template) => {
          const isActive = activeTemplateId === template.id;
          return (
            <div
              key={template.id}
              className={`px-4 py-2.5 transition-colors ${
                isActive
                  ? 'bg-orange-50/60 dark:bg-orange-950/30'
                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-950 dark:text-slate-50">
                    {template.name}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    {template.concurrency.toLocaleString()} VUs · {template.durationSec}s ·{' '}
                    {template.protocols.join('/')}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                  {template.pattern}
                </span>
              </div>

              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                {template.summary}
              </p>

              <button
                type="button"
                onClick={() => onSelectTemplate(template)}
                aria-label={`Inject ${template.name} template`}
                className={`mt-2 inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-orange-200 bg-orange-600 text-white hover:bg-orange-700 dark:border-orange-700'
                    : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {isActive ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Loaded in Editor
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                    Inject Pattern
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
        <button
          type="button"
          onClick={onLoadSecurityDemo}
          className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-900 hover:bg-amber-100 whitespace-nowrap dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950"
        >
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Load Security Failure Sample
        </button>
      </div>
    </aside>
  );
}
