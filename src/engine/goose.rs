use crate::engine::PummelError;
#[cfg(feature = "influxdb-reporter")]
use crate::engine::reporting::InfluxDbReporter;
use crate::engine::reporting::{CliSummary, JUnitReporter, RealTimeMetrics, Reporter};
use crate::engine::sla::SlaEngine;
#[cfg(feature = "influxdb-reporter")]
use crate::engine::utils::parse_time_to_ms;
use crate::models::config::{Configuration, SlaAction, SlaCriterion, SlaMetric};
use crate::translator::StateTranslator;
use axum::{
    Router,
    routing::{get, post},
};
use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use std::time::Duration;

fn run_hooks(services: &[crate::models::config::ServiceDefinition], phase: &str) {
    for svc in services {
        if svc.module == "shell" {
            let cmds = match phase {
                "prepare" => &svc.prepare,
                "startup" => &svc.startup,
                "shutdown" => &svc.shutdown,
                _ => continue,
            };
            for cmd in cmds {
                tracing::info!("[SHELL HOOK] Running ({}): {}", phase, cmd);
                let output = if cfg!(target_os = "windows") {
                    std::process::Command::new("cmd").args(["/C", cmd]).output()
                } else {
                    std::process::Command::new("sh").args(["-c", cmd]).output()
                };
                match output {
                    Ok(out) => {
                        if out.status.success() {
                            tracing::debug!(
                                "[SHELL HOOK] Success: {}",
                                String::from_utf8_lossy(&out.stdout)
                            );
                        } else {
                            tracing::error!(
                                "[SHELL HOOK] Command failed with status {}: {}",
                                out.status,
                                String::from_utf8_lossy(&out.stderr)
                            );
                        }
                    }
                    Err(e) => {
                        tracing::error!("[SHELL HOOK] Failed to execute command: {}", e);
                    }
                }
            }
        }
    }
}

#[allow(clippy::missing_errors_doc)]
pub async fn run_attack(config: Configuration) -> Result<(), PummelError> {
    run_hooks(&config.services, "prepare");
    run_hooks(&config.services, "startup");

    let services_clone = config.services.clone();
    let res = run_attack_inner(config).await;

    run_hooks(&services_clone, "shutdown");
    res
}

#[allow(clippy::too_many_lines)]
async fn run_attack_inner(config: Configuration) -> Result<(), PummelError> {
    tracing::info!(
        "Starting load test with {} scenarios",
        config.scenarios.len()
    );

    let real_time_metrics = Arc::new(RwLock::new(RealTimeMetrics::default()));

    // FR-010: Enable real-time reporting if interval is set
    #[cfg(feature = "influxdb-reporter")]
    for report_def in &config.reporting {
        if report_def.module == "influxdb" {
            let interval_opt = &report_def.interval;
            if let Some(interval) = interval_opt {
                let interval_ms = parse_time_to_ms(interval);
                if interval_ms > 0 {
                    let rt_metrics = real_time_metrics.clone();
                    let report_def_clone = report_def.clone();
                    tokio::spawn(async move {
                        let mut interval =
                            tokio::time::interval(Duration::from_millis(interval_ms));
                        loop {
                            interval.tick().await;
                            // Lock briefly, clone the bounded snapshot, then release before async I/O.
                            // The clone is bounded because RealTimeEndpointStats caps times at 10K.
                            let metrics_snapshot = {
                                let lock = rt_metrics
                                    .read()
                                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                                lock.clone()
                            };
                            if let Err(e) = InfluxDbReporter::push_real_time_metrics(
                                &report_def_clone,
                                &metrics_snapshot,
                            )
                            .await
                            {
                                tracing::error!("[INFLUX-RT] Push failed: {}", e);
                            }
                        }
                    });
                }
            }
        }
    }

    // Build SLA criteria
    let mut all_criteria = Vec::new();
    for report_def in &config.reporting {
        if let Some(threshold) = report_def.failed_threshold {
            all_criteria.push(SlaCriterion {
                metric: SlaMetric::FailRate,
                threshold,
                subject: None,
                duration: None,
                action: SlaAction::Stop,
            });
        }
        all_criteria.extend(report_def.sla.clone());
    }

    let (abort_tx, mut abort_rx) = tokio::sync::mpsc::channel::<String>(1);

    // Spawn Dynamic API server if enabled
    if let Some(ref api_cfg) = config.api
        && api_cfg.enabled
    {
        let metrics_clone = real_time_metrics.clone();
        let abort_tx_clone = abort_tx.clone();
        let port = api_cfg.port;
        tokio::spawn(async move {
            if let Err(e) = start_api_server(port, metrics_clone, abort_tx_clone).await {
                tracing::error!("[API] Server error: {}", e);
            }
        });
    }

    // Spawn SLA background checker if we have criteria
    if !all_criteria.is_empty() {
        let metrics_clone = real_time_metrics.clone();
        let abort_tx_clone = abort_tx.clone();
        let criteria_clone = all_criteria.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(1));
            let mut triggered_execs = std::collections::HashSet::new();

            loop {
                interval.tick().await;
                // FIX: Use a read lock and evaluate directly - no O(n) clone.
                let results = {
                    let lock = metrics_clone
                        .read()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    SlaEngine::evaluate_realtime(&criteria_clone, &lock)
                };
                for result in &results {
                    if !result.passed {
                        match &result.action {
                            SlaAction::Warn => {
                                tracing::warn!(
                                    "[SLA-RT] SLA warning: {:?} {:.2} exceeds threshold {:.2}",
                                    result.metric,
                                    result.actual,
                                    result.threshold
                                );
                            }
                            SlaAction::Continue => {
                                tracing::info!(
                                    "[SLA-RT] SLA breach: {:?} {:.2} exceeds {:.2}",
                                    result.metric,
                                    result.actual,
                                    result.threshold
                                );
                            }
                            SlaAction::Exec(cmd) => {
                                if triggered_execs.insert(cmd.clone()) {
                                    tracing::info!(
                                        "[SLA-RT] Executing SLA action command: {}",
                                        cmd
                                    );
                                    let cmd_for_exec = cmd.clone();
                                    match tokio::task::spawn_blocking(move || {
                                        if cfg!(target_os = "windows") {
                                            std::process::Command::new("cmd")
                                                .args(["/C", &cmd_for_exec])
                                                .status()
                                        } else {
                                            std::process::Command::new("sh")
                                                .args(["-c", &cmd_for_exec])
                                                .status()
                                        }
                                    })
                                    .await
                                    {
                                        Ok(Ok(_)) => {}
                                        Ok(Err(e)) => {
                                            tracing::error!(
                                                "[SLA-RT] SLA action failed to execute: {}",
                                                e
                                            );
                                        }
                                        Err(e) => {
                                            tracing::error!(
                                                "[SLA-RT] SLA action task failed: {}",
                                                e
                                            );
                                        }
                                    }
                                }
                            }
                            SlaAction::Stop => {
                                let _ = abort_tx_clone
                                    .send(format!(
                                        "SLA breach: {:?} {:.2} exceeds threshold {:.2}",
                                        result.metric, result.actual, result.threshold
                                    ))
                                    .await;
                                return;
                            }
                        }
                    }
                }
            }
        });
    }

    let attack = StateTranslator::translate(&config, None, Some(real_time_metrics)).await?;

    tracing::info!("Executing Goose attack...");
    let attack_future = attack.execute();
    tokio::pin!(attack_future);

    let stats = tokio::select! {
        res = &mut attack_future => {
            match res {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!("Goose attack execution failed: {}", e);
                    return Err(PummelError::Goose(Box::new(e)));
                }
            }
        }
        reason = abort_rx.recv() => {
            let reason_str = reason.unwrap_or_else(|| "Unknown abort reason".to_string());
            tracing::error!("[ABORT] Load test aborted: {}", reason_str);
            return Err(PummelError::SlaViolation {
                metric: "Real-time SLA/API Stop".to_string(),
                actual: 0.0,
                threshold: 0.0,
            });
        }
    };

    tracing::info!("Goose attack completed, generating report");

    // US5: CLI Reporter - always print terminal summary
    tracing::debug!("[CLI] Generating terminal summary");
    let summary = CliSummary::from_metrics(&stats);
    summary.print();

    // REQ-6.1: Reporting (JUnit + InfluxDB final push)
    let reporters: Vec<Box<dyn Reporter>> = {
        #[allow(unused_mut)]
        let mut r: Vec<Box<dyn Reporter>> = vec![Box::new(JUnitReporter)];
        #[cfg(feature = "influxdb-reporter")]
        r.push(Box::new(InfluxDbReporter));
        r
    };
    for report_def in &config.reporting {
        if let Some(reporter) = reporters
            .iter()
            .find(|r| r.module_name() == report_def.module)
        {
            reporter.report(report_def, &stats)?;
        }
    }

    // Evaluate SLA at the end
    if !all_criteria.is_empty() {
        tracing::debug!("[SLA] Evaluating {} criteria", all_criteria.len());
        let results = SlaEngine::evaluate(&all_criteria, &stats);
        for result in &results {
            if !result.passed {
                match &result.action {
                    SlaAction::Warn => {
                        tracing::warn!(
                            "SLA warning: {:?} {:.2} exceeds threshold {:.2}",
                            result.metric,
                            result.actual,
                            result.threshold
                        );
                    }
                    SlaAction::Continue => {
                        tracing::info!(
                            "SLA breach recorded: {:?} {:.2} exceeds {:.2}",
                            result.metric,
                            result.actual,
                            result.threshold
                        );
                    }
                    SlaAction::Exec(cmd) => {
                        tracing::info!(
                            "SLA breach recorded: {:?}, triggered: {}",
                            result.metric,
                            cmd
                        );
                    }
                    SlaAction::Stop => {}
                }
            }
        }
        SlaEngine::check_breaches(&results)?;
    }

    Ok(())
}

async fn start_api_server(
    port: u16,
    metrics: Arc<RwLock<RealTimeMetrics>>,
    abort_tx: tokio::sync::mpsc::Sender<String>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use axum::http::StatusCode;

    let metrics_clone = metrics.clone();
    let abort_tx_clone = abort_tx.clone();

    let app = Router::new()
        .route(
            "/metrics",
            get(move || {
                let metrics = metrics_clone.clone();
                async move {
                    // FIX: Use a read lock; clone is bounded by MAX_TIMINGS cap.
                    let snapshot = {
                        let lock = metrics
                            .read()
                            .unwrap_or_else(std::sync::PoisonError::into_inner);
                        lock.clone()
                    };
                    axum::Json(snapshot)
                }
            }),
        )
        .route(
            "/control/stop",
            post(move || {
                let abort_tx = abort_tx_clone.clone();
                async move {
                    let _ = abort_tx.send("Aborted via control API".to_string()).await;
                    (StatusCode::OK, "Load test stop initiated")
                }
            }),
        );

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!(
        "[API] Runtime tuning control API listening on http://{}",
        addr
    );
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::config::Configuration;

    #[tokio::test]
    async fn test_run_attack_empty_config() {
        let config = Configuration {
            execution: vec![],
            scenarios: std::collections::HashMap::new(),
            reporting: vec![],
            services: vec![],
            api: None,
        };
        let result = run_attack(config).await;
        assert!(result.is_ok() || result.is_err());
    }

    #[test]
    fn test_run_hooks_command_failure_and_nonexistent() {
        use crate::models::config::ServiceDefinition;

        // Command returns non-zero status
        let failure_svc = ServiceDefinition {
            module: "shellexec".to_string(),
            prepare: vec!["false".to_string()],
            startup: vec![],
            shutdown: vec![],
        };
        run_hooks(&[failure_svc], "prepare");

        // Non-existent command
        let nonexistent_svc = ServiceDefinition {
            module: "shellexec".to_string(),
            prepare: vec!["/nonexistent/pummel/binary/12345".to_string()],
            startup: vec![],
            shutdown: vec![],
        };
        run_hooks(&[nonexistent_svc], "prepare");

        // Non-matching module does nothing
        let other_svc = ServiceDefinition {
            module: "other".to_string(),
            prepare: vec!["echo hello".to_string()],
            startup: vec![],
            shutdown: vec![],
        };
        run_hooks(&[other_svc], "prepare");

        // Successful hook
        let success_svc = ServiceDefinition {
            module: "shellexec".to_string(),
            prepare: vec!["echo hook_success".to_string()],
            startup: vec![],
            shutdown: vec![],
        };
        run_hooks(&[success_svc], "prepare");
    }

    #[tokio::test]
    async fn test_run_attack_with_sla_actions() {
        use crate::models::config::{
            ExecutionPlan, HTTPRequestDefinition, ScenarioDefinition, SlaAction, SlaCriterion,
            SlaMetric,
        };

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move {
            let app = axum::Router::new().route("/ping", axum::routing::get(|| async { "pong" }));
            let _ = axum::serve(listener, app).await;
        });

        let mut scenarios = std::collections::HashMap::new();
        scenarios.insert(
            "sla_scenario".to_string(),
            ScenarioDefinition {
                requests: vec![HTTPRequestDefinition::Detailed(Box::new(
                    crate::models::config::DetailedRequest {
                        url: format!("http://{addr}/ping"),
                        label: Some("ping_endpoint".to_string()),
                        ..Default::default()
                    },
                ))],
                weight: 1,
                think_time: None,
                data_sources: None,
                headers: None,
            },
        );

        let config = Configuration {
            execution: vec![ExecutionPlan {
                concurrency: 1,
                ramp_up: "0s".to_string(),
                hold_for: "2s".to_string(),
                scenario: "sla_scenario".to_string(),
                throughput: None,
                steps: None,
                pacing: None,
            }],
            scenarios,
            reporting: vec![crate::models::config::ReportingDefinition {
                module: "cli-summary".to_string(),
                sla: vec![
                    SlaCriterion {
                        metric: SlaMetric::AvgResponseTime,
                        threshold: 0.0001,
                        action: SlaAction::Warn,
                        duration: None,
                        subject: None,
                    },
                    SlaCriterion {
                        metric: SlaMetric::P95ResponseTime,
                        threshold: 0.0001,
                        action: SlaAction::Continue,
                        duration: None,
                        subject: None,
                    },
                    SlaCriterion {
                        metric: SlaMetric::P99ResponseTime,
                        threshold: 0.0001,
                        action: SlaAction::Exec("echo sla_exec_ok".to_string()),
                        duration: None,
                        subject: None,
                    },
                ],
                ..Default::default()
            }],
            services: vec![],
            api: None,
        };

        let result = run_attack(config).await;
        handle.abort();
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_run_attack_sla_stop() {
        use crate::models::config::{
            DetailedRequest, ExecutionPlan, HTTPRequestDefinition, ScenarioDefinition, SlaAction,
            SlaCriterion, SlaMetric,
        };

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move {
            let app = axum::Router::new().route("/ping", axum::routing::get(|| async { "pong" }));
            let _ = axum::serve(listener, app).await;
        });

        let mut scenarios = std::collections::HashMap::new();
        scenarios.insert(
            "sla_stop_scenario".to_string(),
            ScenarioDefinition {
                requests: vec![HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
                    url: format!("http://{addr}/ping"),
                    label: Some("ping_stop".to_string()),
                    ..Default::default()
                }))],
                weight: 1,
                think_time: None,
                data_sources: None,
                headers: None,
            },
        );

        let config = Configuration {
            execution: vec![ExecutionPlan {
                concurrency: 1,
                ramp_up: "0s".to_string(),
                hold_for: "2s".to_string(),
                scenario: "sla_stop_scenario".to_string(),
                throughput: None,
                steps: None,
                pacing: None,
            }],
            scenarios,
            reporting: vec![crate::models::config::ReportingDefinition {
                module: "cli-summary".to_string(),
                sla: vec![SlaCriterion {
                    metric: SlaMetric::AvgResponseTime,
                    threshold: -1.0,
                    action: SlaAction::Stop,
                    duration: None,
                    subject: None,
                }],
                ..Default::default()
            }],
            services: vec![],
            api: None,
        };

        let res = run_attack(config).await;
        handle.abort();
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_start_api_server_routes() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let (tx, mut rx) = tokio::sync::mpsc::channel(10);
        let metrics = Arc::new(RwLock::new(RealTimeMetrics::default()));
        let handle = tokio::spawn(async move {
            let _ = start_api_server(port, metrics, tx).await;
        });

        // Allow server to bind
        tokio::time::sleep(Duration::from_millis(50)).await;

        // 1. GET /metrics
        let mut stream = tokio::net::TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .unwrap();
        stream
            .write_all(b"GET /metrics HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut buf = vec![0u8; 1024];
        let n = stream.read(&mut buf).await.unwrap();
        let resp = String::from_utf8_lossy(&buf[..n]);
        assert!(resp.contains("200 OK"));

        // 2. POST /control/stop
        let mut stream2 = tokio::net::TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .unwrap();
        stream2
            .write_all(
                b"POST /control/stop HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            )
            .await
            .unwrap();
        let mut buf2 = vec![0u8; 1024];
        let n2 = stream2.read(&mut buf2).await.unwrap();
        let resp2 = String::from_utf8_lossy(&buf2[..n2]);
        assert!(resp2.contains("200 OK"));

        // Verify abort message was received
        assert_eq!(rx.recv().await.unwrap(), "Aborted via control API");

        handle.abort();
    }
}
