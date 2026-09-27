use pummel::engine::validation::validate_config;
use pummel::importer::import_openapi;
use pummel::models::config::{HTTPRequestDefinition, HttpMethod};

#[tokio::test]
async fn test_openapi_import_yaml_and_json() {
    let openapi_yaml = r#"
openapi: 3.1.0
info:
  title: "Inventory Service"
  version: "2.4.0"
  description: "Enterprise warehouse inventory management API"
servers:
  - url: "https://warehouse.example.com/api/v2"
    description: "Production Gateway"
paths:
  /items:
    get:
      summary: "Query inventory items"
      parameters:
        - name: "category"
          in: "query"
          example: "hardware"
        - name: "X-Request-Source"
          in: "header"
          example: "pummel-load-test"
      responses:
        "200":
          description: "Inventory list"
    post:
      summary: "Create new inventory item"
      requestBody:
        content:
          application/json:
            example:
              sku: "SKU-9901"
              quantity: 150
      responses:
        "201":
          description: "Item provisioned"
  /items/{itemId}/stock:
    put:
      summary: "Update stock levels"
      parameters:
        - name: "itemId"
          in: "path"
          required: true
      requestBody:
        content:
          application/json:
            example: '{"delta": 25}'
      responses:
        "200":
          description: "Stock updated"
  /items/{itemId}:
    delete:
      summary: "Decommission item"
      responses:
        "204":
          description: "Item removed"
"#;

    let config = import_openapi(openapi_yaml).expect("Import OpenAPI YAML");

    // 1. Verify scenario name slugification
    assert_eq!(config.scenarios.len(), 1);
    let scenario = config
        .scenarios
        .get("inventory_service")
        .expect("inventory_service scenario exists");
    assert_eq!(scenario.requests.len(), 4);

    // 2. Verify GET /items
    if let HTTPRequestDefinition::Detailed(ref req) = scenario.requests[0] {
        assert_eq!(
            req.url,
            "https://warehouse.example.com/api/v2/items?category=hardware"
        );
        assert_eq!(req.method, Some(HttpMethod::Get));
        assert_eq!(req.label.as_deref(), Some("Query inventory items"));

        let headers = req.headers.as_ref().expect("headers present");
        assert_eq!(
            headers.get("X-Request-Source"),
            Some(&"pummel-load-test".to_string())
        );

        assert_eq!(req.assert.len(), 1);
        assert_eq!(req.assert[0].subject, "status");
        assert_eq!(req.assert[0].contains, vec!["200"]);
    } else {
        panic!("Expected DetailedRequest for GET");
    }

    // 3. Verify POST /items
    if let HTTPRequestDefinition::Detailed(ref req) = scenario.requests[1] {
        assert_eq!(req.url, "https://warehouse.example.com/api/v2/items");
        assert_eq!(req.method, Some(HttpMethod::Post));
        assert_eq!(req.label.as_deref(), Some("Create new inventory item"));

        let body = req.body.as_deref().expect("body present");
        assert!(body.contains("SKU-9901"));
        assert!(body.contains("150"));

        let headers = req.headers.as_ref().expect("headers present");
        assert_eq!(
            headers.get("Content-Type"),
            Some(&"application/json".to_string())
        );

        assert_eq!(req.assert.len(), 1);
        assert_eq!(req.assert[0].contains, vec!["201"]);
    } else {
        panic!("Expected DetailedRequest for POST");
    }

    // 4. Verify DELETE /items/{itemId} (alphabetically before /items/{itemId}/stock)
    if let HTTPRequestDefinition::Detailed(ref req) = scenario.requests[2] {
        assert_eq!(
            req.url,
            "https://warehouse.example.com/api/v2/items/${itemId}"
        );
        assert_eq!(req.method, Some(HttpMethod::Delete));
        assert_eq!(req.label.as_deref(), Some("Decommission item"));
        assert_eq!(req.assert[0].contains, vec!["204"]);
    } else {
        panic!("Expected DetailedRequest for DELETE");
    }

    // 5. Verify PUT /items/{itemId}/stock -> converted to ${itemId}
    if let HTTPRequestDefinition::Detailed(ref req) = scenario.requests[3] {
        assert_eq!(
            req.url,
            "https://warehouse.example.com/api/v2/items/${itemId}/stock"
        );
        assert_eq!(req.method, Some(HttpMethod::Put));
        assert_eq!(req.label.as_deref(), Some("Update stock levels"));
        assert_eq!(req.body.as_deref(), Some("{\"delta\": 25}"));
        assert_eq!(req.assert[0].contains, vec!["200"]);
    } else {
        panic!("Expected DetailedRequest for PUT");
    }

    // 6. Verify Execution Plan
    assert_eq!(config.execution.len(), 1);
    assert_eq!(config.execution[0].concurrency, 1);
    assert_eq!(config.execution[0].scenario, "inventory_service");

    // 7. Verify Pummel configuration validation
    let summary = validate_config(&config).await;
    assert!(summary.is_valid(), "OpenAPI config validation passes");
}
