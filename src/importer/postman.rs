use crate::engine::PummelError;
use crate::models::config::{
    AssertionDefinition, Configuration, DetailedRequest, ExecutionPlan, HTTPRequestDefinition,
    HttpMethod, Protocol, ScenarioDefinition,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Deserialization model for Postman Collection v2.0 and v2.1.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostmanCollection {
    pub info: PostmanInfo,
    #[serde(default)]
    pub item: Vec<PostmanItem>,
    #[serde(default)]
    pub variable: Option<Vec<PostmanVariable>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostmanInfo {
    #[serde(rename = "_postman_id")]
    pub postman_id: Option<String>,
    pub name: String,
    pub schema: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanItem {
    pub name: Option<String>,
    pub description: Option<String>,
    pub request: Option<PostmanRequest>,
    #[serde(default)]
    pub item: Option<Vec<PostmanItem>>,
    #[serde(default)]
    pub event: Option<Vec<PostmanEvent>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanRequest {
    pub method: Option<String>,
    pub header: Option<PostmanHeaderList>,
    pub body: Option<PostmanBody>,
    pub url: Option<PostmanUrl>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum PostmanUrl {
    String(String),
    Object(PostmanUrlObject),
}

impl PostmanUrl {
    #[must_use]
    pub fn to_url_string(&self) -> String {
        match self {
            PostmanUrl::String(s) => s.clone(),
            PostmanUrl::Object(obj) => {
                if let Some(ref raw) = obj.raw
                    && !raw.trim().is_empty()
                {
                    return raw.clone();
                }

                let mut out = String::new();
                if let Some(ref proto) = obj.protocol {
                    out.push_str(proto);
                    out.push_str("://");
                }

                if let Some(ref host) = obj.host {
                    match host {
                        PostmanHost::List(parts) => out.push_str(&parts.join(".")),
                        PostmanHost::Single(s) => out.push_str(s),
                    }
                }

                if let Some(ref path) = obj.path {
                    match path {
                        PostmanPath::List(parts) => {
                            if !parts.is_empty() {
                                out.push('/');
                                out.push_str(&parts.join("/"));
                            }
                        }
                        PostmanPath::Single(s) => {
                            if !s.starts_with('/') {
                                out.push('/');
                            }
                            out.push_str(s);
                        }
                    }
                }

                if let Some(ref query) = obj.query {
                    let active_queries: Vec<String> = query
                        .iter()
                        .filter(|q| q.disabled != Some(true))
                        .map(|q| {
                            if let Some(ref val) = q.value {
                                format!("{}={}", q.key, val)
                            } else {
                                q.key.clone()
                            }
                        })
                        .collect();

                    if !active_queries.is_empty() {
                        out.push('?');
                        out.push_str(&active_queries.join("&"));
                    }
                }

                out
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanUrlObject {
    pub raw: Option<String>,
    pub protocol: Option<String>,
    pub host: Option<PostmanHost>,
    pub path: Option<PostmanPath>,
    pub query: Option<Vec<PostmanQueryParam>>,
    pub variable: Option<Vec<PostmanVariable>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum PostmanHost {
    List(Vec<String>),
    Single(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum PostmanPath {
    List(Vec<String>),
    Single(String),
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanQueryParam {
    pub key: String,
    pub value: Option<String>,
    #[serde(default)]
    pub disabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum PostmanHeaderList {
    List(Vec<PostmanHeader>),
    Single(String),
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanHeader {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub disabled: Option<bool>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanBody {
    pub mode: Option<String>,
    pub raw: Option<String>,
    pub urlencoded: Option<Vec<PostmanKeyValue>>,
    pub formdata: Option<Vec<PostmanKeyValue>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanKeyValue {
    pub key: String,
    pub value: Option<String>,
    #[serde(default)]
    pub disabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanVariable {
    pub key: String,
    pub value: Option<serde_json::Value>,
    #[serde(rename = "type")]
    pub var_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanEvent {
    pub listen: String,
    pub script: Option<PostmanScript>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PostmanScript {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub script_type: Option<String>,
    pub exec: Option<PostmanScriptExec>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum PostmanScriptExec {
    Lines(Vec<String>),
    Single(String),
}

impl PostmanScriptExec {
    #[must_use]
    pub fn to_script_string(&self) -> String {
        match self {
            PostmanScriptExec::Lines(lines) => lines.join("\n"),
            PostmanScriptExec::Single(s) => s.clone(),
        }
    }
}

/// Convert Postman variable syntax `{{var_name}}` to Pummel syntax `${var_name}`.
#[must_use]
pub fn convert_postman_variables(input: &str) -> String {
    let re = Regex::new(r"\{\{([a-zA-Z0-9_\-\.]+)\}\}").expect("valid regex");
    re.replace_all(input, |caps: &regex::Captures| format!("${{{}}}", &caps[1]))
        .to_string()
}

/// Parse Postman test script for status and body assertions.
fn extract_assertions(events: &[PostmanEvent]) -> Vec<AssertionDefinition> {
    let mut assertions = Vec::new();
    let status_re = Regex::new(
        r"(?:pm\.response\.to\.have\.status|responseCode\.code\s*===?|pm\.response\.code\s*===?)\s*\(?(\d{3})\)?",
    )
    .expect("valid regex");

    let body_include_re = Regex::new(
        r#"(?:pm\.expect\(pm\.response\.text\(\)\)\.to\.include|responseBody\.has)\s*\(\s*["']([^"']+)["']\s*\)"#,
    )
    .expect("valid regex");

    for ev in events {
        if ev.listen == "test"
            && let Some(ref script) = ev.script
            && let Some(ref exec) = script.exec
        {
            let script_text = exec.to_script_string();

            for cap in status_re.captures_iter(&script_text) {
                if let Some(code) = cap.get(1) {
                    assertions.push(AssertionDefinition {
                        subject: "status".to_string(),
                        contains: vec![code.as_str().to_string()],
                        regexp: false,
                        not: false,
                    });
                }
            }

            for cap in body_include_re.captures_iter(&script_text) {
                if let Some(target) = cap.get(1) {
                    assertions.push(AssertionDefinition {
                        subject: "body".to_string(),
                        contains: vec![target.as_str().to_string()],
                        regexp: false,
                        not: false,
                    });
                }
            }
        }
    }

    assertions
}

/// Parse HTTP method string into Pummel `HttpMethod`.
fn parse_http_method(method_str: Option<&str>) -> Option<HttpMethod> {
    match method_str.map(str::to_ascii_uppercase).as_deref() {
        Some("GET") => Some(HttpMethod::Get),
        Some("POST") => Some(HttpMethod::Post),
        Some("PUT") => Some(HttpMethod::Put),
        Some("DELETE") => Some(HttpMethod::Delete),
        Some("PATCH") => Some(HttpMethod::Patch),
        Some("HEAD") => Some(HttpMethod::Head),
        _ => Some(HttpMethod::Get),
    }
}

/// Recursively collect all requests from Postman items.
fn collect_items(
    items: &[PostmanItem],
    parent_folder: Option<&str>,
    out: &mut Vec<HTTPRequestDefinition>,
) {
    for item in items {
        let current_name = item.name.as_deref().unwrap_or("Request");
        let display_label = match parent_folder {
            Some(folder) => format!("{folder} / {current_name}"),
            None => current_name.to_string(),
        };

        if let Some(ref req) = item.request {
            let raw_url = req
                .url
                .as_ref()
                .map(PostmanUrl::to_url_string)
                .unwrap_or_default();
            let converted_url = convert_postman_variables(&raw_url);

            let method = parse_http_method(req.method.as_deref());

            let mut headers_map = HashMap::new();
            if let Some(ref h_list) = req.header {
                match h_list {
                    PostmanHeaderList::List(headers) => {
                        for h in headers {
                            if h.disabled != Some(true) {
                                let key = convert_postman_variables(&h.key);
                                let val = convert_postman_variables(&h.value);
                                headers_map.insert(key, val);
                            }
                        }
                    }
                    PostmanHeaderList::Single(h_str) => {
                        for line in h_str.lines() {
                            if let Some((k, v)) = line.split_once(':') {
                                headers_map.insert(
                                    convert_postman_variables(k.trim()),
                                    convert_postman_variables(v.trim()),
                                );
                            }
                        }
                    }
                }
            }

            let body = req.body.as_ref().and_then(|b| {
                if let Some(ref raw) = b.raw {
                    Some(convert_postman_variables(raw))
                } else if let Some(ref urlencoded) = b.urlencoded {
                    let pairs: Vec<String> = urlencoded
                        .iter()
                        .filter(|kv| kv.disabled != Some(true))
                        .map(|kv| {
                            let k = convert_postman_variables(&kv.key);
                            let v = kv
                                .value
                                .as_deref()
                                .map(convert_postman_variables)
                                .unwrap_or_default();
                            format!("{k}={v}")
                        })
                        .collect();
                    Some(pairs.join("&"))
                } else {
                    None
                }
            });

            let assertions = item
                .event
                .as_ref()
                .map(|events| extract_assertions(events))
                .unwrap_or_default();

            let detailed = DetailedRequest {
                url: converted_url,
                method,
                headers: if headers_map.is_empty() {
                    None
                } else {
                    Some(headers_map)
                },
                body,
                label: Some(display_label.clone()),
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

            out.push(HTTPRequestDefinition::Detailed(Box::new(detailed)));
        }

        // Recurse into subfolders if present
        if let Some(ref sub_items) = item.item {
            collect_items(sub_items, Some(&display_label), out);
        }
    }
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
        slug = "default".to_string();
    }
    slug
}

/// Parse a Postman Collection v2.0 or v2.1 JSON string into a Pummel `Configuration`.
///
/// # Errors
///
/// Returns `PummelError::Serde` if JSON parsing fails, or `PummelError::Validation` if no requests were found.
pub fn import_postman(content: &str) -> Result<Configuration, PummelError> {
    let collection: PostmanCollection =
        serde_json::from_str(content).map_err(|e| PummelError::Serde {
            message: format!("Failed to parse Postman collection JSON: {e}"),
            file_path: None,
            source: Some(Box::new(e)),
        })?;

    let mut requests = Vec::new();
    collect_items(&collection.item, None, &mut requests);

    if requests.is_empty() {
        return Err(PummelError::Validation {
            field: "item".to_string(),
            reason: format!(
                "Postman collection '{}' contains no HTTP requests",
                collection.info.name
            ),
        });
    }

    let scenario_name = slugify(&collection.info.name);

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
    fn test_convert_postman_variables() {
        let input = "https://{{baseUrl}}/api/v1/users/{{userId}}";
        let output = convert_postman_variables(input);
        assert_eq!(output, "https://${baseUrl}/api/v1/users/${userId}");
    }

    #[test]
    fn test_import_postman_simple_collection() {
        let json = r#"{
            "info": {
                "name": "User Service Tests",
                "_postman_id": "test-id-123",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": [
                {
                    "name": "Get Users",
                    "request": {
                        "method": "GET",
                        "header": [
                            { "key": "Accept", "value": "application/json" }
                        ],
                        "url": {
                            "raw": "https://{{host}}/api/users?page=1",
                            "protocol": "https",
                            "host": ["{{host}}"],
                            "path": ["api", "users"],
                            "query": [{ "key": "page", "value": "1" }]
                        }
                    },
                    "event": [
                        {
                            "listen": "test",
                            "script": {
                                "type": "text/javascript",
                                "exec": [
                                    "pm.test(\"Status is 200\", function() {",
                                    "    pm.response.to.have.status(200);",
                                    "});"
                                ]
                            }
                        }
                    ]
                }
            ]
        }"#;

        let config = import_postman(json).expect("import postman collection");
        assert_eq!(config.scenarios.len(), 1);
        let scenario = config.scenarios.get("user_service_tests").unwrap();
        assert_eq!(scenario.requests.len(), 1);

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[0] {
            assert_eq!(d.url, "https://${host}/api/users?page=1");
            assert_eq!(d.method, Some(HttpMethod::Get));
            assert_eq!(d.label.as_deref(), Some("Get Users"));
            assert_eq!(d.assert.len(), 1);
            assert_eq!(d.assert[0].subject, "status");
            assert_eq!(d.assert[0].contains, vec!["200"]);
        } else {
            panic!("Expected DetailedRequest");
        }
    }

    #[test]
    fn test_import_postman_nested_folders_and_body() {
        let json = r#"{
            "info": {
                "name": "Auth API",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": [
                {
                    "name": "Authentication",
                    "item": [
                        {
                            "name": "Login",
                            "request": {
                                "method": "POST",
                                "header": [
                                    { "key": "Content-Type", "value": "application/json" }
                                ],
                                "body": {
                                    "mode": "raw",
                                    "raw": "{\"username\": \"{{user}}\", \"password\": \"{{pass}}\"}"
                                },
                                "url": "https://api.example.com/login"
                            }
                        }
                    ]
                }
            ]
        }"#;

        let config = import_postman(json).expect("import postman nested");
        let scenario = config.scenarios.get("auth_api").unwrap();
        assert_eq!(scenario.requests.len(), 1);

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[0] {
            assert_eq!(d.url, "https://api.example.com/login");
            assert_eq!(d.method, Some(HttpMethod::Post));
            assert_eq!(d.label.as_deref(), Some("Authentication / Login"));
            assert_eq!(
                d.body.as_deref(),
                Some("{\"username\": \"${user}\", \"password\": \"${pass}\"}")
            );
        } else {
            panic!("Expected DetailedRequest");
        }
    }

    #[test]
    fn test_import_postman_invalid_json() {
        let err = import_postman("not valid json").unwrap_err();
        match err {
            PummelError::Serde { .. } => {}
            _ => panic!("Expected Serde error, got {err:?}"),
        }
    }

    #[test]
    fn test_import_postman_empty_collection() {
        let json = r#"{
            "info": {
                "name": "Empty Collection",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": []
        }"#;
        let err = import_postman(json).unwrap_err();
        match err {
            PummelError::Validation { field, .. } => assert_eq!(field, "item"),
            _ => panic!("Expected Validation error, got {err:?}"),
        }
    }

    #[test]
    fn test_import_postman_structured_url_and_single_header_string() {
        let json = r#"{
            "info": {
                "name": "Structured URL Collection",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": [
                {
                    "name": "Search Items",
                    "request": {
                        "method": "POST",
                        "header": "X-Custom: HeaderVal\nAuthorization: Bearer {{token}}",
                        "body": {
                            "mode": "urlencoded",
                            "urlencoded": [
                                { "key": "query", "value": "{{search_term}}" },
                                { "key": "disabled_field", "value": "ignore", "disabled": true }
                            ]
                        },
                        "url": {
                            "protocol": "https",
                            "host": ["api", "example", "com"],
                            "path": ["v1", "search"],
                            "query": [
                                { "key": "limit", "value": "10" },
                                { "key": "inactive", "value": "true", "disabled": true }
                            ]
                        }
                    }
                }
            ]
        }"#;

        let config = import_postman(json).expect("import structured postman");
        let scenario = config.scenarios.get("structured_url_collection").unwrap();
        assert_eq!(scenario.requests.len(), 1);

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[0] {
            assert_eq!(d.url, "https://api.example.com/v1/search?limit=10");
            assert_eq!(d.method, Some(HttpMethod::Post));
            assert_eq!(d.body.as_deref(), Some("query=${search_term}"));
            let headers = d.headers.as_ref().unwrap();
            assert_eq!(headers.get("X-Custom").unwrap(), "HeaderVal");
            assert_eq!(headers.get("Authorization").unwrap(), "Bearer ${token}");
        } else {
            panic!("Expected DetailedRequest");
        }
    }

    #[test]
    fn test_import_postman_single_host_single_path_and_edge_cases() {
        let json = r#"{
            "info": {
                "name": "???",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": [
                {
                    "name": "Empty Folder",
                    "item": []
                },
                {
                    "name": "Single String Host Path",
                    "request": {
                        "method": "GET",
                        "body": {
                            "mode": "file"
                        },
                        "url": {
                            "protocol": "http",
                            "host": "localhost",
                            "path": "testpath",
                            "query": [
                                { "key": "flag_param" }
                            ]
                        }
                    }
                }
            ]
        }"#;

        let config = import_postman(json).expect("import single host postman");
        // Title "???" falls back to default
        let scenario = config.scenarios.get("default").unwrap();
        assert_eq!(scenario.requests.len(), 1);

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[0] {
            assert_eq!(d.url, "http://localhost/testpath?flag_param");
            assert!(d.body.is_none());
        } else {
            panic!("Expected DetailedRequest");
        }
    }
}
