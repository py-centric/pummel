import React from 'react';
import { Plus } from 'lucide-react';
import { YamlCodeEditor } from '../YamlCodeEditor';
import { TemplateLibrarySidebar } from '../TemplateLibrarySidebar';
import type { ConfigFormat, PummelConfig } from '../../types/pummel';
import type { LoadTestTemplate } from '../../engine/templateLibrary';

interface WorkspaceEditorSectionProps {
  draftConfig: PummelConfig;
  normalized: PummelConfig;
  inheritedPairs: string[];
  format: ConfigFormat;
  rawText: string;
  activeTemplateId: string | null;
  statusMessage: string | null;
  overrideInput: string;
  appliedOverrides: string[];
  onOverrideInputChange: (val: string) => void;
  onApplyOverride: (e: React.FormEvent) => void;
  onSelectTemplate: (template: LoadTestTemplate) => void;
  onLoadSecurityDemo: () => void;
  onFormatChange: (fmt: ConfigFormat) => void;
  onRawTextChange: (nextVal: string) => void;
}

export function WorkspaceEditorSection({
  draftConfig,
  normalized,
  inheritedPairs,
  format,
  rawText,
  activeTemplateId,
  statusMessage,
  overrideInput,
  appliedOverrides,
  onOverrideInputChange,
  onApplyOverride,
  onSelectTemplate,
  onLoadSecurityDemo,
  onFormatChange,
  onRawTextChange,
}: WorkspaceEditorSectionProps) {
  return (
    <>
      {/* CLI Override Bar */}
      <section
        aria-label="CLI dot-path overrides"
        className="rounded-xl border border-slate-200 bg-white p-4 sm:px-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">Active Spec:</span>{' '}
            {draftConfig.name}
            {statusMessage && (
              <>
                <span aria-hidden="true" className="mx-2 text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <span>{statusMessage}</span>
              </>
            )}
          </div>

          <form onSubmit={onApplyOverride} className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="cli-override-input"
              className="text-xs font-medium text-slate-600 whitespace-nowrap dark:text-slate-400"
            >
              CLI Override (-o)
            </label>
            <input
              id="cli-override-input"
              type="text"
              value={overrideInput}
              onChange={(e) => onOverrideInputChange(e.target.value)}
              placeholder="execution.0.concurrency=900"
              className="h-9 w-full min-w-[210px] rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none sm:w-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Apply Override
            </button>
          </form>
        </div>

        {appliedOverrides.length > 0 && (
          <div className="mt-2.5 border-t border-slate-100 pt-2.5 font-mono text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Active flags: {appliedOverrides.map((o) => `-o ${o}`).join(' ')}
          </div>
        )}
      </section>

      {/* Primary Authoring Split: Template Library Sidebar + Wide Syntax-Highlighted YAML Editor */}
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-4 xl:col-span-3">
          <TemplateLibrarySidebar
            activeTemplateId={activeTemplateId}
            onSelectTemplate={onSelectTemplate}
            onLoadSecurityDemo={onLoadSecurityDemo}
          />
        </div>

        <section
          aria-label="Multi-format configuration editor"
          className="min-w-0 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-8 xl:col-span-9 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div
              className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
              role="tablist"
            >
              {(['yaml', 'toml', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  role="tab"
                  aria-selected={format === fmt}
                  onClick={() => onFormatChange(fmt)}
                  className={`rounded-md px-3 py-1 text-xs font-medium uppercase ${
                    format === fmt
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {inheritedPairs.length > 0
                ? `Normalized: ${inheritedPairs[0]}`
                : 'No dot-notation inheritance'}
            </span>
          </div>

          <YamlCodeEditor
            id="pummel-config-editor"
            value={rawText}
            format={format}
            onChange={onRawTextChange}
            ariaLabel="Pummel load-testing specification editor"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Scenario: {normalized.execution[0]?.scenario ?? 'default'} · Concurrency:{' '}
              {normalized.execution[0]?.concurrency ?? 0} VUs · Quorum:{' '}
              {normalized.distributed.quorumWorkers}
            </span>
            <span>Strict schema: deny_unknown_fields</span>
          </div>
        </section>
      </div>
    </>
  );
}
