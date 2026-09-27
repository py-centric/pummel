use pummel::exporter::export_goose;
use pummel::models::config::{
    AssertionDefinition, Configuration, DetailedRequest, ExecutionPlan, HTTPRequestDefinition,
    HttpMethod, ScenarioDefinition,
};
use std::collections::HashMap;

#[test]
fn test_export_standalone_goose_script() {
    let mut scenarios = HashMap::new();

    let requests = vec![
        HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
            url: "https://api.example.com/v1/auth".to_string(),
            method: Some(HttpMethod::Post),
            headers: Some(HashMap::from([(
                "Content-Type".to_string(),
                "application/json".to_string(),
            )])),
            body: Some("{\"client_id\": \"test\"}".to_string()),
            label: Some("Auth Flow".to_string()),
            assert: vec![
                AssertionDefinition {
                    subject: "status".to_string(),
                    contains: vec!["200".to_string()],
                    regexp: false,
                    not: false,
                },
                AssertionDefinition {
                    subject: "body".to_string(),
                    contains: vec!["token".to_string()],
                    regexp: false,
                    not: false,
                },
            ],
            ..Default::default()
        })),
        HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
            url: "https://api.example.com/v1/data".to_string(),
            method: Some(HttpMethod::Get),
            headers: Some(HashMap::from([(
                "Accept".to_string(),
                "application/json".to_string(),
            )])),
            label: Some("Fetch Data".to_string()),
            assert: vec![AssertionDefinition {
                subject: "status".to_string(),
                contains: vec!["200".to_string()],
                regexp: false,
                not: false,
            }],
            ..Default::default()
        })),
    ];

    scenarios.insert(
        "api_benchmark".to_string(),
        ScenarioDefinition {
            requests,
            weight: 3,
            think_time: None,
            data_sources: None,
            headers: None,
        },
    );

    let config = Configuration {
        execution: vec![ExecutionPlan {
            concurrency: 50,
            ramp_up: "10s".to_string(),
            hold_for: "2m".to_string(),
            scenario: "api_benchmark".to_string(),
            throughput: Some(1000),
            steps: None,
            pacing: None,
        }],
        scenarios,
        reporting: Vec::new(),
        services: Vec::new(),
        api: None,
    };

    let script = export_goose(&config);

    // Verify preamble and imports
    assert!(script.contains("//! Standalone Goose Load Test Script"));
    assert!(script.contains("use goose::prelude::*;"));
    assert!(script.contains("use std::time::Duration;"));

    // Verify task functions generated
    assert!(
        script.contains(
            "async fn api_benchmark_request_1(user: &mut GooseUser) -> GooseTaskResult {"
        )
    );
    assert!(
        script.contains(
            "async fn api_benchmark_request_2(user: &mut GooseUser) -> GooseTaskResult {"
        )
    );

    // Verify request 1 details
    assert!(script.contains("user.client.post(\"https://api.example.com/v1/auth\")"));
    assert!(script.contains("req_builder.header(\"Content-Type\", \"application/json\")"));
    assert!(script.contains("req_builder.body(\"{\\\"client_id\\\": \\\"test\\\"}\")"));
    assert!(script.contains("actual_status != 200"));
    assert!(script.contains("text.contains(\"token\")"));

    // Verify request 2 details
    assert!(script.contains("user.client.get(\"https://api.example.com/v1/data\")"));
    assert!(script.contains("req_builder.header(\"Accept\", \"application/json\")"));

    // Verify main function and Goose configuration
    assert!(script.contains("#[tokio::main]"));
    assert!(script.contains("async fn main() -> Result<(), GooseError> {"));
    assert!(script.contains("GooseAttack::initialize()?"));
    assert!(script.contains("scenario!(\"api_benchmark\")"));
    assert!(script.contains("scn_api_benchmark.set_weight(3)?"));
    assert!(script.contains("register_transaction(transaction!(api_benchmark_request_1))"));
    assert!(script.contains("register_transaction(transaction!(api_benchmark_request_2))"));

    // Verify execution parameters
    assert!(script.contains("GooseDefault::Users, 50"));
    assert!(script.contains("GooseDefault::RunTime, 120"));
    assert!(script.contains("GooseDefault::HatchRate, \"5\""));
    assert!(script.contains("GooseDefault::ThrottleRequests, 1000"));
    assert!(script.contains("attack.execute().await?;"));
}
