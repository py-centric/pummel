use pummel::exporter::export_locust;
use pummel::parser::yaml::YamlParser;
use std::io::Write;
use tempfile::NamedTempFile;

#[test]
fn test_export_basic_yaml_to_locust() {
    let yaml = r#"
execution:
  - concurrency: 30
    ramp-up: 10s
    hold-for: 2m
    scenario: web-flow

scenarios:
  web-flow:
    think-time: 300ms
    headers:
      Authorization: Bearer ${env.LOCUST_TOKEN}
    requests:
      - url: https://api.example.com/v1/health
      - url: https://api.example.com/v1/users
        method: POST
        label: create-user
        body: '{"username": "locust_user"}'
        timeout: 5s
        assert:
          - contains: ["201"]
            subject: http-code
          - contains: ["locust_user"]
            subject: body
        extract-jsonpath:
          user_id: $.id
      - url: https://api.example.com/v1/users/${user_id}
        method: GET
        label: get-user
        assert:
          - contains: ["fatal"]
            subject: body
            not: true
"#;

    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "{yaml}").unwrap();

    let config = YamlParser::parse(file.path()).unwrap();
    let locust_script = export_locust(&config);

    // Verify imports
    assert!(
        locust_script
            .contains("from locust import HttpUser, task, between, constant, LoadTestShape")
    );

    // Verify class definition and wait_time
    assert!(locust_script.contains("class PummelUser(HttpUser):"));
    assert!(locust_script.contains("wait_time = constant(0.30)"));

    // Verify task method
    assert!(locust_script.contains("def run_web_flow(self):"));

    // Verify headers and environment variable interpolation
    assert!(
        locust_script
            .contains("\"Authorization\": f\"Bearer {os.environ.get('LOCUST_TOKEN', '')}\"")
    );

    // Verify requests
    assert!(locust_script.contains("self.client.get(\"https://api.example.com/v1/health\""));
    assert!(locust_script.contains("self.client.post(\"https://api.example.com/v1/users\""));
    assert!(locust_script.contains("name=\"create-user\""));
    assert!(locust_script.contains("timeout=5.00"));

    // Verify assertions
    assert!(locust_script.contains("res_2.status_code != 201"));
    assert!(locust_script.contains("\"locust_user\" not in res_2.text"));
    assert!(locust_script.contains("\"fatal\" in res_3.text"));

    // Verify extractions
    assert!(locust_script.contains("vars['user_id'] = res_2.json().get('id')"));
    assert!(locust_script.contains("https://api.example.com/v1/users/{vars.get('user_id', '')}"));

    // Verify LoadTestShape
    assert!(locust_script.contains("class StagesShape(LoadTestShape):"));
    assert!(locust_script.contains("{\"duration\": 10, \"users\": 30, \"spawn_rate\": 3}"));
    assert!(locust_script.contains("{\"duration\": 130, \"users\": 30, \"spawn_rate\": 3}"));
    assert!(locust_script.contains("{\"duration\": 135, \"users\": 0, \"spawn_rate\": 3}"));
}
