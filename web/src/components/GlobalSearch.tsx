import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  FileCode2,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import { usePummel } from '../context/PummelContext';
import { buildComplianceMatrix } from '../engine/complianceAudit';
import {
  searchPummelEntities,
  type GlobalSearchResult,
  type SearchCategory,
} from '../engine/globalSearch';

const CATEGORY_TABS: { id: SearchCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'config', label: 'Config Files' },
  { id: 'worker', label: 'Clusters & Workers' },
  { id: 'compliance', label: 'Compliance & Alerts' },
];

export function GlobalSearch() {
  const navigate = useNavigate();
  const { config, runState, diagnostics } = usePummel();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [activeIndex, setActiveIndex] = useState(0);

  const modalInputRef = useRef<HTMLInputElement | null>(null);

  const complianceItems = useMemo(
    () => buildComplianceMatrix(config, runState, diagnostics),
    [config, runState, diagnostics]
  );

  const results = useMemo(
    () =>
      searchPummelEntities({
        query,
        category,
        config,
        runState,
        complianceItems,
        limit: 12,
      }),
    [query, category, config, runState, complianceItems]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, category, open]);

  // Global keyboard shortcut: Cmd/Ctrl + K opens search modal
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => {
          const next = !prev;
          if (next) {
            window.requestAnimationFrame(() => modalInputRef.current?.focus());
          }
          return next;
        });
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => modalInputRef.current?.focus());
    }
  }, [open]);

  const handleSelectResult = (item: GlobalSearchResult) => {
    setOpen(false);
    setQuery('');
    navigate(item.route, { state: item.navigationState });
  };

  const handleQuickJump = (route: '/' | '/workspace' | '/compliance' | '/facilities') => {
    setOpen(false);
    setQuery('');
    navigate(route);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      handleSelectResult(results[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  const renderCategoryIcon = (cat: GlobalSearchResult['category']) => {
    if (cat === 'config') {
      return (
        <FileCode2
          className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400"
          aria-hidden="true"
        />
      );
    }
    if (cat === 'worker') {
      return (
        <Server
          className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400"
          aria-hidden="true"
        />
      );
    }
    return (
      <ShieldCheck
        className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-hidden="true"
      />
    );
  };

  return (
    <div className="relative w-full max-w-xs sm:max-w-sm">
      {/* Header Search Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="global-search-trigger"
        aria-label="Global search across test configurations, active cluster workers, and compliance reports"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-xs text-slate-500 transition-colors hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-900"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <span className="truncate">Search clusters, config files, workers...</span>
        </span>
        <kbd className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          ⌘K
        </kbd>
      </button>

      {/* Cmd/Ctrl + K Global Search Modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Global search modal"
          data-testid="global-search-modal"
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-20"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setOpen(false)}
          />

          {/* Modal Dialog Surface */}
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            {/* Search Input Header */}
            <div className="relative flex items-center border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <Search
                className="pointer-events-none h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              <label htmlFor="pummel-global-search" className="sr-only">
                Search clusters, workspace config files, workers, or compliance rules
              </label>
              <input
                ref={modalInputRef}
                id="pummel-global-search"
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls="pummel-global-search-results"
                aria-autocomplete="list"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search clusters, config files (pummel.yaml, spike, stress), workers..."
                className="h-8 w-full bg-transparent px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    modalInputRef.current?.focus();
                  }}
                  aria-label="Clear global search"
                  className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close global search modal"
                className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-slate-50 px-2 font-mono text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ESC
              </button>
            </div>

            {/* Category Tabs + Quick Cluster / Workspace Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex flex-wrap items-center gap-1" role="tablist">
                {CATEGORY_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={category === tab.id}
                    onClick={() => setCategory(tab.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                      category === tab.id
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                        : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                {results.length} match{results.length === 1 ? '' : 'es'}
              </span>
            </div>

            {/* Quick Cluster & Workspace Route Switcher */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2 text-xs dark:border-slate-800/80">
              <span className="font-mono text-[10px] uppercase text-slate-400">Quick Jump:</span>
              <button
                type="button"
                onClick={() => handleQuickJump('/')}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Terminal className="h-3 w-3 text-orange-600 dark:text-orange-400" aria-hidden="true" />
                Coordinator Cluster ({config.distributed.coordinatorBind})
              </button>
              <button
                type="button"
                onClick={() => handleQuickJump('/workspace')}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <FileCode2 className="h-3 w-3 text-orange-600 dark:text-orange-400" aria-hidden="true" />
                pummel.yaml Workspace
              </button>
              <button
                type="button"
                onClick={() => handleQuickJump('/compliance')}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Alerting &amp; Compliance
              </button>
              <button
                type="button"
                onClick={() => handleQuickJump('/facilities')}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Building2 className="h-3 w-3 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                Facilities L&amp;F
              </button>
            </div>

            {/* Results Listbox */}
            <div
              id="pummel-global-search-results"
              role="listbox"
              aria-label="Global search results"
              className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800"
            >
              {results.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    No matches for &ldquo;{query}&rdquo;
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Try searching for &ldquo;spike&rdquo;, &ldquo;worker-eu&rdquo;, &ldquo;pummel.yaml&rdquo;, or &ldquo;NFR-SEC&rdquo;.
                  </p>
                </div>
              ) : (
                results.map((item, idx) => {
                  const isSelected = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => handleSelectResult(item)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-orange-50/90 dark:bg-slate-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <div>{renderCategoryIcon(item.category)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-slate-950 dark:text-slate-50">
                            {item.title}
                          </span>
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {item.meta}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {item.subtitle}
                        </div>
                      </div>
                      <ArrowRight
                        className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
                          isSelected
                            ? 'text-orange-600 opacity-100 dark:text-orange-400'
                            : 'opacity-0'
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <span>↑↓ Navigate · Enter Open · Esc Close</span>
              <span className="font-mono">Cmd/Ctrl + K</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
