use crate::engine::reporting::RealTimeMetrics;
use std::sync::{Arc, RwLock};

/// Records request metrics for real-time reporting.
///
/// Safely locks the metrics, updates endpoint stats (count, timing, failures),
/// and returns silently if metrics are unavailable or the lock is poisoned.
pub(crate) fn record_request(
    metrics: Option<&Arc<RwLock<RealTimeMetrics>>>,
    endpoint_name: &str,
    duration_ms: usize,
    success: bool,
) {
    if let Some(rtm) = metrics
        && let Ok(mut lock) = rtm.write()
    {
        let stats = lock.endpoints.entry(endpoint_name.to_string()).or_default();
        stats.count += 1;
        stats.total_time_ms += duration_ms;
        stats.push_time(duration_ms);
        if !success {
            stats.failures += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_record_request_success_and_failure() {
        let rtm = Arc::new(RwLock::new(RealTimeMetrics::default()));
        record_request(Some(&rtm), "/api/test", 150, true);
        record_request(Some(&rtm), "/api/test", 250, false);

        let lock = rtm.read().unwrap();
        let stats = lock.endpoints.get("/api/test").unwrap();
        assert_eq!(stats.count, 2);
        assert_eq!(stats.total_time_ms, 400);
        assert_eq!(stats.failures, 1);
        assert_eq!(stats.times, vec![150, 250]);
    }

    #[test]
    fn test_record_request_none_metrics() {
        record_request(None, "/api/none", 100, false);
    }
}
