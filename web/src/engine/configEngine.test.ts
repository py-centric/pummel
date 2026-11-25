import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCliOverrides,
  createDefaultPresetConfig,
  exportPummelConfig,
  importExternalSpec,
  isSensitiveEnvVar,
  normalizeInheritance,
  redactSensitiveText,
  runDryRunValidation,
  serializeConfig,
  validateSafePath,
  xmlEscape,
} from './configEngine';

test('normalizeInheritance injects parent requests into dot-notation child scenario on_start (FR-02)', () => {
  const config = createDefaultPresetConfig();
  assert.equal(config.scenarios['auth.checkout'].onStart.length, 0);

  const { normalized, inheritedPairs } = normalizeInheritance(config);
  assert.equal(normalized.scenarios['auth.checkout'].onStart.length, 1);
  assert.equal(normalized.scenarios['auth.checkout'].onStart[0].label, 'POST /v1/auth/session');
  assert.equal(inheritedPairs.length, 1);
});

test('applyCliOverrides resolves dot paths, array indices, numbers, and booleans (FR-03)', () => {
  const config = createDefaultPresetConfig();
  const updated = applyCliOverrides(config, [
    'execution.0.concurrency=1250',
    'distributed.quorumWorkers=4',
    'api.enabled=false',
  ]);
  assert.equal(updated.execution[0].concurrency, 1250);
  assert.equal(updated.distributed.quorumWorkers, 4);
  assert.equal(updated.api.enabled, false);
});

test('security validators enforce path traversal, secret redaction, localhost binding, and XML escaping (NFR-SEC-01..05)', () => {
  assert.equal(validateSafePath('data/users.csv').valid, true);
  assert.equal(validateSafePath('../etc/passwd').valid, false);
  assert.equal(validateSafePath('/etc/shadow').valid, false);

  assert.equal(isSensitiveEnvVar('AWS_SECRET_ACCESS_KEY'), true);
  assert.equal(isSensitiveEnvVar('DATABASE_URL'), true);
  assert.equal(isSensitiveEnvVar('API_TOKEN'), true);
  assert.equal(isSensitiveEnvVar('TARGET_HOST'), false);

  assert.equal(
    redactSensitiveText('token=${env.AWS_SECRET_ACCESS_KEY} host=${env.TARGET_HOST}'),
    'token=[REDACTED] host=${env.TARGET_HOST}'
  );

  assert.equal(xmlEscape('<script>"a" & \'b\'</script>'), '&lt;script&gt;&quot;a&quot; &amp; &apos;b&apos;&lt;/script&gt;');
});

test('runDryRunValidation flags unknown fields, secret env references, and 0.0.0.0 API bind', () => {
  const config = createDefaultPresetConfig();
  config.api.bindAddress = '0.0.0.0';
  const rawWithSecret = `${serializeConfig(config, 'yaml')}\n# ${'${env.DATABASE_URL}'}`;
  const diagnostics = runDryRunValidation(config, rawWithSecret, ['unknown_block']);

  assert.ok(diagnostics.some((d) => d.tag === '[SERDE]' && d.severity === 'error'));
  assert.ok(diagnostics.some((d) => d.tag === '[ENV]' && d.severity === 'error'));
  assert.ok(diagnostics.some((d) => d.tag === '[VALIDATION]' && d.field === 'api.bind-address' && d.severity === 'error'));
});

test('importers auto-detect HAR (filtering static assets) and exporters emit k6/Locust/Goose', () => {
  const sampleHar = JSON.stringify({
    log: {
      entries: [
        { request: { method: 'GET', url: 'https://shop.internal/logo.png' } },
        { request: { method: 'POST', url: 'https://shop.internal/api/cart' } },
      ],
    },
  });
  const imported = importExternalSpec(sampleHar);
  assert.equal(imported.detectedFormat, 'har');
  assert.ok(imported.yaml.includes('/api/cart'));
  assert.ok(!imported.yaml.includes('logo.png'));

  const config = createDefaultPresetConfig();
  assert.ok(exportPummelConfig(config, 'k6').includes("import http from 'k6/http'"));
  assert.ok(exportPummelConfig(config, 'locust').includes('LoadTestShape'));
  assert.ok(exportPummelConfig(config, 'goose').includes('GooseAttack::initialize()'));
});
