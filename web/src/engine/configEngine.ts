import type {
  ConfigFormat,
  DistributedRunState,
  PummelConfig,
  ScenarioConfig,
  ValidationDiagnostic,
} from '../types/pummel';

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB (NFR-SEC-02)

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'name',
  'execution',
  'scenarios',
  'distributed',
  'sla',
  'services',
  'api',
  'reporting',
  'modules',
]);

const SENSITIVE_ENV_PATTERNS: RegExp[] = [
  /^AWS_/i,
  /^SECRET/i,
  /^KEY$/i,
  /_KEY$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /_SECRET$/i,
  /PASSWORD/i,
  /^PRIVATE/i,
  /^DATABASE_URL$/i,
  /^DB_/i,
];

export function isSensitiveEnvVar(varName: string): boolean {
  const cleaned = varName.trim();
  return SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(cleaned));
}

export function extractEnvReferences(rawText: string): string[] {
  const matches = new Set<string>();
  const regex = /\$\{(?:env\.)?([A-Z][A-Z0-9_]{1,64})\}/g;
  let m: RegExpExecArray | null = regex.exec(rawText);
  while (m !== null) {
    matches.add(m[1]);
    m = regex.exec(rawText);
  }
  return [...matches];
}

export function redactSensitiveText(text: string): string {
  return text.replace(
    /(\$\{(?:env\.)?([A-Z][A-Z0-9_]{1,64})\})|(\b([A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL|PRIVATE[A-Z0-9_]*))\s*[:=]\s*["']?[^\s"',]+["']?)/g,
    (full, envExpr, envName, assignExpr, assignKey) => {
      if (envExpr && envName && isSensitiveEnvVar(envName)) {
        return '[REDACTED]';
      }
      if (assignExpr && assignKey && isSensitiveEnvVar(assignKey)) {
        return `${assignKey}=[REDACTED]`;
      }
      return full;
    }
  );
}

export function validateSafePath(filePath: string): { valid: boolean; reason?: string } {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Path must not be empty.' };
  }
  if (trimmed.includes('\0')) {
    return { valid: false, reason: 'Path contains null byte.' };
  }
  if (trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return { valid: false, reason: 'Absolute paths outside project directory are forbidden (NFR-SEC-01).' };
  }
  const segments = trimmed.split(/[/\\]/);
  if (segments.some((seg) => seg === '..')) {
    return { valid: false, reason: 'Directory traversal ("..") detected and blocked by validate_path (NFR-SEC-01).' };
  }
  return { valid: true };
}

export function xmlEscape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function coerceOverrideValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function applyCliOverrides<T extends object>(config: T, overrides: readonly string[]): T {
  const clone = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

  for (const rawOverride of overrides) {
    const eqIndex = rawOverride.indexOf('=');
    if (eqIndex <= 0) continue;
    const keyPath = rawOverride.slice(0, eqIndex).trim();
    const rawVal = rawOverride.slice(eqIndex + 1).trim();
    const coerced = coerceOverrideValue(rawVal);

    const parts = keyPath.split('.').filter(Boolean);
    if (parts.length === 0) continue;

    let cursor: Record<string, unknown> | unknown[] = clone;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      const nextPart = parts[i + 1];
      const nextIsIndex = /^\d+$/.test(nextPart);

      if (Array.isArray(cursor)) {
        const idx = Number(part);
        if (cursor[idx] === undefined || typeof cursor[idx] !== 'object' || cursor[idx] === null) {
          cursor[idx] = nextIsIndex ? [] : {};
        }
        cursor = cursor[idx] as Record<string, unknown> | unknown[];
      } else {
        if (cursor[part] === undefined || typeof cursor[part] !== 'object' || cursor[part] === null) {
          cursor[part] = nextIsIndex ? [] : {};
        }
        cursor = cursor[part] as Record<string, unknown> | unknown[];
      }
    }

    const last = parts[parts.length - 1];
    if (Array.isArray(cursor)) {
      cursor[Number(last)] = coerced;
    } else {
      cursor[last] = coerced;
    }
  }

  return clone as T;
}

export function normalizeInheritance(config: PummelConfig): {
  normalized: PummelConfig;
  inheritedPairs: string[];
} {
  const clone: PummelConfig = JSON.parse(JSON.stringify(config));
  const inheritedPairs: string[] = [];

  for (const [name, scenario] of Object.entries(clone.scenarios)) {
    if (!name.includes('.')) continue;
    const parentName = name.slice(0, name.lastIndexOf('.'));
    const parent = clone.scenarios[parentName];
    if (!parent) continue;

    const existingOnStartLabels = new Set(scenario.onStart.map((r) => r.label));
    const inheritedSteps = [...parent.onStart, ...parent.requests].filter(
      (r) => !existingOnStartLabels.has(r.label)
    );

    if (inheritedSteps.length > 0) {
      scenario.onStart = [...inheritedSteps, ...scenario.onStart];
      inheritedPairs.push(`${name} <- ${parentName} (${inheritedSteps.length} on_start step${inheritedSteps.length === 1 ? '' : 's'})`);
    }
  }

  return { normalized: clone, inheritedPairs };
}

export function createDefaultPresetConfig(): PummelConfig {
  return {
    name: 'Distributed Checkout & gRPC Fulfillment',
    execution: [
      {
        scenario: 'auth.checkout',
        concurrency: 600,
        rampUpSec: 15,
        holdForSec: 45,
        pacing: {
          rate: 1800,
          per: 'second',
          randomize: true,
        },
      },
    ],
    scenarios: {
      auth: {
        name: 'auth',
        weight: 1,
        thinkTimeMs: 120,
        onStart: [],
        requests: [
          {
            label: 'POST /v1/auth/session',
            url: 'https://api.storefront.internal/v1/auth/session',
            method: 'POST',
            protocol: 'http',
            timeoutMs: 1500,
            body: '{"email":"${faker.email}","trace_id":"${uuid}"}',
            assertions: ['http-code == 200', 'body contains "session_token"'],
            extractors: ['jsonpath: $.session_token -> token'],
          },
        ],
        dataSources: [
          {
            path: 'data/users.csv',
            delimiter: ',',
            quoted: true,
            loopData: true,
            ordered: false,
            estimatedSizeBytes: 2_400_000,
          },
        ],
      },
      'auth.checkout': {
        name: 'auth.checkout',
        weight: 3,
        thinkTimeMs: 200,
        onStart: [],
        requests: [
          {
            label: 'gRPC OrderService/ReserveInventory',
            url: 'grpc://inventory.internal:50051/orders.OrderService/ReserveInventory',
            method: 'POST',
            protocol: 'grpc',
            grpcMode: 'unary',
            timeoutMs: 800,
            body: '{"sku":"${sku}","qty":1}',
            assertions: ['grpc-status == OK'],
          },
          {
            label: 'POST /v1/checkout/commit',
            url: 'https://api.storefront.internal/v1/checkout/commit',
            method: 'POST',
            protocol: 'http',
            timeoutMs: 2000,
            body: '{"session":"${token}","currency":"USD"}',
            assertions: ['http-code == 201', 'not body contains "DECLINED"'],
            condition: 'token != ""',
          },
          {
            label: 'WS /v1/orders/stream',
            url: 'wss://stream.storefront.internal/v1/orders/stream',
            method: 'GET',
            protocol: 'websocket',
            timeoutMs: 1200,
            assertions: ['frame contains "CONFIRMED"'],
          },
        ],
        dataSources: [
          {
            path: 'data/skus.csv',
            delimiter: ',',
            quoted: true,
            loopData: true,
            ordered: true,
            estimatedSizeBytes: 840_000,
          },
        ],
      },
    },
    distributed: {
      enabled: true,
      coordinatorBind: '127.0.0.1:50051',
      quorumWorkers: 2,
      shardStrategy: 'weighted-capacity',
      heartbeatIntervalMs: 1000,
      telemetryFlushMs: 500,
      tlsMode: 'mtls',
      tuiEnabled: true,
    },
    sla: [
      {
        id: 'sla-p95',
        metric: 'p95-response-time',
        comparator: '>',
        threshold: 180,
        unit: 'ms',
        action: 'warn',
      },
      {
        id: 'sla-fail-rate',
        metric: 'fail-rate',
        comparator: '>',
        threshold: 3.5,
        unit: '%',
        action: 'stop',
      },
      {
        id: 'sla-grpc-p99',
        metric: 'p99-response-time',
        comparator: '>',
        threshold: 250,
        unit: 'ms',
        subject: 'gRPC OrderService/ReserveInventory',
        action: 'exec:./scripts/scale-inventory.sh --replicas=6',
      },
    ],
    services: [
      {
        phase: 'prepare',
        name: 'Verify Toxiproxy Sidecar',
        command: 'toxiproxy-cli list --host 127.0.0.1:8474',
        platform: 'unix',
      },
      {
        phase: 'startup',
        name: 'Warm Cache & Seed Feature Flags',
        command: './scripts/warm-edge-cache.sh --env staging',
        platform: 'unix',
      },
      {
        phase: 'shutdown',
        name: 'Remove Toxiproxy Faults & Flush Metrics',
        command: 'toxiproxy-cli toxic remove --all && ./scripts/flush-influx.sh',
        platform: 'unix',
      },
    ],
    api: {
      enabled: true,
      bindAddress: '127.0.0.1',
      port: 8089,
    },
    reporting: ['cli', 'junit-xml', 'html', 'influxdb'],
  };
}

export function serializeConfig(config: PummelConfig, format: ConfigFormat): string {
  if (format === 'json') {
    return JSON.stringify(config, null, 2);
  }

  if (format === 'toml') {
    const exec = config.execution[0];
    const lines: string[] = [
      `name = "${config.name}"`,
      '',
      '[distributed]',
      `enabled = ${config.distributed.enabled}`,
      `coordinator_bind = "${config.distributed.coordinatorBind}"`,
      `quorum_workers = ${config.distributed.quorumWorkers}`,
      `shard_strategy = "${config.distributed.shardStrategy}"`,
      `heartbeat_interval_ms = ${config.distributed.heartbeatIntervalMs}`,
      `tls_mode = "${config.distributed.tlsMode}"`,
      `tui_enabled = ${config.distributed.tuiEnabled}`,
      '',
      '[[execution]]',
      `scenario = "${exec?.scenario ?? 'default'}"`,
      `concurrency = ${exec?.concurrency ?? 200}`,
      `ramp-up = "${exec?.rampUpSec ?? 15}s"`,
      `hold-for = "${exec?.holdForSec ?? 45}s"`,
      '',
      '[api]',
      `enabled = ${config.api.enabled}`,
      `bind_address = "${config.api.bindAddress}"`,
      `port = ${config.api.port}`,
    ];

    for (const [name, sc] of Object.entries(config.scenarios)) {
      lines.push('', `[scenarios."${name}"]`);
      lines.push(`weight = ${sc.weight}`);
      lines.push(`think_time_ms = ${sc.thinkTimeMs}`);
      for (const req of sc.requests) {
        lines.push(`  [[scenarios."${name}".requests]]`);
        lines.push(`  label = "${req.label}"`);
        lines.push(`  method = "${req.method}"`);
        lines.push(`  protocol = "${req.protocol}"`);
        lines.push(`  url = "${req.url}"`);
      }
    }

    for (const sla of config.sla) {
      lines.push('', '[[sla]]');
      lines.push(`metric = "${sla.metric}"`);
      lines.push(`comparator = "${sla.comparator}"`);
      lines.push(`threshold = ${sla.threshold}`);
      lines.push(`action = "${sla.action}"`);
      if (sla.subject) lines.push(`subject = "${sla.subject}"`);
    }

    return lines.join('\n');
  }

  // YAML serialization
  const lines: string[] = [
    `name: "${config.name}"`,
    'distributed:',
    `  enabled: ${config.distributed.enabled}`,
    `  coordinator-bind: "${config.distributed.coordinatorBind}"`,
    `  quorum-workers: ${config.distributed.quorumWorkers}`,
    `  shard-strategy: ${config.distributed.shardStrategy}`,
    `  heartbeat-interval-ms: ${config.distributed.heartbeatIntervalMs}`,
    `  tls-mode: ${config.distributed.tlsMode}`,
    `  tui-enabled: ${config.distributed.tuiEnabled}`,
    'execution:',
  ];

  for (const exec of config.execution) {
    lines.push(`  - scenario: ${exec.scenario}`);
    lines.push(`    concurrency: ${exec.concurrency}`);
    lines.push(`    ramp-up: ${exec.rampUpSec}s`);
    lines.push(`    hold-for: ${exec.holdForSec}s`);
    if (exec.pacing) {
      lines.push('    pacing:');
      lines.push(`      rate: ${exec.pacing.rate}`);
      lines.push(`      per: ${exec.pacing.per}`);
      lines.push(`      randomize: ${exec.pacing.randomize}`);
    }
  }

  lines.push('scenarios:');
  for (const [name, sc] of Object.entries(config.scenarios)) {
    lines.push(`  ${name}:`);
    lines.push(`    weight: ${sc.weight}`);
    lines.push(`    think-time: ${sc.thinkTimeMs}ms`);
    if (sc.dataSources.length > 0) {
      lines.push('    data-sources:');
      for (const ds of sc.dataSources) {
        lines.push(`      - path: "${ds.path}"`);
        lines.push(`        delimiter: "${ds.delimiter ?? ','}"`);
        lines.push(`        loop: ${ds.loopData ?? true}`);
      }
    }
    if (sc.onStart.length > 0) {
      lines.push('    on_start:');
      for (const r of sc.onStart) {
        lines.push(`      - label: "${r.label}"`);
        lines.push(`        protocol: ${r.protocol}`);
        lines.push(`        url: "${r.url}"`);
      }
    }
    lines.push('    requests:');
    for (const r of sc.requests) {
      lines.push(`      - label: "${r.label}"`);
      lines.push(`        method: ${r.method}`);
      lines.push(`        protocol: ${r.protocol}`);
      lines.push(`        url: "${r.url}"`);
      if (r.body) lines.push(`        body: '${r.body}'`);
      if (r.bodyFile) lines.push(`        body-file: "${r.bodyFile}"`);
    }
  }

  lines.push('sla:');
  for (const s of config.sla) {
    lines.push(`  - metric: ${s.metric}`);
    lines.push(`    condition: "${s.comparator} ${s.threshold}${s.unit}"`);
    if (s.subject) lines.push(`    subject: "${s.subject}"`);
    lines.push(`    action: "${s.action}"`);
  }

  lines.push('api:');
  lines.push(`  enabled: ${config.api.enabled}`);
  lines.push(`  bind-address: "${config.api.bindAddress}"`);
  lines.push(`  port: ${config.api.port}`);

  lines.push('reporting:');
  for (const r of config.reporting) {
    lines.push(`  - module: ${r}`);
  }

  return lines.join('\n');
}

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

export function exportPummelConfig(
  config: PummelConfig,
  target: 'k6' | 'locust' | 'taurus' | 'postman' | 'goose' | 'distributed'
): string {
  const { normalized } = normalizeInheritance(config);
  const exec = normalized.execution[0];
  const scenario: ScenarioConfig | undefined =
    (exec && normalized.scenarios[exec.scenario]) || Object.values(normalized.scenarios)[0];
  const requests = scenario ? [...scenario.onStart, ...scenario.requests] : [];

  if (target === 'k6') {
    const reqLines = requests
      .map(
        (r) =>
          `  const res_${r.label.replace(/[^a-zA-Z0-9]/g, '_')} = http.${r.method.toLowerCase()}('${r.url}'${r.body ? `, '${r.body}'` : ''});\n  check(res_${r.label.replace(/[^a-zA-Z0-9]/g, '_')}, { '${r.label} ok': (r) => r.status < 400 });`
      )
      .join('\n');

    return `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '${exec?.rampUpSec ?? 15}s', target: ${exec?.concurrency ?? 200} },
    { duration: '${exec?.holdForSec ?? 45}s', target: ${exec?.concurrency ?? 200} },
  ],
  thresholds: {
    http_req_duration: ['p(95)<${normalized.sla.find((s) => s.metric === 'p95-response-time')?.threshold ?? 200}'],
    http_req_failed: ['rate<${((normalized.sla.find((s) => s.metric === 'fail-rate')?.threshold ?? 5) / 100).toFixed(3)}'],
  },
};

export default function () {
${reqLines || "  http.get('https://example.internal/health');"}
  sleep(${((scenario?.thinkTimeMs ?? 150) / 1000).toFixed(2)});
}`;
  }

  if (target === 'locust') {
    const tasks = requests
      .map(
        (r, i) => `    @task(${i === 0 ? 2 : 1})
    def step_${i + 1}(self):
        self.client.${r.method.toLowerCase()}("${r.url}", name="${r.label}")`
      )
      .join('\n\n');

    return `from locust import HttpUser, LoadTestShape, task, between

class PummelExportUser(HttpUser):
    wait_time = between(0.1, ${((scenario?.thinkTimeMs ?? 200) / 1000).toFixed(2)})

${tasks || '    @task\n    def health(self):\n        self.client.get("/health")'}

class RampAndHoldShape(LoadTestShape):
    def tick(self):
        run_time = self.get_run_time()
        if run_time < ${exec?.rampUpSec ?? 15}:
            return (${exec?.concurrency ?? 200}, ${Math.max(1, Math.round((exec?.concurrency ?? 200) / Math.max(1, exec?.rampUpSec ?? 15)))})
        if run_time < ${(exec?.rampUpSec ?? 15) + (exec?.holdForSec ?? 45)}:
            return (${exec?.concurrency ?? 200}, 10)
        return None`;
  }

  if (target === 'postman') {
    return JSON.stringify(
      {
        info: {
          name: normalized.name,
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: requests.map((r) => ({
          name: r.label,
          request: {
            method: r.method,
            url: { raw: r.url },
            ...(r.body ? { body: { mode: 'raw', raw: r.body } } : {}),
          },
        })),
      },
      null,
      2
    );
  }

  if (target === 'goose') {
    const txFns = requests
      .map(
        (r, i) => `async fn tx_${i + 1}(user: &mut GooseUser) -> TransactionResult {
    let _res = user.${r.method === 'POST' ? 'post' : 'get'}("${r.url}"${r.method === 'POST' ? `, "${(r.body ?? '{}').replace(/"/g, '\\"')}"` : ''}).await?;
    Ok(())
}`
      )
      .join('\n\n');

    return `use goose::prelude::*;

${txFns}

#[tokio::main]
async fn main() -> Result<(), GooseError> {
    GooseAttack::initialize()?
        .register_scenario(
            scenario!("${exec?.scenario ?? 'default'}")
${requests.map((_, i) => `                .register_transaction(transaction!(tx_${i + 1}))`).join('\n')}
        )
        .execute()
        .await?;
    Ok(())
}`;
  }

  if (target === 'distributed') {
    return `# Launch Pummel Distributed Coordinator with Ratatui TUI
pummel run pummel.yaml \\
  --mode distributed \\
  --role coordinator \\
  --coordinator-bind ${normalized.distributed.coordinatorBind} \\
  --quorum ${normalized.distributed.quorumWorkers} \\
  --shard-strategy ${normalized.distributed.shardStrategy} \\
  --tui

# Attach Worker Nodes (run on each load-gen host)
pummel worker join \\
  --coordinator ${normalized.distributed.coordinatorBind} \\
  --tls ${normalized.distributed.tlsMode} \\
  --heartbeat-ms ${normalized.distributed.heartbeatIntervalMs}`;
  }

  return serializeConfig(normalized, 'yaml');
}

export function importExternalSpec(
  rawInput: string
): { detectedFormat: 'postman' | 'har' | 'openapi' | 'unknown'; yaml: string; summary: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      detectedFormat: 'unknown',
      yaml: '',
      summary: 'Input is empty.',
    };
  }

  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    if (json.log && typeof json.log === 'object') {
      const entries = ((json.log as { entries?: { request?: { method?: string; url?: string } }[] }).entries ?? [])
        .filter((e) => {
          const url = e.request?.url ?? '';
          return !/\.(png|jpg|jpeg|svg|css|woff2?|ico)(\?|$)/i.test(url);
        });
      const yaml = [
        'name: "Imported HAR Scenario"',
        'execution:',
        '  - scenario: har_replay',
        '    concurrency: 100',
        '    ramp-up: 10s',
        '    hold-for: 30s',
        'scenarios:',
        '  har_replay:',
        '    requests:',
        ...entries.map(
          (e, i) =>
            `      - label: "${e.request?.method ?? 'GET'} #${i + 1}"\n        method: ${e.request?.method ?? 'GET'}\n        protocol: http\n        url: "${e.request?.url ?? 'https://example.internal/'}"`
        ),
      ].join('\n');
      return {
        detectedFormat: 'har',
        yaml,
        summary: `Auto-detected HAR v1.2 (${entries.length} API requests preserved after static-asset filtering).`,
      };
    }

    if (json.info && Array.isArray(json.item)) {
      const items = json.item as { name?: string; request?: { method?: string; url?: string | { raw?: string } } }[];
      const yaml = [
        `name: "${(json.info as { name?: string }).name ?? 'Imported Postman Collection'}"`,
        'execution:',
        '  - scenario: postman_flow',
        '    concurrency: 150',
        '    ramp-up: 15s',
        '    hold-for: 45s',
        'scenarios:',
        '  postman_flow:',
        '    requests:',
        ...items.map((it, i) => {
          const rawUrl =
            typeof it.request?.url === 'string'
              ? it.request.url
              : it.request?.url?.raw ?? 'https://api.example.internal/';
          return `      - label: "${it.name ?? `Request ${i + 1}`}"\n        method: ${it.request?.method ?? 'GET'}\n        protocol: http\n        url: "${rawUrl}"`;
        }),
      ].join('\n');
      return {
        detectedFormat: 'postman',
        yaml,
        summary: `Auto-detected Postman Collection v2.1 (${items.length} request items converted).`,
      };
    }

    if (json.openapi && json.paths && typeof json.paths === 'object') {
      const paths = Object.entries(json.paths as Record<string, Record<string, unknown>>);
      const reqLines: string[] = [];
      for (const [pathStr, methods] of paths) {
        for (const method of Object.keys(methods)) {
          reqLines.push(
            `      - label: "${method.toUpperCase()} ${pathStr}"\n        method: ${method.toUpperCase()}\n        protocol: http\n        url: "https://api.example.internal${pathStr}"`
          );
        }
      }
      return {
        detectedFormat: 'openapi',
        yaml: [
          `name: "${(json.info as { title?: string })?.title ?? 'Imported OpenAPI Spec'}"`,
          'execution:',
          '  - scenario: openapi_suite',
          '    concurrency: 200',
          '    ramp-up: 15s',
          '    hold-for: 60s',
          'scenarios:',
          '  openapi_suite:',
          '    requests:',
          ...reqLines,
        ].join('\n'),
        summary: `Auto-detected OpenAPI ${String(json.openapi)} (${reqLines.length} endpoints converted).`,
      };
    }
  } catch {
    if (/^openapi:\s*3\./m.test(trimmed)) {
      return {
        detectedFormat: 'openapi',
        yaml: `name: "Imported OpenAPI YAML"\nexecution:\n  - scenario: openapi_yaml\n    concurrency: 120\n    ramp-up: 10s\n    hold-for: 30s\nscenarios:\n  openapi_yaml:\n    requests:\n      - label: "GET /v1/health"\n        method: GET\n        protocol: http\n        url: "https://api.example.internal/v1/health"`,
        summary: 'Auto-detected OpenAPI 3.x YAML specification.',
      };
    }
  }

  return {
    detectedFormat: 'unknown',
    yaml: '',
    summary: 'Unrecognized specification format. Provide Postman v2.1 JSON, HAR v1.2 JSON, or OpenAPI 3.0 JSON/YAML.',
  };
}

export function generateJunitXml(state: DistributedRunState, suiteName: string): string {
  const escapedSuite = xmlEscape(suiteName);
  const failures = state.slaResults.filter((r) => r.breached).length;
  const cases = state.slaResults
    .map((res) => {
      const name = xmlEscape(
        `${res.criterion.subject ?? 'global'} :: ${res.criterion.metric} ${res.criterion.comparator} ${res.criterion.threshold}${res.criterion.unit}`
      );
      if (res.breached) {
        const msg = xmlEscape(
          `SLA breached: observed ${res.currentValue}${res.criterion.unit} (action=${res.criterion.action})`
        );
        return `  <testcase classname="pummel.sla" name="${name}" time="${state.elapsedSec}">\n    <failure message="${msg}" type="SlaBreach"/>\n  </testcase>`;
      }
      return `  <testcase classname="pummel.sla" name="${name}" time="${state.elapsedSec}"/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${escapedSuite}" tests="${state.slaResults.length}" failures="${failures}" time="${state.elapsedSec}">
${cases}
</testsuite>`;
}
