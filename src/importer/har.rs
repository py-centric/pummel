use crate::engine::PummelError;
use crate::models::config::{
    AssertionDefinition, Configuration, DetailedRequest, ExecutionPlan, HTTPRequestDefinition,
    HttpMethod, Protocol, ScenarioDefinition,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Options for importing HTTP Archive (HAR) files.
#[derive(Debug, Clone)]
pub struct HarImportOptions {
    /// If true, filters out static assets (images, fonts, stylesheets, scripts, media).
    pub filter_static_assets: bool,
    /// If true, extracts response HTTP status codes into assertions.
    pub include_status_assertions: bool,
    /// Custom scenario name to assign (defaults to "har_scenario").
    pub scenario_name: Option<String>,
}

impl Default for HarImportOptions {
    fn default() -> Self {
        Self {
            filter_static_assets: true,
            include_status_assertions: true,
            scenario_name: None,
        }
    }
}

/// Root HAR model.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarFile {
    pub log: HarLog,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarLog {
    pub version: Option<String>,
    pub creator: Option<HarCreator>,
    pub pages: Option<Vec<HarPage>>,
    #[serde(default)]
    pub entries: Vec<HarEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarCreator {
    pub name: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarPage {
    pub id: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarEntry {
    #[serde(rename = "startedDateTime")]
    pub started_date_time: Option<String>,
    pub time: Option<f64>,
    pub request: HarRequest,
    pub response: Option<HarResponse>,
    pub timings: Option<HarTimings>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<HarHeader>,
    #[serde(rename = "postData")]
    pub post_data: Option<HarPostData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarHeader {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarPostData {
    #[serde(rename = "mimeType")]
    pub mime_type: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarResponse {
    pub status: u16,
    #[serde(rename = "statusText")]
    pub status_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HarTimings {
    pub wait: Option<f64>,
}

const STATIC_EXTENSIONS: &[&str] = &[
    "css", "js", "png", "jpg", "jpeg", "gif", "ico", "svg", "woff", "woff2", "ttf", "eot", "otf",
    "webp", "map", "avif", "mp4", "mp3", "webm",
];

const IGNORED_HEADERS: &[&str] = &[
    ":method",
    ":path",
    ":scheme",
    ":authority",
    "content-length",
    "host",
    "connection",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user",
];

/// Checks if a given URL is for a static web asset based on path extension.
fn is_static_asset(url_str: &str) -> bool {
    let clean_url = url_str.split('?').next().unwrap_or(url_str);
    let path = clean_url.split('#').next().unwrap_or(clean_url);

    if let Some(pos) = path.rfind('.') {
        let ext = &path[pos + 1..].to_ascii_lowercase();
        return STATIC_EXTENSIONS.contains(&ext.as_str());
    }
    false
}

/// Convert HTTP method string to Pummel `HttpMethod`.
fn parse_http_method(method: &str) -> Option<HttpMethod> {
    match method.to_ascii_uppercase().as_str() {
        "GET" => Some(HttpMethod::Get),
        "POST" => Some(HttpMethod::Post),
        "PUT" => Some(HttpMethod::Put),
        "DELETE" => Some(HttpMethod::Delete),
        "PATCH" => Some(HttpMethod::Patch),
        "HEAD" => Some(HttpMethod::Head),
        _ => Some(HttpMethod::Get),
    }
}

/// Generate a human-readable label from the URL path.
fn extract_label_from_url(method: &str, url: &str) -> String {
    if let Some(path_start) = url.find("://") {
        let after_scheme = &url[path_start + 3..];
        if let Some(slash_pos) = after_scheme.find('/') {
            let path_and_query = &after_scheme[slash_pos..];
            let path_only = path_and_query.split('?').next().unwrap_or(path_and_query);
            return format!("{method} {path_only}");
        }
    }
    format!("{method} {url}")
}

/// Import a HAR JSON string into a Pummel `Configuration` with default options.
///
/// # Errors
///
/// Returns `PummelError::Serde` on JSON parse errors, or `PummelError::Validation` if no requests match.
pub fn import_har(content: &str) -> Result<Configuration, PummelError> {
    import_har_with_options(content, &HarImportOptions::default())
}

/// Import a HAR JSON string into a Pummel `Configuration` with specific options.
///
/// # Errors
///
/// Returns `PummelError::Serde` on JSON parse errors, or `PummelError::Validation` if no requests match.
pub fn import_har_with_options(
    content: &str,
    options: &HarImportOptions,
) -> Result<Configuration, PummelError> {
    let har: HarFile = serde_json::from_str(content).map_err(|e| PummelError::Serde {
        message: format!("Failed to parse HAR JSON: {e}"),
        file_path: None,
        source: Some(Box::new(e)),
    })?;

    let mut requests = Vec::new();

    for entry in har.log.entries {
        if options.filter_static_assets && is_static_asset(&entry.request.url) {
            continue;
        }

        let method = parse_http_method(&entry.request.method);
        let label = extract_label_from_url(&entry.request.method, &entry.request.url);

        let mut headers_map = HashMap::new();
        for h in entry.request.headers {
            let key_lower = h.name.to_ascii_lowercase();
            if !IGNORED_HEADERS.contains(&key_lower.as_str()) {
                headers_map.insert(h.name, h.value);
            }
        }

        let body = entry.request.post_data.and_then(|pd| pd.text);

        let mut assertions = Vec::new();
        if options.include_status_assertions
            && let Some(ref resp) = entry.response
            && resp.status > 0
        {
            assertions.push(AssertionDefinition {
                subject: "status".to_string(),
                contains: vec![resp.status.to_string()],
                regexp: false,
                not: false,
            });
        }

        let detailed = DetailedRequest {
            url: entry.request.url,
            method,
            headers: if headers_map.is_empty() {
                None
            } else {
                Some(headers_map)
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

        requests.push(HTTPRequestDefinition::Detailed(Box::new(detailed)));
    }

    if requests.is_empty() {
        return Err(PummelError::Validation {
            field: "entries".to_string(),
            reason:
                "HAR file contains no valid HTTP requests (or all were filtered as static assets)"
                    .to_string(),
        });
    }

    let scenario_name = options
        .scenario_name
        .clone()
        .unwrap_or_else(|| "har_scenario".to_string());

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
    fn test_is_static_asset() {
        assert!(is_static_asset("https://example.com/bundle.js"));
        assert!(is_static_asset("https://example.com/styles.css?v=123"));
        assert!(is_static_asset("https://example.com/logo.PNG"));
        assert!(is_static_asset("https://example.com/font.woff2#anchor"));
        assert!(!is_static_asset("https://example.com/api/v1/users"));
        assert!(!is_static_asset("https://example.com/items?format=json"));
    }

    #[test]
    fn test_import_har_success() {
        let har_json = r#"{
            "log": {
                "version": "1.2",
                "creator": { "name": "Chrome DevTools", "version": "120.0" },
                "entries": [
                    {
                        "startedDateTime": "2026-09-27T00:00:00.000Z",
                        "request": {
                            "method": "GET",
                            "url": "https://api.example.com/v1/products",
                            "headers": [
                                { "name": "Accept", "value": "application/json" },
                                { "name": ":authority", "value": "api.example.com" }
                            ]
                        },
                        "response": {
                            "status": 200,
                            "statusText": "OK"
                        }
                    },
                    {
                        "startedDateTime": "2026-09-27T00:00:01.000Z",
                        "request": {
                            "method": "GET",
                            "url": "https://api.example.com/static/style.css",
                            "headers": []
                        },
                        "response": {
                            "status": 200
                        }
                    },
                    {
                        "startedDateTime": "2026-09-27T00:00:02.000Z",
                        "request": {
                            "method": "POST",
                            "url": "https://api.example.com/v1/orders",
                            "headers": [
                                { "name": "Content-Type", "value": "application/json" }
                            ],
                            "postData": {
                                "mimeType": "application/json",
                                "text": "{\"item_id\": 42}"
                            }
                        },
                        "response": {
                            "status": 201
                        }
                    }
                ]
            }
        }"#;

        let config = import_har(har_json).expect("import har");
        assert_eq!(config.scenarios.len(), 1);
        let scenario = config.scenarios.get("har_scenario").unwrap();
        // The .css file should have been filtered out!
        assert_eq!(scenario.requests.len(), 2);

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[0] {
            assert_eq!(d.url, "https://api.example.com/v1/products");
            assert_eq!(d.method, Some(HttpMethod::Get));
            assert_eq!(d.label.as_deref(), Some("GET /v1/products"));
            assert_eq!(d.assert.len(), 1);
            assert_eq!(d.assert[0].contains, vec!["200"]);
            // :authority header should be filtered out
            assert_eq!(
                d.headers.as_ref().unwrap().get("Accept"),
                Some(&"application/json".to_string())
            );
            assert!(!d.headers.as_ref().unwrap().contains_key(":authority"));
        } else {
            panic!("Expected DetailedRequest");
        }

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[1] {
            assert_eq!(d.url, "https://api.example.com/v1/orders");
            assert_eq!(d.method, Some(HttpMethod::Post));
            assert_eq!(d.body.as_deref(), Some("{\"item_id\": 42}"));
            assert_eq!(d.assert[0].contains, vec!["201"]);
        } else {
            panic!("Expected DetailedRequest");
        }
    }

    #[test]
    fn test_import_har_methods_and_negative_cases() {
        // Test invalid JSON
        let err = import_har("invalid json").unwrap_err();
        assert!(matches!(err, PummelError::Serde { .. }));

        // Test empty entries
        let empty_har =
            r#"{ "log": { "version": "1.2", "creator": { "name": "test" }, "entries": [] } }"#;
        let empty_err = import_har(empty_har).unwrap_err();
        assert!(matches!(empty_err, PummelError::Validation { .. }));

        // Test other HTTP methods and label fallback
        let methods_har = r#"{
            "log": {
                "version": "1.2",
                "creator": { "name": "test" },
                "entries": [
                    { "request": { "method": "PUT", "url": "simple-path", "headers": [] } },
                    { "request": { "method": "DELETE", "url": "https://api.example.com/item", "headers": [] } },
                    { "request": { "method": "PATCH", "url": "https://api.example.com/item", "headers": [] } },
                    { "request": { "method": "HEAD", "url": "https://api.example.com/item", "headers": [] } }
                ]
            }
        }"#;

        let config = import_har(methods_har).expect("import methods har");
        let scenario = config.scenarios.get("har_scenario").unwrap();
        assert_eq!(scenario.requests.len(), 4);

        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[0] {
            assert_eq!(d.method, Some(HttpMethod::Put));
            assert_eq!(d.label.as_deref(), Some("PUT simple-path"));
        }
        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[1] {
            assert_eq!(d.method, Some(HttpMethod::Delete));
        }
        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[2] {
            assert_eq!(d.method, Some(HttpMethod::Patch));
        }
        if let HTTPRequestDefinition::Detailed(ref d) = scenario.requests[3] {
            assert_eq!(d.method, Some(HttpMethod::Head));
        }
    }
}
