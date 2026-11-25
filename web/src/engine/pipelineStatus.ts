import type { StorageLike } from './scheduledTests';

export type PipelineProvider = 'github' | 'gitlab';

export type PipelineConclusion =
  | 'passing'
  | 'failing'
  | 'running'
  | 'cancelled'
  | 'unknown';

export interface PipelineRunSummary {
  id: string;
  runNumber: number | string;
  name: string;
  branch: string;
  commitSha: string;
  commitMessage: string;
  status: string;
  conclusion: PipelineConclusion;
  durationSec: number | null;
  updatedAtIso: string;
  htmlUrl: string;
}

export interface PipelineStatusReport {
  provider: PipelineProvider;
  repository: string;
  branchFilter: string;
  configPath: string;
  health: PipelineConclusion;
  defaultBranch: string;
  checkedAtIso: string;
  latestRun: PipelineRunSummary | null;
  recentRuns: PipelineRunSummary[];
  configDetected: boolean;
  note: string;
}

export interface TrackedPipelineTarget {
  id: string;
  provider: PipelineProvider;
  repository: string;
  branchFilter: string;
  configPath: string;
  gitlabHost?: string;
}

export const PIPELINE_TARGETS_STORAGE_KEY = 'pummel_tracked_pipelines_v1';

export const DEFAULT_PIPELINE_TARGETS: readonly TrackedPipelineTarget[] = [
  {
    id: 'pipe-k6',
    provider: 'github',
    repository: 'grafana/k6',
    branchFilter: 'master',
    configPath: 'pummel.yaml',
  },
  {
    id: 'pipe-locust',
    provider: 'github',
    repository: 'locustio/locust',
    branchFilter: 'master',
    configPath: 'load/pummel.yaml',
  },
  {
    id: 'pipe-gitlab-runner',
    provider: 'gitlab',
    repository: 'gitlab-org/gitlab-runner',
    branchFilter: 'main',
    configPath: 'pummel.yaml',
    gitlabHost: 'https://gitlab.com',
  },
];

export function sanitizeRepositorySlug(raw: string): string | null {
  const trimmed = raw
    .trim()
    .replace(/^https?:\/\/(github\.com|gitlab\.com)\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  if (!trimmed) return null;
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function sanitizeGitLabOrigin(raw?: string): string {
  const fallback = 'https://gitlab.com';
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = new URL(raw.trim().startsWith('http') ? raw.trim() : `https://${raw.trim()}`);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return fallback;
    return parsed.origin;
  } catch {
    return fallback;
  }
}

export function normalizeGitHubConclusion(
  status?: string | null,
  conclusion?: string | null
): PipelineConclusion {
  const st = (status ?? '').toLowerCase();
  const conc = (conclusion ?? '').toLowerCase();
  if (st === 'in_progress' || st === 'queued' || st === 'waiting' || st === 'pending') {
    return 'running';
  }
  if (conc === 'success' || conc === 'neutral') return 'passing';
  if (conc === 'failure' || conc === 'timed_out' || conc === 'action_required') return 'failing';
  if (conc === 'cancelled' || conc === 'skipped') return 'cancelled';
  if (st === 'completed' && !conc) return 'unknown';
  return 'unknown';
}

export function normalizeGitLabStatus(status?: string | null): PipelineConclusion {
  const st = (status ?? '').toLowerCase();
  if (st === 'success') return 'passing';
  if (st === 'failed') return 'failing';
  if (st === 'running' || st === 'pending' || st === 'created' || st === 'preparing') {
    return 'running';
  }
  if (st === 'canceled' || st === 'cancelled' || st === 'skipped') return 'cancelled';
  return 'unknown';
}

export function mapGitHubWorkflowRuns(params: {
  repository: string;
  branchFilter: string;
  configPath: string;
  defaultBranch?: string;
  rawRuns: unknown[];
  nowIso?: string;
}): PipelineStatusReport {
  const {
    repository,
    branchFilter,
    configPath,
    defaultBranch = 'main',
    rawRuns,
    nowIso = new Date().toISOString(),
  } = params;

  const recentRuns: PipelineRunSummary[] = [];
  for (const item of rawRuns.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const headCommit =
      r.head_commit && typeof r.head_commit === 'object'
        ? (r.head_commit as Record<string, unknown>)
        : null;
    const createdMs = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN;
    const updatedMs = typeof r.updated_at === 'string' ? Date.parse(r.updated_at) : NaN;
    const durationSec =
      Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs >= createdMs
        ? Math.round((updatedMs - createdMs) / 1000)
        : null;

    const conclusion = normalizeGitHubConclusion(
      typeof r.status === 'string' ? r.status : null,
      typeof r.conclusion === 'string' ? r.conclusion : null
    );

    recentRuns.push({
      id: String(r.id ?? recentRuns.length),
      runNumber: typeof r.run_number === 'number' ? r.run_number : String(r.id ?? '-'),
      name:
        (typeof r.name === 'string' && r.name) ||
        (typeof r.display_title === 'string' && r.display_title) ||
        'CI Workflow',
      branch: typeof r.head_branch === 'string' ? r.head_branch : branchFilter || defaultBranch,
      commitSha: typeof r.head_sha === 'string' ? r.head_sha.slice(0, 7) : 'unknown',
      commitMessage:
        headCommit && typeof headCommit.message === 'string'
          ? headCommit.message.split('\n')[0]
          : typeof r.display_title === 'string'
            ? r.display_title
            : 'Workflow execution',
      status: typeof r.status === 'string' ? r.status : 'unknown',
      conclusion,
      durationSec,
      updatedAtIso: typeof r.updated_at === 'string' ? r.updated_at : nowIso,
      htmlUrl:
        typeof r.html_url === 'string'
          ? r.html_url
          : `https://github.com/${repository}/actions`,
    });
  }

  const latestRun = recentRuns[0] ?? null;
  const health: PipelineConclusion = latestRun ? latestRun.conclusion : 'unknown';

  return {
    provider: 'github',
    repository,
    branchFilter,
    configPath,
    health,
    defaultBranch,
    checkedAtIso: nowIso,
    latestRun,
    recentRuns,
    configDetected: recentRuns.length > 0,
    note:
      recentRuns.length > 0
        ? `Live GitHub Actions telemetry (${recentRuns.length} recent workflow runs).`
        : 'Connected to GitHub repository; no workflow runs found for the selected branch.',
  };
}

export function mapGitLabPipelines(params: {
  repository: string;
  branchFilter: string;
  configPath: string;
  gitlabOrigin: string;
  defaultBranch?: string;
  rawPipelines: unknown[];
  nowIso?: string;
}): PipelineStatusReport {
  const {
    repository,
    branchFilter,
    configPath,
    gitlabOrigin,
    defaultBranch = 'main',
    rawPipelines,
    nowIso = new Date().toISOString(),
  } = params;

  const recentRuns: PipelineRunSummary[] = [];
  for (const item of rawPipelines.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    const createdMs = typeof p.created_at === 'string' ? Date.parse(p.created_at) : NaN;
    const updatedMs = typeof p.updated_at === 'string' ? Date.parse(p.updated_at) : NaN;
    const durationSec =
      typeof p.duration === 'number'
        ? Math.round(p.duration)
        : Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs >= createdMs
          ? Math.round((updatedMs - createdMs) / 1000)
          : null;

    const status = typeof p.status === 'string' ? p.status : 'unknown';
    const conclusion = normalizeGitLabStatus(status);

    recentRuns.push({
      id: String(p.id ?? recentRuns.length),
      runNumber: typeof p.iid === 'number' ? p.iid : typeof p.id === 'number' ? p.id : '-',
      name: `Pipeline #${String(p.iid ?? p.id ?? '-')}`,
      branch: typeof p.ref === 'string' ? p.ref : branchFilter || defaultBranch,
      commitSha: typeof p.sha === 'string' ? p.sha.slice(0, 7) : 'unknown',
      commitMessage:
        typeof p.source === 'string' ? `Triggered via ${p.source}` : 'GitLab CI pipeline',
      status,
      conclusion,
      durationSec,
      updatedAtIso: typeof p.updated_at === 'string' ? p.updated_at : nowIso,
      htmlUrl:
        typeof p.web_url === 'string'
          ? p.web_url
          : `${gitlabOrigin}/${repository}/-/pipelines`,
    });
  }

  const latestRun = recentRuns[0] ?? null;
  const health: PipelineConclusion = latestRun ? latestRun.conclusion : 'unknown';

  return {
    provider: 'gitlab',
    repository,
    branchFilter,
    configPath,
    health,
    defaultBranch,
    checkedAtIso: nowIso,
    latestRun,
    recentRuns,
    configDetected: recentRuns.length > 0,
    note:
      recentRuns.length > 0
        ? `Live GitLab CI telemetry (${recentRuns.length} recent pipelines).`
        : 'Connected to GitLab project; no pipelines found for the selected ref.',
  };
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return null;
}

export function loadTrackedPipelineTarget(
  storage: StorageLike | null = getDefaultStorage()
): TrackedPipelineTarget {
  const fallback = DEFAULT_PIPELINE_TARGETS[0];
  if (!storage) return { ...fallback };
  try {
    const raw = storage.getItem(PIPELINE_TARGETS_STORAGE_KEY);
    if (!raw) return { ...fallback };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...fallback };
    const obj = parsed as Partial<TrackedPipelineTarget>;
    const provider: PipelineProvider = obj.provider === 'gitlab' ? 'gitlab' : 'github';
    const repository = sanitizeRepositorySlug(obj.repository ?? '') ?? fallback.repository;
    return {
      id: typeof obj.id === 'string' ? obj.id : fallback.id,
      provider,
      repository,
      branchFilter: typeof obj.branchFilter === 'string' ? obj.branchFilter : '',
      configPath:
        typeof obj.configPath === 'string' && obj.configPath.trim()
          ? obj.configPath.trim()
          : 'pummel.yaml',
      gitlabHost: obj.gitlabHost,
    };
  } catch {
    return { ...fallback };
  }
}

export function saveTrackedPipelineTarget(
  target: TrackedPipelineTarget,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PIPELINE_TARGETS_STORAGE_KEY, JSON.stringify(target));
    return true;
  } catch {
    return false;
  }
}
