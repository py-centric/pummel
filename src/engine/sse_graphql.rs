//! SSE streaming TTFT/token-rate & GraphQL DataLoader batched load profile builders (`ADR-L0-DX-07`).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Metrics captured from an SSE token-streaming load iteration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SseBenchmarkSample {
    pub ttft_ms: u64,
    pub total_ms: u64,
    pub events_received: usize,
    pub tokens_per_sec: f64,
}

/// Parse an SSE response body and compute deterministic token throughput metrics.
#[must_use]
pub fn evaluate_sse_sample(raw_stream: &str, ttft_ms: u64, total_ms: u64) -> SseBenchmarkSample {
    let events_received = raw_stream
        .lines()
        .filter(|line| line.trim_start().starts_with("data:"))
        .count();
    let tokens_per_sec = if total_ms > 0 {
        (events_received as f64) / (total_ms as f64 / 1000.0)
    } else {
        0.0
    };
    SseBenchmarkSample {
        ttft_ms,
        total_ms,
        events_received,
        tokens_per_sec,
    }
}

/// GraphQL operation descriptor for single or DataLoader-batched requests.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GraphQlOperation {
    pub query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_name: Option<String>,
    #[serde(default)]
    pub variables: Value,
}

/// Serialize a DataLoader-style batched JSON array payload for GraphQL load testing.
///
/// # Errors
/// Returns a serialization error if JSON encoding fails.
pub fn build_graphql_dataloader_batch(
    ops: &[GraphQlOperation],
) -> Result<String, serde_json::Error> {
    if ops.len() == 1 {
        serde_json::to_string(&ops[0])
    } else {
        serde_json::to_string(ops)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn evaluates_sse_ttft_and_tokens_per_sec() {
        let stream = "event: token
data: a

event: token
data: b

event: token
data: c

";
        let sample = evaluate_sse_sample(stream, 42, 500);
        assert_eq!(sample.ttft_ms, 42);
        assert_eq!(sample.events_received, 3);
        assert!((sample.tokens_per_sec - 6.0).abs() < 0.01);
    }

    #[test]
    fn builds_single_and_batched_graphql_dataloader_payloads() {
        let op1 = GraphQlOperation {
            query: "query GetPortfolio($id: ID!) { portfolio(id: $id) { totalCents } }".to_string(),
            operation_name: Some("GetPortfolio".to_string()),
            variables: json!({ "id": "p-1" }),
        };
        let single = build_graphql_dataloader_batch(std::slice::from_ref(&op1)).unwrap();
        assert!(single.starts_with('{'));

        let op2 = GraphQlOperation {
            query: "query GetRisk($id: ID!) { risk(id: $id) { score } }".to_string(),
            operation_name: Some("GetRisk".to_string()),
            variables: json!({ "id": "p-1" }),
        };
        let batch = build_graphql_dataloader_batch(&[op1, op2]).unwrap();
        assert!(batch.starts_with('['));
        assert!(batch.contains("GetPortfolio"));
        assert!(batch.contains("GetRisk"));
    }
}
