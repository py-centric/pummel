import React from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import type {
  FoundItem,
  GeminiMatchSuggestion,
  MissingReport,
} from '../../engine/lostAndFound';

interface GeminiMatchesPanelProps {
  matches: GeminiMatchSuggestion[];
  foundItems: FoundItem[];
  missingReports: MissingReport[];
  onConfirmMatch: (match: GeminiMatchSuggestion) => void;
}

export function GeminiMatchesPanel({
  matches,
  foundItems,
  missingReports,
  onConfirmMatch,
}: GeminiMatchesPanelProps) {
  if (matches.length === 0) return null;

  return (
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
                  onClick={() => onConfirmMatch(match)}
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
                    <p className="mt-0.5 text-slate-600 dark:text-slate-400">{found.description}</p>
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
  );
}
