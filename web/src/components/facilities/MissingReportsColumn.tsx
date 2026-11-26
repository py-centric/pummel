import React, { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { CameraPhotoCapture } from '../CameraPhotoCapture';
import {
  LOST_FOUND_CATEGORIES,
  type LostFoundCategory,
  type MissingReport,
} from '../../engine/lostAndFound';

interface MissingReportsColumnProps {
  filteredMissingReports: MissingReport[];
  onAddMissingReport: (report: MissingReport) => void;
  onToggleMissingStatus: (id: string) => void;
}

export function MissingReportsColumn({
  filteredMissingReports,
  onAddMissingReport,
  onToggleMissingStatus,
}: MissingReportsColumnProps) {
  const [reporterType, setReporterType] = useState<'student' | 'parent'>('student');
  const [reporterName, setReporterName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [missingItemName, setMissingItemName] = useState('');
  const [missingCategory, setMissingCategory] = useState<LostFoundCategory>('Electronics');
  const [lastSeenLocation, setLastSeenLocation] = useState('');
  const [missingDescription, setMissingDescription] = useState('');
  const [missingPhotoUrl, setMissingPhotoUrl] = useState<string | undefined>(undefined);
  const [missingFormError, setMissingFormError] = useState<string | null>(null);

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

    onAddMissingReport(created);
    setMissingItemName('');
    setReporterName('');
    setContactInfo('');
    setLastSeenLocation('');
    setMissingDescription('');
    setMissingPhotoUrl(undefined);
    setMissingFormError(null);
  };

  return (
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
                  {rep.reporterType.toUpperCase()} · {rep.reporterName} ({rep.contactInfo}) · Last
                  seen: {rep.lastSeenLocation}
                </div>
                <p className="mt-1 text-slate-700 dark:text-slate-300">{rep.description}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-slate-400">
                    {new Date(rep.lostAtIso).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleMissingStatus(rep.id)}
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
  );
}
