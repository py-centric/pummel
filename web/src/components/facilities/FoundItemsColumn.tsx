import React, { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { CameraPhotoCapture } from '../CameraPhotoCapture';
import {
  LOST_FOUND_CATEGORIES,
  type FoundItem,
  type LostFoundCategory,
} from '../../engine/lostAndFound';

interface FoundItemsColumnProps {
  filteredFoundItems: FoundItem[];
  onAddFoundItem: (item: FoundItem) => void;
  onToggleFoundStatus: (id: string) => void;
}

export function FoundItemsColumn({
  filteredFoundItems,
  onAddFoundItem,
  onToggleFoundStatus,
}: FoundItemsColumnProps) {
  const [foundTitle, setFoundTitle] = useState('');
  const [foundCategory, setFoundCategory] = useState<LostFoundCategory>('Electronics');
  const [foundLocation, setFoundLocation] = useState('');
  const [foundStaffName, setFoundStaffName] = useState('');
  const [foundDescription, setFoundDescription] = useState('');
  const [foundPhotoUrl, setFoundPhotoUrl] = useState<string | undefined>(undefined);
  const [foundFormError, setFoundFormError] = useState<string | null>(null);

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

    onAddFoundItem(created);
    setFoundTitle('');
    setFoundLocation('');
    setFoundStaffName('');
    setFoundDescription('');
    setFoundPhotoUrl(undefined);
    setFoundFormError(null);
  };

  return (
    <section
      aria-label="Staff Found Items Intake and Registry"
      className="space-y-4 lg:col-span-6"
    >
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <PackageCheck
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
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
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{foundFormError}</p>
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
                    onClick={() => onToggleFoundStatus(item.id)}
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
  );
}
