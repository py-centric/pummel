//! Apache Cassandra 5.0 Time-Window Compaction Strategy (TWCS) telemetry reporter (`ADR-L1-NOSQL-01`, `ADR-L0-DX-07`).

use std::fs::File;
use std::io::Write;

use chrono::Utc;
use goose::metrics::GooseMetrics;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::engine::PummelError;
use crate::engine::reporting::Reporter;
use crate::models::config::ReportingDefinition;

/// Default Cassandra keyspace for Pummel raw telemetry.
pub const DEFAULT_KEYSPACE: &str = "pummel_telemetry";

/// Default TWCS table name for per-endpoint run buckets.
pub const DEFAULT_TABLE: &str = "endpoint_latency_buckets";

/// Default TTL in seconds (30 days).
pub const DEFAULT_TTL_SECS: u64 = 2_592_000;

/// Single time-bucketed Cassandra telemetry record.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CassandraTelemetryRow {
    pub run_id: String,
    pub bucket_minute: String,
    pub endpoint: String,
    pub total_requests: usize,
    pub fail_count: usize,
    pub avg_ms: f64,
    pub min_ms: usize,
    pub max_ms: usize,
    pub ttl_secs: u64,
}

/// Generates canonical Cassandra 5.0 TWCS DDL for Pummel telemetry storage.
#[must_use]
pub fn render_twcs_schema_cql(keyspace: &str, table: &str, ttl_secs: u64) -> String {
    format!(
        "CREATE TABLE IF NOT EXISTS {keyspace}.{table} (
           run_id uuid,
           bucket_minute text,
           endpoint text,
           total_requests bigint,
           fail_count bigint,
           avg_ms double,
           min_ms bigint,
           max_ms bigint,
           PRIMARY KEY ((run_id, bucket_minute), endpoint)
         ) WITH compaction = {{'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}}
           AND default_time_to_live = {ttl_secs};
"
    )
}

/// Formats a single [`CassandraTelemetryRow`] into an idempotent CQL `INSERT ... USING TTL`.
#[must_use]
pub fn render_insert_cql(keyspace: &str, table: &str, row: &CassandraTelemetryRow) -> String {
    let escaped_ep = row.endpoint.replace('\'', "''");
    format!(
        "INSERT INTO {keyspace}.{table} (run_id, bucket_minute, endpoint, total_requests, fail_count, avg_ms, min_ms, max_ms)          VALUES ({}, '{}', '{}', {}, {}, {:.3}, {}, {}) USING TTL {};",
        row.run_id,
        row.bucket_minute,
        escaped_ep,
        row.total_requests,
        row.fail_count,
        row.avg_ms,
        row.min_ms,
        row.max_ms,
        row.ttl_secs
    )
}

/// Pummel Reporter emitting Cassandra 5.0 TWCS CQL batches to disk (for `cqlsh` / async bulk ingest).
pub struct CassandraReporter;

impl CassandraReporter {
    /// Convert [`GooseMetrics`] into deterministic [`CassandraTelemetryRow`] records.
    #[must_use]
    pub fn build_rows(
        stats: &GooseMetrics,
        ttl_secs: u64,
        run_id: Option<&str>,
    ) -> Vec<CassandraTelemetryRow> {
        let rid = run_id
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let bucket = Utc::now().format("%Y-%m-%dT%H:%M").to_string();

        stats
            .requests
            .iter()
            .map(|(endpoint, req)| {
                let count = req.raw_data.counter;
                let avg_ms = if count > 0 {
                    req.raw_data.total_time as f64 / count as f64
                } else {
                    0.0
                };
                CassandraTelemetryRow {
                    run_id: rid.clone(),
                    bucket_minute: bucket.clone(),
                    endpoint: endpoint.clone(),
                    total_requests: count,
                    fail_count: req.fail_count,
                    avg_ms,
                    min_ms: req.raw_data.minimum_time,
                    max_ms: req.raw_data.maximum_time,
                    ttl_secs,
                }
            })
            .collect()
    }
}

impl Reporter for CassandraReporter {
    fn module_name(&self) -> &'static str {
        "cassandra"
    }

    fn report(
        &self,
        definition: &ReportingDefinition,
        stats: &GooseMetrics,
    ) -> Result<(), PummelError> {
        if definition.module != "cassandra" {
            return Ok(());
        }
        let ks = definition.keyspace.as_deref().unwrap_or(DEFAULT_KEYSPACE);
        let table = definition.table.as_deref().unwrap_or(DEFAULT_TABLE);
        let ttl = definition.ttl_secs.unwrap_or(DEFAULT_TTL_SECS);
        let filename = definition
            .filename
            .as_deref()
            .unwrap_or("pummel_cassandra_batch.cql");

        let rows = Self::build_rows(stats, ttl, None);
        let mut file = File::create(filename)?;
        writeln!(file, "{}", render_twcs_schema_cql(ks, table, ttl))?;
        for row in &rows {
            writeln!(file, "{}", render_insert_cql(ks, table, row))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_twcs_ddl_and_insert_cql_safely() {
        let ddl = render_twcs_schema_cql("pummel_telemetry", "latency", 86_400);
        assert!(ddl.contains("TimeWindowCompactionStrategy"));
        assert!(ddl.contains("default_time_to_live = 86400"));

        let row = CassandraTelemetryRow {
            run_id: "11111111-1111-4111-8111-111111111111".to_string(),
            bucket_minute: "2026-11-24T18:00".to_string(),
            endpoint: "GET /api/v1/o'reilly".to_string(),
            total_requests: 120,
            fail_count: 0,
            avg_ms: 14.5,
            min_ms: 3,
            max_ms: 49,
            ttl_secs: 86_400,
        };
        let insert = render_insert_cql("pummel_telemetry", "latency", &row);
        assert!(insert.contains("o''reilly"));
        assert!(insert.contains("USING TTL 86400"));
    }

    #[test]
    fn cassandra_reporter_writes_batch_file() {
        let dir = tempfile::tempdir().unwrap();
        let out_path = dir.path().join("batch.cql");
        let def = ReportingDefinition {
            module: "cassandra".to_string(),
            filename: Some(out_path.to_string_lossy().into_owned()),
            keyspace: Some("test_ks".to_string()),
            table: Some("test_tbl".to_string()),
            ttl_secs: Some(3600),
            ..ReportingDefinition::default()
        };
        let stats = GooseMetrics::default();
        CassandraReporter.report(&def, &stats).unwrap();
        let written = std::fs::read_to_string(out_path).unwrap();
        assert!(written.contains("CREATE TABLE IF NOT EXISTS test_ks.test_tbl"));
    }
}
