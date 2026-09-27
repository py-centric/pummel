use clap::Parser;
use pummel::engine;
use pummel::engine::PummelError;
use pummel::models::config::Configuration;
use pummel::normalizer::{SchemaNormalizer, ShorthandConfiguration};
use std::fs;
use std::path::Path;

#[derive(clap::Subcommand, Debug, PartialEq)]
enum Subcommands {
    /// Import external format (Postman Collection, HAR) into Pummel YAML configuration
    Import {
        /// Path to the file to import (.json, .har)
        file: String,

        /// Source format ('postman', 'har'). Auto-detected if omitted
        #[arg(long = "from", short = 'f')]
        from: Option<String>,

        /// Output YAML file path (defaults to stdout)
        #[arg(long = "out", short = 'o')]
        out: Option<String>,
    },
}

#[derive(Parser, Debug)]
#[command(author, version, about, subcommand_negates_reqs = true)]
struct Args {
    #[command(subcommand)]
    subcommand: Option<Subcommands>,

    /// Path to the configuration file (.yaml, .json, .toml)
    #[arg(index = 1, required = true)]
    config: Option<String>,

    /// Validate the configuration and dependencies without executing the test
    #[arg(long, short = 'd')]
    dry_run: bool,

    /// Start an internal HTTP mock server based on the configuration
    #[arg(long, short = 'm')]
    mock: bool,

    /// Start the mock server and run the configuration against it
    #[arg(long)]
    mock_run: bool,

    /// Override option values (e.g. -o modules.console.disable=true)
    #[arg(short = 'o', value_name = "key=value")]
    option: Vec<String>,

    /// Export configuration to an external tool format ('k6', 'locust', 'taurus')
    #[arg(long, value_name = "TARGET")]
    export: Option<String>,

    /// Destination file path for exported script (defaults to stdout)
    #[arg(long = "export-out", short = 'e', value_name = "FILE")]
    export_out: Option<String>,

    /// Convenience flag to export directly to a k6 script file
    #[arg(long = "export-k6", value_name = "FILE")]
    export_k6: Option<String>,

    /// Convenience flag to export directly to a Locust locustfile.py
    #[arg(long = "export-locust", value_name = "FILE")]
    export_locust: Option<String>,

    /// Convenience flag to export directly to a canonical Taurus YAML file
    #[arg(long = "export-taurus", value_name = "FILE")]
    export_taurus: Option<String>,

    /// Convenience flag to export directly to a Postman Collection v2.1 JSON file
    #[arg(long = "export-postman", value_name = "FILE")]
    export_postman: Option<String>,

    /// Convenience flag to export directly to a standalone pure Rust Goose script (main.rs)
    #[arg(long = "export-goose", value_name = "FILE")]
    export_goose: Option<String>,

    /// Import configuration from an external format ('postman', 'har', 'openapi')
    #[arg(long = "import", value_name = "FORMAT")]
    import_format: Option<String>,

    /// Destination file path for imported configuration (defaults to stdout)
    #[arg(long = "import-out", value_name = "FILE")]
    import_out: Option<String>,
}

fn yaml_to_json(yaml_val: serde_yaml::Value) -> serde_json::Value {
    match yaml_val {
        serde_yaml::Value::Null => serde_json::Value::Null,
        serde_yaml::Value::Bool(b) => serde_json::Value::Bool(b),
        serde_yaml::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                serde_json::Value::Number(serde_json::Number::from(i))
            } else if let Some(u) = n.as_u64() {
                serde_json::Value::Number(serde_json::Number::from(u))
            } else if let Some(f) = n.as_f64() {
                serde_json::Number::from_f64(f)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null)
            } else {
                serde_json::Value::Null
            }
        }
        serde_yaml::Value::String(s) => serde_json::Value::String(s),
        serde_yaml::Value::Sequence(seq) => {
            serde_json::Value::Array(seq.into_iter().map(yaml_to_json).collect())
        }
        serde_yaml::Value::Mapping(map) => {
            let mut json_map = serde_json::Map::new();
            for (k, v) in map {
                if let Some(k_str) = k.as_str() {
                    json_map.insert(k_str.to_string(), yaml_to_json(v));
                }
            }
            serde_json::Value::Object(json_map)
        }
        serde_yaml::Value::Tagged(tagged) => yaml_to_json(tagged.value),
    }
}

fn toml_to_json(toml_val: toml::Value) -> serde_json::Value {
    match toml_val {
        toml::Value::String(s) => serde_json::Value::String(s),
        toml::Value::Integer(i) => serde_json::Value::Number(serde_json::Number::from(i)),
        toml::Value::Float(f) => serde_json::Number::from_f64(f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        toml::Value::Boolean(b) => serde_json::Value::Bool(b),
        toml::Value::Datetime(d) => serde_json::Value::String(d.to_string()),
        toml::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(toml_to_json).collect())
        }
        toml::Value::Table(table) => {
            let mut map = serde_json::Map::new();
            for (k, v) in table {
                map.insert(k, toml_to_json(v));
            }
            serde_json::Value::Object(map)
        }
    }
}

fn apply_override(
    root: &mut serde_json::Value,
    path_str: &str,
    val_str: &str,
) -> Result<(), String> {
    let parts: Vec<&str> = path_str.split('.').collect();
    let mut current = root;

    for (i, &part) in parts.iter().enumerate() {
        if i == parts.len() - 1 {
            let val = if let Ok(b) = val_str.parse::<bool>() {
                serde_json::Value::Bool(b)
            } else if let Ok(num) = val_str.parse::<i64>() {
                serde_json::Value::Number(serde_json::Number::from(num))
            } else if let Ok(num) = val_str.parse::<f64>() {
                serde_json::Number::from_f64(num)
                    .map(serde_json::Value::Number)
                    .unwrap_or_else(|| serde_json::Value::String(val_str.to_string()))
            } else if let Ok(v) = serde_json::from_str::<serde_json::Value>(val_str) {
                v
            } else {
                serde_json::Value::String(val_str.to_string())
            };

            match current {
                serde_json::Value::Object(map) => {
                    map.insert(part.to_string(), val);
                }
                serde_json::Value::Array(arr) => {
                    if let Ok(idx) = part.parse::<usize>() {
                        if idx >= arr.len() {
                            arr.resize(idx + 1, serde_json::Value::Null);
                        }
                        arr[idx] = val;
                    } else {
                        return Err(format!(
                            "Expected array index but found '{}' at path {}",
                            part, path_str
                        ));
                    }
                }
                _ => {
                    return Err(format!(
                        "Cannot set property of non-object/non-array for path {}",
                        path_str
                    ));
                }
            }
            return Ok(());
        }

        match current {
            serde_json::Value::Object(map) => {
                let next_is_array_idx = parts
                    .get(i + 1)
                    .and_then(|p| p.parse::<usize>().ok())
                    .is_some();
                current = map.entry(part.to_string()).or_insert_with(|| {
                    if next_is_array_idx {
                        serde_json::Value::Array(Vec::new())
                    } else {
                        serde_json::Value::Object(serde_json::Map::new())
                    }
                });
            }
            serde_json::Value::Array(arr) => {
                if let Ok(idx) = part.parse::<usize>() {
                    if idx >= arr.len() {
                        let next_is_array_idx = parts
                            .get(i + 1)
                            .and_then(|p| p.parse::<usize>().ok())
                            .is_some();
                        arr.resize_with(idx + 1, || {
                            if next_is_array_idx {
                                serde_json::Value::Array(Vec::new())
                            } else {
                                serde_json::Value::Object(serde_json::Map::new())
                            }
                        });
                    }
                    current = &mut arr[idx];
                } else {
                    return Err(format!(
                        "Expected array index but found '{}' at path {}",
                        part, path_str
                    ));
                }
            }
            _ => {
                return Err(format!(
                    "Expected object or array at part '{}' for path {}",
                    part, path_str
                ));
            }
        }
    }

    Ok(())
}

fn parse_config_content(
    config_path: &str,
    content: &str,
) -> Result<serde_json::Value, PummelError> {
    if Path::new(config_path)
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("yaml") || ext.eq_ignore_ascii_case("yml"))
    {
        tracing::info!("Parsing YAML config: {}", config_path);
        let yaml_val: serde_yaml::Value =
            serde_yaml::from_str(content).map_err(|e| PummelError::Serde {
                message: e.to_string(),
                file_path: Some(config_path.to_string()),
                source: None,
            })?;
        Ok(yaml_to_json(yaml_val))
    } else if Path::new(config_path)
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    {
        tracing::info!("Parsing JSON config: {}", config_path);
        serde_json::from_str(content).map_err(|e| PummelError::Serde {
            message: e.to_string(),
            file_path: Some(config_path.to_string()),
            source: Some(Box::new(e)),
        })
    } else if Path::new(config_path)
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("toml"))
    {
        tracing::info!("Parsing TOML config: {}", config_path);
        if let Ok(shorthand) = toml::from_str::<ShorthandConfiguration>(content) {
            let normalized = SchemaNormalizer::normalize_shorthand(shorthand);
            serde_json::to_value(&normalized).map_err(|e| PummelError::Serde {
                message: e.to_string(),
                file_path: Some(config_path.to_string()),
                source: Some(Box::new(e)),
            })
        } else {
            let toml_val: toml::Value =
                toml::from_str(content).map_err(|e| PummelError::Serde {
                    message: e.to_string(),
                    file_path: Some(config_path.to_string()),
                    source: Some(Box::new(e)),
                })?;
            Ok(toml_to_json(toml_val))
        }
    } else {
        tracing::error!("Unsupported file format: {}", config_path);
        Err(PummelError::Validation {
            field: "file_extension".to_string(),
            reason: "Unsupported file format. Supported: .yaml, .yml, .json, .toml".to_string(),
        })
    }
}

fn apply_options(json_val: &mut serde_json::Value, options: &[String]) -> bool {
    let mut disable_console = false;
    for opt in options {
        if let Some((path, val)) = opt.split_once('=') {
            let path_trimmed = path.trim();
            let val_trimmed = val.trim();
            if path_trimmed == "modules.console.disable" && val_trimmed == "true" {
                disable_console = true;
            } else if path_trimmed.starts_with("execution")
                || path_trimmed.starts_with("scenarios")
                || path_trimmed.starts_with("reporting")
                || path_trimmed.starts_with("services")
                || path_trimmed.starts_with("api")
            {
                tracing::info!(
                    "Applying config override: {} = {}",
                    path_trimmed,
                    val_trimmed
                );
                if let Err(e) = apply_override(json_val, path_trimmed, val_trimmed) {
                    tracing::warn!("Failed to apply override '{}': {}", opt, e);
                }
            }
        }
    }
    disable_console
}

#[tokio::main]
async fn main() -> Result<(), PummelError> {
    let args = Args::parse();
    if let Err(e) = run_app(args).await {
        eprintln!("{e}");
        std::process::exit(1);
    }
    Ok(())
}

pub(crate) async fn run_app(args: Args) -> Result<(), PummelError> {
    // 1. Process overrides to check if console logging should be disabled
    let mut dummy_val = serde_json::Value::Null;
    let disable_console = apply_options(&mut dummy_val, &args.option);

    // 2. Initialize logging subscriber
    engine::init_logging(disable_console);

    tracing::debug!(
        "CLI flags: dry_run={}, mock={}, mock_run={}, option={:?}",
        args.dry_run,
        args.mock,
        args.mock_run,
        args.option
    );

    // Handle import subcommand
    if let Some(Subcommands::Import { file, from, out }) = args.subcommand {
        let imported_config = pummel::importer::import_file(&file, from.as_deref())?;
        let yaml_output = serde_yaml::to_string(&imported_config)?;
        if let Some(dest) = out {
            fs::write(&dest, yaml_output)?;
            println!("Successfully imported {file} to {dest}");
        } else {
            print!("{yaml_output}");
        }
        return Ok(());
    }

    let config_path = args.config.as_deref().unwrap();

    // Handle --import flag
    if let Some(ref format) = args.import_format {
        let imported_config = pummel::importer::import_file(config_path, Some(format))?;
        let yaml_output = serde_yaml::to_string(&imported_config)?;
        if let Some(ref dest) = args.import_out {
            fs::write(dest, yaml_output)?;
            println!("Successfully imported {config_path} to {dest}");
        } else {
            print!("{yaml_output}");
        }
        return Ok(());
    }

    let content = fs::read_to_string(config_path)?;
    let mut json_val = parse_config_content(config_path, &content)?;

    // Apply configuration-level overrides
    apply_options(&mut json_val, &args.option);

    // Deserialize into target strongly typed Configuration
    let config: Configuration =
        serde_json::from_value(json_val).map_err(|e| PummelError::Serde {
            message: e.to_string(),
            file_path: Some(config_path.to_string()),
            source: Some(Box::new(e)),
        })?;

    // Handle export to external formats (e.g. k6, locust, taurus, postman, goose)
    if args.export.is_some()
        || args.export_k6.is_some()
        || args.export_locust.is_some()
        || args.export_taurus.is_some()
        || args.export_postman.is_some()
        || args.export_goose.is_some()
    {
        let (target, out_path) = if let Some(ref path) = args.export_k6 {
            ("k6", Some(path))
        } else if let Some(ref path) = args.export_locust {
            ("locust", Some(path))
        } else if let Some(ref path) = args.export_taurus {
            ("taurus", Some(path))
        } else if let Some(ref path) = args.export_postman {
            ("postman", Some(path))
        } else if let Some(ref path) = args.export_goose {
            ("goose", Some(path))
        } else {
            (
                args.export.as_deref().unwrap_or("k6"),
                args.export_out.as_ref(),
            )
        };

        let script = pummel::exporter::export(&config, target)?;

        if let Some(dest) = out_path {
            fs::write(dest, script)?;
            println!("Successfully exported {target} script to {dest}");
        } else {
            print!("{script}");
        }
        return Ok(());
    }

    if args.dry_run {
        let summary = engine::validation::validate_config(&config).await;
        if !disable_console {
            summary.report();
        }
        if summary.is_valid() {
            return Ok(());
        }
        return Err(PummelError::Validation {
            field: "config".to_string(),
            reason: "Dry run validation failed".to_string(),
        });
    }

    if args.mock {
        #[cfg(feature = "grpc")]
        {
            let _ = engine::mock::start_mock_server(config).await?;
            println!("Mock server is running. Press Ctrl+C to stop.");
            loop {
                tokio::time::sleep(std::time::Duration::from_hours(1)).await;
            }
        }
        #[cfg(not(feature = "grpc"))]
        {
            let _ = config;
            return Err(PummelError::Internal(
                "Mock server requires the 'grpc' feature".to_string(),
            ));
        }
    }

    if args.mock_run {
        #[cfg(feature = "grpc")]
        {
            println!("Starting integrated mock run...");
            let addrs = engine::mock::start_mock_server(config.clone()).await?;
            let host_override = format!("http://{}", addrs.http_addr);

            let attack =
                pummel::translator::StateTranslator::translate(&config, Some(host_override), None)
                    .await?;
            let _stats = attack
                .execute()
                .await
                .map_err(|e| PummelError::Goose(Box::new(e)))?;

            println!("Integrated mock run complete.");
            return Ok(());
        }
        #[cfg(not(feature = "grpc"))]
        {
            let _ = config;
            return Err(PummelError::Internal(
                "Mock run requires the 'grpc' feature".to_string(),
            ));
        }
    }

    engine::goose::run_attack(config).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_args_parsing_defaults() {
        let args = Args::try_parse_from(["pummel", "test.yaml"]).expect("Failed to parse args");
        assert_eq!(args.config.as_deref(), Some("test.yaml"));
        assert!(!args.dry_run);
        assert!(!args.mock);
        assert!(!args.mock_run);
        assert!(args.option.is_empty());
    }

    #[test]
    fn test_args_parsing_all_flags() {
        let args = Args::try_parse_from([
            "pummel",
            "scenario.json",
            "-d",
            "-m",
            "--mock-run",
            "-o",
            "modules.console.disable=true",
            "-o",
            "execution.0.concurrency=50",
        ])
        .expect("Failed to parse args");
        assert_eq!(args.config.as_deref(), Some("scenario.json"));
        assert!(args.dry_run);
        assert!(args.mock);
        assert!(args.mock_run);
        assert_eq!(args.option.len(), 2);
    }

    #[test]
    fn test_args_parsing_missing_config_fails() {
        let res = Args::try_parse_from(["pummel"]);
        assert!(res.is_err());
    }

    #[test]
    fn test_args_parsing_import_subcommand() {
        let args = Args::try_parse_from([
            "pummel",
            "import",
            "collection.json",
            "--from",
            "postman",
            "-o",
            "pummel.yaml",
        ])
        .expect("Failed to parse import subcommand");
        assert_eq!(
            args.subcommand,
            Some(Subcommands::Import {
                file: "collection.json".to_string(),
                from: Some("postman".to_string()),
                out: Some("pummel.yaml".to_string()),
            })
        );
    }

    #[test]
    fn test_args_parsing_import_flag() {
        let args = Args::try_parse_from([
            "pummel",
            "recording.har",
            "--import",
            "har",
            "--import-out",
            "pummel.yaml",
        ])
        .expect("Failed to parse import flag");
        assert_eq!(args.config.as_deref(), Some("recording.har"));
        assert_eq!(args.import_format.as_deref(), Some("har"));
        assert_eq!(args.import_out.as_deref(), Some("pummel.yaml"));
    }

    #[test]
    fn test_args_parsing_export() {
        let args = Args::try_parse_from([
            "pummel",
            "scenario.yaml",
            "--export",
            "k6",
            "--export-out",
            "test_script.js",
        ])
        .expect("Failed to parse export args");
        assert_eq!(args.export.as_deref(), Some("k6"));
        assert_eq!(args.export_out.as_deref(), Some("test_script.js"));
    }

    #[test]
    fn test_args_parsing_export_k6_alias() {
        let args = Args::try_parse_from(["pummel", "scenario.yaml", "--export-k6", "out.js"])
            .expect("Failed to parse export-k6 alias");
        assert_eq!(args.export_k6.as_deref(), Some("out.js"));
    }

    #[test]
    fn test_args_parsing_export_locust_alias() {
        let args = Args::try_parse_from([
            "pummel",
            "scenario.yaml",
            "--export-locust",
            "locustfile.py",
        ])
        .expect("Failed to parse export-locust alias");
        assert_eq!(args.export_locust.as_deref(), Some("locustfile.py"));
    }

    #[test]
    fn test_args_parsing_export_taurus_alias() {
        let args =
            Args::try_parse_from(["pummel", "scenario.yaml", "--export-taurus", "clean.yaml"])
                .expect("Failed to parse export-taurus alias");
        assert_eq!(args.export_taurus.as_deref(), Some("clean.yaml"));
    }

    #[test]
    fn test_args_parsing_export_postman_alias() {
        let args = Args::try_parse_from([
            "pummel",
            "scenario.yaml",
            "--export-postman",
            "collection.json",
        ])
        .expect("Failed to parse export-postman alias");
        assert_eq!(args.export_postman.as_deref(), Some("collection.json"));
    }

    #[test]
    fn test_args_parsing_export_goose_alias() {
        let args = Args::try_parse_from(["pummel", "scenario.yaml", "--export-goose", "main.rs"])
            .expect("Failed to parse export-goose alias");
        assert_eq!(args.export_goose.as_deref(), Some("main.rs"));
    }

    #[test]
    fn test_apply_override_primitive_types() {
        let mut root = serde_json::json!({});

        apply_override(&mut root, "flag_bool", "true").expect("override bool");
        assert_eq!(root["flag_bool"], serde_json::json!(true));

        apply_override(&mut root, "flag_false", "false").expect("override bool false");
        assert_eq!(root["flag_false"], serde_json::json!(false));

        apply_override(&mut root, "count_int", "123").expect("override int");
        assert_eq!(root["count_int"], serde_json::json!(123));

        apply_override(&mut root, "ratio_float", "12.5").expect("override float");
        assert_eq!(root["ratio_float"], serde_json::json!(12.5));

        apply_override(&mut root, "text", "hello-world").expect("override string");
        assert_eq!(root["text"], serde_json::json!("hello-world"));

        apply_override(&mut root, "json_obj", r#"{"nested": "value"}"#).expect("override json obj");
        assert_eq!(root["json_obj"]["nested"], serde_json::json!("value"));

        apply_override(&mut root, "json_arr", "[1, 2, 3]").expect("override json arr");
        assert_eq!(root["json_arr"], serde_json::json!([1, 2, 3]));
    }

    #[test]
    fn test_apply_override_nested_and_array() {
        let mut root = serde_json::json!({});

        apply_override(&mut root, "execution.0.concurrency", "25").expect("override array index 0");
        assert_eq!(root["execution"][0]["concurrency"], serde_json::json!(25));

        // Test array auto-expansion
        apply_override(&mut root, "execution.2.concurrency", "100")
            .expect("override array index 2");
        assert_eq!(root["execution"][2]["concurrency"], serde_json::json!(100));

        // Test replacing array element directly
        apply_override(&mut root, "items.0", "first").expect("override array element");
        apply_override(&mut root, "items.1", "second").expect("override array element");
        assert_eq!(root["items"][0], serde_json::json!("first"));
        assert_eq!(root["items"][1], serde_json::json!("second"));
    }

    #[test]
    fn test_apply_override_errors() {
        let mut root = serde_json::json!({"items": [1, 2, 3]});

        // Non-numeric index on array
        let err1 = apply_override(&mut root, "items.nonnum.prop", "val");
        assert!(err1.is_err());

        let err2 = apply_override(&mut root, "items.nonnum", "val");
        assert!(err2.is_err());

        // Cannot set property of primitive non-object
        let mut primitive = serde_json::json!("a-string");
        let err3 = apply_override(&mut primitive, "prop", "val");
        assert!(err3.is_err());

        let err4 = apply_override(&mut primitive, "nested.prop", "val");
        assert!(err4.is_err());
    }

    #[test]
    fn test_yaml_to_json_conversion() {
        let yaml_str = r#"
null_val: null
bool_val: true
int_val: 42
float_val: 2.718
str_val: "pummel"
list_val:
  - 1
  - 2
nested:
  key: "value"
"#;
        let yaml_val: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
        let json_val = yaml_to_json(yaml_val);

        assert_eq!(json_val["null_val"], serde_json::Value::Null);
        assert_eq!(json_val["bool_val"], serde_json::json!(true));
        assert_eq!(json_val["int_val"], serde_json::json!(42));
        assert_eq!(json_val["str_val"], serde_json::json!("pummel"));
        assert_eq!(json_val["list_val"][0], serde_json::json!(1));
        assert_eq!(json_val["nested"]["key"], serde_json::json!("value"));
    }

    #[test]
    fn test_toml_to_json_conversion() {
        let toml_str = r#"
title = "TOML Test"
count = 100
ratio = 12.5
enabled = true
numbers = [1, 2, 3]

[section]
inner = "data"
"#;
        let toml_val: toml::Value = toml::from_str(toml_str).unwrap();
        let json_val = toml_to_json(toml_val);

        assert_eq!(json_val["title"], serde_json::json!("TOML Test"));
        assert_eq!(json_val["count"], serde_json::json!(100));
        assert_eq!(json_val["enabled"], serde_json::json!(true));
        assert_eq!(json_val["numbers"][1], serde_json::json!(2));
        assert_eq!(json_val["section"]["inner"], serde_json::json!("data"));
    }

    #[test]
    fn test_apply_options() {
        let mut json_val = serde_json::json!({});
        let options = vec![
            "modules.console.disable=true".to_string(),
            "execution.0.concurrency=50".to_string(),
            "scenarios.default.timeout=30s".to_string(),
            "unrelated.setting=ignore".to_string(),
        ];

        let disable_console = apply_options(&mut json_val, &options);
        assert!(disable_console);
        assert_eq!(
            json_val["execution"][0]["concurrency"],
            serde_json::json!(50)
        );
        assert_eq!(
            json_val["scenarios"]["default"]["timeout"],
            serde_json::json!("30s")
        );
        assert!(json_val.get("unrelated").is_none());
    }

    #[test]
    fn test_parse_config_content_yaml_and_yml() {
        let yaml_str = "execution:\n  - concurrency: 10\n";
        let res1 = parse_config_content("config.yaml", yaml_str).expect("parse yaml");
        assert_eq!(res1["execution"][0]["concurrency"], serde_json::json!(10));

        let res2 = parse_config_content("config.yml", yaml_str).expect("parse yml");
        assert_eq!(res2["execution"][0]["concurrency"], serde_json::json!(10));
    }

    #[test]
    fn test_parse_config_content_json() {
        let json_str = r#"{"execution": [{"concurrency": 20}]}"#;
        let res = parse_config_content("config.json", json_str).expect("parse json");
        assert_eq!(res["execution"][0]["concurrency"], serde_json::json!(20));
    }

    #[test]
    fn test_parse_config_content_toml() {
        let toml_str = r#"
[execution]
concurrency = 30
"#;
        let res = parse_config_content("config.toml", toml_str).expect("parse toml");
        assert_eq!(res["execution"]["concurrency"], serde_json::json!(30));
    }

    #[test]
    fn test_parse_config_content_errors() {
        // Unsupported extension
        let err_ext = parse_config_content("config.xml", "<root/>");
        assert!(err_ext.is_err());

        // Malformed YAML
        let err_yaml = parse_config_content("config.yaml", ": invalid yaml");
        assert!(err_yaml.is_err());

        // Malformed JSON
        let err_json = parse_config_content("config.json", "{ invalid json }");
        assert!(err_json.is_err());

        // Malformed TOML
        let err_toml = parse_config_content("config.toml", "invalid toml = =");
        assert!(err_toml.is_err());
    }

    #[tokio::test]
    async fn test_run_app_dry_run_success_and_failure() {
        let dir = tempfile::tempdir().unwrap();
        let valid_path = dir.path().join("valid.yaml");
        let valid_yaml = r#"
execution:
  - concurrency: 1
    ramp-up: 1s
    hold-for: 1s
    scenario: default
scenarios:
  default:
    requests:
      - https://example.com/health
"#;
        fs::write(&valid_path, valid_yaml).unwrap();

        let args = Args::try_parse_from([
            "pummel",
            valid_path.to_str().unwrap(),
            "--dry-run",
            "-o",
            "modules.console.disable=true",
        ])
        .unwrap();

        let res = run_app(args).await;
        assert!(res.is_ok());

        // Invalid config (missing data-source file)
        let invalid_path = dir.path().join("invalid.yaml");
        let invalid_yaml = r#"
scenarios:
  default:
    data-sources:
      - non_existent_file.csv
    requests:
      - https://example.com/health
"#;
        fs::write(&invalid_path, invalid_yaml).unwrap();

        let args_invalid = Args::try_parse_from([
            "pummel",
            invalid_path.to_str().unwrap(),
            "--dry-run",
            "-o",
            "modules.console.disable=true",
        ])
        .unwrap();

        let res_invalid = run_app(args_invalid).await;
        assert!(res_invalid.is_err());
    }

    #[tokio::test]
    async fn test_run_app_import_subcommand_and_flag() {
        let dir = tempfile::tempdir().unwrap();
        let openapi_path = dir.path().join("openapi.yaml");
        let openapi_yaml = r#"
openapi: 3.0.0
info:
  title: Import Test
paths:
  /test:
    get:
      responses:
        "200":
          description: OK
"#;
        fs::write(&openapi_path, openapi_yaml).unwrap();

        // 1. Subcommand Import
        let out_sub = dir.path().join("imported_sub.yaml");
        let args_sub = Args::try_parse_from([
            "pummel",
            "import",
            openapi_path.to_str().unwrap(),
            "-o",
            out_sub.to_str().unwrap(),
        ])
        .unwrap();

        let res_sub = run_app(args_sub).await;
        assert!(res_sub.is_ok());
        assert!(out_sub.exists());

        // 2. Flag Import
        let out_flag = dir.path().join("imported_flag.yaml");
        let args_flag = Args::try_parse_from([
            "pummel",
            openapi_path.to_str().unwrap(),
            "--import",
            "openapi",
            "--import-out",
            out_flag.to_str().unwrap(),
        ])
        .unwrap();

        let res_flag = run_app(args_flag).await;
        assert!(res_flag.is_ok());
        assert!(out_flag.exists());
    }

    #[tokio::test]
    async fn test_run_app_export_all_targets() {
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("pummel.yaml");
        let yaml = r#"
execution:
  - scenario: quick
    concurrency: 1
    ramp-up: 0s
    hold-for: 1s
scenarios:
  quick:
    requests:
      - https://example.com/api
"#;
        fs::write(&config_path, yaml).unwrap();

        let k6_out = dir.path().join("test.js");
        let args_k6 = Args::try_parse_from([
            "pummel",
            config_path.to_str().unwrap(),
            "--export-k6",
            k6_out.to_str().unwrap(),
        ])
        .unwrap();
        assert!(run_app(args_k6).await.is_ok());
        assert!(k6_out.exists());

        let locust_out = dir.path().join("locustfile.py");
        let args_locust = Args::try_parse_from([
            "pummel",
            config_path.to_str().unwrap(),
            "--export-locust",
            locust_out.to_str().unwrap(),
        ])
        .unwrap();
        assert!(run_app(args_locust).await.is_ok());
        assert!(locust_out.exists());

        let taurus_out = dir.path().join("taurus.yaml");
        let args_taurus = Args::try_parse_from([
            "pummel",
            config_path.to_str().unwrap(),
            "--export-taurus",
            taurus_out.to_str().unwrap(),
        ])
        .unwrap();
        assert!(run_app(args_taurus).await.is_ok());
        assert!(taurus_out.exists());

        let postman_out = dir.path().join("postman.json");
        let args_postman = Args::try_parse_from([
            "pummel",
            config_path.to_str().unwrap(),
            "--export-postman",
            postman_out.to_str().unwrap(),
        ])
        .unwrap();
        assert!(run_app(args_postman).await.is_ok());
        assert!(postman_out.exists());

        let goose_out = dir.path().join("main.rs");
        let args_goose = Args::try_parse_from([
            "pummel",
            config_path.to_str().unwrap(),
            "--export-goose",
            goose_out.to_str().unwrap(),
        ])
        .unwrap();
        assert!(run_app(args_goose).await.is_ok());
        assert!(goose_out.exists());
    }

    #[tokio::test]
    async fn test_run_app_error_paths() {
        let args_missing =
            Args::try_parse_from(["pummel", "nonexistent_config_12345.yaml"]).unwrap();
        let res_missing = run_app(args_missing).await;
        assert!(res_missing.is_err());
        assert!(matches!(res_missing.unwrap_err(), PummelError::Io { .. }));

        let dir = tempfile::tempdir().unwrap();
        let bad_path = dir.path().join("bad.yaml");
        fs::write(&bad_path, "not: a: valid: yaml: config:").unwrap();
        let args_bad = Args::try_parse_from(["pummel", bad_path.to_str().unwrap()]).unwrap();
        let res_bad = run_app(args_bad).await;
        assert!(res_bad.is_err());
    }

    #[test]
    fn test_parse_config_content_toml_shorthand() {
        let toml_content = r#"
[execution]
concurrency = 5
scenario = "quick"

[scenarios.quick]
requests = ["http://localhost:8080/"]
"#;
        let res = parse_config_content("test.toml", toml_content);
        assert!(res.is_ok());
        let val = res.unwrap();
        assert_eq!(val["execution"][0]["concurrency"], 5);
    }

    #[test]
    fn test_yaml_to_json_tagged_and_u64() {
        let yaml_tagged = "!tag 'custom value'";
        let yaml_val: serde_yaml::Value = serde_yaml::from_str(yaml_tagged).unwrap();
        let json_val = yaml_to_json(yaml_val);
        assert_eq!(json_val, "custom value");

        let yaml_u64 = format!("num: {}", u64::MAX);
        let yaml_val: serde_yaml::Value = serde_yaml::from_str(&yaml_u64).unwrap();
        let json_val = yaml_to_json(yaml_val);
        assert_eq!(json_val["num"], u64::MAX);
    }

    #[test]
    fn test_toml_to_json_datetime() {
        let toml_str = "date = 1979-05-27T07:32:00Z";
        let toml_val: toml::Value = toml::from_str(toml_str).unwrap();
        let json_val = toml_to_json(toml_val);
        assert_eq!(json_val["date"], "1979-05-27T07:32:00Z");
    }

    #[test]
    fn test_apply_override_nested_array_creation() {
        let mut root = serde_json::json!({"matrix": []});
        let res = apply_override(&mut root, "matrix.0.0", "nested_val");
        assert!(res.is_ok());
        assert_eq!(root["matrix"][0][0], "nested_val");
    }

    #[test]
    fn test_apply_options_invalid_path_warning() {
        let mut root = serde_json::json!({"val": 42});
        let options = vec!["val.foo.bar=123".to_string()];
        let disable_console = apply_options(&mut root, &options);
        assert!(!disable_console);
    }

    #[tokio::test]
    async fn test_run_app_export_stdout() {
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("pummel.yaml");
        let yaml = r#"
execution: []
scenarios:
  quick:
    requests:
      - https://example.com/api
"#;
        fs::write(&config_path, yaml).unwrap();

        let args_export =
            Args::try_parse_from(["pummel", config_path.to_str().unwrap(), "--export", "k6"])
                .unwrap();
        assert!(run_app(args_export).await.is_ok());
    }

    #[tokio::test]
    async fn test_run_app_import_stdout() {
        let dir = tempfile::tempdir().unwrap();
        let openapi_path = dir.path().join("openapi.yaml");
        let openapi_yaml = r#"
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /hello:
    get:
      responses:
        '200':
          description: OK
"#;
        fs::write(&openapi_path, openapi_yaml).unwrap();

        // 1. Subcommand import without out
        let args_sub = Args::try_parse_from([
            "pummel",
            "import",
            openapi_path.to_str().unwrap(),
            "--from",
            "openapi",
        ])
        .unwrap();
        assert!(run_app(args_sub).await.is_ok());

        // 2. Flag import without import-out
        let args_flag = Args::try_parse_from([
            "pummel",
            openapi_path.to_str().unwrap(),
            "--import",
            "openapi",
        ])
        .unwrap();
        assert!(run_app(args_flag).await.is_ok());
    }

    #[tokio::test]
    async fn test_run_app_dry_run_console_report() {
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("pummel.yaml");
        let yaml = r#"
execution:
  - concurrency: 1
    ramp-up: 0s
    hold-for: 1s
    scenario: quick
scenarios:
  quick:
    requests:
      - https://example.com/api
"#;
        fs::write(&config_path, yaml).unwrap();

        let args_dry =
            Args::try_parse_from(["pummel", config_path.to_str().unwrap(), "--dry-run"]).unwrap();
        assert!(run_app(args_dry).await.is_ok());
    }

    #[tokio::test]
    async fn test_run_app_mock_flags() {
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("pummel.yaml");
        let yaml = r#"
execution: []
scenarios:
  quick:
    requests:
      - https://example.com/api
"#;
        fs::write(&config_path, yaml).unwrap();

        #[cfg(not(feature = "grpc"))]
        {
            let args_mock =
                Args::try_parse_from(["pummel", config_path.to_str().unwrap(), "--mock"]).unwrap();
            let res = run_app(args_mock).await;
            assert!(matches!(res, Err(PummelError::Internal(msg)) if msg.contains("grpc")));

            let args_mock_run =
                Args::try_parse_from(["pummel", config_path.to_str().unwrap(), "--mock-run"])
                    .unwrap();
            let res_run = run_app(args_mock_run).await;
            assert!(matches!(res_run, Err(PummelError::Internal(msg)) if msg.contains("grpc")));
        }
    }
}
