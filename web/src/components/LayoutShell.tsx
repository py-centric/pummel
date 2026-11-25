import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  Building2,
  FileCode2,
  Menu,
  Moon,
  Play,
  ShieldCheck,
  Square,
  Sun,
  Terminal,
  X,
} from 'lucide-react';
import { usePummel } from '../context/PummelContext';
import { useTheme } from '../context/ThemeContext';
import { GlobalSearch } from './GlobalSearch';

interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Cluster & TUI',
    description: 'Distributed gRPC & Ratatui',
    icon: Terminal,
  },
  {
    to: '/workspace',
    label: 'Config Workspace',
    description: 'YAML/TOML, dry-run & export',
    icon: FileCode2,
  },
  {
    to: '/compliance',
    label: 'Compliance & Audit',
    description: 'FR/NFR matrix & JUnit XML',
    icon: ShieldCheck,
  },
  {
    to: '/facilities',
    label: 'Facilities L&F',
    description: 'Lost & found + AI match',
    icon: Building2,
  },
];

const ROUTE_TITLES: Record<string, { section: string; page: string }> = {
  '/': { section: 'Execution', page: 'Cluster & TUI' },
  '/workspace': { section: 'Authoring', page: 'Config Workspace' },
  '/compliance': { section: 'Governance', page: 'Compliance & Audit' },
  '/facilities': { section: 'Campus Ops', page: 'Facilities Lost & Found' },
};

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { config, runState, startRun, stopRun } = usePummel();
  const { isDark, toggleTheme } = useTheme();

  const breadcrumb = ROUTE_TITLES[location.pathname] ?? ROUTE_TITLES['/'];
  const onlineWorkers = runState.workers.filter((w) => w.status !== 'offline').length;
  const isRunning = runState.status === 'running';

  const renderNavLinks = (onNavigate?: () => void) => (
    <nav aria-label="Primary navigation" className="flex flex-col gap-1 px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-50'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    isActive
                      ? 'text-orange-400'
                      : 'text-slate-500 group-hover:text-slate-800 dark:text-slate-400 dark:group-hover:text-slate-200'
                  }`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold whitespace-nowrap">{item.label}</span>
                  <span
                    className={`truncate text-xs ${
                      isActive
                        ? 'text-slate-300 dark:text-slate-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {item.description}
                  </span>
                </span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 lg:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white dark:lg:border-slate-800 dark:lg:bg-slate-900">
        <div className="flex h-16 items-center border-b border-slate-200 px-5 dark:border-slate-800">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0 dark:text-slate-50"
          >
            <Activity className="h-5 w-5 text-orange-600 dark:text-orange-500" aria-hidden="true" />
            <span>Pummel</span>
          </NavLink>
        </div>

        <div className="flex-1 overflow-y-auto">{renderNavLinks()}</div>

        <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            Coordinator Topology
          </div>
          <dl className="mt-2 space-y-1.5 font-mono tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">Bind</dt>
              <dd className="truncate text-slate-800 dark:text-slate-200">
                {config.distributed.coordinatorBind}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">Workers</dt>
              <dd className="text-slate-800 dark:text-slate-200">
                {onlineWorkers}/{runState.workers.length} online
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">Control API</dt>
              <dd className="text-slate-800 dark:text-slate-200">
                {config.api.bindAddress}:{config.api.port}
              </dd>
            </div>
          </dl>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation menu"
        >
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
              <span className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-slate-50">
                <Activity className="h-5 w-5 text-orange-600 dark:text-orange-500" aria-hidden="true" />
                Pummel
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderNavLinks(() => setMobileMenuOpen(false))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:h-16 lg:gap-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden min-w-0 items-center gap-2 text-sm md:flex">
              <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {breadcrumb.section}
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                /
              </span>
              <span className="truncate font-semibold text-slate-950 dark:text-slate-50">
                {breadcrumb.page}
              </span>
            </div>
          </div>

          {/* Center Global Search */}
          <div className="flex min-w-0 flex-1 justify-center md:max-w-md">
            <GlobalSearch />
          </div>

          {/* Right Controls: Theme Toggle + Cluster Run CTA */}
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            {isRunning ? (
              <button
                type="button"
                onClick={stopRun}
                aria-label="Stop Run"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span className="hidden sm:inline">Stop Run</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startRun}
                aria-label="Start Cluster Run"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-orange-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-orange-700 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span className="hidden sm:inline">Start Cluster Run</span>
              </button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
