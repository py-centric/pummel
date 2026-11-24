//! Fail-closed `cordon-public` sandbox wrapper for Pummel load executions (`ADR-L0-DX-07`).

use std::collections::BTreeSet;
use std::path::Path;

use crate::engine::PummelError;
use crate::models::config::{Configuration, HTTPRequestDefinition};

/// Default canonical Cordon template slug for Tea/Pummel runners.
pub const DEFAULT_CORDON_PROFILE: &str = "tea-pummel-runner";

/// Extract unique target hostnames from all scenario requests in `config`.
#[must_use]
pub fn extract_target_hosts(config: &Configuration) -> Vec<String> {
    let mut hosts = BTreeSet::new();
    for scenario in config.scenarios.values() {
        for req in &scenario.requests {
            let url = match req {
                HTTPRequestDefinition::Simple(u) => u.as_str(),
                HTTPRequestDefinition::Detailed(d) => d.url.as_str(),
            };
            if let Some(host) = extract_host_from_url(url) {
                hosts.insert(host);
            }
        }
    }
    if let Some(ref cordon) = config.cordon {
        for domain in &cordon.extra_allowed_domains {
            let trimmed = domain.trim();
            if !trimmed.is_empty() {
                hosts.insert(trimmed.to_string());
            }
        }
    }
    hosts.into_iter().collect()
}

fn extract_host_from_url(raw: &str) -> Option<String> {
    let after_scheme = raw
        .strip_prefix("https://")
        .or_else(|| raw.strip_prefix("http://"))
        .or_else(|| raw.strip_prefix("wss://"))
        .or_else(|| raw.strip_prefix("ws://"))?;
    let authority = after_scheme.split('/').next()?;
    let host_port = authority.rsplit('@').next()?;
    let host = host_port.split(':').next()?.trim();
    if host.is_empty() {
        None
    } else {
        Some(host.to_ascii_lowercase())
    }
}

/// Build the fail-closed `cordon` CLI argv wrapping a Pummel scenario run.
///
/// # Errors
/// Returns `PummelError::Validation` if `scenario_path` is empty.
pub fn build_cordon_wrapped_argv(
    config: &Configuration,
    scenario_path: &Path,
) -> Result<Vec<String>, PummelError> {
    let scenario_str = scenario_path.to_string_lossy();
    if scenario_str.trim().is_empty() {
        return Err(PummelError::Validation {
            field: "scenario_path".to_string(),
            reason: "Scenario path cannot be empty".to_string(),
        });
    }

    let mut argv = vec!["cordon".to_string(), "run".to_string()];
    if let Some(cfg_file) = config
        .cordon
        .as_ref()
        .and_then(|c| c.config_file.as_deref())
    {
        argv.push("-f".to_string());
        argv.push(cfg_file.to_string());
    } else {
        let profile = config
            .cordon
            .as_ref()
            .and_then(|c| c.profile.as_deref())
            .unwrap_or(DEFAULT_CORDON_PROFILE);
        argv.push("--profile".to_string());
        argv.push(profile.to_string());
    }

    for host in extract_target_hosts(config) {
        argv.push("--allow-domain".to_string());
        argv.push(host);
    }

    argv.push("--".to_string());
    argv.push("pummel".to_string());
    argv.push(scenario_str.into_owned());
    Ok(argv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::config::{CordonSandboxConfig, ExecutionPlan, ScenarioDefinition};
    use std::collections::HashMap;

    #[test]
    fn builds_fail_closed_cordon_argv_with_extracted_hosts() {
        let mut scenarios = HashMap::new();
        scenarios.insert(
            "smoke".to_string(),
            ScenarioDefinition {
                requests: vec![
                    HTTPRequestDefinition::Simple(
                        "https://tst.pycentric.local:8443/health".to_string(),
                    ),
                    HTTPRequestDefinition::Simple("http://127.0.0.1:8000/api/v1/ping".to_string()),
                ],
                weight: 1,
                think_time: None,
                data_sources: None,
                headers: None,
            },
        );
        let cfg = Configuration {
            execution: vec![ExecutionPlan {
                concurrency: 5,
                ramp_up: "1s".to_string(),
                hold_for: "5s".to_string(),
                scenario: "smoke".to_string(),
                throughput: None,
                steps: None,
                pacing: None,
            }],
            scenarios,
            reporting: vec![],
            services: vec![],
            api: None,
            cordon: Some(CordonSandboxConfig {
                enabled: true,
                profile: None,
                config_file: Some(".cordon.toml".to_string()),
                extra_allowed_domains: vec!["int.pycentric.local".to_string()],
            }),
        };

        let argv = build_cordon_wrapped_argv(&cfg, Path::new("loadtests/smoke.yaml")).unwrap();
        assert_eq!(argv[0], "cordon");
        assert!(argv.contains(&".cordon.toml".to_string()));
        assert!(argv.contains(&"127.0.0.1".to_string()));
        assert!(argv.contains(&"tst.pycentric.local".to_string()));
        assert!(argv.contains(&"int.pycentric.local".to_string()));
        assert_eq!(
            argv.last().map(String::as_str),
            Some("loadtests/smoke.yaml")
        );
    }
}
