import type {
  ConfigFormat,
  DistributedRunState,
  PummelConfig,
  ScenarioConfig,
  ValidationDiagnostic,
} from '../../types/pummel';

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

// 100 MB (NFR-SEC-02)

export const ALLOWED_TOP_LEVEL_KEYS = new Set([
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

export const SENSITIVE_ENV_PATTERNS: RegExp[] = [
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
