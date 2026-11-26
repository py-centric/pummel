import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, RotateCcw, Search, Sparkles } from 'lucide-react';
import {
  createSeededFoundItems,
  createSeededMissingReports,
  loadFoundItems,
  loadMissingReports,
  loadSavedMatches,
  saveFoundItems,
  saveMatches,
  saveMissingReports,
  type FoundItem,
  type GeminiMatchSuggestion,
  type MissingReport,
} from '../engine/lostAndFound';
import { GeminiMatchesPanel } from '../components/facilities/GeminiMatchesPanel';
import { FoundItemsColumn } from '../components/facilities/FoundItemsColumn';
import { MissingReportsColumn } from '../components/facilities/MissingReportsColumn';

export function FacilitiesPage() {
  const [foundItems, setFoundItems] = useState<FoundItem[]>(() => loadFoundItems());
  const [missingReports, setMissingReports] = useState<MissingReport[]>(() =>
    loadMissingReports()
  );
  const [matches, setMatches] = useState<GeminiMatchSuggestion[]>(() => loadSavedMatches());
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);
  const [matchingBusy, setMatchingBusy] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    saveFoundItems(foundItems);
  }, [foundItems]);

  useEffect(() => {
    saveMissingReports(missingReports);
  }, [missingReports]);

  useEffect(() => {
    saveMatches(matches);
  }, [matches]);

  const openFoundCount = foundItems.filter((f) => f.status === 'open').length;
  const activeMissingCount = missingReports.filter((m) => m.status === 'searching').length;
  const resolvedCount =
    foundItems.filter((f) => f.status === 'claimed').length +
    missingReports.filter((m) => m.status === 'resolved').length;

  const filteredFoundItems = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return foundItems;
    return foundItems.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.locationFound.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
    );
  }, [foundItems, searchFilter]);

  const filteredMissingReports = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return missingReports;
    return missingReports.filter(
      (m) =>
        m.itemName.toLowerCase().includes(q) ||
        m.reporterName.toLowerCase().includes(q) ||
        m.lastSeenLocation.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }, [missingReports, searchFilter]);

  const handleRunGeminiMatch = async () => {
    setMatchingBusy(true);
    setMatchError(null);
    try {
      const resp = await fetch('/api/facilities/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foundItems,
          missingReports,
        }),
      });
      const json = (await resp.json()) as {
        matches?: GeminiMatchSuggestion[];
        analyzedAtIso?: string;
        error?: string;
      };
      if (!resp.ok || json.error) {
        setMatchError(json.error || `Match analysis failed with HTTP ${resp.status}.`);
        return;
      }
      setMatches(Array.isArray(json.matches) ? json.matches : []);
      setLastAnalyzedAt(json.analyzedAtIso ?? new Date().toISOString());
    } catch (err) {
      setMatchError(
        err instanceof Error ? err.message : 'Unable to reach /api/facilities/match endpoint.'
      );
    } finally {
      setMatchingBusy(false);
    }
  };

  const handleConfirmMatch = (match: GeminiMatchSuggestion) => {
    const report = missingReports.find((m) => m.id === match.missingReportId);
    setFoundItems((prev) =>
      prev.map((f) =>
        f.id === match.foundItemId
          ? {
              ...f,
              status: 'claimed',
              claimedBy: report ? report.reporterName : 'Verified Owner',
            }
          : f
      )
    );
    setMissingReports((prev) =>
      prev.map((m) => (m.id === match.missingReportId ? { ...m, status: 'resolved' } : m))
    );
    setMatches((prev) => prev.filter((m) => m.id !== match.id));
  };

  const handleToggleFoundStatus = (id: string) => {
    setFoundItems((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              status: f.status === 'open' ? 'claimed' : 'open',
              claimedBy: f.status === 'open' ? 'Front Desk Pickup' : undefined,
            }
          : f
      )
    );
  };

  const handleToggleMissingStatus = (id: string) => {
    setMissingReports((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, status: m.status === 'searching' ? 'resolved' : 'searching' }
          : m
      )
    );
  };

  const handleResetDemoData = () => {
    setFoundItems(createSeededFoundItems());
    setMissingReports(createSeededMissingReports());
    setMatches([]);
    setMatchError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-400">
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            Facilities Operations
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50 text-balance">
            Digital Lost &amp; Found Registry
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Staff intake with live camera photo capture, student/parent missing item reports, and
            Gemini multimodal match suggestions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetDemoData}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset Seed Logs
          </button>

          <button
            type="button"
            disabled={matchingBusy || openFoundCount === 0 || activeMissingCount === 0}
            onClick={() => void handleRunGeminiMatch()}
            data-testid="facilities-gemini-match-btn"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-4 text-xs font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {matchingBusy ? 'Analyzing Photos & Logs...' : 'Run Gemini Smart Match'}
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <section
        aria-label="Lost and Found summary metrics"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800"
      >
        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Open Found Items
          </div>
          <div
            data-testid="found-open-count"
            className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-950 dark:text-slate-50"
          >
            {openFoundCount}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {foundItems.length} total staff logs
          </div>
        </div>

        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Active Missing Reports
          </div>
          <div
            data-testid="missing-active-count"
            className="mt-1 font-mono text-2xl font-semibold tabular-nums text-orange-700 dark:text-orange-400"
          >
            {activeMissingCount}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Student &amp; parent submissions
          </div>
        </div>

        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Gemini Suggested Matches
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-sky-700 dark:text-sky-400">
            {matches.length}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {lastAnalyzedAt
              ? `Updated ${new Date(lastAnalyzedAt).toLocaleTimeString()}`
              : 'Ready for visual & text match'}
          </div>
        </div>

        <div className="bg-white p-4 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Claimed &amp; Resolved
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {resolvedCount}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Returned to owners
          </div>
        </div>
      </section>

      {/* Gemini Error State (Honest propagation when API key missing or upstream error) */}
      {matchError && (
        <div
          role="alert"
          data-testid="gemini-match-error"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <div className="font-semibold">Gemini Smart Match unavailable</div>
            <p className="mt-0.5">{matchError}</p>
          </div>
        </div>
      )}

      {/* Gemini Match Suggestions Panel */}
      <GeminiMatchesPanel
        matches={matches}
        foundItems={foundItems}
        missingReports={missingReports}
        onConfirmMatch={handleConfirmMatch}
      />

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <label htmlFor="facilities-search-input" className="sr-only">
          Filter found items and missing reports
        </label>
        <input
          id="facilities-search-input"
          type="search"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Search found items, locations, student or parent names..."
          className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {/* Main 2-Column Interactive Registry */}
      <div className="grid gap-6 lg:grid-cols-12">
        <FoundItemsColumn
          filteredFoundItems={filteredFoundItems}
          onAddFoundItem={(created) => setFoundItems((prev) => [created, ...prev])}
          onToggleFoundStatus={handleToggleFoundStatus}
        />
        <MissingReportsColumn
          filteredMissingReports={filteredMissingReports}
          onAddMissingReport={(created) => setMissingReports((prev) => [created, ...prev])}
          onToggleMissingStatus={handleToggleMissingStatus}
        />
      </div>
    </div>
  );
}
