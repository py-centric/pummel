import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPresetConfig } from './configEngine';
import {
  buildGitHookArtifact,
  DEFAULT_GIT_HOOK_OPTIONS,
  loadGitHookOptions,
  saveGitHookOptions,
} from './gitHooksEngine';

test('buildGitHookArtifact generates valid prek.toml with builtin and local Pummel hooks', () => {
  const config = createDefaultPresetConfig();
  const artifact = buildGitHookArtifact(config, {
    ...DEFAULT_GIT_HOOK_OPTIONS,
    tool: 'prek',
    stage: 'pre-commit',
    enableProjectLint: true,
  });

  assert.equal(artifact.filename, 'prek.toml');
  assert.match(artifact.installCommand, /prek install/);
  assert.match(artifact.content, /repo = "builtin"/);
  assert.match(artifact.content, /id = "pummel-dry-run"/);
  assert.match(artifact.content, /id = "typescript-lint"/);
  assert.ok(artifact.activeHookCount >= 8);
});

test('buildGitHookArtifact generates valid Python .pre-commit-config.yaml', () => {
  const config = createDefaultPresetConfig();
  const artifact = buildGitHookArtifact(config, {
    ...DEFAULT_GIT_HOOK_OPTIONS,
    tool: 'pre-commit',
    stage: 'pre-push',
  });

  assert.equal(artifact.filename, '.pre-commit-config.yaml');
  assert.match(artifact.installCommand, /pre-commit install --hook-type pre-push/);
  assert.match(artifact.content, /pre-commit\/pre-commit-hooks/);
  assert.match(artifact.content, /language: python/);
  assert.match(artifact.content, /stages: \[pre-push\]/);
});

test('buildGitHookArtifact generates executable POSIX standard githook script', () => {
  const config = createDefaultPresetConfig();
  const artifact = buildGitHookArtifact(config, {
    ...DEFAULT_GIT_HOOK_OPTIONS,
    tool: 'githooks',
    stage: 'pre-commit',
  });

  assert.equal(artifact.filename, '.githooks-pre-commit.sh');
  assert.match(artifact.installCommand, /git config core\.hooksPath \.githooks/);
  assert.match(artifact.content, /^#!\/usr\/bin\/env sh/);
  assert.match(artifact.content, /STAGED_SPECS=/);
  assert.match(artifact.content, /pummel validate --dry-run/);
});

test('gitHooksEngine persists options cleanly via StorageLike', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  saveGitHookOptions(
    {
      ...DEFAULT_GIT_HOOK_OPTIONS,
      tool: 'githooks',
      stage: 'pre-push',
      enableProjectLint: true,
    },
    mockStorage
  );
  const loaded = loadGitHookOptions(mockStorage);
  assert.equal(loaded.tool, 'githooks');
  assert.equal(loaded.stage, 'pre-push');
  assert.equal(loaded.enableProjectLint, true);
});
