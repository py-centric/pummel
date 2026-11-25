import type { PummelConfig } from '../../types/pummel';
import type { StorageLike } from '../scheduledTests';

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

export function sanitizeGlobRegex(glob: string): string {
  const trimmed = glob.trim();
  return trimmed || '\\.(pummel\\.)?(yaml|yml|toml|json)$';
}

export function buildPrekToml(config: PummelConfig, opts: GitHookOptions): { content: string; count: number } {
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

export function buildPythonPreCommitYaml(
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
