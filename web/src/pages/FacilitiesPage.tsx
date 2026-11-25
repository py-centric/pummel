import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  PackageCheck,
  RotateCcw,
  Search,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { CameraPhotoCapture } from '../components/CameraPhotoCapture';
import {
  createSeededFoundItems,
  createSeededMissingReports,
  loadFoundItems,
  loadMissingReports,
  loadSavedMatches,
  LOST_FOUND_CATEGORIES,
  saveFoundItems,
  saveMatches,
  saveMissingReports,
  type FoundItem,
  type GeminiMatchSuggestion,
  type LostFoundCategory,
  type MissingReport,
} from '../engine/lostAndFound';

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

  // Staff Found Item form state
  const [foundTitle, setFoundTitle] = useState('');
  const [foundCategory, setFoundCategory] = useState<LostFoundCategory>('Electronics');
  const [foundLocation, setFoundLocation] = useState('');
  const [foundStaffName, setFoundStaffName] = useState('');
  const [foundDescription, setFoundDescription] = useState('');
  const [foundPhotoUrl, setFoundPhotoUrl] = useState<string | undefined>(undefined);
  const [foundFormError, setFoundFormError] = useState<string | null>(null);

  // Student / Parent Missing Report form state
  const [reporterType, setReporterType] = useState<'student' | 'parent'>('student');
  const [reporterName, setReporterName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [missingItemName, setMissingItemName] = useState('');
  const [missingCategory, setMissingCategory] = useState<LostFoundCategory>('Electronics');
  const [lastSeenLocation, setLastSeenLocation] = useState('');
  const [missingDescription, setMissingDescription] = useState('');
  const [missingPhotoUrl, setMissingPhotoUrl] = useState<string | undefined>(undefined);
  const [missingFormError, setMissingFormError] = useState<string | null>(null);

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

  const handleLogFoundItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundTitle.trim() || !foundLocation.trim() || !foundStaffName.trim()) {
      setFoundFormError(
        'Item title, location found, and staff name are required before logging a found item.'
      );
      return;
    }

    const created: FoundItem = {
      id: `found-${Date.now().toString().slice(-6)}`,
      title: foundTitle.trim(),
      category: foundCategory,
      locationFound: foundLocation.trim(),
      foundAtIso: new Date().toISOString(),
      staffName: foundStaffName.trim(),
      description:
        foundDescription.trim() || `${foundTitle.trim()} logged at ${foundLocation.trim()}.`,
      photoDataUrl: foundPhotoUrl,
      status: 'open',
    };

    setFoundItems((prev) => [created, ...prev]);
    setFoundTitle('');
    setFoundLocation('');
    setFoundStaffName('');
    setFoundDescription('');
    setFoundPhotoUrl(undefined);
    setFoundFormError(null);
  };

  const handleSubmitMissingReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !missingItemName.trim() ||
      !reporterName.trim() ||
      !contactInfo.trim() ||
      !lastSeenLocation.trim()
    ) {
      setMissingFormError(
        'Item name, reporter name, contact info, and last seen location are required.'
      );
      return;
    }

    const created: MissingReport = {
      id: `miss-${Date.now().toString().slice(-6)}`,
      itemName: missingItemName.trim(),
      category: missingCategory,
      reporterType,
      reporterName: reporterName.trim(),
      contactInfo: contactInfo.trim(),
      lastSeenLocation: lastSeenLocation.trim(),
      lostAtIso: new Date().toISOString(),
      description:
        missingDescription.trim() ||
        `${missingItemName.trim()} last seen near ${lastSeenLocation.trim()}.`,
      photoDataUrl: missingPhotoUrl,
      status: 'searching',
    };

    setMissingReports((prev) => [created, ...prev]);
    setMissingItemName('');
    setReporterName('');
    setContactInfo('');
    setLastSeenLocation('');
    setMissingDescription('');
    setMissingPhotoUrl(undefined);
    setMissingFormError(null);
  };

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
      {matches.length > 0 && (
        <section
          aria-label="Gemini Suggested Lost and Found Matches"
          data-testid="gemini-matches-panel"
          className="rounded-xl border border-orange-300 bg-orange-50/40 dark:border-orange-700/70 dark:bg-orange-950/20"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-200/80 px-5 py-3.5 dark:border-orange-900/50">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Gemini Suggested Matches ({matches.length})
              </h2>
            </div>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              Review visual &amp; descriptive evidence before confirming pickup
            </span>
          </div>

          <div className="divide-y divide-orange-200/70 dark:divide-orange-900/40">
            {matches.map((match) => {
              const found = foundItems.find((f) => f.id === match.foundItemId);
              const missing = missingReports.find((m) => m.id === match.missingReportId);
              if (!found || !missing) return null;
              return (
                <div key={match.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-orange-600 px-2 py-0.5 font-mono text-xs font-bold text-white">
                        {match.confidencePct}% Match
                      </span>
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {match.reason}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleConfirmMatch(match)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Confirm Match &amp; Resolve Both
                    </button>
                  </div>

                  <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    Evidence: {match.visualEvidence}
                  </p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                      {found.photoDataUrl && (
                        <img
                          src={found.photoDataUrl}
                          alt={found.title}
                          className="h-16 w-16 shrink-0 rounded object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
                          Found Item · {found.locationFound}
                        </div>
                        <div className="mt-0.5 font-semibold text-slate-950 dark:text-slate-50">
                          {found.title}
                        </div>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                          {found.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                      {missing.photoDataUrl && (
                        <img
                          src={missing.photoDataUrl}
                          alt={missing.itemName}
                          className="h-16 w-16 shrink-0 rounded object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] font-semibold uppercase text-orange-700 dark:text-orange-400">
                          Missing ({missing.reporterType}) · {missing.reporterName}
                        </div>
                        <div className="mt-0.5 font-semibold text-slate-950 dark:text-slate-50">
                          {missing.itemName}
                        </div>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                          {missing.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
        {/* Staff Found Items Column */}
        <section
          aria-label="Staff Found Items Intake and Registry"
          className="space-y-4 lg:col-span-6"
        >
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                  Log Found Item (Facilities Staff)
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Record items turned in to campus desks and attach live camera or uploaded photos.
              </p>
            </div>

            <form
              onSubmit={handleLogFoundItem}
              data-testid="found-item-form"
              className="space-y-3 p-5"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Item Title
                  </span>
                  <input
                    type="text"
                    required
                    data-testid="found-title-input"
                    value={foundTitle}
                    onChange={(e) => setFoundTitle(e.target.value)}
                    placeholder="e.g. Silver MacBook Charger (96W USB-C)"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Category
                  </span>
                  <select
                    value={foundCategory}
                    onChange={(e) => setFoundCategory(e.target.value as LostFoundCategory)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {LOST_FOUND_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Location Found
                  </span>
                  <input
                    type="text"
                    required
                    data-testid="found-location-input"
                    value={foundLocation}
                    onChange={(e) => setFoundLocation(e.target.value)}
                    placeholder="Library 2nd Floor Study Table"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Logged By (Staff Member)
                  </span>
                  <input
                    type="text"
                    required
                    data-testid="found-staff-input"
                    value={foundStaffName}
                    onChange={(e) => setFoundStaffName(e.target.value)}
                    placeholder="J. Morales (Facilities)"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Condition &amp; Identifying Details
                  </span>
                  <textarea
                    rows={2}
                    value={foundDescription}
                    onChange={(e) => setFoundDescription(e.target.value)}
                    placeholder="Color, stickers, engravings, case details..."
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
              </div>

              <CameraPhotoCapture
                idPrefix="found"
                photoDataUrl={foundPhotoUrl}
                onChangePhoto={setFoundPhotoUrl}
              />

              {foundFormError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {foundFormError}
                </p>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  data-testid="submit-found-item-btn"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                >
                  Log Found Item
                </button>
              </div>
            </form>
          </div>

          {/* Found Items List */}
          <div
            data-testid="found-items-list"
            className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="bg-slate-50/70 px-5 py-3 text-xs font-semibold text-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
              Found Item Inventory ({filteredFoundItems.length})
            </div>
            {filteredFoundItems.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No found items match the current search.
              </div>
            ) : (
              filteredFoundItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-4 text-xs">
                  {item.photoDataUrl ? (
                    <img
                      src={item.photoDataUrl}
                      alt={item.title}
                      className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-950 dark:text-slate-50">
                        {item.title}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                          item.status === 'claimed'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {item.category} · {item.locationFound} · Logged by {item.staffName}
                    </div>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">{item.description}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(item.foundAtIso).toLocaleString()}
                        {item.claimedBy ? ` · Claimed by ${item.claimedBy}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleFoundStatus(item.id)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {item.status === 'open' ? 'Mark Claimed' : 'Reopen'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Student & Parent Missing Reports Column */}
        <section
          aria-label="Student and Parent Missing Item Reports"
          className="space-y-4 lg:col-span-6"
        >
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                  Report Missing Item (Student / Parent)
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Submit lost item details and reference photos so Gemini can match against found logs.
              </p>
            </div>

            <form
              onSubmit={handleSubmitMissingReport}
              data-testid="missing-report-form"
              className="space-y-3 p-5"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Reporter Role
                  </span>
                  <select
                    value={reporterType}
                    onChange={(e) => setReporterType(e.target.value as 'student' | 'parent')}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="student">Student</option>
                    <option value="parent">Parent / Guardian</option>
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Category
                  </span>
                  <select
                    value={missingCategory}
                    onChange={(e) => setMissingCategory(e.target.value as LostFoundCategory)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {LOST_FOUND_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Reporter Name
                  </span>
                  <input
                    type="text"
                    required
                    data-testid="missing-reporter-input"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder="Alex Rivera (Parent)"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Email or Phone
                  </span>
                  <input
                    type="text"
                    required
                    data-testid="missing-contact-input"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="rivera.family@example.com"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Missing Item Name
                  </span>
                  <input
                    type="text"
                    required
                    data-testid="missing-item-input"
                    value={missingItemName}
                    onChange={(e) => setMissingItemName(e.target.value)}
                    placeholder="MacBook power adapter"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Last Seen Location
                  </span>
                  <input
                    type="text"
                    required
                    data-testid="missing-location-input"
                    value={lastSeenLocation}
                    onChange={(e) => setLastSeenLocation(e.target.value)}
                    placeholder="Main Library Upstairs"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Description &amp; Distinct Features
                  </span>
                  <textarea
                    rows={2}
                    value={missingDescription}
                    onChange={(e) => setMissingDescription(e.target.value)}
                    placeholder="Brand, color, stickers, name tag..."
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
              </div>

              <CameraPhotoCapture
                idPrefix="missing"
                photoDataUrl={missingPhotoUrl}
                onChangePhoto={setMissingPhotoUrl}
                label="Reference Photo (Optional)"
              />

              {missingFormError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {missingFormError}
                </p>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  data-testid="submit-missing-report-btn"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-4 text-xs font-semibold text-white hover:bg-orange-700"
                >
                  Submit Missing Report
                </button>
              </div>
            </form>
          </div>

          {/* Missing Reports List */}
          <div
            data-testid="missing-reports-list"
            className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="bg-slate-50/70 px-5 py-3 text-xs font-semibold text-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
              Missing Item Reports ({filteredMissingReports.length})
            </div>
            {filteredMissingReports.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No missing item reports match the current search.
              </div>
            ) : (
              filteredMissingReports.map((rep) => (
                <div key={rep.id} className="flex items-start gap-3 p-4 text-xs">
                  {rep.photoDataUrl ? (
                    <img
                      src={rep.photoDataUrl}
                      alt={rep.itemName}
                      className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-950 dark:text-slate-50">
                        {rep.itemName}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                          rep.status === 'resolved'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300'
                        }`}
                      >
                        {rep.status}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {rep.reporterType.toUpperCase()} · {rep.reporterName} ({rep.contactInfo}) ·
                      Last seen: {rep.lastSeenLocation}
                    </div>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">{rep.description}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(rep.lostAtIso).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleMissingStatus(rep.id)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {rep.status === 'searching' ? 'Mark Resolved' : 'Reopen Search'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
