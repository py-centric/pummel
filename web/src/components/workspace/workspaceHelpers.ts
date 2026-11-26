import {
  buildConfigExportArtifact,
  type DownloadExportFormat,
} from '../../engine/exportDownload';
import {
  createDefaultPresetConfig,
  parseRawConfigCheck,
  runDryRunValidation,
  serializeConfig,
} from '../../engine/configEngine';
import type { PummelConfig, ValidationDiagnostic } from '../../types/pummel';

export function buildSecurityPolicyDemo(): {
  config: PummelConfig;
  serialized: string;
  diagnostics: ValidationDiagnostic[];
} {
  const base = createDefaultPresetConfig();
  base.name = 'Pre-Flight Security Policy Demo';
  base.api.bindAddress = '0.0.0.0';
  base.scenarios.auth.dataSources[0].path = '../../etc/passwd';
  const serialized =
    serializeConfig(base, 'yaml') +
    '\nlegacy_block: true\n# leaked: ${env.AWS_SECRET_ACCESS_KEY}';
  const parsed = parseRawConfigCheck(serialized, 'yaml', base);
  const diagnostics = runDryRunValidation(parsed.config, serialized, parsed.unknownFields);
  return {
    config: base,
    serialized,
    diagnostics,
  };
}

export function triggerConfigExportDownload(
  config: PummelConfig,
  target: DownloadExportFormat
): { label: string; filename: string } {
  const artifact = buildConfigExportArtifact(config, target);
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
  return { label: artifact.label, filename: artifact.filename };
}
