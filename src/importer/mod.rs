pub mod har;
pub mod openapi;
pub mod postman;

pub use har::{HarImportOptions, import_har, import_har_with_options};
pub use openapi::import_openapi;
pub use postman::import_postman;

use crate::engine::PummelError;
use crate::models::config::Configuration;
use std::fs;
use std::path::Path;

/// Unified dispatcher to import a Pummel configuration from an external format string.
///
/// Supported formats: "postman", "har", "openapi"
///
/// # Errors
///
/// Returns `PummelError::Validation` if format is unsupported, or `PummelError::Serde` on parse errors.
pub fn import(content: &str, format: &str) -> Result<Configuration, PummelError> {
    match format.to_ascii_lowercase().as_str() {
        "postman" => import_postman(content),
        "har" => import_har(content),
        "openapi" | "swagger" => import_openapi(content),
        other => Err(PummelError::Validation {
            field: "format".to_string(),
            reason: format!(
                "Unsupported import format: '{other}'. Supported formats: postman, har, openapi"
            ),
        }),
    }
}

/// Auto-detects the format of a file or content if format is not specified.
#[must_use]
pub fn detect_format(path: &Path, content: &str) -> Option<&'static str> {
    if let Some(ext) = path.extension().and_then(|e| e.to_str())
        && ext.eq_ignore_ascii_case("har")
    {
        return Some("har");
    }

    if content.contains("schema.getpostman.com") || content.contains("_postman_id") {
        return Some("postman");
    }

    if content.contains("\"log\"") && content.contains("\"entries\"") {
        return Some("har");
    }

    if content.contains("openapi:")
        || content.contains("\"openapi\"")
        || content.contains("swagger:")
        || content.contains("\"swagger\"")
    {
        return Some("openapi");
    }

    None
}

/// Import a file into a Pummel `Configuration`, auto-detecting the format if unspecified.
///
/// # Errors
///
/// Returns `PummelError::Io` on file read error, `PummelError::Validation` if format cannot be detected,
/// or `PummelError::Serde` if parsing fails.
pub fn import_file<P: AsRef<Path>>(
    path: P,
    format: Option<&str>,
) -> Result<Configuration, PummelError> {
    let path_ref = path.as_ref();
    let content = fs::read_to_string(path_ref).map_err(|e| PummelError::Io {
        source: e,
        context: format!("Failed to read import file '{}'", path_ref.display()),
    })?;

    let resolved_format = match format {
        Some(f) => f,
        None => detect_format(path_ref, &content).ok_or_else(|| PummelError::Validation {
            field: "format".to_string(),
            reason: format!(
                "Could not auto-detect format for '{}'. Please specify --from <postman|har>",
                path_ref.display()
            ),
        })?,
    };

    import(&content, resolved_format)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_format_by_extension() {
        assert_eq!(detect_format(Path::new("recording.har"), "{}"), Some("har"));
    }

    #[test]
    fn test_detect_format_postman_content() {
        let content = r#"{"info": {"name": "Test", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"}, "item": []}"#;
        assert_eq!(
            detect_format(Path::new("test.json"), content),
            Some("postman")
        );
    }

    #[test]
    fn test_detect_format_har_content() {
        let content = r#"{"log": {"version": "1.2", "entries": []}}"#;
        assert_eq!(detect_format(Path::new("data.json"), content), Some("har"));
    }

    #[test]
    fn test_detect_format_openapi_content() {
        let yaml = "openapi: 3.0.0\ninfo:\n  title: Test\npaths: {}";
        assert_eq!(detect_format(Path::new("api.yaml"), yaml), Some("openapi"));
        let swagger = "swagger: 2.0\ninfo:\n  title: Test\npaths: {}";
        assert_eq!(
            detect_format(Path::new("api.yaml"), swagger),
            Some("openapi")
        );
    }

    #[test]
    fn test_import_unsupported_format() {
        let res = import("{}", "unsupported");
        assert!(res.is_err());
        if let Err(PummelError::Validation { field, reason }) = res {
            assert_eq!(field, "format");
            assert!(reason.contains("Unsupported import format"));
        } else {
            panic!("Expected Validation error");
        }
    }

    #[test]
    fn test_import_file_not_found() {
        let res = import_file("nonexistent_file_path_12345.json", Some("postman"));
        assert!(res.is_err());
        assert!(matches!(res.unwrap_err(), PummelError::Io { .. }));
    }

    #[test]
    fn test_import_file_undetectable_format() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("random.txt");
        std::fs::write(&file_path, "plain text without signatures").unwrap();

        let res = import_file(&file_path, None);
        assert!(res.is_err());
        if let Err(PummelError::Validation { field, reason }) = res {
            assert_eq!(field, "format");
            assert!(reason.contains("Could not auto-detect format"));
        } else {
            panic!("Expected Validation error");
        }
    }

    #[test]
    fn test_import_file_auto_detection_and_parse() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("spec.yaml");
        let content = r#"
openapi: 3.0.0
info:
  title: "Test API"
  version: "1.0.0"
paths:
  /ping:
    get:
      summary: "Ping"
      responses:
        "200":
          description: "pong"
"#;
        std::fs::write(&file_path, content).unwrap();

        let config = import_file(&file_path, None).expect("Auto-detect and import openapi");
        assert!(config.scenarios.contains_key("test_api"));
    }

    #[test]
    fn test_import_file_with_explicit_format() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("spec_no_ext");
        let content = r#"
openapi: 3.0.0
info:
  title: "Explicit Format API"
paths:
  /check:
    get:
      responses:
        "200":
          description: "ok"
"#;
        std::fs::write(&file_path, content).unwrap();

        let config = import_file(&file_path, Some("openapi")).expect("Explicit format import");
        assert!(config.scenarios.contains_key("explicit_format_api"));
    }
}
