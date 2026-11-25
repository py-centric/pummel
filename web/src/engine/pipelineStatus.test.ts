import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadTrackedPipelineTarget,
  mapGitHubWorkflowRuns,
  mapGitLabPipelines,
  normalizeGitHubConclusion,
  normalizeGitLabStatus,
  sanitizeGitLabOrigin,
  sanitizeRepositorySlug,
  saveTrackedPipelineTarget,
} from './pipelineStatus';

test('sanitizeRepositorySlug normalizes GitHub/GitLab URLs and rejects invalid paths', () => {
  assert.equal(sanitizeRepositorySlug('https://github.com/grafana/k6.git'), 'grafana/k6');
  assert.equal(sanitizeRepositorySlug('gitlab-org/gitlab-runner/'), 'gitlab-org/gitlab-runner');
  assert.equal(sanitizeRepositorySlug('invalid-slug'), null);
  assert.equal(sanitizeRepositorySlug('bad host/repo with spaces'), null);
});

test('sanitizeGitLabOrigin accepts https URLs and falls back cleanly', () => {
  assert.equal(sanitizeGitLabOrigin('gitlab.example.com/team'), 'https://gitlab.example.com');
  assert.equal(sanitizeGitLabOrigin(''), 'https://gitlab.com');
});

test('normalizeGitHubConclusion and mapGitHubWorkflowRuns summarize health accurately', () => {
  assert.equal(normalizeGitHubConclusion('in_progress', null), 'running');
  assert.equal(normalizeGitHubConclusion('completed', 'success'), 'passing');
  assert.equal(normalizeGitHubConclusion('completed', 'failure'), 'failing');

  const report = mapGitHubWorkflowRuns({
    repository: 'grafana/k6',
    branchFilter: 'master',
    configPath: 'pummel.yaml',
    rawRuns: [
      {
        id: 9001,
        run_number: 412,
        name: 'Load Test Gate',
        head_branch: 'master',
        head_sha: 'abcdef1234567',
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-11-22T10:00:00.000Z',
        updated_at: '2026-11-22T10:02:15.000Z',
        html_url: 'https://github.com/grafana/k6/actions/runs/9001',
        head_commit: { message: 'chore: tune k6 thresholds\nextra details' },
      },
    ],
  });

  assert.equal(report.health, 'passing');
  assert.equal(report.latestRun?.commitSha, 'abcdef1');
  assert.equal(report.latestRun?.durationSec, 135);
  assert.equal(report.latestRun?.commitMessage, 'chore: tune k6 thresholds');
});

test('normalizeGitLabStatus and mapGitLabPipelines parse GitLab pipeline JSON', () => {
  assert.equal(normalizeGitLabStatus('running'), 'running');
  assert.equal(normalizeGitLabStatus('failed'), 'failing');

  const report = mapGitLabPipelines({
    repository: 'gitlab-org/gitlab-runner',
    branchFilter: 'main',
    configPath: 'pummel.yaml',
    gitlabOrigin: 'https://gitlab.com',
    rawPipelines: [
      {
        id: 777,
        iid: 88,
        status: 'failed',
        ref: 'main',
        sha: '998877665544',
        duration: 92,
        source: 'push',
        updated_at: '2026-11-22T09:00:00.000Z',
        web_url: 'https://gitlab.com/gitlab-org/gitlab-runner/-/pipelines/777',
      },
    ],
  });

  assert.equal(report.health, 'failing');
  assert.equal(report.latestRun?.name, 'Pipeline #88');
  assert.equal(report.latestRun?.durationSec, 92);
});

test('tracked pipeline target persists cleanly to StorageLike', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  saveTrackedPipelineTarget(
    {
      id: 'custom',
      provider: 'gitlab',
      repository: 'org/load-suite',
      branchFilter: 'release',
      configPath: 'ci/pummel.yaml',
    },
    mockStorage
  );
  const loaded = loadTrackedPipelineTarget(mockStorage);
  assert.equal(loaded.provider, 'gitlab');
  assert.equal(loaded.repository, 'org/load-suite');
  assert.equal(loaded.branchFilter, 'release');
});
