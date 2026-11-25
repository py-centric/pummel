import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Database, Download, FileSpreadsheet } from 'lucide-react';
import type { DistributedRunState } from '../types/pummel';
import {
  buildRawMetricsExportArtifact,
  type RawMetricsExportFormat,
} from '../engine/rawMetricsExport';

interface ExportRawDataMenuProps {
  runState: DistributedRunState;
  specName: string;
  onExported?: (summary: string) => void;
}

export function ExportRawDataMenu({
  runState,
  specName,
  onExported,
}: ExportRawDataMenuProps) {
  const [open, setOpen] = useState(false);
  const [lastFormat, setLastFormat] = useState<RawMetricsExportFormat | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleDownload = (format: RawMetricsExportFormat) => {
    const artifact = buildRawMetricsExportArtifact({
      runState,
      specName,
      format,
    });

    const blob =
      format === 'csv'
        ? new Blob([artifact.csvText], { type: artifact.mimeType })
        : new Blob([artifact.parquetBytes.buffer as ArrayBuffer], { type: artifact.mimeType });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = artifact.filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    setLastFormat(format);
    setOpen(false);
    onExported?.(
      `Exported ${artifact.filename} (${artifact.rowCount} rows · ${artifact.byteLength.toLocaleString()} B)`
    );
    window.setTimeout(() => setLastFormat(null), 2200);
  };

  const estimatedRows = Math.max(1, runState.history.length) + runState.endpoints.length;

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="export-raw-data-button"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {lastFormat ? (
          <Check
            className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span>{lastFormat ? `Exported ${lastFormat.toUpperCase()}` : 'Export Raw Data'}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Export Raw Telemetry Data"
          data-testid="export-raw-data-menu"
          className="absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="border-b border-slate-100 bg-slate-50/80 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Raw Telemetry Dataset
              </span>
              <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                {estimatedRows} rows ready
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Includes ISO timestamps, avg/p50/p90/p95/p99 latencies, and throughput markers.
            </p>
          </div>

          <div className="divide-y divide-slate-100 py-1 dark:divide-slate-800/80">
            <button
              type="button"
              role="menuitem"
              aria-label="Export raw metrics as CSV"
              onClick={() => handleDownload('csv')}
              className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80"
            >
              <FileSpreadsheet
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    CSV Telemetry (.csv)
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    UTF-8
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Tabular time-series ticks, latency percentiles &amp; PEAK_RPS / SLA_BREACH markers.
                </p>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              aria-label="Export raw metrics as Parquet"
              onClick={() => handleDownload('parquet')}
              className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80"
            >
              <Database
                className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Apache Parquet (.parquet)
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    PAR1
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Columnar binary dataset for DuckDB, Polars, or Spark telemetry analysis.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
