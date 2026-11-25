import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, GitBranch, ShieldCheck, Terminal } from 'lucide-react';
import type { PummelConfig } from '../types/pummel';
import {
  buildGitHookArtifact,
  loadGitHookOptions,
  saveGitHookOptions,
  type GitHookOptions,
  type GitHookStage,
  type GitHookTool,
} from '../engine/gitHooksEngine';

interface GitHooksPanelProps {
  activeConfig: PummelConfig;
}

const HOOK_TOOLS: ReadonlyArray<{ id: GitHookTool; label: string; badge: string }> = [
  { id: 'prek', label: 'prek (Rust)', badge: 'prek.toml' },
  { id: 'pre-commit', label: 'Python pre-commit', badge: '.pre-commit-config.yaml' },
  { id: 'githooks', label: 'Standard Git Hooks', badge: '.githooks/' },
];

export function GitHooksPanel({ activeConfig }: GitHooksPanelProps) {
  const [options, setOptions] = useState<GitHookOptions>(() => loadGitHookOptions());
  const [copiedKey, setCopiedKey] = useState<'install' | 'file' | null>(null);

  useEffect(() => {
    saveGitHookOptions(options);
  }, [options]);

  const artifact = useMemo(
    () => buildGitHookArtifact(activeConfig, options),
    [activeConfig, options]
  );

  const handleCopy = async (text: string, which: 'install' | 'file') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(which);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      setCopiedKey(null);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = artifact.filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const toggleGate = (
    field:
      | 'enableSchemaDryRun'
      | 'enableSecretGuard'
      | 'enablePathTraversalCheck'
      | 'enableSlaThresholdLint'
      | 'enableProjectLint'
  ) => {
    setOptions((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  return (
    <section
      aria-label="Git Hooks: prek, Python pre-commit, and standard githooks"
      data-testid="git-hooks-panel"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <GitBranch className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                Git Hooks &amp; Pre-Commit Gateways
              </h2>
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                {artifact.activeHookCount} Hooks Ready
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Generate and export repository hooks for <span className="font-mono">prek</span>,
              Python <span className="font-mono">pre-commit</span>, or POSIX{' '}
              <span className="font-mono">.githooks/</span>.
            </p>
          </div>
        </div>

        {/* Tool Selector Tabs */}
        <div
          className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
          role="tablist"
          aria-label="Git hook runner ecosystem"
        >
          {HOOK_TOOLS.map((item) => {
            const active = options.tool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                data-testid={`githook-tab-${item.id}`}
                aria-selected={active}
                onClick={() => setOptions((prev) => ({ ...prev, tool: item.id }))}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls & Gate Checkboxes */}
      <div className="grid gap-4 border-b border-slate-200 bg-slate-50/60 px-5 py-4 lg:grid-cols-12 dark:border-slate-800 dark:bg-slate-950/50">
        <div className="flex flex-wrap items-end gap-3 lg:col-span-5">
          <label className="block min-w-[140px]">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Git Hook Stage
            </span>
            <select
              aria-label="Git hook stage"
              value={options.stage}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, stage: e.target.value as GitHookStage }))
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="pre-commit">pre-commit</option>
              <option value="pre-push">pre-push</option>
            </select>
          </label>

          <label className="block min-w-[180px] flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              File Match Regex
            </span>
            <input
              type="text"
              aria-label="Spec file match regex"
              value={options.configGlob}
              onChange={(e) => setOptions((prev) => ({ ...prev, configGlob: e.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700 lg:col-span-7 dark:text-slate-300">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={options.enableSchemaDryRun}
              onChange={() => toggleGate('enableSchemaDryRun')}
              className="h-3.5 w-3.5 accent-orange-600"
            />
            <span>Schema &amp; Dry-Run</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={options.enableSecretGuard}
              onChange={() => toggleGate('enableSecretGuard')}
              className="h-3.5 w-3.5 accent-orange-600"
            />
            <span>Secret Leak Guard</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={options.enablePathTraversalCheck}
              onChange={() => toggleGate('enablePathTraversalCheck')}
              className="h-3.5 w-3.5 accent-orange-600"
            />
            <span>Path Traversal Guard</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={options.enableSlaThresholdLint}
              onChange={() => toggleGate('enableSlaThresholdLint')}
              className="h-3.5 w-3.5 accent-orange-600"
            />
            <span>SLA Budget Check</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={options.enableProjectLint}
              onChange={() => toggleGate('enableProjectLint')}
              className="h-3.5 w-3.5 accent-orange-600"
            />
            <span>npm run lint</span>
          </label>
        </div>
      </div>

      {/* Install Command + Generated Config Preview */}
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-slate-800 dark:text-slate-200">
            <Terminal className="h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            <span className="truncate">{artifact.installCommand}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy(artifact.installCommand, 'install')}
              className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {copiedKey === 'install' ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                  Copied CLI
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  Copy CLI
                </>
              )}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-200">
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>{artifact.filename}</span>
              <span className="text-slate-400">· {artifact.toolLabel}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy(artifact.content, 'file')}
                className="inline-flex h-7 items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
              >
                {copiedKey === 'file' ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    Copy File
                  </>
                )}
              </button>
              <button
                type="button"
                data-testid="githook-download-btn"
                onClick={handleDownload}
                className="inline-flex h-7 items-center gap-1 rounded bg-orange-600 px-2.5 text-[11px] font-semibold text-white hover:bg-orange-700"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Download {artifact.filename}
              </button>
            </div>
          </div>

          <pre
            data-testid="githook-preview-code"
            className="max-h-72 overflow-auto bg-[#0B1120] p-4 font-mono text-xs leading-relaxed text-slate-200"
          >
            <code>{artifact.content}</code>
          </pre>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          <span>Verify all hooks locally: {artifact.runCommand}</span>
          <span>
            Tooling: {options.tool === 'prek' ? 'prek CLI (Rust)' : options.tool === 'pre-commit' ? 'Python pre-commit' : 'Git core.hooksPath'}
          </span>
        </div>
      </div>
    </section>
  );
}
