import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileCode2 } from 'lucide-react';
import {
  DOWNLOAD_EXPORT_FORMATS,
  type DownloadExportFormat,
} from '../engine/exportDownload';

interface ExportConfigMenuProps {
  onExportFormat: (format: DownloadExportFormat) => void;
}

export function ExportConfigMenu({ onExportFormat }: ExportConfigMenuProps) {
  const [open, setOpen] = useState(false);
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
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (format: DownloadExportFormat) => {
    setOpen(false);
    onExportFormat(format);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="workspace-export-menu"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Export
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="workspace-export-menu"
          role="menu"
          aria-label="Export YAML configuration format options"
          className="absolute left-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-950 dark:text-slate-50">
              Download Configuration As
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Transpiles the active YAML spec into an external runner format.
            </p>
          </div>

          <div className="divide-y divide-slate-100 p-1.5 dark:divide-slate-800/80">
            {DOWNLOAD_EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(fmt.id)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
              >
                <FileCode2
                  className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {fmt.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      .{fmt.extension}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    {fmt.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
