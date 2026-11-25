import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOAD_TEST_TEMPLATES,
  filterLoadTestTemplates,
  getTemplateById,
} from './templateLibrary';
import { runDryRunValidation, serializeConfig } from './configEngine';

test('LOAD_TEST_TEMPLATES includes smoke, spike, stress, load, and chaos patterns', () => {
  const patterns = new Set(LOAD_TEST_TEMPLATES.map((t) => t.pattern));
  assert.ok(patterns.has('smoke'));
  assert.ok(patterns.has('spike'));
  assert.ok(patterns.has('stress'));
  assert.ok(patterns.has('load'));
  assert.ok(patterns.has('chaos'));
});

test('every template builds a valid PummelConfig that passes dry-run validation with zero errors', () => {
  for (const tpl of LOAD_TEST_TEMPLATES) {
    const cfg = tpl.buildConfig();
    const yaml = serializeConfig(cfg, 'yaml');
    const diags = runDryRunValidation(cfg, yaml);
    const errors = diags.filter((d) => d.severity === 'error');
    assert.equal(errors.length, 0, `Template "${tpl.id}" had dry-run errors: ${errors.map((e) => e.message).join(', ')}`);
    assert.equal(cfg.execution[0].concurrency, tpl.concurrency);
  }
});

test('filterLoadTestTemplates filters accurately by pattern and returns all for "all"', () => {
  assert.equal(filterLoadTestTemplates(LOAD_TEST_TEMPLATES, 'all').length, LOAD_TEST_TEMPLATES.length);
  const spikeOnly = filterLoadTestTemplates(LOAD_TEST_TEMPLATES, 'spike');
  assert.equal(spikeOnly.length, 1);
  assert.equal(spikeOnly[0].id, 'spike');
  assert.equal(getTemplateById('stress')?.concurrency, 2200);
});
