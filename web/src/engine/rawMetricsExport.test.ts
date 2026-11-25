import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPresetConfig } from './configEngine';
import {
  createInitialClusterState,
  startDistributedRun,
  stepDistributedRun,
} from './distributedSim';
import {
  buildRawMetricRecords,
  buildRawMetricsExportArtifact,
} from './rawMetricsExport';

test('buildRawMetricRecords includes idle baseline and endpoint summaries when run has not started', () => {
  const cfg = createDefaultPresetConfig();
  const state = createInitialClusterState(cfg);
  const fixedNow = new Date('2026-11-22T01:40:00.000Z');

  const records = buildRawMetricRecords(state, fixedNow);

  // 1 global baseline row + 4 endpoint summary rows
  assert.equal(records.length, 5);
  assert.equal(records[0].recordType, 'timeseries_tick');
  assert.equal(records[0].throughputMarker, 'IDLE_BASELINE');
  assert.equal(records[0].timestampIso, '2026-11-22T01:40:00.000Z');
  assert.equal(records[1].recordType, 'endpoint_summary');
});

test('buildRawMetricsExportArtifact generates CSV with timestamps, latency values, and throughput markers', () => {
  const cfg = createDefaultPresetConfig();
  let state = createInitialClusterState(cfg);
  state = startDistributedRun(state, cfg);
  state = stepDistributedRun(state, cfg, 1);
  state = stepDistributedRun(state, cfg, 1);

  const csvArtifact = buildRawMetricsExportArtifact({
    runState: state,
    specName: cfg.name,
    format: 'csv',
    now: new Date('2026-11-22T01:40:00.000Z'),
  });

  assert.ok(csvArtifact.filename.endsWith('-metrics.csv'));
  assert.equal(csvArtifact.mimeType, 'text/csv;charset=utf-8');
  assert.ok(csvArtifact.rowCount >= 6);
  assert.ok(
    csvArtifact.csvText.startsWith(
      'timestamp_iso,elapsed_sec,record_type,subject,protocol,active_vus,throughput_rps,throughput_marker,latency_avg_ms,latency_p50_ms,latency_p90_ms,latency_p95_ms,latency_p99_ms,fail_rate_pct,total_requests,failed_requests'
    )
  );
  assert.ok(csvArtifact.csvText.includes('PEAK_RPS'));
});

test('buildRawMetricsExportArtifact generates Parquet binary with PAR1 magic header and footer', () => {
  const cfg = createDefaultPresetConfig();
  const state = createInitialClusterState(cfg);

  const parquetArtifact = buildRawMetricsExportArtifact({
    runState: state,
    specName: cfg.name,
    format: 'parquet',
  });

  assert.ok(parquetArtifact.filename.endsWith('-metrics.parquet'));
  assert.equal(parquetArtifact.mimeType, 'application/vnd.apache.parquet');

  const bytes = parquetArtifact.parquetBytes;
  const decoder = new TextDecoder();
  assert.equal(decoder.decode(bytes.slice(0, 4)), 'PAR1');
  assert.equal(decoder.decode(bytes.slice(bytes.length - 4)), 'PAR1');
});
