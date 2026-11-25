import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPresetConfig } from './configEngine';
import { createInitialClusterState } from './distributedSim';
import { buildComplianceMatrix } from './complianceAudit';
import { searchPummelEntities } from './globalSearch';

test('searchPummelEntities returns balanced suggestions across all three domains on empty query', () => {
  const config = createDefaultPresetConfig();
  const runState = createInitialClusterState(config);
  const complianceItems = buildComplianceMatrix(config, runState);

  const results = searchPummelEntities({
    query: '',
    config,
    runState,
    complianceItems,
  });

  assert.ok(results.some((r) => r.category === 'config'));
  assert.ok(results.some((r) => r.category === 'worker'));
  assert.ok(results.some((r) => r.category === 'compliance'));
});

test('searchPummelEntities finds active workers by ID or region and targets "/" route', () => {
  const config = createDefaultPresetConfig();
  const runState = createInitialClusterState(config);
  const complianceItems = buildComplianceMatrix(config, runState);

  const results = searchPummelEntities({
    query: 'us-east-1',
    config,
    runState,
    complianceItems,
  });

  assert.ok(results.length >= 1);
  assert.equal(results[0].category, 'worker');
  assert.equal(results[0].route, '/');
  assert.equal(results[0].navigationState?.focusWorkerId, 'worker-us-east-01');
});

test('searchPummelEntities finds compliance reports by requirement ID and targets "/compliance"', () => {
  const config = createDefaultPresetConfig();
  const runState = createInitialClusterState(config);
  const complianceItems = buildComplianceMatrix(config, runState);

  const results = searchPummelEntities({
    query: 'NFR-SEC-03',
    config,
    runState,
    complianceItems,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].category, 'compliance');
  assert.equal(results[0].route, '/compliance');
  assert.equal(results[0].navigationState?.searchQuery, 'NFR-SEC-03');
});

test('searchPummelEntities respects category filter and returns template navigation state', () => {
  const config = createDefaultPresetConfig();
  const runState = createInitialClusterState(config);
  const complianceItems = buildComplianceMatrix(config, runState);

  const results = searchPummelEntities({
    query: 'spike',
    category: 'config',
    config,
    runState,
    complianceItems,
  });

  assert.ok(results.length >= 1);
  assert.ok(results.every((r) => r.category === 'config'));
  assert.equal(results[0].navigationState?.templateId, 'spike');
});
