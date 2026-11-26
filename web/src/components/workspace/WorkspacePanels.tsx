import React, { useState } from 'react';
import { Check, Copy, Upload } from 'lucide-react';
import { importExternalSpec } from '../../engine/configEngine';
import type { ValidationDiagnostic } from '../../types/pummel';

export type ExportTarget = 'k6' | 'locust' | 'taurus' | 'postman' | 'goose' | 'distributed';

interface ValidationAndExporterSplitProps {
  diagnostics: ValidationDiagnostic[];
  parseError: string | null;
  errorCount: number;
  exportTarget: ExportTarget;
  exportedOutput: string;
  onSelectExportTarget: (target: ExportTarget) => void;
}

export function ValidationAndExporterSplit({
  diagnostics,
  parseError,
  errorCount,
  exportTarget,
  exportedOutput,
  onSelectExportTarget,
}: ValidationAndExporterSplitProps) {
  const [copiedExport, setCopiedExport] = useState(false);

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportedOutput);
      setCopiedExport(true);
      window.setTimeout(() => setCopiedExport(false), 1600);
    } catch {
      setCopiedExport(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section
        aria-label="Dry-run pre-flight validation results"
        className="min-w-0 flex flex-col rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Dry-Run Validator (--dry-run)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Zero network traffic · checks schema, paths, size limits, and secrets.
            </p>
          </div>
          <span
            className={`font-mono text-xs font-semibold whitespace-nowrap shrink-0 ${
              errorCount > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {errorCount > 0 ? `${errorCount} FAIL` : 'ALL PASS'}
          </span>
        </div>

        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto px-5 py-2 dark:divide-slate-800/80">
          {parseError && (
            <div className="py-3 text-xs">
              <div className="font-mono font-semibold text-red-700 dark:text-red-400">
                [SERDE] Parse Error
              </div>
              <p className="mt-1 text-slate-700 dark:text-slate-300">{parseError}</p>
            </div>
          )}
          {diagnostics.map((diag) => (
            <div key={diag.id} className="py-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono font-semibold ${
                    diag.severity === 'error'
                      ? 'text-red-700 dark:text-red-400'
                      : diag.severity === 'warning'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {diag.tag} {diag.field}
                </span>
                <span className="font-mono text-[11px] uppercase text-slate-400 dark:text-slate-500">
                  {diag.severity}
                </span>
              </div>
              <p className="mt-1 text-slate-700 dark:text-slate-300">{diag.message}</p>
              {diag.remediation && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Fix: {diag.remediation}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section
        aria-label="Multi-Target Exporter"
        className="min-w-0 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div
            className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
            role="tablist"
          >
            {(
              [
                { id: 'distributed', label: 'Cluster CLI' },
                { id: 'k6', label: 'k6 (JS)' },
                { id: 'locust', label: 'Locust' },
                { id: 'goose', label: 'Goose' },
                { id: 'taurus', label: 'Taurus' },
                { id: 'postman', label: 'Postman' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={exportTarget === t.id}
                onClick={() => onSelectExportTarget(t.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                  exportTarget === t.id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopyExport}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {copiedExport ? (
              <>
                <Check
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copy Output
              </>
            )}
          </button>
        </div>

        <pre className="flex-1 max-h-80 overflow-auto bg-[#0B1120] p-4 font-mono text-xs leading-relaxed text-slate-200">
          <code>{exportedOutput}</code>
        </pre>
      </section>
    </div>
  );
}

const SAMPLE_POSTMAN = JSON.stringify(
  {
    info: {
      name: 'Payments Gateway v2',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [
      {
        name: 'POST /v2/intents',
        request: { method: 'POST', url: { raw: 'https://pay.internal/v2/intents' } },
      },
      {
        name: 'GET /v2/intents/status',
        request: { method: 'GET', url: { raw: 'https://pay.internal/v2/intents/status' } },
      },
    ],
  },
  null,
  2
);

const SAMPLE_HAR = JSON.stringify(
  {
    log: {
      version: '1.2',
      entries: [
        { request: { method: 'GET', url: 'https://cdn.shop.internal/assets/hero.png' } },
        { request: { method: 'GET', url: 'https://api.shop.internal/v1/catalog' } },
        { request: { method: 'POST', url: 'https://api.shop.internal/v1/cart/items' } },
      ],
    },
  },
  null,
  2
);

const SAMPLE_OPENAPI = JSON.stringify(
  {
    openapi: '3.1.0',
    info: { title: 'Inventory gRPC Gateway' },
    paths: {
      '/v1/inventory/stock': { get: {} },
      '/v1/inventory/reserve': { post: {} },
    },
  },
  null,
  2
);

interface SpecImporterSectionProps {
  onImportedYaml: (yaml: string, summary: string) => void;
}

export function SpecImporterSection({ onImportedYaml }: SpecImporterSectionProps) {
  const [importInput, setImportInput] = useState(SAMPLE_HAR);
  const [importResult, setImportResult] = useState<{
    detectedFormat: string;
    yaml: string;
    summary: string;
  } | null>(null);

  const handleImportConvert = () => {
    const converted = importExternalSpec(importInput);
    setImportResult(converted);
    if (converted.yaml) {
      onImportedYaml(converted.yaml, converted.summary);
    }
  };

  return (
    <section
      aria-label="Specification Importer"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            Import into Pummel YAML
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Auto-detects Postman v2.1, HAR v1.2 (filters static assets), and OpenAPI 3.x.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Sample input:</span>
          <button
            type="button"
            onClick={() => setImportInput(SAMPLE_POSTMAN)}
            className="font-medium text-slate-700 underline-offset-4 hover:text-orange-700 hover:underline dark:text-slate-300 dark:hover:text-orange-400"
          >
            Postman v2.1
          </button>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
            ·
          </span>
          <button
            type="button"
            onClick={() => setImportInput(SAMPLE_HAR)}
            className="font-medium text-slate-700 underline-offset-4 hover:text-orange-700 hover:underline dark:text-slate-300 dark:hover:text-orange-400"
          >
            Browser HAR
          </button>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
            ·
          </span>
          <button
            type="button"
            onClick={() => setImportInput(SAMPLE_OPENAPI)}
            className="font-medium text-slate-700 underline-offset-4 hover:text-orange-700 hover:underline dark:text-slate-300 dark:hover:text-orange-400"
          >
            OpenAPI 3.1
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <label htmlFor="import-spec-textarea" className="sr-only">
          Paste Postman, HAR, or OpenAPI specification
        </label>
        <textarea
          id="import-spec-textarea"
          value={importInput}
          onChange={(e) => setImportInput(e.target.value)}
          rows={5}
          spellCheck={false}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:bg-slate-950"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleImportConvert}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Convert to Pummel YAML
          </button>
          {importResult && (
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {importResult.summary}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
