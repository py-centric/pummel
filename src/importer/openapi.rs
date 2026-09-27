use crate::engine::PummelError;
use crate::models::config::{
    AssertionDefinition, Configuration, DetailedRequest, ExecutionPlan, HTTPRequestDefinition,
    HttpMethod, Protocol, ScenarioDefinition,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// OpenAPI 3.0/3.1 root model.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenApiSpec {
    pub openapi: Option<String>,
    pub swagger: Option<String>,
    pub info: Option<OpenApiInfo>,
    pub servers: Option<Vec<OpenApiServer>>,
    #[serde(default)]
    pub paths: HashMap<String, OpenApiPathItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct OpenApiInfo {
    pub title: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct OpenApiServer {
    pub url: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct OpenApiPathItem {
    pub get: Option<OpenApiOperation>,
    pub post: Option<OpenApiOperation>,
    pub put: Option<OpenApiOperation>,
    pub delete: Option<OpenApiOperation>,
    pub patch: Option<OpenApiOperation>,
    pub head: Option<OpenApiOperation>,
    #[serde(default)]
    pub parameters: Vec<OpenApiParameter>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct OpenApiOperation {
    pub summary: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "operationId")]
    pub operation_id: Option<String>,
    #[serde(default)]
    pub parameters: Vec<OpenApiParameter>,
    #[serde(rename = "requestBody")]
    pub request_body: Option<OpenApiRequestBody>,
    #[serde(default)]
    pub responses: HashMap<String, OpenApiResponse>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct OpenApiParameter {
    pub name: String,
    #[serde(rename = "in")]
    pub in_location: String,
    #[serde(default)]
    pub required: bool,
    pub description: Option<String>,
    pub example: Option<serde_json::Value>,
    pub schema: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct OpenApiRequestBody {
    pub description: Option<String>,
    #[serde(default)]
    pub required: bool,
    pub content: Option<HashMap<String, OpenApiMediaType>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct OpenApiMediaType {
    pub example: Option<serde_json::Value>,
    pub schema: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct OpenApiResponse {
    pub description: Option<String>,
}

/// Convert OpenAPI path variable `{param}` to Pummel syntax `${param}`.
#[must_use]
pub fn convert_openapi_path_variables(path: &str) -> String {
    let re = Regex::new(r"\{([a-zA-Z0-9_\-\.]+)\}").expect("valid regex");
    re.replace_all(path, |caps: &regex::Captures| format!("${{{}}}", &caps[1]))
        .to_string()
}

/// Convert a string into a clean scenario identifier.
fn slugify(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();

    let mut slug = clean
        .split('_')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("_");

    if slug.is_empty() {
        slug = "openapi_scenario".to_string();
    }
    slug
}

/// Build `DetailedRequest` from an OpenAPI operation.
fn build_operation_request(
    base_url: &str,
    path: &str,
    method: HttpMethod,
    op: &OpenApiOperation,
    path_parameters: &[OpenApiParameter],
) -> HTTPRequestDefinition {
    let converted_path = convert_openapi_path_variables(path);
    let mut url = if base_url.ends_with('/') && converted_path.starts_with('/') {
        format!("{}{}", base_url, &converted_path[1..])
    } else if !base_url.ends_with('/') && !converted_path.starts_with('/') {
        format!("{base_url}/{converted_path}")
    } else {
        format!("{base_url}{converted_path}")
    };

    // Collect query and header parameters
    let mut query_params = Vec::new();
    let mut headers = HashMap::new();

    let all_params = path_parameters.iter().chain(op.parameters.iter());

    for param in all_params {
        match param.in_location.as_str() {
            "query" => {
                let val_str = if let Some(ref ex) = param.example {
                    if let Some(s) = ex.as_str() {
                        s.to_string()
                    } else {
                        ex.to_string()
                    }
                } else {
                    format!("${{{}}}", param.name)
                };
                query_params.push(format!("{}={val_str}", param.name));
            }
            "header" => {
                let val_str = if let Some(ref ex) = param.example {
                    if let Some(s) = ex.as_str() {
                        s.to_string()
                    } else {
                        ex.to_string()
                    }
                } else {
                    format!("${{{}}}", param.name)
                };
                headers.insert(param.name.clone(), val_str);
            }
            _ => {}
        }
    }

    if !query_params.is_empty() {
        if url.contains('?') {
            url.push('&');
        } else {
            url.push('?');
        }
        url.push_str(&query_params.join("&"));
    }

    // Process request body
    let mut body = None;
    if let Some(ref req_body) = op.request_body
        && let Some(ref content) = req_body.content
    {
        if let Some(media) = content.get("application/json") {
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            if let Some(ref ex) = media.example {
                if let Some(s) = ex.as_str() {
                    body = Some(s.to_string());
                } else {
                    body = serde_json::to_string(ex).ok();
                }
            } else if let Some(ref schema) = media.schema
                && let Some(schema_ex) = schema.get("example")
            {
                if let Some(s) = schema_ex.as_str() {
                    body = Some(s.to_string());
                } else {
                    body = serde_json::to_string(schema_ex).ok();
                }
            }
        } else if let Some(first_entry) = content.iter().next() {
            headers.insert("Content-Type".to_string(), first_entry.0.clone());
            if let Some(ref ex) = first_entry.1.example {
                body = ex.as_str().map(ToString::to_string);
            }
        }
    }

    // Process responses into status assertions
    let mut assertions = Vec::new();
    let mut success_codes: Vec<String> = op
        .responses
        .keys()
        .filter(|k| k.starts_with('2') && k.len() == 3)
        .cloned()
        .collect();
    success_codes.sort();

    if let Some(primary_code) = success_codes.first() {
        assertions.push(AssertionDefinition {
            subject: "status".to_string(),
            contains: vec![primary_code.clone()],
            regexp: false,
            not: false,
        });
    }

    let label = op
        .summary
        .clone()
        .or_else(|| op.operation_id.clone())
        .unwrap_or_else(|| format!("{:?} {path}", method));

    let detailed = DetailedRequest {
        url,
        method: Some(method),
        headers: if headers.is_empty() {
            None
        } else {
            Some(headers)
        },
        body,
        label: Some(label),
        body_file: None,
        timeout: None,
        on_start: false,
        think_time: None,
        extract_jsonpath: None,
        extract_regexp: None,
        extract_xpath: None,
        assert: assertions,
        protocol: Some(Protocol::Http),
        message: None,
        method_name: None,
        grpc_mode: None,
        messages: Vec::new(),
        execute_if: None,
        loop_while: None,
    };

    HTTPRequestDefinition::Detailed(Box::new(detailed))
}

/// Import an OpenAPI 3.0 or 3.1 specification (YAML or JSON) into a Pummel `Configuration`.
///
/// # Errors
///
/// Returns `PummelError::Serde` if parsing fails, or `PummelError::Validation` if no operations found.
pub fn import_openapi(content: &str) -> Result<Configuration, PummelError> {
    let spec: OpenApiSpec = serde_yaml::from_str(content).map_err(|e| PummelError::Serde {
        message: format!("Failed to parse OpenAPI specification: {e}"),
        file_path: None,
        source: None,
    })?;

    if spec.openapi.is_none() && spec.swagger.is_none() {
        return Err(PummelError::Validation {
            field: "openapi".to_string(),
            reason: "Specification must declare 'openapi' (e.g. 3.0.0) or 'swagger'".to_string(),
        });
    }

    let base_url = spec
        .servers
        .as_ref()
        .and_then(|s| s.first())
        .map(|s| convert_openapi_path_variables(&s.url))
        .unwrap_or_else(|| "${host}".to_string());

    let mut requests = Vec::new();

    // Sort path keys for deterministic generation
    let mut sorted_paths: Vec<_> = spec.paths.iter().collect();
    sorted_paths.sort_by_key(|(p, _)| *p);

    for (path, item) in sorted_paths {
        if let Some(ref get_op) = item.get {
            requests.push(build_operation_request(
                &base_url,
                path,
                HttpMethod::Get,
                get_op,
                &item.parameters,
            ));
        }
        if let Some(ref post_op) = item.post {
            requests.push(build_operation_request(
                &base_url,
                path,
                HttpMethod::Post,
                post_op,
                &item.parameters,
            ));
        }
        if let Some(ref put_op) = item.put {
            requests.push(build_operation_request(
                &base_url,
                path,
                HttpMethod::Put,
                put_op,
                &item.parameters,
            ));
        }
        if let Some(ref delete_op) = item.delete {
            requests.push(build_operation_request(
                &base_url,
                path,
                HttpMethod::Delete,
                delete_op,
                &item.parameters,
            ));
        }
        if let Some(ref patch_op) = item.patch {
            requests.push(build_operation_request(
                &base_url,
                path,
                HttpMethod::Patch,
                patch_op,
                &item.parameters,
            ));
        }
        if let Some(ref head_op) = item.head {
            requests.push(build_operation_request(
                &base_url,
                path,
                HttpMethod::Head,
                head_op,
                &item.parameters,
            ));
        }
    }

    if requests.is_empty() {
        return Err(PummelError::Validation {
            field: "paths".to_string(),
            reason: "OpenAPI specification contains no HTTP operations".to_string(),
        });
    }

    let scenario_name = spec
        .info
        .as_ref()
        .and_then(|i| i.title.as_deref())
        .map(slugify)
        .unwrap_or_else(|| "openapi_scenario".to_string());

    let scenario = ScenarioDefinition {
        requests,
        weight: 1,
        think_time: None,
        data_sources: None,
        headers: None,
    };

    let mut scenarios = HashMap::new();
    scenarios.insert(scenario_name.clone(), scenario);

    let execution = vec![ExecutionPlan {
        concurrency: 1,
        ramp_up: "1s".to_string(),
        hold_for: "10s".to_string(),
        scenario: scenario_name,
        throughput: None,
        steps: None,
        pacing: None,
    }];

    Ok(Configuration {
        execution,
        scenarios,
        reporting: Vec::new(),
        services: Vec::new(),
        api: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_openapi_path_variables() {
        let path = "/users/{userId}/posts/{postId}";
        assert_eq!(
            convert_openapi_path_variables(path),
            "/users/${userId}/posts/${postId}"
        );
    }

    #[test]
    fn test_import_openapi_yaml() {
        let yaml = r#"
openapi: "3.0.3"
info:
  title: "Petstore Service"
  version: "1.0.0"
servers:
  - url: "https://api.petstore.com/v1"
paths:
  /pets:
    get:
      summary: "List Pets"
      parameters:
        - name: "limit"
          in: "query"
          example: 25
      responses:
        "200":
          description: "Success"
    post:
      summary: "Create Pet"
      requestBody:
        content:
          application/json:
            example: '{"name": "Dog"}'
      responses:
        "201":
          description: "Created"
  /pets/{petId}:
    delete:
      summary: "Delete Pet"
      responses:
        "204":
          description: "Deleted"
"#;

        let config = import_openapi(yaml).expect("import openapi");
        assert_eq!(config.scenarios.len(), 1);
        let scenario = config.scenarios.get("petstore_service").unwrap();
        assert_eq!(scenario.requests.len(), 3);

        // Verify GET /pets
        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[0] {
            assert_eq!(d.url, "https://api.petstore.com/v1/pets?limit=25");
            assert_eq!(d.method, Some(HttpMethod::Get));
            assert_eq!(d.label.as_deref(), Some("List Pets"));
            assert_eq!(d.assert.len(), 1);
            assert_eq!(d.assert[0].contains, vec!["200"]);
        } else {
            panic!("Expected DetailedRequest");
        }

        // Verify POST /pets
        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[1] {
            assert_eq!(d.url, "https://api.petstore.com/v1/pets");
            assert_eq!(d.method, Some(HttpMethod::Post));
            assert_eq!(d.body.as_deref(), Some("{\"name\": \"Dog\"}"));
            assert_eq!(d.assert.len(), 1);
            assert_eq!(d.assert[0].contains, vec!["201"]);
        } else {
            panic!("Expected DetailedRequest");
        }

        // Verify DELETE /pets/{petId}
        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[2] {
            assert_eq!(d.url, "https://api.petstore.com/v1/pets/${petId}");
            assert_eq!(d.method, Some(HttpMethod::Delete));
            assert_eq!(d.assert.len(), 1);
            assert_eq!(d.assert[0].contains, vec!["204"]);
        } else {
            panic!("Expected DetailedRequest");
        }
    }

    #[test]
    fn test_import_openapi_missing_version_error() {
        let yaml = r#"
info:
  title: "No Version Spec"
paths:
  /test:
    get:
      responses:
        "200":
          description: "OK"
"#;
        let err = import_openapi(yaml).unwrap_err();
        match err {
            PummelError::Validation { field, .. } => assert_eq!(field, "openapi"),
            _ => panic!("Expected Validation error, got {err:?}"),
        }
    }

    #[test]
    fn test_import_openapi_no_operations_error() {
        let yaml = r#"
openapi: "3.0.0"
info:
  title: "Empty Spec"
paths: {}
"#;
        let err = import_openapi(yaml).unwrap_err();
        match err {
            PummelError::Validation { field, .. } => assert_eq!(field, "paths"),
            _ => panic!("Expected Validation error, got {err:?}"),
        }
    }

    #[test]
    fn test_import_openapi_patch_head_and_headers() {
        let yaml = r#"
openapi: "3.0.1"
paths:
  /items:
    patch:
      parameters:
        - name: "X-Trace-Id"
          in: "header"
          example: "trace-123"
        - name: "X-Empty-Header"
          in: "header"
      requestBody:
        content:
          text/plain:
            example: "sample text"
      responses:
        "200":
          description: "Updated"
    head:
      responses:
        "200":
          description: "Headers"
"#;
        let config = import_openapi(yaml).expect("import openapi");
        let scenario = config.scenarios.get("openapi_scenario").unwrap();
        assert_eq!(scenario.requests.len(), 2);

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[0] {
            assert_eq!(d.method, Some(HttpMethod::Patch));
            assert_eq!(d.body.as_deref(), Some("sample text"));
            let headers = d.headers.as_ref().unwrap();
            assert_eq!(headers.get("X-Trace-Id").unwrap(), "trace-123");
            assert_eq!(headers.get("X-Empty-Header").unwrap(), "${X-Empty-Header}");
        } else {
            panic!("Expected DetailedRequest");
        }

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[1] {
            assert_eq!(d.method, Some(HttpMethod::Head));
        } else {
            panic!("Expected DetailedRequest");
        }
    }

    #[test]
    fn test_import_openapi_edge_cases_and_schema_examples() {
        // Invalid YAML returns Serde error
        let err = import_openapi("invalid: [yaml: broken").unwrap_err();
        assert!(matches!(err, PummelError::Serde { .. }));

        // Schema example, url slash concatenation, query appending, empty title slug fallback
        let yaml = r#"
openapi: "3.0.0"
info:
  title: "???"
servers:
  - url: "https://api.example.com/"
paths:
  /search?existing=1:
    post:
      parameters:
        - name: "q"
          in: "query"
      requestBody:
        content:
          application/json:
            schema:
              example:
                key: "value"
      responses:
        "200":
          description: "ok"
"#;
        let config = import_openapi(yaml).expect("import openapi with schema example");
        // Title "???" falls back to openapi_scenario
        let scenario = config.scenarios.get("openapi_scenario").unwrap();
        assert_eq!(scenario.requests.len(), 1);

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[0] {
            // Base URL ending with / and path starting with /
            assert!(
                d.url
                    .starts_with("https://api.example.com/search?existing=1&q=${q}")
            );
            assert_eq!(d.body.as_deref(), Some("{\"key\":\"value\"}"));
        } else {
            panic!("Expected DetailedRequest");
        }
    }
}
