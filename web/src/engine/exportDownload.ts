import type { PummelConfig } from '../types/pummel';
import { exportPummelConfig } from './configEngine';

export type DownloadExportFormat = 'k6' | 'locust' | 'taurus';

export interface ExportFormatDescriptor {
  id: DownloadExportFormat;
  label: string;
  shortLabel: string;
  description: string;
  extension: string;
  mimeType: string;
}

export const DOWNLOAD_EXPORT_FORMATS: readonly ExportFormatDescriptor[] = [
  {
    id: 'k6',
    label: 'k6 Script (JavaScript)',
    shortLabel: 'k6 (.js)',
    description: 'Grafana k6 ES module with stages, thresholds, and checks.',
    extension: 'k6.js',
    mimeType: 'text/javascript;charset=utf-8',
  },
  {
    id: 'locust',
    label: 'Locust Suite (Python)',
    shortLabel: 'Locust (.py)',
    description: 'Python HttpUser tasks with wait_time and scenario weights.',
    extension: 'locustfile.py',
    mimeType: 'text/x-python;charset=utf-8',
  },
  {
    id: 'taurus',
    label: 'Taurus Config (YAML)',
    shortLabel: 'Taurus (.yaml)',
    description: 'BlazeMeter Taurus bzt YAML execution, scenarios, and passfail SLAs.',
    extension: 'taurus.yaml',
    mimeType: 'application/x-yaml;charset=utf-8',
  },
];

export function sanitizeExportFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'pummel-config';
}

export interface ConfigExportArtifact {
  format: DownloadExportFormat;
  label: string;
  filename: string;
  mimeType: string;
  content: string;
}

export function buildConfigExportArtifact(
  config: PummelConfig,
  format: DownloadExportFormat
): ConfigExportArtifact {
  const descriptor = DOWNLOAD_EXPORT_FORMATS.find((f) => f.id === format);
  if (!descriptor) {
    throw new Error(`Unsupported export format: ${format}`);
  }
  const baseSlug = sanitizeExportFilename(config.name);
  const content = exportPummelConfig(config, format);
  return {
    format,
    label: descriptor.label,
    filename: `${baseSlug}.${descriptor.extension}`,
    mimeType: descriptor.mimeType,
    content,
  };
}
