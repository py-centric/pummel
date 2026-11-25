import type { PummelConfig } from '../types/pummel';
import type { StorageLike } from './scheduledTests';

export type GitHookTool = 'prek' | 'pre-commit' | 'githooks';
export type GitHookStage = 'pre-commit' | 'pre-push';

export interface GitHookOptions {
  tool: GitHookTool;
  stage: GitHookStage;
  configGlob: string;
  enableSchemaDryRun: boolean;
  enableSecretGuard: boolean;
  enablePathTraversalCheck: boolean;
  enableSlaThresholdLint: boolean;
  enableProjectLint: boolean;
}

export interface GitHookArtifact {
  tool: GitHookTool;
  toolLabel: string;
  stage: GitHookStage;
  filename: string;
  mimeType: string;
  installCommand: string;
  runCommand: string;
  content: string;
  activeHookCount: number;
}

export const GIT_HOOK_OPTIONS_STORAGE_KEY = 'pummel_git_hooks_options_v1';

export const DEFAULT_GIT_HOOK_OPTIONS: GitHookOptions = {
  tool: 'prek',
  stage: 'pre-commit',
  configGlob: '\\.(pummel\\.)?(yaml|yml|toml|json)$',
  enableSchemaDryRun: true,
  enableSecretGuard: true,
  enablePathTraversalCheck: true,
  enableSlaThresholdLint: true,
  enableProjectLint: false,
};

function sanitizeGlobRegex(glob: string): string {
  const trimmed = glob.trim();
  return trimmed || '\\.(pummel\\.)?(yaml|yml|toml|json)$';
}

function buildPrekToml(config: PummelConfig, opts: GitHookOptions): { content: string; count: number } {
  const filePattern = sanitizeGlobRegex(opts.configGlob);
  const stageName = opts.stage;
  let count = 4; // built-in hygiene hooks

  const lines: string[] = [
    `# prek configuration generated for "${config.name}"`,
    '# Docs: https://prek.j178.dev/configuration/',
    'fail_fast = false',
    `default_stages = ["${stageName}"]`,
    '',
    '[[repos]]',
    'repo = "builtin"',
    'hooks = [',
    '  { id = "trailing-whitespace" },',
    '  { id = "end-of-file-fixer" },',
    '  { id = "check-yaml" },',
    '  { id = "check-merge-conflict" },',
  ];

  if (opts.enableSecretGuard) {
    lines.push('  { id = "detect-private-key" },');
    count += 1;
  }

  lines.push(']', '', '[[repos]]', 'repo = "local"');

  if (opts.enableSchemaDryRun) {
    count += 1;
    lines.push(
      '',
      '[[repos.hooks]]',
      'id = "pummel-dry-run"',
      'name = "Pummel Config Schema & Dry-Run"',
      `entry = "pummel validate --dry-run --strict"`,
      'language = "system"',
      `files = '${filePattern}'`,
      `stages = ["${stageName}"]`
    );
  }

  if (opts.enableSecretGuard) {
    count += 1;
    lines.push(
      '',
      '[[repos.hooks]]',
      'id = "pummel-env-secret-guard"',
      'name = "Block Hardcoded Secrets & ${env.*} Leaks"',
      'entry = "sh -c \'! grep -nE \\"(AWS_SECRET|PRIVATE_KEY|\\\\$\\\\{env\\\\.[^}]*(SECRET|TOKEN|KEY))\\" \\"$@\\"\' --"',
      'language = "system"',
      `files = '${filePattern}'`,
      `stages = ["${stageName}"]`
    );
  }

  if (opts.enablePathTraversalCheck) {
    count += 1;
    lines.push(
      '',
      '[[repos.hooks]]',
      'id = "pummel-path-traversal-guard"',
      'name = "Block Parent Path Traversal in Data Sources"',
      'entry = "sh -c \'! grep -nE \\"(path|body-file)\\\\s*[:=].*\\\\.\\\\./\\" \\"$@\\"\' --"',
      'language = "system"',
      `files = '${filePattern}'`,
      `stages = ["${stageName}"]`
    );
  }

  if (opts.enableSlaThresholdLint) {
    count += 1;
    lines.push(
      '',
      '[[repos.hooks]]',
      'id = "pummel-sla-budget-check"',
      'name = "Verify SLA Latency & Fail-Rate Gates Present"',
      'entry = "sh -c \'grep -qE \\"(sla|p95-response-time|fail-rate)\\" \\"$1\\"\' --"',
      'language = "system"',
      `files = '${filePattern}'`,
      `stages = ["${stageName}"]`
    );
  }

  if (opts.enableProjectLint) {
    count += 1;
    lines.push(
      '',
      '[[repos.hooks]]',
      'id = "typescript-lint"',
      'name = "TypeScript Project Check"',
      'entry = "npm run lint"',
      'language = "system"',
      'pass_filenames = false',
      `stages = ["${stageName}"]`
    );
  }

  return { content: lines.join('\n') + '\n', count };
}

function buildPythonPreCommitYaml(
  config: PummelConfig,
  opts: GitHookOptions
): { content: string; count: number } {
  const filePattern = sanitizeGlobRegex(opts.configGlob);
  const stageName = opts.stage;
  let count = 4;

  const lines: string[] = [
    `# Python pre-commit configuration generated for "${config.name}"`,
    `# Compatible with both Python \`pre-commit\` and Rust \`prek\``,
    `default_stages: [${stageName}]`,
    'fail_fast: false',
    '',
    'repos:',
    '  - repo: https://github.com/pre-commit/pre-commit-hooks',
    '    rev: v5.0.0',
    '    hooks:',
    '      - id: trailing-whitespace',
    '      - id: end-of-file-fixer',
    '      - id: check-yaml',
    '      - id: check-merge-conflict',
  ];

  if (opts.enableSecretGuard) {
    lines.push('      - id: detect-private-key');
    count += 1;
  }

  lines.push('', '  - repo: local', '    hooks:');

  if (opts.enableSchemaDryRun) {
    count += 1;
    lines.push(
      '      - id: pummel-dry-run',
      '        name: Pummel Config Schema & Dry-Run',
      '        entry: pummel validate --dry-run --strict',
      '        language: system',
      `        files: '${filePattern}'`,
      `        stages: [${stageName}]`
    );
  }

  if (opts.enableSecretGuard) {
    count += 1;
    lines.push(
      '      - id: pummel-env-secret-guard',
      '        name: Block Hardcoded Secrets & ${env.*} Leaks',
      `        entry: python3 -c "import re,sys; bad=[f for f in sys.argv[1:] if re.search(r'(AWS_SECRET|PRIVATE_KEY|\\$\\{env\\.[^}]*(SECRET|TOKEN|KEY))', open(f).read())]; sys.exit('Secret leak found: '+','.join(bad) if bad else 0)"`,
      '        language: python',
      `        files: '${filePattern}'`,
      `        stages: [${stageName}]`
    );
  }

  if (opts.enablePathTraversalCheck) {
    count += 1;
    lines.push(
      '      - id: pummel-path-traversal-guard',
      '        name: Block Parent Path Traversal in Data Sources',
      `        entry: python3 -c "import re,sys; bad=[f for f in sys.argv[1:] if re.search(r'(?:path|body-file)\\s*[:=].*\\.\\./', open(f).read())]; sys.exit('Unsafe path traversal: '+','.join(bad) if bad else 0)"`,
      '        language: python',
      `        files: '${filePattern}'`,
      `        stages: [${stageName}]`
    );
  }

  if (opts.enableSlaThresholdLint) {
    count += 1;
    lines.push(
      '      - id: pummel-sla-budget-check',
      '        name: Verify SLA Thresholds Declared',
      `        entry: python3 -c "import sys; missing=[f for f in sys.argv[1:] if 'sla' not in open(f).read()]; sys.exit('Missing sla block: '+','.join(missing) if missing else 0)"`,
      '        language: python',
      `        files: '${filePattern}'`,
      `        stages: [${stageName}]`
    );
  }

  if (opts.enableProjectLint) {
    count += 1;
    lines.push(
      '      - id: typescript-lint',
      '        name: TypeScript Project Check',
      '        entry: npm run lint',
      '        language: system',
      '        pass_filenames: false',
      `        stages: [${stageName}]`
    );
  }

  return { content: lines.join('\n') + '\n', count };
}

function buildStandardGitHookScript(
  config: PummelConfig,
  opts: GitHookOptions
): { content: string; count: number } {
  const stageName = opts.stage;
  let count = 0;

  const lines: string[] = [
    '#!/usr/bin/env sh',
    `# Standard Git ${stageName} hook generated for "${config.name}"`,
    '# Install via: git config core.hooksPath .githooks && chmod +x .githooks/*',
    'set -eu',
    '',
    'STAGED_SPECS=$(git diff --cached --name-only --diff-filter=ACM | grep -E "\\.(yaml|yml|toml|json)$" || true)',
    '',
  ];

  if (opts.enableSecretGuard) {
    count += 1;
    lines.push(
      'echo "[githook] Checking staged configs for secret leaks..."',
      'if [ -n "$STAGED_SPECS" ]; then',
      '  for f in $STAGED_SPECS; do',
      '    if grep -nE "(AWS_SECRET|BEGIN [A-Z ]*PRIVATE KEY|\\$\\{env\\.[^}]*(SECRET|TOKEN|KEY))" "$f"; then',
      '      echo "ERROR: Potential secret leak detected in $f" >&2',
      '      exit 1',
      '    fi',
      '  done',
      'fi',
      ''
    );
  }

  if (opts.enablePathTraversalCheck) {
    count += 1;
    lines.push(
      'echo "[githook] Checking staged configs for path traversal..."',
      'if [ -n "$STAGED_SPECS" ]; then',
      '  for f in $STAGED_SPECS; do',
      '    if grep -nE "(path|body-file)\\s*[:=].*\\.\\./" "$f"; then',
      '      echo "ERROR: Relative parent traversal (../) rejected in $f" >&2',
      '      exit 1',
      '    fi',
      '  done',
      'fi',
      ''
    );
  }

  if (opts.enableSchemaDryRun) {
    count += 1;
    lines.push(
      'echo "[githook] Validating load-testing specs..."',
      'if command -v pummel >/dev/null 2>&1 && [ -n "$STAGED_SPECS" ]; then',
      '  for f in $STAGED_SPECS; do',
      '    case "$f" in',
      '      *pummel*|*.yaml|*.yml|*.toml) pummel validate --dry-run "$f" ;;',
      '    esac',
      '  done',
      'fi',
      ''
    );
  }

  if (opts.enableSlaThresholdLint) {
    count += 1;
    lines.push(
      'echo "[githook] Ensuring SLA gates are declared when execution specs change..."',
      'if [ -n "$STAGED_SPECS" ]; then',
      '  for f in $STAGED_SPECS; do',
      '    if grep -q "concurrency" "$f" && ! grep -q "sla" "$f"; then',
      '      echo "ERROR: Spec $f defines execution concurrency without an SLA guard block" >&2',
      '      exit 1',
      '    fi',
      '  done',
      'fi',
      ''
    );
  }

  if (opts.enableProjectLint) {
    count += 1;
    lines.push(
      'echo "[githook] Running TypeScript lint check..."',
      'npm run lint',
      ''
    );
  }

  lines.push(`echo "[githook] All ${stageName} checks passed."`);
  return { content: lines.join('\n'), count: Math.max(1, count) };
}

export function buildGitHookArtifact(
  config: PummelConfig,
  options: GitHookOptions
): GitHookArtifact {
  if (options.tool === 'prek') {
    const built = buildPrekToml(config, options);
    return {
      tool: 'prek',
      toolLabel: 'prek (Rust pre-commit)',
      stage: options.stage,
      filename: 'prek.toml',
      mimeType: 'application/toml;charset=utf-8',
      installCommand: `prek install --hook-type ${options.stage}`,
      runCommand: 'prek run --all-files',
      content: built.content,
      activeHookCount: built.count,
    };
  }

  if (options.tool === 'pre-commit') {
    const built = buildPythonPreCommitYaml(config, options);
    return {
      tool: 'pre-commit',
      toolLabel: 'Python pre-commit',
      stage: options.stage,
      filename: '.pre-commit-config.yaml',
      mimeType: 'application/x-yaml;charset=utf-8',
      installCommand: `pip install pre-commit && pre-commit install --hook-type ${options.stage}`,
      runCommand: 'pre-commit run --all-files',
      content: built.content,
      activeHookCount: built.count,
    };
  }

  const built = buildStandardGitHookScript(config, options);
  return {
    tool: 'githooks',
    toolLabel: 'Standard Git Hooks (.githooks)',
    stage: options.stage,
    filename: `.githooks-${options.stage}.sh`,
    mimeType: 'text/x-shellscript;charset=utf-8',
    installCommand: `mkdir -p .githooks && chmod +x .githooks/${options.stage} && git config core.hooksPath .githooks`,
    runCommand: `sh .githooks/${options.stage}`,
    content: built.content,
    activeHookCount: built.count,
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

export function loadGitHookOptions(
  storage: StorageLike | null = getDefaultStorage()
): GitHookOptions {
  if (!storage) return { ...DEFAULT_GIT_HOOK_OPTIONS };
  try {
    const raw = storage.getItem(GIT_HOOK_OPTIONS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GIT_HOOK_OPTIONS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_GIT_HOOK_OPTIONS };
    const obj = parsed as Partial<GitHookOptions>;
    return {
      tool:
        obj.tool === 'pre-commit' || obj.tool === 'githooks' || obj.tool === 'prek'
          ? obj.tool
          : 'prek',
      stage: obj.stage === 'pre-push' ? 'pre-push' : 'pre-commit',
      configGlob:
        typeof obj.configGlob === 'string' && obj.configGlob.trim()
          ? obj.configGlob
          : DEFAULT_GIT_HOOK_OPTIONS.configGlob,
      enableSchemaDryRun: obj.enableSchemaDryRun ?? true,
      enableSecretGuard: obj.enableSecretGuard ?? true,
      enablePathTraversalCheck: obj.enablePathTraversalCheck ?? true,
      enableSlaThresholdLint: obj.enableSlaThresholdLint ?? true,
      enableProjectLint: obj.enableProjectLint ?? false,
    };
  } catch {
    return { ...DEFAULT_GIT_HOOK_OPTIONS };
  }
}

export function saveGitHookOptions(
  options: GitHookOptions,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(GIT_HOOK_OPTIONS_STORAGE_KEY, JSON.stringify(options));
    return true;
  } catch {
    return false;
  }
}
