"""MCP Prompt definitions for Pummel load testing workflows."""

from __future__ import annotations

PROMPTS = {
    "design_load_test": {
        "name": "design_load_test",
        "description": "Guides the generation of a comprehensive, production-grade Pummel load test scenario.",
        "arguments": [
            {
                "name": "target_url",
                "description": "Base target URL of the application under test",
                "required": True,
            },
            {
                "name": "target_rps",
                "description": "Expected throughput target in requests per second",
                "required": False,
            },
            {
                "name": "concurrency",
                "description": "Target virtual user concurrency count",
                "required": False,
            },
            {
                "name": "sla_latency_ms",
                "description": "Maximum permissible latency threshold in milliseconds",
                "required": False,
            },
        ],
        "template": """You are an expert Performance and Load Testing Architect utilizing Pummel.

Please design a comprehensive load testing scenario in valid Pummel YAML format for:
Target URL: {target_url}
Target Throughput (RPS): {target_rps}
Target Concurrency: {concurrency}
Target Max Latency SLA: {sla_latency_ms}ms

Include:
1. An 'execution' block with realistic ramp-up, hold-for duration, and throughput throttle.
2. A 'scenarios' block covering primary user journeys (GET, POST with JSON body).
3. Dynamic macros such as ${{uuid}} or ${{faker.word}} where appropriate.
4. Response assertions checking http-code (e.g. contains: ["200"]).
5. A 'reporting' block with console and junit-xml modules including SLA criteria.
6. Verify the YAML using 'validate_scenario' with Pummel's dry-run.
""",
    },
    "analyze_test_metrics": {
        "name": "analyze_test_metrics",
        "description": "Analyzes raw Pummel load test execution metrics to identify latency bottlenecks, error spikes, and SLA compliance.",
        "arguments": [
            {
                "name": "metrics_summary",
                "description": "Pummel or Goose console output or LoadTestMetrics JSON",
                "required": True,
            },
            {
                "name": "performance_goals",
                "description": "Service Level Objectives or expected latency/throughput targets",
                "required": False,
            },
        ],
        "template": """You are an expert Site Reliability Engineer analyzing Pummel load test results.

Metrics Data:
{metrics_summary}

Target Performance Goals:
{performance_goals}

Please provide a detailed performance evaluation:
1. Executive Summary: Was the test successful? Did any SLA thresholds get breached?
2. Throughput & Latency Analysis: Analyze p50, p90, p95, and p99 latencies vs throughput.
3. Error Breakdown: Identify status codes (e.g. 404, 500, 502, timeouts) and failure patterns.
4. Actionable Recommendations: Specific architectural, database, or network optimizations to resolve observed bottlenecks.
""",
    },
    "debug_scenario": {
        "name": "debug_scenario",
        "description": "Diagnoses and resolves syntax, normalization, or data-source errors in Pummel configuration files.",
        "arguments": [
            {
                "name": "scenario_content",
                "description": "Current YAML scenario content",
                "required": True,
            },
            {
                "name": "error_message",
                "description": "Dry-run validation error message returned by Pummel",
                "required": True,
            },
        ],
        "template": """You are a Pummel load testing specialist debugging a scenario validation failure.

Scenario Content:
```yaml
{scenario_content}
```

Error Details:
```
{error_message}
```

Identify the exact root cause:
- Ensure 'contains' assertions in 'assert' are strings (e.g. ["200"], not numbers [200]).
- Ensure reporting definitions use valid fields: module, filename, url, token, org, bucket, interval, failed-threshold, sla.
- Ensure conditional 'if' expressions are quoted properly.
- Provide the corrected, fully working YAML scenario.
""",
    },
}
