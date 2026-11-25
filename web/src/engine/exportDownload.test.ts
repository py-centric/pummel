import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPresetConfig } from './configEngine';
import {
  buildConfigExportArtifact,
  DOWNLOAD_EXPORT_FORMATS,
  sanitizeExportFilename,
} from './exportDownload';

test('sanitizeExportFilename strips special characters and handles blank names', () => {
  assert.equal(
    sanitizeExportFilename('Distributed Checkout & gRPC Fulfillment'),
    'distributed-checkout-grpc-fulfillment'
  );
  assert.equal(sanitizeExportFilename('   !!!   '), 'pummel-config');
});

test('buildConfigExportArtifact generates valid k6, Locust, and Taurus artifacts', () => {
  const config = createDefaultPresetConfig();

  const k6 = buildConfigExportArtifact(config, 'k6');
  assert.equal(k6.filename, 'distributed-checkout-grpc-fulfillment.k6.js');
  assert.equal(k6.mimeType, 'text/javascript;charset=utf-8');
  assert.match(k6.content, /import http from 'k6\/http';/);
  assert.match(k6.content, /export const options/);

  const locust = buildConfigExportArtifact(config, 'locust');
  assert.equal(locust.filename, 'distributed-checkout-grpc-fulfillment.locustfile.py');
  assert.equal(locust.mimeType, 'text/x-python;charset=utf-8');
  assert.match(locust.content, /from locust import HttpUser, LoadTestShape, task, between/);
  assert.match(locust.content, /class PummelExportUser\(HttpUser\):/);

  const taurus = buildConfigExportArtifact(config, 'taurus');
  assert.equal(taurus.filename, 'distributed-checkout-grpc-fulfillment.taurus.yaml');
  assert.equal(taurus.mimeType, 'application/x-yaml;charset=utf-8');
  assert.match(taurus.content, /^execution:/m);
  assert.match(taurus.content, /reporting:/);
});

test('DOWNLOAD_EXPORT_FORMATS exposes exactly k6, locust, and taurus targets', () => {
  assert.deepEqual(
    DOWNLOAD_EXPORT_FORMATS.map((f) => f.id),
    ['k6', 'locust', 'taurus']
  );
});
