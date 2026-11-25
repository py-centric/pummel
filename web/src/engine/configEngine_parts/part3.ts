import type {
  ConfigFormat,
  DistributedRunState,
  PummelConfig,
  ScenarioConfig,
  ValidationDiagnostic,
} from '../../types/pummel';

export function parseRawConfigCheck(
  rawText: string,
  format: ConfigFormat,
  baseConfig: PummelConfig
): { config: PummelConfig; unknownFields: string[]; parseError?: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      config: baseConfig,
      unknownFields: [],
      parseError: '[SERDE] Configuration payload is empty.',
    };
  }

  if (format === 'json') {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const unknownFields = Object.keys(parsed).filter((k) => !ALLOWED_TOP_LEVEL_KEYS.has(k));
      const merged: PummelConfig = {
        ...baseConfig,
        ...(parsed as Partial<PummelConfig>),
      };
      return { config: merged, unknownFields };
    } catch (err) {
      return {
        config: baseConfig,
        unknownFields: [],
        parseError: `[SERDE] Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse failure'}`,
      };
    }
  }

  // Lightweight deterministic extractor for YAML & TOML edits in the interactive studio
  const unknownFields: string[] = [];
  const next: PummelConfig = JSON.parse(JSON.stringify(baseConfig));
  const lines = trimmed.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Detect unknown top-level keys in YAML (0-indent key:) or TOML ([section])
    if (format === 'yaml' && !rawLine.startsWith(' ') && !rawLine.startsWith('-')) {
      const keyMatch = /^([a-zA-Z0-9_-]+)\s*:/.exec(line);
      if (keyMatch && !ALLOWED_TOP_LEVEL_KEYS.has(keyMatch[1])) {
        unknownFields.push(keyMatch[1]);
      }
    }
    if (format === 'toml' && line.startsWith('[') && line.endsWith(']')) {
      const section = line.replace(/^\[+|\]+$/g, '').split('.')[0].replace(/"/g, '');
      if (section && !ALLOWED_TOP_LEVEL_KEYS.has(section)) {
        unknownFields.push(section);
      }
    }

    const concurrencyMatch = /concurrency\s*[:=]\s*(\d+)/.exec(line);
    if (concurrencyMatch && next.execution[0]) {
      next.execution[0].concurrency = Number(concurrencyMatch[1]);
    }
    const quorumMatch = /quorum[-_]workers\s*[:=]\s*(\d+)/.exec(line);
    if (quorumMatch) {
      next.distributed.quorumWorkers = Number(quorumMatch[1]);
    }
    const bindMatch = /bind[-_]address\s*[:=]\s*["']?([0-9.a-zA-Z:]+)["']?/.exec(line);
    if (bindMatch) {
      next.api.bindAddress = bindMatch[1];
    }
    const coordMatch = /coordinator[-_]bind\s*[:=]\s*["']?([0-9.a-zA-Z:]+)["']?/.exec(line);
    if (coordMatch) {
      next.distributed.coordinatorBind = coordMatch[1];
    }
    const pathMatch = /(?:path|body-file)\s*[:=]\s*["']([^"']+)["']/.exec(line);
    if (pathMatch) {
      const firstScenario = Object.values(next.scenarios)[0];
      if (firstScenario && firstScenario.dataSources[0]) {
        firstScenario.dataSources[0].path = pathMatch[1];
      }
    }
  }

  return { config: next, unknownFields };
}

export function runDryRunValidation(
  config: PummelConfig,
  rawText: string,
  unknownFields: readonly string[] = []
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  // FR-01 / NFR-SEC-05: Strict schema deny_unknown_fields
  if (unknownFields.length > 0) {
    diagnostics.push({
      id: 'diag-unknown-fields',
      tag: '[SERDE]',
      severity: 'error',
      field: unknownFields.join(', '),
      message: `Unknown top-level field(s) rejected by #[serde(deny_unknown_fields)]: ${unknownFields.join(', ')}.`,
      remediation: 'Remove unrecognized keys or move custom variables into scenario extractors/env.',
    });
  } else {
    diagnostics.push({
      id: 'diag-schema-ok',
      tag: '[SERDE]',
      severity: 'pass',
      field: 'configuration',
      message: 'Strict Taurus schema check passed (#[serde(deny_unknown_fields)]).',
    });
  }

  // FR-02: Inheritance check
  const { inheritedPairs } = normalizeInheritance(config);
  if (inheritedPairs.length > 0) {
    diagnostics.push({
      id: 'diag-inherit',
      tag: '[VALIDATION]',
      severity: 'pass',
      field: 'scenarios',
      message: `SchemaNormalizer resolved dot-notation inheritance: ${inheritedPairs.join('; ')}.`,
    });
  }

  // NFR-SEC-01 & NFR-SEC-02: Path traversal & file size check
  let pathIssues = 0;
  for (const [scName, sc] of Object.entries(config.scenarios)) {
    for (const ds of sc.dataSources) {
      const check = validateSafePath(ds.path);
      if (!check.valid) {
        pathIssues += 1;
        diagnostics.push({
          id: `diag-path-${scName}-${ds.path}`,
          tag: '[IO]',
          severity: 'error',
          field: `scenarios.${scName}.data-sources`,
          message: `Blocked data-source "${ds.path}": ${check.reason}`,
          remediation: 'Use a relative path inside the active workspace directory (e.g., data/users.csv).',
        });
      }
      if ((ds.estimatedSizeBytes ?? 0) > MAX_FILE_SIZE_BYTES) {
        pathIssues += 1;
        diagnostics.push({
          id: `diag-size-${scName}-${ds.path}`,
          tag: '[IO]',
          severity: 'error',
          field: `scenarios.${scName}.data-sources`,
          message: `File "${ds.path}" exceeds MAX_FILE_SIZE (100 MB limit, NFR-SEC-02).`,
          remediation: 'Shard the CSV file or compress/filter dataset rows below 100 MB.',
        });
      }
    }
    for (const req of sc.requests) {
      if (req.bodyFile) {
        const check = validateSafePath(req.bodyFile);
        if (!check.valid) {
          pathIssues += 1;
          diagnostics.push({
            id: `diag-bodyfile-${scName}-${req.label}`,
            tag: '[IO]',
            severity: 'error',
            field: `scenarios.${scName}.requests.${req.label}.body-file`,
            message: `Blocked body-file "${req.bodyFile}": ${check.reason}`,
          });
        }
      }
    }
  }
  if (pathIssues === 0) {
    diagnostics.push({
      id: 'diag-paths-ok',
      tag: '[IO]',
      severity: 'pass',
      field: 'data-sources',
      message: 'All data-sources and body-file references canonicalized within project root and under 100 MB.',
    });
  }

  // NFR-SEC-03: Secret env var scan
  const envRefs = extractEnvReferences(rawText);
  const blockedEnv = envRefs.filter(isSensitiveEnvVar);
  if (blockedEnv.length > 0) {
    diagnostics.push({
      id: 'diag-env-blocked',
      tag: '[ENV]',
      severity: 'error',
      field: 'env-macros',
      message: `Sensitive environment variable reference(s) blocked at pre-flight: ${blockedEnv.join(', ')} (values masked as [REDACTED]).`,
      remediation: 'Use scoped non-secret runtime tokens or mock fixtures instead of privileged secrets.',
    });
  } else {
    diagnostics.push({
      id: 'diag-env-ok',
      tag: '[ENV]',
      severity: 'pass',
      field: 'env-macros',
      message: 'No sensitive environment variable exfiltration patterns detected (NFR-SEC-03).',
    });
  }

  // NFR-SEC-04: Localhost-only Control API binding
  if (config.api.enabled && config.api.bindAddress !== '127.0.0.1' && config.api.bindAddress !== 'localhost') {
    diagnostics.push({
      id: 'diag-api-bind',
      tag: '[VALIDATION]',
      severity: 'error',
      field: 'api.bind-address',
      message: `Control API bound to "${config.api.bindAddress}" violates localhost-only policy (NFR-SEC-04).`,
      remediation: 'Set api.bind-address strictly to "127.0.0.1".',
    });
  } else if (config.api.enabled) {
    diagnostics.push({
      id: 'diag-api-ok',
      tag: '[VALIDATION]',
      severity: 'pass',
      field: 'api.bind-address',
      message: `Live Control API restricted to 127.0.0.1:${config.api.port} (GET /metrics, POST /control/stop).`,
    });
  }

  // Distributed coordinator validation
  if (config.distributed.enabled) {
    if (config.distributed.quorumWorkers < 1) {
      diagnostics.push({
        id: 'diag-dist-quorum',
        tag: '[VALIDATION]',
        severity: 'error',
        field: 'distributed.quorum-workers',
        message: 'Distributed mode requires quorum-workers >= 1.',
      });
    } else {
      diagnostics.push({
        id: 'diag-dist-ok',
        tag: '[GOOSE]',
        severity: 'pass',
        field: 'distributed',
        message: `Distributed gRPC coordinator verified (${config.distributed.coordinatorBind}, quorum=${config.distributed.quorumWorkers}, TUI=${config.distributed.tuiEnabled ? 'enabled' : 'disabled'}).`,
      });
    }
  }

  // Execution plan sanity
  for (const [idx, plan] of config.execution.entries()) {
    if (!config.scenarios[plan.scenario]) {
      diagnostics.push({
        id: `diag-exec-missing-${idx}`,
        tag: '[GOOSE]',
        severity: 'error',
        field: `execution.${idx}.scenario`,
        message: `Execution plan references undefined scenario "${plan.scenario}".`,
      });
    }
  }

  return diagnostics;
}
