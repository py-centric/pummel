use crate::engine::PummelError;
use crate::engine::interpolation::Interpolator;
use crate::engine::macros::MacroEvaluator;
use std::collections::HashMap;

/// Resolves the request body from either a file or inline definition.
///
/// Priority: `body_file` > inline `body`. When a file is specified, the path
/// is validated for security (no directory traversal) and the file size is
/// checked before reading. The resulting content is interpolated with session
/// variables and evaluated for macro expressions.
///
/// # Errors
///
/// Returns `PummelError` if path validation, security checks, or macro
/// evaluation fails.
pub(crate) async fn resolve_body(
    body: Option<&str>,
    body_file: Option<&str>,
    variables: &HashMap<String, String>,
    record: Option<&HashMap<String, String>>,
) -> Result<String, PummelError> {
    let raw = if let Some(bf) = body_file {
        let body_path = MacroEvaluator::evaluate(bf, record)?;
        let canonical = crate::engine::data_sources::validate_path(&body_path)?;
        crate::engine::data_sources::check_file_size(&canonical)?;
        match tokio::fs::read_to_string(&canonical).await {
            Ok(content) => content,
            Err(e) => {
                tracing::warn!(
                    "[BODY_FILE] Failed to read body file '{}': {}",
                    canonical.display(),
                    e
                );
                String::new()
            }
        }
    } else {
        body.map(|b| Interpolator::interpolate(b, variables))
            .unwrap_or_default()
    };

    let final_body = MacroEvaluator::evaluate(&raw, record)?;
    Ok(final_body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_resolve_body_inline_interpolation() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "World".to_string());
        let res = resolve_body(Some("Hello, ${name}!"), None, &vars, None)
            .await
            .unwrap();
        assert_eq!(res, "Hello, World!");
    }

    #[tokio::test]
    async fn test_resolve_body_from_file() {
        let vars = HashMap::new();
        let res = resolve_body(None, Some("Cargo.toml"), &vars, None)
            .await
            .unwrap();
        assert!(res.contains("pummel"));
    }

    #[tokio::test]
    async fn test_resolve_body_path_traversal_rejected() {
        let vars = HashMap::new();
        let res = resolve_body(None, Some("../../etc/passwd"), &vars, None).await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_resolve_body_directory_read_error() {
        let vars = HashMap::new();
        let res = resolve_body(None, Some("src"), &vars, None).await.unwrap();
        assert_eq!(res, "");
    }

    #[tokio::test]
    async fn test_resolve_body_empty_defaults() {
        let vars = HashMap::new();
        let res = resolve_body(None, None, &vars, None).await.unwrap();
        assert_eq!(res, "");
    }
}
