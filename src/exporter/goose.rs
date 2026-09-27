use crate::engine::utils::parse_time_to_ms;
use crate::models::config::{Configuration, HTTPRequestDefinition, HttpMethod};

/// Slugify an arbitrary identifier into a valid Rust function/variable identifier.
fn rust_ident(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
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
        slug = "task".to_string();
    }
    // Identifiers cannot start with a digit in Rust
    if slug.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        slug = format!("t_{slug}");
    }
    slug
}

/// Calculate hatch rate string for Goose defaults.
fn calculate_hatch_rate(ramp_up: &str, concurrency: usize) -> String {
    let ms = parse_time_to_ms(ramp_up);
    let seconds = (ms as f64) / 1000.0;
    if seconds <= 0.0 {
        concurrency.to_string()
    } else {
        let rate = (concurrency as f64) / seconds;
        if (rate - rate.round()).abs() < 0.01 {
            format!("{}", rate.round() as usize)
        } else {
            format!("{rate:.2}")
        }
    }
}

/// Export a Pummel `Configuration` to a standalone, compilable Rust Goose script (`main.rs`).
#[must_use]
#[allow(clippy::too_many_lines)]
pub fn export_goose(config: &Configuration) -> String {
    let mut code = String::new();

    code.push_str("//! Standalone Goose Load Test Script\n");
    code.push_str("//! Generated automatically by Pummel\n");
    code.push_str("//!\n");
    code.push_str("//! To execute this script with Goose:\n");
    code.push_str("//! ```bash\n");
    code.push_str("//! cargo run --release -- --host https://api.example.com\n");
    code.push_str("//! ```\n\n");
    code.push_str("use goose::prelude::*;\n");
    code.push_str("use std::time::Duration;\n\n");

    let mut scenario_task_map: Vec<(String, usize, Vec<String>)> = Vec::new();

    // Sort scenarios for deterministic code generation
    let mut sorted_scenarios: Vec<_> = config.scenarios.iter().collect();
    sorted_scenarios.sort_by_key(|(name, _)| *name);

    for (scenario_name, scenario_def) in sorted_scenarios {
        let scn_slug = rust_ident(scenario_name);
        let mut task_fn_names = Vec::new();

        for (idx, req_def) in scenario_def.requests.iter().enumerate() {
            let fn_name = format!("{scn_slug}_request_{}", idx + 1);
            task_fn_names.push(fn_name.clone());

            let label_str = match req_def {
                HTTPRequestDefinition::Simple(u) => u.as_str(),
                HTTPRequestDefinition::Detailed(d) => d.label.as_deref().unwrap_or(d.url.as_str()),
            };
            code.push_str(&format!("/// Transaction {}: {label_str}\n", idx + 1));
            code.push_str(&format!(
                "async fn {fn_name}(user: &mut GooseUser) -> GooseTaskResult {{\n"
            ));

            match req_def {
                HTTPRequestDefinition::Simple(url) => {
                    code.push_str(&format!("    let _ = user.get(\"{url}\").await?;\n"));
                }
                HTTPRequestDefinition::Detailed(d) => {
                    let method = d.method.as_ref().unwrap_or(&HttpMethod::Get);
                    let (method_variant, client_fn) = match method {
                        HttpMethod::Get => ("GooseMethod::Get", "get"),
                        HttpMethod::Post => ("GooseMethod::Post", "post"),
                        HttpMethod::Put => ("GooseMethod::Put", "put"),
                        HttpMethod::Delete => ("GooseMethod::Delete", "delete"),
                        HttpMethod::Patch => ("GooseMethod::Patch", "patch"),
                        HttpMethod::Head => ("GooseMethod::Head", "head"),
                    };

                    let url_str = &d.url;
                    let label = d.label.as_deref().unwrap_or(url_str);

                    code.push_str(&format!(
                        "    let mut req_builder = user.client.{client_fn}(\"{url_str}\");\n"
                    ));

                    // Add scenario headers
                    if let Some(ref scn_headers) = scenario_def.headers {
                        for (k, v) in scn_headers {
                            code.push_str(&format!(
                                "    req_builder = req_builder.header(\"{k}\", \"{v}\");\n"
                            ));
                        }
                    }

                    // Add request headers
                    if let Some(ref req_headers) = d.headers {
                        for (k, v) in req_headers {
                            code.push_str(&format!(
                                "    req_builder = req_builder.header(\"{k}\", \"{v}\");\n"
                            ));
                        }
                    }

                    // Add request timeout
                    if let Some(ref timeout_str) = d.timeout {
                        let ms = parse_time_to_ms(timeout_str);
                        if ms > 0 {
                            code.push_str(&format!(
                                "    req_builder = req_builder.timeout(Duration::from_millis({ms}));\n"
                            ));
                        }
                    }

                    // Add body
                    if let Some(ref body) = d.body {
                        let escaped_body = body.replace('"', "\\\"");
                        code.push_str(&format!(
                            "    req_builder = req_builder.body(\"{escaped_body}\");\n"
                        ));
                    }

                    // Build GooseRequest
                    code.push_str("    let goose_req = GooseRequest::builder()\n");
                    code.push_str(&format!("        .method({method_variant})\n"));
                    code.push_str(&format!("        .path(\"{label}\")\n"));
                    code.push_str("        .set_request_builder(req_builder)\n");
                    code.push_str("        .build();\n");
                    code.push_str("    let mut goose_resp = user.request(goose_req).await?;\n");

                    // Status and body assertions
                    for assertion in &d.assert {
                        match assertion.subject.as_str() {
                            "status" => {
                                for code_str in &assertion.contains {
                                    if let Ok(expected_status) = code_str.parse::<u16>() {
                                        code.push_str(
                                            "    if let Ok(ref response) = goose_resp.response {\n",
                                        );
                                        code.push_str("        let actual_status = response.status().as_u16();\n");
                                        code.push_str(&format!(
                                            "        if actual_status != {expected_status} {{\n"
                                        ));
                                        code.push_str("            let mut req = goose_resp.request.clone();\n");
                                        code.push_str("            let _ = user.set_failure(\n");
                                        code.push_str("                \"Status Assertion\",\n");
                                        code.push_str("                &mut req,\n");
                                        code.push_str("                None,\n");
                                        code.push_str(&format!(
                                            "                Some(&format!(\"Expected status {expected_status}, got {{actual_status}}\")),\n"
                                        ));
                                        code.push_str("            );\n");
                                        code.push_str("        }\n");
                                        code.push_str("    }\n");
                                    }
                                }
                            }
                            "body" => {
                                for needle in &assertion.contains {
                                    let escaped_needle = needle.replace('"', "\\\"");
                                    code.push_str(
                                        "    if let Ok(response) = goose_resp.response {\n",
                                    );
                                    code.push_str(
                                        "        if let Ok(text) = response.text().await {\n",
                                    );
                                    code.push_str(&format!(
                                        "            if !text.contains(\"{escaped_needle}\") {{\n"
                                    ));
                                    code.push_str("                let mut req = goose_resp.request.clone();\n");
                                    code.push_str("                let _ = user.set_failure(\n");
                                    code.push_str("                    \"Body Assertion\",\n");
                                    code.push_str("                    &mut req,\n");
                                    code.push_str("                    None,\n");
                                    code.push_str(&format!(
                                        "                    Some(\"Body does not contain '{escaped_needle}'\"),\n"
                                    ));
                                    code.push_str("                );\n");
                                    code.push_str("            }\n");
                                    code.push_str("        }\n");
                                    code.push_str("    }\n");
                                }
                            }
                            _ => {}
                        }
                    }

                    // Think time if configured per request
                    if let Some(ref tt) = d.think_time {
                        let ms = parse_time_to_ms(tt);
                        if ms > 0 {
                            code.push_str(&format!(
                                "    tokio::time::sleep(Duration::from_millis({ms})).await;\n"
                            ));
                        }
                    }
                }
            }

            code.push_str("    Ok(())\n");
            code.push_str("}\n\n");
        }

        scenario_task_map.push((scenario_name.clone(), scenario_def.weight, task_fn_names));
    }

    // Main Goose entrypoint
    code.push_str("#[tokio::main]\n");
    code.push_str("async fn main() -> Result<(), GooseError> {\n");
    code.push_str("    let mut attack = GooseAttack::initialize()?;\n\n");

    for (scn_name, weight, task_fns) in scenario_task_map {
        code.push_str(&format!(
            "    let mut scn_{} = scenario!(\"{scn_name}\");\n",
            rust_ident(&scn_name)
        ));
        if weight > 1 {
            code.push_str(&format!(
                "    scn_{} = scn_{}.set_weight({weight})?;\n",
                rust_ident(&scn_name),
                rust_ident(&scn_name)
            ));
        }
        for task_fn in task_fns {
            code.push_str(&format!(
                "    scn_{} = scn_{}.register_transaction(transaction!({task_fn}));\n",
                rust_ident(&scn_name),
                rust_ident(&scn_name)
            ));
        }
        code.push_str(&format!(
            "    attack = attack.register_scenario(scn_{});\n\n",
            rust_ident(&scn_name)
        ));
    }

    // Determine execution defaults from first execution plan if present
    if let Some(first_exec) = config.execution.first() {
        let concurrency = first_exec.concurrency;
        let runtime_secs = parse_time_to_ms(&first_exec.hold_for) as usize / 1000;
        let hatch_rate = calculate_hatch_rate(&first_exec.ramp_up, concurrency);

        code.push_str(&format!(
            "    attack = attack.set_default(GooseDefault::Users, {concurrency})?;\n"
        ));
        code.push_str(&format!(
            "    attack = attack.set_default(GooseDefault::RunTime, {runtime_secs})?;\n"
        ));
        code.push_str(&format!(
            "    attack = attack.set_default(GooseDefault::HatchRate, \"{hatch_rate}\")?;\n"
        ));

        if let Some(throughput) = first_exec.throughput {
            code.push_str(&format!(
                "    attack = attack.set_default(GooseDefault::ThrottleRequests, {throughput})?;\n"
            ));
        }
    }

    code.push_str("\n    attack.execute().await?;\n");
    code.push_str("    Ok(())\n");
    code.push_str("}\n");

    code
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::config::{
        AssertionDefinition, DetailedRequest, ExecutionPlan, ScenarioDefinition,
    };
    use std::collections::HashMap;

    #[test]
    fn test_rust_ident() {
        assert_eq!(rust_ident("My Scenario!"), "my_scenario");
        assert_eq!(rust_ident("123_test"), "t_123_test");
        assert_eq!(rust_ident(""), "task");
    }

    #[test]
    fn test_calculate_hatch_rate() {
        assert_eq!(calculate_hatch_rate("10s", 100), "10");
        assert_eq!(calculate_hatch_rate("3s", 10), "3.33");
        assert_eq!(calculate_hatch_rate("0s", 50), "50");
    }

    #[test]
    fn test_export_goose_script_generation() {
        let mut scenarios = HashMap::new();
        let requests = vec![HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
            url: "https://httpbin.org/get".to_string(),
            method: Some(HttpMethod::Get),
            headers: Some(HashMap::from([(
                "Accept".to_string(),
                "application/json".to_string(),
            )])),
            label: Some("Get Request".to_string()),
            assert: vec![AssertionDefinition {
                subject: "status".to_string(),
                contains: vec!["200".to_string()],
                regexp: false,
                not: false,
            }],
            ..Default::default()
        }))];

        scenarios.insert(
            "checkout_flow".to_string(),
            ScenarioDefinition {
                requests,
                weight: 2,
                think_time: None,
                data_sources: None,
                headers: None,
            },
        );

        let config = Configuration {
            execution: vec![ExecutionPlan {
                concurrency: 20,
                ramp_up: "5s".to_string(),
                hold_for: "60s".to_string(),
                scenario: "checkout_flow".to_string(),
                throughput: Some(500),
                steps: None,
                pacing: None,
            }],
            scenarios,
            reporting: Vec::new(),
            services: Vec::new(),
            api: None,
        };

        let script = export_goose(&config);
        assert!(script.contains("use goose::prelude::*;"));
        assert!(script.contains("checkout_flow_request_1"));
        assert!(script.contains("GooseMethod::Get"));
        assert!(script.contains("https://httpbin.org/get"));
        assert!(script.contains("req_builder.header(\"Accept\", \"application/json\")"));
        assert!(script.contains("actual_status != 200"));
        assert!(script.contains("GooseDefault::Users, 20"));
        assert!(script.contains("GooseDefault::RunTime, 60"));
        assert!(script.contains("GooseDefault::HatchRate, \"4\""));
        assert!(script.contains("GooseDefault::ThrottleRequests, 500"));
        assert!(script.contains("attack.execute().await?;"));
    }

    #[test]
    fn test_export_goose_simple_requests_and_all_methods() {
        let mut scenarios = HashMap::new();
        scenarios.insert(
            "various_ops".to_string(),
            ScenarioDefinition {
                requests: vec![
                    HTTPRequestDefinition::Simple("https://httpbin.org/anything".to_string()),
                    HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
                        url: "https://httpbin.org/put".to_string(),
                        method: Some(HttpMethod::Put),
                        timeout: Some("3000ms".to_string()),
                        think_time: Some("500ms".to_string()),
                        ..Default::default()
                    })),
                    HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
                        url: "https://httpbin.org/delete".to_string(),
                        method: Some(HttpMethod::Delete),
                        ..Default::default()
                    })),
                    HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
                        url: "https://httpbin.org/patch".to_string(),
                        method: Some(HttpMethod::Patch),
                        ..Default::default()
                    })),
                    HTTPRequestDefinition::Detailed(Box::new(DetailedRequest {
                        url: "https://httpbin.org/head".to_string(),
                        method: Some(HttpMethod::Head),
                        ..Default::default()
                    })),
                ],
                weight: 1,
                think_time: None,
                data_sources: None,
                headers: Some(HashMap::from([(
                    "X-Global-Header".to_string(),
                    "goose-val".to_string(),
                )])),
            },
        );

        let config = Configuration {
            execution: vec![],
            scenarios,
            reporting: vec![],
            services: vec![],
            api: None,
        };

        let script = export_goose(&config);
        assert!(script.contains("user.get(\"https://httpbin.org/anything\").await?"));
        assert!(script.contains("GooseMethod::Put"));
        assert!(script.contains("GooseMethod::Delete"));
        assert!(script.contains("GooseMethod::Patch"));
        assert!(script.contains("GooseMethod::Head"));
        assert!(script.contains("req_builder.header(\"X-Global-Header\", \"goose-val\")"));
        assert!(script.contains("Duration::from_millis(3000)"));
        assert!(script.contains("Duration::from_millis(500)"));
    }
}
