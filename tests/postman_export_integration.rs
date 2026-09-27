use pummel::exporter::export_postman;
use pummel::importer::import_postman;
use pummel::models::config::{
    AssertionDefinition, Configuration, DetailedRequest, ExecutionPlan, HTTPRequestDefinition,
    HttpMethod, ScenarioDefinition,
};
use std::collections::HashMap;

#[tokio::test]
async fn test_export_postman_and_bidirectional_roundtrip() {
    let mut scenarios = HashMap::new();

    let requests = vec![
        HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
            url: "https://${gatewayHost}/api/v1/authenticate".to_string(),
            method: Some(HttpMethod::Post),
            headers: Some(HashMap::from([(
                "Content-Type".to_string(),
                "application/json".to_string(),
            )])),
            body: Some("{\"api_key\": \"${secretKey}\"}".to_string()),
            label: Some("Authenticate System".to_string()),
            assert: vec![
                AssertionDefinition {
                    subject: "status".to_string(),
                    contains: vec!["200".to_string()],
                    regexp: false,
                    not: false,
                },
                AssertionDefinition {
                    subject: "body".to_string(),
                    contains: vec!["session_token".to_string()],
                    regexp: false,
                    not: false,
                },
            ],
            ..Default::default()
        })),
        HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
            url: "https://${gatewayHost}/api/v1/metrics?view=summary".to_string(),
            method: Some(HttpMethod::Get),
            headers: Some(HashMap::from([(
                "Authorization".to_string(),
                "Bearer ${sessionToken}".to_string(),
            )])),
            label: Some("Fetch Metrics".to_string()),
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
        "gateway_test".to_string(),
        ScenarioDefinition {
            requests,
            weight: 1,
            think_time: None,
            data_sources: None,
            headers: None,
        },
    );

    let config = Configuration {
        execution: vec![ExecutionPlan {
            concurrency: 5,
            ramp_up: "5s".to_string(),
            hold_for: "30s".to_string(),
            scenario: "gateway_test".to_string(),
            throughput: None,
            steps: None,
            pacing: None,
        }],
        scenarios,
        reporting: Vec::new(),
        services: Vec::new(),
        api: None,
    };

    // 1. Export to Postman Collection v2.1 JSON
    let exported_json = export_postman(&config);

    // Verify Postman Collection schema and structure
    assert!(
        exported_json
            .contains("https://schema.getpostman.com/json/collection/v2.1.0/collection.json")
    );
    assert!(exported_json.contains("Pummel Test Collection"));

    // Verify variable syntax transpiled from ${var} to {{var}}
    assert!(exported_json.contains("https://{{gatewayHost}}/api/v1/authenticate"));
    assert!(exported_json.contains("api_key"));
    assert!(exported_json.contains("{{secretKey}}"));
    assert!(exported_json.contains("Bearer {{sessionToken}}"));

    // Verify pm.test assertions
    assert!(exported_json.contains("pm.response.to.have.status(200)"));
    assert!(
        exported_json.contains("pm.expect(pm.response.text()).to.include(\\\"session_token\\\")")
    );

    // 2. Bidirectional Roundtrip: Re-import exported Postman JSON back into Pummel!
    let reimported_config =
        import_postman(&exported_json).expect("Re-import exported Postman collection into Pummel");

    assert_eq!(reimported_config.scenarios.len(), 1);
    let reimported_scenario = reimported_config
        .scenarios
        .values()
        .next()
        .expect("Reimported scenario exists");
    assert_eq!(reimported_scenario.requests.len(), 2);

    // Verify reimported request 0 converted back to ${var}
    if let HTTPRequestDefinition::Detailed(ref req) = reimported_scenario.requests[0] {
        assert_eq!(req.url, "https://${gatewayHost}/api/v1/authenticate");
        assert_eq!(req.method, Some(HttpMethod::Post));
        assert_eq!(req.body.as_deref(), Some("{\"api_key\": \"${secretKey}\"}"));
        assert_eq!(req.assert.len(), 2);
        assert_eq!(req.assert[0].subject, "status");
        assert_eq!(req.assert[0].contains, vec!["200"]);
        assert_eq!(req.assert[1].subject, "body");
        assert_eq!(req.assert[1].contains, vec!["session_token"]);
    } else {
        panic!("Expected DetailedRequest on reimport");
    }

    // Verify reimported request 1
    if let HTTPRequestDefinition::Detailed(ref req) = reimported_scenario.requests[1] {
        assert_eq!(
            req.url,
            "https://${gatewayHost}/api/v1/metrics?view=summary"
        );
        assert_eq!(req.method, Some(HttpMethod::Get));
        let headers = req.headers.as_ref().expect("headers present");
        assert_eq!(
            headers.get("Authorization"),
            Some(&"Bearer ${sessionToken}".to_string())
        );
        assert_eq!(req.assert.len(), 1);
        assert_eq!(req.assert[0].subject, "status");
        assert_eq!(req.assert[0].contains, vec!["200"]);
    } else {
        panic!("Expected DetailedRequest on reimport");
    }
}
