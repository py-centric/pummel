#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]

use crate::engine::PummelError;
use crate::engine::reporting::RealTimeMetrics;
use crate::models::config::{SlaAction, SlaCriterion, SlaMetric};

#[derive(Debug)]
pub struct SlaResult {
    pub metric: SlaMetric,
    pub actual: f32,
    pub threshold: f32,
    pub passed: bool,
    pub action: SlaAction,
    #[allow(dead_code)]
    pub subject: Option<String>,
}

pub struct SlaEngine;

impl SlaEngine {
    pub fn evaluate(
        criteria: &[SlaCriterion],
        stats: &goose::metrics::GooseMetrics,
    ) -> Vec<SlaResult> {
        tracing::debug!("[SLA] Evaluating {} criteria", criteria.len());
        let mut results = Vec::new();
        for criterion in criteria {
            let actual = get_metric_value(criterion.metric, stats, criterion.subject.as_deref());
            let passed = actual <= criterion.threshold;
            tracing::debug!(
                "[SLA] {:?}: actual={:.4} threshold={:.4} passed={}",
                criterion.metric,
                actual,
                criterion.threshold,
                passed
            );
            results.push(SlaResult {
                metric: criterion.metric,
                actual,
                threshold: criterion.threshold,
                passed,
                action: criterion.action.clone(),
                subject: criterion.subject.clone(),
            });
        }
        results
    }

    #[allow(clippy::missing_errors_doc)]
    pub fn check_breaches(results: &[SlaResult]) -> Result<(), PummelError> {
        for result in results {
            if !result.passed && result.action == SlaAction::Stop {
                return Err(PummelError::SlaViolation {
                    metric: format!("{:?}", result.metric),
                    actual: result.actual,
                    threshold: result.threshold,
                });
            }
        }
        Ok(())
    }
}

fn get_metric_value(
    metric: SlaMetric,
    stats: &goose::metrics::GooseMetrics,
    subject: Option<&str>,
) -> f32 {
    let requests: Vec<&goose::metrics::GooseRequestMetricAggregate> = if let Some(s) = subject {
        stats.requests.values().filter(|r| r.path == s).collect()
    } else {
        stats.requests.values().collect()
    };

    let total_reqs: usize = requests
        .iter()
        .map(|r| r.success_count + r.fail_count)
        .sum();
    let total_fails: usize = requests.iter().map(|r| r.fail_count).sum();

    match metric {
        SlaMetric::FailRate => {
            if total_reqs == 0 {
                0.0
            } else {
                total_fails as f32 / total_reqs as f32
            }
        }
        SlaMetric::AvgResponseTime => {
            let mut total_time: usize = 0;
            let mut total_count: usize = 0;
            for req in &requests {
                total_time += req.raw_data.total_time;
                total_count += req.raw_data.counter;
            }
            if total_count == 0 {
                0.0
            } else {
                total_time as f32 / total_count as f32
            }
        }
        SlaMetric::P90ResponseTime | SlaMetric::P95ResponseTime | SlaMetric::P99ResponseTime => {
            let pct = match metric {
                SlaMetric::P90ResponseTime => 90.0,
                SlaMetric::P95ResponseTime => 95.0,
                SlaMetric::P99ResponseTime => 99.0,
                _ => unreachable!(),
            };
            percentile_from_metrics(&requests, pct)
        }
        SlaMetric::Throughput => {
            let duration_ms = stats.duration;
            if duration_ms == 0 {
                0.0
            } else {
                total_reqs as f32 / (duration_ms as f32 / 1000.0)
            }
        }
    }
}

fn percentile_from_metrics(
    requests: &[&goose::metrics::GooseRequestMetricAggregate],
    percentile: f64,
) -> f32 {
    let mut all_times: Vec<usize> = Vec::new();
    for req in requests {
        for (&time_ms, &count) in &req.raw_data.times {
            for _ in 0..count {
                all_times.push(time_ms);
            }
        }
    }
    if all_times.is_empty() {
        return 0.0;
    }
    all_times.sort_unstable();
    let idx = ((percentile / 100.0) * (all_times.len() as f64 - 1.0)).round() as usize;
    all_times[idx] as f32
}

impl SlaEngine {
    #[must_use]
    pub fn evaluate_realtime(criteria: &[SlaCriterion], stats: &RealTimeMetrics) -> Vec<SlaResult> {
        let mut results = Vec::new();
        let elapsed_secs = stats.start_time.elapsed().as_secs_f32().max(1.0);
        for criterion in criteria {
            let actual = get_realtime_metric_value(
                criterion.metric,
                stats,
                criterion.subject.as_deref(),
                elapsed_secs,
            );
            let passed = actual <= criterion.threshold;
            results.push(SlaResult {
                metric: criterion.metric,
                actual,
                threshold: criterion.threshold,
                passed,
                action: criterion.action.clone(),
                subject: criterion.subject.clone(),
            });
        }
        results
    }
}

fn get_realtime_metric_value(
    metric: SlaMetric,
    stats: &RealTimeMetrics,
    subject: Option<&str>,
    elapsed_secs: f32,
) -> f32 {
    let endpoints: Vec<&crate::engine::reporting::RealTimeEndpointStats> = if let Some(s) = subject
    {
        stats.endpoints.get(s).into_iter().collect()
    } else {
        stats.endpoints.values().collect()
    };

    let total_reqs: usize = endpoints.iter().map(|e| e.count).sum();
    let total_fails: usize = endpoints.iter().map(|e| e.failures).sum();

    match metric {
        SlaMetric::FailRate => {
            if total_reqs == 0 {
                0.0
            } else {
                total_fails as f32 / total_reqs as f32
            }
        }
        SlaMetric::AvgResponseTime => {
            let mut total_time: usize = 0;
            let mut total_count: usize = 0;
            for ep in &endpoints {
                total_time += ep.total_time_ms;
                total_count += ep.count;
            }
            if total_count == 0 {
                0.0
            } else {
                total_time as f32 / total_count as f32
            }
        }
        SlaMetric::P90ResponseTime | SlaMetric::P95ResponseTime | SlaMetric::P99ResponseTime => {
            let pct = match metric {
                SlaMetric::P90ResponseTime => 90.0,
                SlaMetric::P95ResponseTime => 95.0,
                SlaMetric::P99ResponseTime => 99.0,
                _ => unreachable!(),
            };
            percentile_from_realtime(&endpoints, pct)
        }
        SlaMetric::Throughput => total_reqs as f32 / elapsed_secs,
    }
}

fn percentile_from_realtime(
    endpoints: &[&crate::engine::reporting::RealTimeEndpointStats],
    percentile: f64,
) -> f32 {
    let mut all_times: Vec<usize> = Vec::new();
    for ep in endpoints {
        all_times.extend_from_slice(&ep.times);
    }
    if all_times.is_empty() {
        return 0.0;
    }
    all_times.sort_unstable();
    let idx = ((percentile / 100.0) * (all_times.len() as f64 - 1.0)).round() as usize;
    all_times[idx] as f32
}

#[cfg(test)]
mod tests {
    use super::*;
    use goose::metrics::GooseMetrics;

    fn mock_stats() -> GooseMetrics {
        GooseMetrics::default()
    }

    #[test]
    fn test_fail_rate_under_threshold_passes() {
        let criteria = vec![SlaCriterion {
            metric: SlaMetric::FailRate,
            threshold: 0.1,
            subject: None,
            duration: None,
            action: SlaAction::Stop,
        }];
        let stats = mock_stats();
        let results = SlaEngine::evaluate(&criteria, &stats);
        assert!(results[0].passed);
        assert_eq!(results[0].actual, 0.0);
    }

    #[test]
    fn test_avg_response_time() {
        let criteria = vec![SlaCriterion {
            metric: SlaMetric::AvgResponseTime,
            threshold: 1000.0,
            subject: None,
            duration: None,
            action: SlaAction::Warn,
        }];
        let stats = mock_stats();
        let results = SlaEngine::evaluate(&criteria, &stats);
        assert!(results[0].passed);
    }

    #[test]
    fn test_throughput_computation() {
        let criteria = vec![SlaCriterion {
            metric: SlaMetric::Throughput,
            threshold: 0.0,
            subject: None,
            duration: None,
            action: SlaAction::Continue,
        }];
        let stats = mock_stats();
        let results = SlaEngine::evaluate(&criteria, &stats);
        assert_eq!(results[0].actual, 0.0);
    }

    #[test]
    fn test_check_breaches_stop_action() {
        let results = vec![SlaResult {
            metric: SlaMetric::FailRate,
            actual: 0.5,
            threshold: 0.1,
            passed: false,
            action: SlaAction::Stop,
            subject: None,
        }];
        let err = SlaEngine::check_breaches(&results);
        assert!(err.is_err());
        assert!(matches!(err.unwrap_err(), PummelError::SlaViolation { .. }));
    }

    #[test]
    fn test_check_breaches_warn_action_no_error() {
        let results = vec![SlaResult {
            metric: SlaMetric::FailRate,
            actual: 0.5,
            threshold: 0.1,
            passed: false,
            action: SlaAction::Warn,
            subject: None,
        }];
        let result = SlaEngine::check_breaches(&results);
        assert!(result.is_ok());
    }

    #[test]
    fn test_avg_response_time_with_zero_requests_returns_zero() {
        let stats = mock_stats();
        let criteria = vec![SlaCriterion {
            metric: SlaMetric::AvgResponseTime,
            threshold: 1000.0,
            subject: None,
            duration: None,
            action: SlaAction::Warn,
        }];
        let results = SlaEngine::evaluate(&criteria, &stats);
        assert!(results[0].passed);
        assert!((results[0].actual - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_throughput_with_zero_duration_returns_zero() {
        let stats = mock_stats();
        let criteria = vec![SlaCriterion {
            metric: SlaMetric::Throughput,
            threshold: 10.0,
            subject: None,
            duration: None,
            action: SlaAction::Continue,
        }];
        let results = SlaEngine::evaluate(&criteria, &stats);
        assert!(results[0].passed);
        // Duration is 0, so throughput should be 0
        assert!((results[0].actual - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_empty_criteria_returns_empty_results() {
        let stats = mock_stats();
        let results = SlaEngine::evaluate(&[], &stats);
        assert!(results.is_empty());
    }

    #[test]
    fn test_percentile_from_metrics_and_goose_metrics_evaluation() {
        use std::collections::BTreeMap;
        let mut stats = mock_stats();
        stats.duration = 2000; // 2 seconds

        let mut times = BTreeMap::new();
        times.insert(100, 10);
        let timing = goose::metrics::GooseRequestMetricTimingData {
            counter: 10,
            total_time: 1000,
            minimum_time: 100,
            maximum_time: 100,
            times,
        };
        let req_metric = goose::metrics::GooseRequestMetricAggregate {
            path: "/api/items".to_string(),
            method: goose::prelude::GooseMethod::Get,
            raw_data: timing,
            coordinated_omission_data: None,
            status_code_counts: std::collections::HashMap::new(),
            success_count: 9,
            fail_count: 1,
            load_test_hash: 0,
        };

        stats.requests.insert("/api/items".to_string(), req_metric);

        let criteria = vec![
            SlaCriterion {
                metric: SlaMetric::P90ResponseTime,
                threshold: 200.0,
                subject: Some("/api/items".to_string()),
                duration: None,
                action: SlaAction::Warn,
            },
            SlaCriterion {
                metric: SlaMetric::P95ResponseTime,
                threshold: 200.0,
                subject: None,
                duration: None,
                action: SlaAction::Warn,
            },
            SlaCriterion {
                metric: SlaMetric::P99ResponseTime,
                threshold: 200.0,
                subject: None,
                duration: None,
                action: SlaAction::Warn,
            },
            SlaCriterion {
                metric: SlaMetric::Throughput,
                threshold: 10.0,
                subject: None,
                duration: None,
                action: SlaAction::Warn,
            },
        ];

        let results = SlaEngine::evaluate(&criteria, &stats);
        assert_eq!(results.len(), 4);
        assert!(results[0].passed);
        assert_eq!(results[0].actual, 100.0);
        assert!(results[1].passed);
        assert_eq!(results[1].actual, 100.0);
        assert!(results[2].passed);
        assert_eq!(results[2].actual, 100.0);
        assert!(results[3].passed);
        assert_eq!(results[3].actual, 5.0); // 10 reqs / 2s = 5 RPS
    }

    #[test]
    fn test_evaluate_realtime_metrics_all_branches() {
        use crate::engine::reporting::{RealTimeEndpointStats, RealTimeMetrics};

        let mut rt = RealTimeMetrics::default();
        let ep = RealTimeEndpointStats {
            count: 20,
            failures: 2,
            total_time_ms: 2000,
            times: vec![50, 100, 150, 200, 250],
        };

        rt.endpoints.insert("/api/test".to_string(), ep);

        let criteria = vec![
            SlaCriterion {
                metric: SlaMetric::FailRate,
                threshold: 0.2,
                subject: Some("/api/test".to_string()),
                duration: None,
                action: SlaAction::Warn,
            },
            SlaCriterion {
                metric: SlaMetric::AvgResponseTime,
                threshold: 500.0,
                subject: None,
                duration: None,
                action: SlaAction::Warn,
            },
            SlaCriterion {
                metric: SlaMetric::P90ResponseTime,
                threshold: 300.0,
                subject: None,
                duration: None,
                action: SlaAction::Warn,
            },
            SlaCriterion {
                metric: SlaMetric::P95ResponseTime,
                threshold: 300.0,
                subject: None,
                duration: None,
                action: SlaAction::Warn,
            },
            SlaCriterion {
                metric: SlaMetric::P99ResponseTime,
                threshold: 300.0,
                subject: None,
                duration: None,
                action: SlaAction::Warn,
            },
            SlaCriterion {
                metric: SlaMetric::Throughput,
                threshold: 100.0,
                subject: None,
                duration: None,
                action: SlaAction::Warn,
            },
        ];

        let results = SlaEngine::evaluate_realtime(&criteria, &rt);
        assert_eq!(results.len(), 6);
        assert!(results[0].passed); // FailRate 2/20 = 0.1 <= 0.2
        assert!(results[1].passed); // AvgResponseTime = 100 <= 500
        assert!(results[2].passed); // P90 <= 300
        assert!(results[3].passed); // P95 <= 300
        assert!(results[4].passed); // P99 <= 300
        assert!(results[5].passed); // Throughput > 0.1

        // Empty endpoints realtime test
        let empty_rt = RealTimeMetrics::default();
        let empty_results = SlaEngine::evaluate_realtime(&criteria, &empty_rt);
        assert_eq!(empty_results.len(), 6);
        assert_eq!(empty_results[0].actual, 0.0);
    }
}
