use pummel::engine::validation::validate_config;
use pummel::importer::import_postman;
use pummel::models::config::{HTTPRequestDefinition, HttpMethod};

#[tokio::test]
async fn test_postman_import_full_workflow() {
    let postman_json = r#"{
        "info": {
            "_postman_id": "c1f7b03a-67b1-4d32-bc56-027588389476",
            "name": "Order Management Service",
            "description": "API suite for testing order flows",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        "item": [
            {
                "name": "Auth",
                "item": [
                    {
                        "name": "User Login",
                        "request": {
                            "method": "POST",
                            "header": [
                                { "key": "Content-Type", "value": "application/json" },
                                { "key": "X-Client-Id", "value": "test-client" }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": "{\"email\": \"{{userEmail}}\", \"password\": \"{{userSecret}}\"}"
                            },
                            "url": {
                                "raw": "https://{{apiHost}}/v1/auth/login",
                                "protocol": "https",
                                "host": ["{{apiHost}}"],
                                "path": ["v1", "auth", "login"]
                            }
                        },
                        "event": [
                            {
                                "listen": "test",
                                "script": {
                                    "type": "text/javascript",
                                    "exec": [
                                        "pm.test(\"Status code is 200\", function () {",
                                        "    pm.response.to.have.status(200);",
                                        "});",
                                        "pm.test(\"Has token\", function () {",
                                        "    pm.expect(pm.response.text()).to.include(\"access_token\");",
                                        "});"
                                    ]
                                }
                            }
                        ]
                    }
                ]
            },
            {
                "name": "Orders",
                "item": [
                    {
                        "name": "List Orders",
                        "request": {
                            "method": "GET",
                            "header": [
                                { "key": "Authorization", "value": "Bearer {{jwtToken}}" }
                            ],
                            "url": {
                                "raw": "https://{{apiHost}}/v1/orders?limit=20&status=active",
                                "protocol": "https",
                                "host": ["{{apiHost}}"],
                                "path": ["v1", "orders"],
                                "query": [
                                    { "key": "limit", "value": "20" },
                                    { "key": "status", "value": "active" }
                                ]
                            }
                        },
                        "event": [
                            {
                                "listen": "test",
                                "script": {
                                    "exec": [
                                        "responseCode.code === 200"
                                    ]
                                }
                            }
                        ]
                    },
                    {
                        "name": "Delete Order",
                        "request": {
                            "method": "DELETE",
                            "header": [
                                { "key": "Authorization", "value": "Bearer {{jwtToken}}" }
                            ],
                            "url": "https://{{apiHost}}/v1/orders/{{orderId}}"
                        }
                    }
                ]
            }
        ]
    }"#;

    let config = import_postman(postman_json).expect("Successful postman import");

    // Verify scenario naming and structure
    assert_eq!(config.scenarios.len(), 1);
    let scenario = config
        .scenarios
        .get("order_management_service")
        .expect("Scenario exists");
    assert_eq!(scenario.requests.len(), 3);

    // Verify Login Request
    if let HTTPRequestDefinition::Detailed(ref req) = scenario.requests[0] {
        assert_eq!(req.label.as_deref(), Some("Auth / User Login"));
        assert_eq!(req.method, Some(HttpMethod::Post));
        assert_eq!(req.url, "https://${apiHost}/v1/auth/login");
        assert_eq!(
            req.body.as_deref(),
            Some("{\"email\": \"${userEmail}\", \"password\": \"${userSecret}\"}")
        );

        let headers = req.headers.as_ref().expect("headers present");
        assert_eq!(
            headers.get("Content-Type"),
            Some(&"application/json".to_string())
        );
        assert_eq!(headers.get("X-Client-Id"), Some(&"test-client".to_string()));

        // Assertions extracted from Postman tests
        assert_eq!(req.assert.len(), 2);
        assert_eq!(req.assert[0].subject, "status");
        assert_eq!(req.assert[0].contains, vec!["200"]);
        assert_eq!(req.assert[1].subject, "body");
        assert_eq!(req.assert[1].contains, vec!["access_token"]);
    } else {
        panic!("Expected DetailedRequest for login");
    }

    // Verify List Orders Request
    if let HTTPRequestDefinition::Detailed(ref req) = scenario.requests[1] {
        assert_eq!(req.label.as_deref(), Some("Orders / List Orders"));
        assert_eq!(req.method, Some(HttpMethod::Get));
        assert_eq!(
            req.url,
            "https://${apiHost}/v1/orders?limit=20&status=active"
        );
        let headers = req.headers.as_ref().expect("headers present");
        assert_eq!(
            headers.get("Authorization"),
            Some(&"Bearer ${jwtToken}".to_string())
        );
        assert_eq!(req.assert.len(), 1);
        assert_eq!(req.assert[0].subject, "status");
        assert_eq!(req.assert[0].contains, vec!["200"]);
    } else {
        panic!("Expected DetailedRequest for list orders");
    }

    // Verify Delete Order Request
    if let HTTPRequestDefinition::Detailed(ref req) = scenario.requests[2] {
        assert_eq!(req.label.as_deref(), Some("Orders / Delete Order"));
        assert_eq!(req.method, Some(HttpMethod::Delete));
        assert_eq!(req.url, "https://${apiHost}/v1/orders/${orderId}");
    } else {
        panic!("Expected DetailedRequest for delete order");
    }

    // Verify Execution Plan generated correctly
    assert_eq!(config.execution.len(), 1);
    assert_eq!(config.execution[0].concurrency, 1);
    assert_eq!(config.execution[0].scenario, "order_management_service");

    // Verify valid serialization to YAML
    let yaml = serde_yaml::to_string(&config).expect("Serializes to YAML");
    assert!(yaml.contains("order_management_service"));
    assert!(yaml.contains("https://${apiHost}/v1/auth/login"));

    // Verify Pummel validation passes
    let summary = validate_config(&config).await;
    assert!(summary.is_valid(), "Validation should succeed");
}
