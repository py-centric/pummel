import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, Copy, RefreshCw, Search, ShieldCheck, Webhook } from 'lucide-react';
import { usePummel } from '../context/PummelContext';
import { buildComplianceMatrix } from '../engine/complianceAudit';
import { generateJunitXml } from '../engine/configEngine';
import { AlertingConfigSection } from '../components/AlertingConfigSection';
import { IntegrationsTabPanel } from '../components/IntegrationsTabPanel';

type GroupFilter = 'all' | 'Functional' | 'Non-Functional';
type StatusFilter = 'all' | 'pass' | 'warning' | 'fail';
type CompliancePageTab = 'compliance' | 'integrations';

interface ComplianceLocationState {
  searchQuery?: string;
}

export function CompliancePage() {
  const location = useLocation();
  const { config, runState, diagnostics, lastAuditAt, webhookIntegrations, rerunAudit } =
    usePummel();

  const [activeTab, setActiveTab] = useState<CompliancePageTab>('compliance');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showJunitPreview, setShowJunitPreview] = useState(false);
  const [copiedXml, setCopiedXml] = useState(false);

  useEffect(() => {
    const state = location.state as ComplianceLocationState | null;
    if (!state?.searchQuery) return;
    setSearchQuery(state.searchQuery);
    setGroupFilter('all');
    setStatusFilter('all');
  }, [location.state]);

  const items = useMemo(
    () => buildComplianceMatrix(config, runState, diagnostics),
    [config, runState, diagnostics]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (groupFilter !== 'all' && item.group !== groupFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.requirement.toLowerCase().includes(q) ||
        item.evidence.toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery, groupFilter, statusFilter]);

  const counts = useMemo(
    () => ({
      total: items.length,
      pass: items.filter((i) => i.status === 'pass').length,
      warning: items.filter((i) => i.status === 'warning').length,
      fail: items.filter((i) => i.status === 'fail').length,
    }),
    [items]
  );

  const junitXml = useMemo(() => generateJunitXml(runState, config.name), [runState, config.name]);

  const handleCopyXml = async () => {
    try {
      await navigator.clipboard.writeText(junitXml);
      setCopiedXml(true);
      window.setTimeout(() => setCopiedXml(false), 1600);
    } catch {
      setCopiedXml(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50 text-balance">
            Requirements &amp; Security Compliance Audit
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Live verification of Functional Requirements (FR-01 to FR-17), Alerting Thresholds, and
            Non-Functional Security, Performance, and Reliability guarantees · Last audited {lastAuditAt}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowJunitPreview((prev) => !prev)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {showJunitPreview ? 'Hide JUnit XML' : 'Preview JUnit XML'}
          </button>
          <button
            type="button"
            onClick={rerunAudit}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Re-run Security Audit
          </button>
        </div>
      </div>

      {/* Section Tabs: Compliance & Alerting vs Integrations */}
      <div
        className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Compliance page sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'compliance'}
          onClick={() => setActiveTab('compliance')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'compliance'
              ? 'border-orange-600 text-slate-950 dark:border-orange-500 dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Compliance &amp; Alerting
        </button>
        <button
          type="button"
          role="tab"
          data-testid="compliance-integrations-tab"
          aria-selected={activeTab === 'integrations'}
          onClick={() => setActiveTab('integrations')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'integrations'
              ? 'border-orange-600 text-slate-950 dark:border-orange-500 dark:text-white'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          <Webhook className="h-3.5 w-3.5" aria-hidden="true" />
          Integrations
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {webhookIntegrations.length}
          </span>
        </button>
      </div>

      {activeTab === 'integrations' ? (
        <IntegrationsTabPanel />
      ) : (
        <>
          {/* Summary Strip */}
          <section
            aria-label="Compliance summary counts"
            className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800"
          >
            <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Tracked Controls
              </div>
              <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">
                {counts.total}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">FR + NFR guarantees</div>
            </div>
            <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Verified Passing
              </div>
              <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {counts.pass}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Active runtime &amp; schema gates
              </div>
            </div>
            <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Warnings</div>
              <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {counts.warning}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                SLA or quorum advisories
              </div>
            </div>
            <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Blocking Failures
              </div>
              <div
                className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
                  counts.fail > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-slate-950 dark:text-slate-50'
                }`}
              >
                {counts.fail}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Policy or schema violations
              </div>
            </div>
          </section>

          {/* Latency & Error-Rate Alerting Section */}
          <AlertingConfigSection />

      {/* Optional JUnit XML Report Preview (NFR-SEC-05 xml_escape) */}
      {showJunitPreview && (
        <section
          aria-label="Escaped JUnit XML compliance report"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                CI/CD JUnit XML Export (xml_escape protected)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reflects live SLA evaluations for &ldquo;{config.name}&rdquo; (NFR-SEC-05).
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyXml}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {copiedXml ? (
                <>
                  <Check
                    className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  Copied XML
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy XML
                </>
              )}
            </button>
          </div>
          <pre className="max-h-60 overflow-auto bg-[#0B1120] p-4 font-mono text-xs leading-relaxed text-slate-200">
            <code>{junitXml}</code>
          </pre>
        </section>
      )}

      {/* Filter Bar & Compliance Matrix Table */}
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
                  onClick={() => setGroupFilter(grp)}
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
                  onClick={() => setStatusFilter(st)}
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
                onClick={() => {
                  setSearchQuery('');
                  setGroupFilter('all');
                  setStatusFilter('all');
                }}
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
        </>
      )}
    </div>
  );
}

