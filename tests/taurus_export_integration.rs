use pummel::exporter::export_taurus;
use pummel::normalizer::{SchemaNormalizer, ShorthandConfiguration};
use pummel::parser::json::JsonParser;
use pummel::parser::yaml::YamlParser;
use std::io::Write;
use tempfile::NamedTempFile;

#[test]
fn test_export_taurus_from_yaml() {
    let yaml = r#"
execution:
  - concurrency: 15
    ramp-up: 5s
    hold-for: 45s
    scenario: checkout

scenarios:
  checkout:
    think-time: 200ms
    requests:
      - url: https://api.example.com/checkout
        method: POST
        body: '{"item": 1}'
        assert:
          - contains: ["200"]
            subject: http-code
"#;

    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "{yaml}").unwrap();

    let config = YamlParser::parse(file.path()).unwrap();
    let exported_yaml = export_taurus(&config).unwrap();

    assert!(exported_yaml.contains("# Canonical Taurus YAML Configuration"));
    assert!(exported_yaml.contains("concurrency: 15"));
    assert!(exported_yaml.contains("scenario: checkout"));
    assert!(exported_yaml.contains("https://api.example.com/checkout"));

    // Verify the exported YAML can be re-parsed cleanly by YamlParser
    let mut re_file = NamedTempFile::new().unwrap();
    writeln!(re_file, "{exported_yaml}").unwrap();
    let re_config = YamlParser::parse(re_file.path()).unwrap();
    assert_eq!(re_config.execution.len(), 1);
    assert_eq!(re_config.execution[0].concurrency, 15);
}

#[test]
fn test_export_taurus_from_json() {
    let json = r#"
{
  "execution": [{
    "concurrency": 10,
    "ramp-up": "5s",
    "hold-for": "30s",
    "scenario": "basic"
  }],
  "scenarios": {
    "basic": {
      "requests": [
        "https://example.com/health"
      ]
    }
  }
}
"#;

    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "{json}").unwrap();

    let config = JsonParser::parse(file.path()).unwrap();
    let exported_yaml = export_taurus(&config).unwrap();

    assert!(exported_yaml.contains("concurrency: 10"));
    assert!(exported_yaml.contains("https://example.com/health"));
}

#[test]
fn test_export_taurus_from_shorthand_toml() {
    let toml = r#"
[execution]
concurrency = 5
ramp-up = "2s"
hold-for = "10s"
scenario = "auth.profile"

[scenarios]
auth = { requests = ["https://example.com/login"] }
"auth.profile" = { requests = ["https://example.com/profile"] }
"#;

    let shorthand: ShorthandConfiguration = toml::from_str(toml).unwrap();
    let normalized = SchemaNormalizer::normalize_shorthand(shorthand);
    let exported_yaml = export_taurus(&normalized).unwrap();

    assert!(exported_yaml.contains("concurrency: 5"));
    assert!(exported_yaml.contains("https://example.com/login"));
    assert!(exported_yaml.contains("https://example.com/profile"));
}
