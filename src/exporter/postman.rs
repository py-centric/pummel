use crate::models::config::{Configuration, HTTPRequestDefinition, HttpMethod};
use regex::Regex;
use serde::{Deserialize, Serialize};

/// Postman Collection v2.1 export structures.
#[derive(Debug, Serialize, Deserialize)]
pub struct PostmanExportCollection {
    pub info: PostmanExportInfo,
    pub item: Vec<PostmanExportItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostmanExportInfo {
    #[serde(rename = "_postman_id")]
    pub postman_id: String,
    pub name: String,
    pub schema: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostmanExportItem {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<Vec<PostmanExportItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request: Option<PostmanExportRequest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<Vec<PostmanExportEvent>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostmanExportRequest {
    pub method: String,
    pub header: Vec<PostmanExportHeader>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<PostmanExportBody>,
    pub url: PostmanExportUrl,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostmanExportUrl {
    pub raw: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostmanExportHeader {
    pub key: String,
    pub value: String,
    #[serde(rename = "type")]
    pub header_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostmanExportBody {
    pub mode: String,
    pub raw: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostmanExportEvent {
    pub listen: String,
    pub script: PostmanExportScript,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostmanExportScript {
    #[serde(rename = "type")]
    pub script_type: String,
    pub exec: Vec<String>,
}

/// Convert Pummel variable syntax `${var_name}` to Postman `{{var_name}}`.
#[must_use]
pub fn convert_pummel_vars_to_postman(input: &str) -> String {
    let re = Regex::new(r"\$\{([a-zA-Z0-9_\-\.]+)\}").expect("valid regex");
    re.replace_all(input, |caps: &regex::Captures| {
        format!("{{{{{}}}}}", &caps[1])
    })
    .to_string()
}

/// Export a Pummel `Configuration` to a Postman Collection v2.1 JSON string.
#[must_use]
pub fn export_postman(config: &Configuration) -> String {
    let mut scenario_folders = Vec::new();

    // Sort scenario keys for deterministic export output
    let mut sorted_scenarios: Vec<_> = config.scenarios.iter().collect();
    sorted_scenarios.sort_by_key(|(name, _)| *name);

    for (scenario_name, scenario) in sorted_scenarios {
        let mut request_items = Vec::new();

        for (idx, req_def) in scenario.requests.iter().enumerate() {
            match req_def {
                HTTPRequestDefinition::Simple(url) => {
                    let converted_url = convert_pummel_vars_to_postman(url);
                    request_items.push(PostmanExportItem {
                        name: format!("Request {}", idx + 1),
                        item: None,
                        request: Some(PostmanExportRequest {
                            method: "GET".to_string(),
                            header: Vec::new(),
                            body: None,
                            url: PostmanExportUrl { raw: converted_url },
                        }),
                        event: None,
                    });
                }
                HTTPRequestDefinition::Detailed(d) => {
                    let converted_url = convert_pummel_vars_to_postman(&d.url);
                    let method = match d.method {
                        Some(HttpMethod::Get) => "GET",
                        Some(HttpMethod::Post) => "POST",
                        Some(HttpMethod::Put) => "PUT",
                        Some(HttpMethod::Delete) => "DELETE",
                        Some(HttpMethod::Patch) => "PATCH",
                        Some(HttpMethod::Head) => "HEAD",
                        None => "GET",
                    }
                    .to_string();

                    let label = d
                        .label
                        .clone()
                        .unwrap_or_else(|| format!("{} {}", method, d.url));

                    // Merge scenario headers with request headers
                    let mut headers = Vec::new();
                    if let Some(ref scn_headers) = scenario.headers {
                        for (k, v) in scn_headers {
                            headers.push(PostmanExportHeader {
                                key: convert_pummel_vars_to_postman(k),
                                value: convert_pummel_vars_to_postman(v),
                                header_type: "text".to_string(),
                            });
                        }
                    }
                    if let Some(ref req_headers) = d.headers {
                        for (k, v) in req_headers {
                            headers.push(PostmanExportHeader {
                                key: convert_pummel_vars_to_postman(k),
                                value: convert_pummel_vars_to_postman(v),
                                header_type: "text".to_string(),
                            });
                        }
                    }

                    // Body
                    let body = d.body.as_ref().map(|raw_body| {
                        let converted_body = convert_pummel_vars_to_postman(raw_body);
                        let is_json = converted_body.trim_start().starts_with('{')
                            || converted_body.trim_start().starts_with('[');
                        let options = if is_json {
                            Some(serde_json::json!({
                                "raw": { "language": "json" }
                            }))
                        } else {
                            None
                        };

                        PostmanExportBody {
                            mode: "raw".to_string(),
                            raw: converted_body,
                            options,
                        }
                    });

                    // Assertions -> Postman test scripts
                    let mut test_lines = Vec::new();
                    for assertion in &d.assert {
                        match assertion.subject.as_str() {
                            "status" => {
                                for code in &assertion.contains {
                                    test_lines.push(format!(
                                        "pm.test(\"Status code is {code}\", function () {{ pm.response.to.have.status({code}); }});"
                                    ));
                                }
                            }
                            "body" => {
                                for needle in &assertion.contains {
                                    let escaped = needle.replace('"', "\\\"");
                                    test_lines.push(format!(
                                        "pm.test(\"Body contains {escaped}\", function () {{ pm.expect(pm.response.text()).to.include(\"{escaped}\"); }});"
                                    ));
                                }
                            }
                            _ => {}
                        }
                    }

                    let event = if test_lines.is_empty() {
                        None
                    } else {
                        Some(vec![PostmanExportEvent {
                            listen: "test".to_string(),
                            script: PostmanExportScript {
                                script_type: "text/javascript".to_string(),
                                exec: test_lines,
                            },
                        }])
                    };

                    request_items.push(PostmanExportItem {
                        name: label,
                        item: None,
                        request: Some(PostmanExportRequest {
                            method,
                            header: headers,
                            body,
                            url: PostmanExportUrl { raw: converted_url },
                        }),
                        event,
                    });
                }
            }
        }

        scenario_folders.push(PostmanExportItem {
            name: format!("Scenario: {scenario_name}"),
            item: Some(request_items),
            request: None,
            event: None,
        });
    }

    let collection = PostmanExportCollection {
        info: PostmanExportInfo {
            postman_id: "pummel-export-collection".to_string(),
            name: "Pummel Test Collection".to_string(),
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
                .to_string(),
            description: Some("Exported from Pummel performance test suite".to_string()),
        },
        item: scenario_folders,
    };

    serde_json::to_string_pretty(&collection).unwrap_or_else(|_| "{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::config::{AssertionDefinition, DetailedRequest, ScenarioDefinition};
    use std::collections::HashMap;

    #[test]
    fn test_convert_pummel_vars_to_postman() {
        assert_eq!(
            convert_pummel_vars_to_postman("https://${host}/api/${version}"),
            "https://{{host}}/api/{{version}}"
        );
    }

    #[test]
    fn test_export_postman_roundtrip() {
        let mut scenarios = HashMap::new();
        let requests = vec![HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
            url: "https://${api_host}/v1/users".to_string(),
            method: Some(HttpMethod::Post),
            headers: Some(HashMap::from([(
                "Content-Type".to_string(),
                "application/json".to_string(),
            )])),
            body: Some("{\"name\": \"${username}\"}".to_string()),
            label: Some("Create User".to_string()),
            assert: vec![
                AssertionDefinition {
                    subject: "status".to_string(),
                    contains: vec!["201".to_string()],
                    regexp: false,
                    not: false,
                },
                AssertionDefinition {
                    subject: "body".to_string(),
                    contains: vec!["id".to_string()],
                    regexp: false,
                    not: false,
                },
            ],
            ..Default::default()
        }))];

        scenarios.insert(
            "user_flow".to_string(),
            ScenarioDefinition {
                requests,
                weight: 1,
                think_time: None,
                data_sources: None,
                headers: None,
            },
        );

        let config = Configuration {
            execution: Vec::new(),
            scenarios,
            reporting: Vec::new(),
            services: Vec::new(),
            api: None,
        };

        let json = export_postman(&config);
        assert!(
            json.contains("https://schema.getpostman.com/json/collection/v2.1.0/collection.json")
        );
        assert!(json.contains("https://{{api_host}}/v1/users"));
        assert!(json.contains("Create User"));
        assert!(json.contains("pm.response.to.have.status(201)"));
        assert!(json.contains("pm.expect(pm.response.text()).to.include(\\\"id\\\")"));
    }

    #[test]
    fn test_export_postman_simple_requests_and_scenario_headers() {
        let mut scenarios = HashMap::new();
        let requests = vec![
            HTTPRequestDefinition::Simple("https://example.com/health".to_string()),
            HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
                url: "https://example.com/upload".to_string(),
                method: Some(HttpMethod::Put),
                headers: Some(HashMap::from([(
                    "Content-Type".to_string(),
                    "text/plain".to_string(),
                )])),
                body: Some("raw text content".to_string()),
                ..Default::default()
            })),
        ];

        scenarios.insert(
            "health_check".to_string(),
            ScenarioDefinition {
                requests,
                weight: 1,
                think_time: None,
                data_sources: None,
                headers: Some(HashMap::from([(
                    "X-Global".to_string(),
                    "global-value".to_string(),
                )])),
            },
        );

        let config = Configuration {
            execution: Vec::new(),
            scenarios,
            reporting: Vec::new(),
            services: Vec::new(),
            api: None,
        };

        let json = export_postman(&config);
        assert!(json.contains("https://example.com/health"));
        assert!(json.contains("https://example.com/upload"));
        assert!(json.contains("PUT"));
        assert!(json.contains("X-Global"));
        assert!(json.contains("raw text content"));
    }
}
