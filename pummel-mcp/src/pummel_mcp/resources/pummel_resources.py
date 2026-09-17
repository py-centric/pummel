"""MCP Resource definitions for Pummel scenario templates and documentation."""

from __future__ import annotations

RESOURCES = {
    "pummel://templates/smoke": {
        "name": "Pummel Smoke Test Scenario Template",
        "description": "Minimal configuration for rapid health and sanity checking",
        "mimeType": "text/yaml",
        "content": """# Smoke Test Scenario Template
execution:
- concurrency: 1
  ramp-up: 1s
  hold-for: 10s
  scenario: smoke

scenarios:
  smoke:
    requests:
    - url: "http://localhost:8080/health"
      method: GET
      label: health
      assert:
      - contains: ["200"]
        subject: http-code

reporting:
- module: console
""",
    },
    "pummel://templates/load": {
        "name": "Pummel Load Test Scenario Template",
        "description": "Production load test with ramp-up, throughput pacing, and SLA evaluation",
        "mimeType": "text/yaml",
        "content": """# Standard Load Test Scenario Template
execution:
- concurrency: 25
  ramp-up: 15s
  hold-for: 2m
  throughput: 100
  scenario: standard-load

scenarios:
  standard-load:
    requests:
    - url: "http://localhost:8080/api/users"
      method: GET
      label: list_users
      think-time: "50ms"
      assert:
      - contains: ["200"]
        subject: http-code
    - url: "http://localhost:8080/api/users"
      method: POST
      label: create_user
      headers:
        Content-Type: "application/json"
      body: '{"username":"user_${uuid}","query":"${faker.word}"}'
      assert:
      - contains: ["201", "200"]
        subject: http-code

reporting:
- module: console
- module: junit-xml
  filename: load_results.xml
  sla:
  - metric: avg-response-time
    threshold: 500ms
    action: continue
  - metric: fail-ratio
    threshold: 1%
    action: stop
""",
    },
    "pummel://templates/stress": {
        "name": "Pummel Stress Test Scenario Template",
        "description": "High-concurrency stress test designed to determine system breaking points",
        "mimeType": "text/yaml",
        "content": """# Stress Test Scenario Template
execution:
- concurrency: 200
  ramp-up: 30s
  hold-for: 5m
  scenario: stress-peak

scenarios:
  stress-peak:
    requests:
    - url: "http://localhost:8080/api/search?q=${faker.word}"
      method: GET
      label: search_stress
      timeout: "3s"

reporting:
- module: console
- module: junit-xml
  filename: stress_report.xml
  sla:
  - metric: avg-response-time
    threshold: 1500ms
    action: stop
""",
    },
    "pummel://templates/spike": {
        "name": "Pummel Spike Test Scenario Template",
        "description": "Sudden traffic surge test for elasticity and autoscaling verification",
        "mimeType": "text/yaml",
        "content": """# Spike Test Scenario Template
execution:
- concurrency: 150
  ramp-up: 3s
  hold-for: 45s
  scenario: traffic-spike

scenarios:
  traffic-spike:
    requests:
    - url: "http://localhost:8080/checkout"
      method: GET
      label: checkout_surge

reporting:
- module: console
""",
    },
    "pummel://docs/syntax": {
        "name": "Pummel Configuration Syntax Reference",
        "description": "Comprehensive YAML schema reference for Pummel test scenarios",
        "mimeType": "text/markdown",
        "content": """# Pummel YAML Configuration Reference

Pummel executes Taurus-compatible YAML, JSON, or TOML load testing scenarios using the Goose load engine.

## 1. Execution Block
```yaml
execution:
- concurrency: 50       # Number of simultaneous virtual users
  ramp-up: 10s          # Duration to spawn all users (e.g. 5s, 1m)
  hold-for: 2m          # Sustained load duration
  throughput: 200       # Target global requests per second cap
  scenario: my-scenario # Scenario identifier
```

## 2. Scenarios Block
```yaml
scenarios:
  my-scenario:
    data-sources:
    - users.csv         # CSV data feeding dynamic variables
    requests:
    - url: "http://target:8080/api/items?id=${id}"
      method: GET
      label: fetch_item
      timeout: "5s"
      think-time: "100ms"
      assert:
      - contains: ["200"]
        subject: http-code
      - contains: ["success"]
        subject: body
```

## 3. Dynamic Macros
- `${uuid}`: Generates a random RFC 4122 v4 UUID.
- `${faker.word}`: Generates a random alphanumeric word.
- `${faker.name}`: Generates a random name.
- `${env.VAR_NAME}`: Interpolates system environment variables.
- `${column_name}`: Values fed row-by-row from data-sources CSV.

## 4. Reporting & SLA Block
```yaml
reporting:
- module: console
- module: junit-xml
  filename: results.xml
  sla:
  - metric: avg-response-time
    threshold: 250ms
    action: stop       # 'stop' aborts immediately, 'continue' records breach
  - metric: fail-ratio
    threshold: 0.5%
    action: stop
```
""",
    },
    "pummel://docs/cli": {
        "name": "Pummel Installed Binary CLI Reference",
        "description": "Command line options for the installed pummel binary",
        "mimeType": "text/markdown",
        "content": """# Pummel CLI Reference

The pummel load generator is installed globally as an executable binary (`pummel`).

## Usage
```bash
pummel [OPTIONS] <CONFIG>
```

## Core Commands and Options
- `pummel test.yaml --dry-run` (`-d`): Validates schema, data sources, and Goose attack translation without generating traffic.
- `pummel test.yaml`: Executes the full load test against target endpoints.
- `pummel test.yaml --mock-run`: Spawns an internal mock server on an ephemeral port matching test endpoints, redirects traffic, and executes synthetic load.
- `pummel test.yaml --mock` (`-m`): Starts internal mock server independently.
- `pummel test.yaml -o key=value`: Overrides YAML settings at runtime (e.g. `-o execution.0.concurrency=100 -o api.enabled=true`).
""",
    },
}
