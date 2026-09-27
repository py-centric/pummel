pub mod goose;
pub mod k6;
pub mod locust;
pub mod postman;
pub mod taurus;

pub use goose::export_goose;
pub use k6::export_k6;
pub use locust::export_locust;
pub use postman::export_postman;
pub use taurus::export_taurus;

use crate::engine::PummelError;
use crate::models::config::Configuration;

/// Unified dispatcher to export a Pummel configuration to a supported external target.
///
/// Supported targets: "k6", "locust", "taurus" (or "bzt"), "postman", "goose" (or "rust")
///
/// # Errors
///
/// Returns `PummelError::Validation` if target is unsupported, or `PummelError::Serde` on serialization failure.
pub fn export(config: &Configuration, target: &str) -> Result<String, PummelError> {
    match target.to_ascii_lowercase().as_str() {
        "k6" => Ok(export_k6(config)),
        "locust" => Ok(export_locust(config)),
        "taurus" | "bzt" => export_taurus(config),
        "postman" => Ok(export_postman(config)),
        "goose" | "rust" => Ok(export_goose(config)),
        other => Err(PummelError::Validation {
            field: "export".to_string(),
            reason: format!(
                "Unsupported export target: '{other}'. Supported targets: k6, locust, taurus, postman, goose"
            ),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn dummy_config() -> Configuration {
        let mut scenarios = HashMap::new();
        scenarios.insert(
            "dummy".to_string(),
            crate::models::config::ScenarioDefinition {
                requests: vec![],
                weight: 1,
                think_time: None,
                data_sources: None,
                headers: None,
            },
        );
        Configuration {
            execution: vec![crate::models::config::ExecutionPlan {
                concurrency: 1,
                ramp_up: "0s".to_string(),
                hold_for: "1s".to_string(),
                scenario: "dummy".to_string(),
                throughput: None,
                steps: None,
                pacing: None,
            }],
            scenarios,
            reporting: Vec::new(),
            services: Vec::new(),
            api: None,
        }
    }

    #[test]
    fn test_export_dispatcher_all_targets() {
        let config = dummy_config();
        assert!(export(&config, "k6").is_ok());
        assert!(export(&config, "locust").is_ok());
        assert!(export(&config, "taurus").is_ok());
        assert!(export(&config, "bzt").is_ok());
        assert!(export(&config, "postman").is_ok());
        assert!(export(&config, "goose").is_ok());
        assert!(export(&config, "rust").is_ok());
    }

    #[test]
    fn test_export_dispatcher_invalid_target() {
        let config = dummy_config();
        let res = export(&config, "nonexistent");
        assert!(res.is_err());
        if let Err(PummelError::Validation { field, reason }) = res {
            assert_eq!(field, "export");
            assert!(reason.contains("Unsupported export target"));
        } else {
            panic!("Expected Validation error");
        }
    }
}
