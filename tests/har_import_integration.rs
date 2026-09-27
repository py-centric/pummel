use pummel::engine::validation::validate_config;
use pummel::importer::{HarImportOptions, import_har, import_har_with_options};
use pummel::models::config::{HTTPRequestDefinition, HttpMethod};

#[tokio::test]
async fn test_har_import_and_filtering() {
    let har_json = r#"{
        "log": {
            "version": "1.2",
            "creator": { "name": "Firefox", "version": "125.0" },
            "entries": [
                {
                    "startedDateTime": "2026-09-27T01:00:00.000Z",
                    "time": 45.2,
                    "request": {
                        "method": "GET",
                        "url": "https://api.myapp.com/v2/items",
                        "headers": [
                            { "name": "Accept", "value": "application/json" },
                            { "name": "Authorization", "value": "Bearer token-abc" },
                            { "name": ":authority", "value": "api.myapp.com" },
                            { "name": "sec-ch-ua", "value": "Chromium" }
                        ]
                    },
                    "response": {
                        "status": 200,
                        "statusText": "OK"
                    },
                    "timings": { "wait": 30.0 }
                },
                {
                    "startedDateTime": "2026-09-27T01:00:01.000Z",
                    "time": 12.0,
                    "request": {
                        "method": "GET",
                        "url": "https://api.myapp.com/assets/app.js",
                        "headers": []
                    },
                    "response": { "status": 200 }
                },
                {
                    "startedDateTime": "2026-09-27T01:00:01.100Z",
                    "time": 8.0,
                    "request": {
                        "method": "GET",
                        "url": "https://api.myapp.com/images/hero.webp",
                        "headers": []
                    },
                    "response": { "status": 200 }
                },
                {
                    "startedDateTime": "2026-09-27T01:00:02.000Z",
                    "time": 95.0,
                    "request": {
                        "method": "PUT",
                        "url": "https://api.myapp.com/v2/items/42",
                        "headers": [
                            { "name": "Content-Type", "value": "application/json" }
                        ],
                        "postData": {
                            "mimeType": "application/json",
                            "text": "{\"status\": \"archived\"}"
                        }
                    },
                    "response": {
                        "status": 204
                    }
                }
            ]
        }
    }"#;

    // 1. Test default import with asset filtering
    let config = import_har(har_json).expect("Successful HAR import");

    assert_eq!(config.scenarios.len(), 1);
    let scenario = config
        .scenarios
        .get("har_scenario")
        .expect("Scenario exists");
    // app.js and hero.webp should be excluded, leaving 2 requests
    assert_eq!(scenario.requests.len(), 2);

    // Verify first request
    if let HTTPRequestDefinition::Detailed(ref req) = scenario.requests[0] {
        assert_eq!(req.label.as_deref(), Some("GET /v2/items"));
        assert_eq!(req.method, Some(HttpMethod::Get));
        assert_eq!(req.url, "https://api.myapp.com/v2/items");

        let headers = req.headers.as_ref().expect("headers present");
        assert_eq!(headers.get("Accept"), Some(&"application/json".to_string()));
        assert_eq!(
            headers.get("Authorization"),
            Some(&"Bearer token-abc".to_string())
        );
        // Browser pseudo-headers must be filtered out
        assert!(!headers.contains_key(":authority"));
        assert!(!headers.contains_key("sec-ch-ua"));

        assert_eq!(req.assert.len(), 1);
        assert_eq!(req.assert[0].subject, "status");
        assert_eq!(req.assert[0].contains, vec!["200"]);
    } else {
        panic!("Expected DetailedRequest for items");
    }

    // Verify second request
    if let HTTPRequestDefinition::Detailed(ref req) = scenario.requests[1] {
        assert_eq!(req.label.as_deref(), Some("PUT /v2/items/42"));
        assert_eq!(req.method, Some(HttpMethod::Put));
        assert_eq!(req.url, "https://api.myapp.com/v2/items/42");
        assert_eq!(req.body.as_deref(), Some("{\"status\": \"archived\"}"));

        assert_eq!(req.assert.len(), 1);
        assert_eq!(req.assert[0].subject, "status");
        assert_eq!(req.assert[0].contains, vec!["204"]);
    } else {
        panic!("Expected DetailedRequest for update");
    }

    // Verify Pummel validation passes
    let summary = validate_config(&config).await;
    assert!(summary.is_valid(), "Validation should succeed");

    // 2. Test import with custom scenario name and asset filtering disabled
    let opts = HarImportOptions {
        filter_static_assets: false,
        include_status_assertions: false,
        scenario_name: Some("full_browser_session".to_string()),
    };
    let unfiltered_config =
        import_har_with_options(har_json, &opts).expect("Unfiltered import succeeds");
    let unfiltered_scenario = unfiltered_config
        .scenarios
        .get("full_browser_session")
        .expect("Custom scenario name");
    assert_eq!(unfiltered_scenario.requests.len(), 4);
}
