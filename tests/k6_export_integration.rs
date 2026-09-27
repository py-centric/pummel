use pummel::exporter::export_k6;
use pummel::parser::yaml::YamlParser;
use std::io::Write;
use tempfile::NamedTempFile;

#[test]
fn test_export_basic_yaml_to_k6() {
    let yaml = r#"
execution:
  - concurrency: 25
    ramp-up: 10s
    hold-for: 1m
    scenario: basic-test

scenarios:
  basic-test:
    think-time: 250ms
    headers:
      Authorization: Bearer ${env.AUTH_TOKEN}
    requests:
      - url: https://api.example.com/health
      - url: https://api.example.com/items
        method: POST
        label: create-item
        body: '{"name": "widget"}'
        timeout: 5s
        assert:
          - contains: ["201"]
            subject: http-code
          - contains: ["widget"]
            subject: body
        extract-jsonpath:
          item_id: $.id
      - url: https://api.example.com/items/${item_id}
        method: GET
        label: get-item
        assert:
          - contains: ["error"]
            subject: body
            not: true
"#;

    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "{yaml}").unwrap();

    let config = YamlParser::parse(file.path()).unwrap();
    let k6_script = export_k6(&config);

    // Verify imports
    assert!(k6_script.contains("import http from 'k6/http';"));
    assert!(k6_script.contains("import { check, sleep } from 'k6';"));

    // Verify stages
    assert!(k6_script.contains("duration: '10s', target: 25"));
    assert!(k6_script.contains("duration: '1m', target: 25"));
    assert!(k6_script.contains("duration: '5s', target: 0"));

    // Verify headers and environment variable interpolation
    assert!(k6_script.contains("'Authorization': `Bearer ${__ENV.AUTH_TOKEN || ''}`"));

    // Verify requests
    assert!(k6_script.contains("http.get(`https://api.example.com/health`"));
    assert!(k6_script.contains("http.post(`https://api.example.com/items`"));
    assert!(k6_script.contains("tags: { name: 'create-item' }"));
    assert!(k6_script.contains("timeout: '5s'"));

    // Verify assertions
    assert!(k6_script.contains("r.status === 201"));
    assert!(k6_script.contains("r.body && r.body.includes('widget')"));
    assert!(k6_script.contains("r.body && !r.body.includes('error')"));

    // Verify extractions and interpolation of extracted variables
    assert!(k6_script.contains("vars['item_id'] = res_2.json('id');"));
    assert!(k6_script.contains("https://api.example.com/items/${vars['item_id'] || ''}"));

    // Verify think time
    assert!(k6_script.contains("sleep(0.25);"));
}

#[test]
fn test_export_sla_thresholds_to_k6() {
    let yaml = r#"
execution:
  - concurrency: 5
    ramp-up: 0s
    hold-for: 10s
    scenario: sla-check

scenarios:
  sla-check:
    requests:
      - url: https://api.example.com/ping

reporting:
  - module: junit-xml
    failed-threshold: 0.05
    sla:
      - metric: avg-response-time
        threshold: 200.0
      - metric: p95-response-time
        threshold: 500.0
      - metric: fail-rate
        threshold: 0.01
      - metric: throughput
        threshold: 50.0
"#;

    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "{yaml}").unwrap();

    let config = YamlParser::parse(file.path()).unwrap();
    let k6_script = export_k6(&config);

    // Verify thresholds
    assert!(k6_script.contains("'http_req_duration': ['avg<200', 'p(95)<500']"));
    assert!(k6_script.contains("'http_req_failed': ['rate<0.05', 'rate<0.01']"));
    assert!(k6_script.contains("'http_reqs': ['rate>50']"));
}

#[test]
fn test_export_all_http_methods() {
    let yaml = r#"
execution:
  - concurrency: 1
    ramp-up: 1s
    hold-for: 2s
    scenario: methods

scenarios:
  methods:
    requests:
      - url: https://example.com/get
        method: GET
      - url: https://example.com/post
        method: POST
        body: '{"a": 1}'
      - url: https://example.com/put
        method: PUT
        body: '{"a": 2}'
      - url: https://example.com/delete
        method: DELETE
      - url: https://example.com/patch
        method: PATCH
        body: '{"a": 3}'
      - url: https://example.com/head
        method: HEAD
"#;

    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "{yaml}").unwrap();

    let config = YamlParser::parse(file.path()).unwrap();
    let k6_script = export_k6(&config);

    assert!(k6_script.contains("http.get(`https://example.com/get`"));
    assert!(k6_script.contains("http.post(`https://example.com/post`, `{\"a\": 1}`,"));
    assert!(k6_script.contains("http.put(`https://example.com/put`, `{\"a\": 2}`,"));
    assert!(k6_script.contains("http.del(`https://example.com/delete`, null,"));
    assert!(k6_script.contains("http.patch(`https://example.com/patch`, `{\"a\": 3}`,"));
    assert!(k6_script.contains("http.request('HEAD', `https://example.com/head`, null,"));
}
