import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  GitCommit,
  RefreshCw,
  Workflow,
  XCircle,
} from 'lucide-react';
import {
  DEFAULT_PIPELINE_TARGETS,
  loadTrackedPipelineTarget,
  saveTrackedPipelineTarget,
  type PipelineConclusion,
  type PipelineProvider,
  type PipelineStatusReport,
  type TrackedPipelineTarget,
} from '../engine/pipelineStatus';

interface PipelineStatusWidgetProps {
  activeSpecName: string;
}

function getConclusionMeta(conclusion: PipelineConclusion): {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
} {
  switch (conclusion) {
    case 'passing':
      return {
        label: 'Passing',
        badgeClass:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300',
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />,
      };
    case 'failing':
      return {
        label: 'Failing',
        badgeClass:
          'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300',
        icon: <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />,
      };
    case 'running':
      return {
        label: 'Running',
        badgeClass:
          'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300',
        icon: <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400" aria-hidden="true" />,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        badgeClass:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300',
        icon: <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />,
      };
    default:
      return {
        label: 'Unknown',
        badgeClass:
          'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
        icon: <AlertCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />,
      };
  }
}

export function PipelineStatusWidget({ activeSpecName }: PipelineStatusWidgetProps) {
  const [target, setTarget] = useState<TrackedPipelineTarget>(() =>
    loadTrackedPipelineTarget()
  );
  const [report, setReport] = useState<PipelineStatusReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPipelineStatus = useCallback(async (nextTarget: TrackedPipelineTarget) => {
    setLoading(true);
    setErrorMsg(null);
    saveTrackedPipelineTarget(nextTarget);

    try {
      const qs = new URLSearchParams({
        provider: nextTarget.provider,
        repo: nextTarget.repository,
        branch: nextTarget.branchFilter,
        configPath: nextTarget.configPath,
      });
      if (nextTarget.provider === 'gitlab' && nextTarget.gitlabHost) {
        qs.set('gitlabHost', nextTarget.gitlabHost);
      }

      const resp = await fetch(`/api/pipelines/status?${qs.toString()}`);
      const json = (await resp.json()) as PipelineStatusReport & { error?: string };
      if (!resp.ok || json.error) {
        setReport(null);
        setErrorMsg(json.error || `Request failed with HTTP ${resp.status}.`);
        return;
      }
      setReport(json);
    } catch (err) {
      setReport(null);
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to reach /api/pipelines/status endpoint.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPipelineStatus(target);
    // Run initial fetch once for persisted pipeline target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchPipelineStatus(target);
  };

  const handleSelectPreset = (preset: TrackedPipelineTarget) => {
    setTarget(preset);
    void fetchPipelineStatus(preset);
  };

  const healthMeta = report ? getConclusionMeta(report.health) : null;

  return (
    <section
      aria-label="CI/CD Pipeline Status for Load-Testing Configurations"
      data-testid="pipeline-status-widget"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <Workflow className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                Pipeline Status (GitHub Actions / GitLab CI)
              </h2>
              {healthMeta && (
                <span
                  data-testid="pipeline-health-badge"
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${healthMeta.badgeClass}`}
                >
                  {healthMeta.icon}
                  {healthMeta.label}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Live repository build &amp; verification health for{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {target.configPath}
              </span>{' '}
              ({activeSpecName}).
            </p>
          </div>
        </div>

        {/* Quick Repo Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {DEFAULT_PIPELINE_TARGETS.map((preset) => {
            const isSelected =
              target.provider === preset.provider && target.repository === preset.repository;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'border-orange-500 bg-orange-50 text-orange-800 dark:border-orange-500/70 dark:bg-orange-950/40 dark:text-orange-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {preset.provider === 'github' ? 'GH' : 'GL'}: {preset.repository}
              </button>
            );
          })}
        </div>
      </div>

      {/* Repository Query Controls */}
      <form
        onSubmit={handleSubmit}
        className="grid gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-3.5 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-950/50"
      >
        <label className="sm:col-span-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Provider
          </span>
          <select
            aria-label="CI/CD Provider"
            data-testid="pipeline-provider-select"
            value={target.provider}
            onChange={(e) =>
              setTarget((prev) => ({
                ...prev,
                provider: e.target.value as PipelineProvider,
              }))
            }
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="github">GitHub Actions</option>
            <option value="gitlab">GitLab CI/CD</option>
          </select>
        </label>

        <label className="sm:col-span-4">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Repository (owner/repo)
          </span>
          <input
            type="text"
            aria-label="Repository slug"
            data-testid="pipeline-repo-input"
            value={target.repository}
            onChange={(e) => setTarget((prev) => ({ ...prev, repository: e.target.value }))}
            placeholder="grafana/k6"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <label className="sm:col-span-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Branch
          </span>
          <input
            type="text"
            aria-label="Pipeline branch filter"
            value={target.branchFilter}
            onChange={(e) => setTarget((prev) => ({ ...prev, branchFilter: e.target.value }))}
            placeholder="main"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <label className="sm:col-span-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Config File
          </span>
          <input
            type="text"
            aria-label="Load test config path"
            value={target.configPath}
            onChange={(e) => setTarget((prev) => ({ ...prev, configPath: e.target.value }))}
            placeholder="pummel.yaml"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <div className="flex items-end sm:col-span-2">
          <button
            type="submit"
            disabled={loading}
            data-testid="pipeline-refresh-btn"
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? 'Checking...' : 'Check Status'}
          </button>
        </div>
      </form>

      {/* Output Area */}
      <div className="p-5">
        {errorMsg && (
          <div
            role="alert"
            data-testid="pipeline-error-banner"
            className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <div className="font-semibold">Unable to load CI/CD pipeline telemetry</div>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {!errorMsg && loading && !report && (
          <div className="py-6 text-center font-mono text-xs text-slate-500 dark:text-slate-400">
            Querying {target.provider === 'github' ? 'GitHub Actions' : 'GitLab CI'} API for{' '}
            {target.repository}...
          </div>
        )}

        {!errorMsg && report && (
          <div className="space-y-4">
            {/* Latest Run Banner */}
            {report.latestRun ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-950/50">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {getConclusionMeta(report.latestRun.conclusion).icon}
                    <span className="font-semibold text-slate-950 dark:text-slate-50">
                      Latest: {report.latestRun.name} (#{report.latestRun.runNumber})
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <GitBranch className="h-3 w-3" aria-hidden="true" />
                      {report.latestRun.branch}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      <GitCommit className="h-3 w-3" aria-hidden="true" />
                      {report.latestRun.commitSha}
                    </span>
                  </div>
                  <p className="truncate font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {report.latestRun.commitMessage}
                  </p>
                </div>

                <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {report.latestRun.durationSec !== null && (
                    <span>{report.latestRun.durationSec}s</span>
                  )}
                  <a
                    href={report.latestRun.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-sans font-semibold text-orange-700 hover:underline dark:text-orange-400"
                  >
                    Inspect Run
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {report.note}
              </div>
            )}

            {/* Recent Builds Table */}
            {report.recentRuns.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Workflow / Pipeline</th>
                      <th className="px-3 py-2.5">Branch &amp; SHA</th>
                      <th className="px-3 py-2.5">Commit</th>
                      <th className="px-3 py-2.5 text-right">Duration</th>
                      <th className="px-4 py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {report.recentRuns.slice(0, 5).map((run) => {
                      const meta = getConclusionMeta(run.conclusion);
                      return (
                        <tr
                          key={run.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-2.5">
                            <a
                              href={run.htmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 font-semibold text-slate-900 hover:text-orange-700 dark:text-slate-100 dark:hover:text-orange-400"
                            >
                              {run.name}
                              <span className="font-mono text-[10px] font-normal text-slate-500">
                                #{run.runNumber}
                              </span>
                            </a>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {run.branch} · {run.commitSha}
                          </td>
                          <td className="max-w-xs truncate px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {run.commitMessage}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {run.durationSec !== null ? `${run.durationSec}s` : ' -- '}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${meta.badgeClass}`}
                            >
                              {meta.icon}
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
              <span>{report.note}</span>
              <span>
                Default branch: {report.defaultBranch} · Checked{' '}
                {new Date(report.checkedAtIso).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
