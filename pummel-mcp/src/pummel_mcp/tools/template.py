"""Scenario generation template tool for Pummel."""

from __future__ import annotations

from pathlib import Path

from pummel_mcp.models import ScenarioTemplate


def build_scenario_yaml(
    template_type: str,
    target_url: str,
    concurrency: int = 10,
    duration: str = "30s",
) -> str:
    """Construct a clean, valid Pummel YAML configuration string."""
    t_type = template_type.lower().strip()
    target = target_url.rstrip("/")

    if t_type == "smoke":
        return f"""# Pummel Smoke Test Scenario
execution:
- concurrency: {min(concurrency, 2)}
  ramp-up: 2s
  hold-for: {duration}
  scenario: smoke-scenario

scenarios:
  smoke-scenario:
    requests:
    - url: "{target}/health"
      method: GET
      label: health_check
      assert:
      - contains: ["200"]
        subject: http-code
    - url: "{target}/"
      method: GET
      label: home_page

reporting:
- module: console
"""

    if t_type == "stress":
        return f"""# Pummel Stress Test Scenario
execution:
- concurrency: {max(concurrency, 50)}
  ramp-up: 10s
  hold-for: {duration}
  scenario: stress-scenario

scenarios:
  stress-scenario:
    requests:
    - url: "{target}/api/items"
      method: GET
      label: get_items
      timeout: "5s"
      assert:
      - contains: ["200"]
        subject: http-code
    - url: "{target}/api/search?q=${{faker.word}}"
      method: GET
      label: search_stress

reporting:
- module: console
- module: junit-xml
  filename: stress_results.xml
  sla:
  - metric: avg-response-time
    threshold: 1000ms
    action: stop
"""

    if t_type == "spike":
        return f"""# Pummel Spike Test Scenario
execution:
- concurrency: {max(concurrency, 100)}
  ramp-up: 2s
  hold-for: {duration}
  scenario: spike-scenario

scenarios:
  spike-scenario:
    requests:
    - url: "{target}/"
      method: GET
      label: spike_entry
      assert:
      - contains: ["200"]
        subject: http-code

reporting:
- module: console
"""

    if t_type == "chaos":
        return f"""# Pummel Chaos / Dynamic Test Scenario
execution:
- concurrency: {concurrency}
  ramp-up: 5s
  hold-for: {duration}
  scenario: chaos-scenario

scenarios:
  chaos-scenario:
    requests:
    - url: "{target}/api/resource/${{uuid}}"
      method: GET
      label: random_uuid_lookup
    - url: "{target}/api/query?q=${{faker.word}}"
      method: GET
      label: random_query
      think-time: "200ms"

reporting:
- module: console
"""

    # Default to standard load test
    return f"""# Pummel Load Test Scenario
execution:
- concurrency: {concurrency}
  ramp-up: 5s
  hold-for: {duration}
  throughput: {concurrency * 5}
  scenario: load-scenario

scenarios:
  load-scenario:
    requests:
    - url: "{target}/"
      method: GET
      label: home
      assert:
      - contains: ["200"]
        subject: http-code
    - url: "{target}/api/data"
      method: GET
      label: api_data
      think-time: "100ms"

reporting:
- module: console
- module: junit-xml
  filename: load_results.xml
"""


async def generate_scenario(
    template_type: str = "load",
    target_url: str = "http://localhost:8080",
    concurrency: int = 10,
    duration: str = "30s",
    output_path: str | None = None,
) -> ScenarioTemplate:
    """Generate a valid, production-ready Pummel scenario configuration.

    Supports template types: smoke, load, stress, spike, chaos.

    Args:
        template_type: Type of load test scenario (smoke, load, stress, spike, chaos).
        target_url: Base HTTP/HTTPS URL of the target service.
        concurrency: Target virtual user concurrency count.
        duration: Hold duration string (e.g. '30s', '5m', '1h').
        output_path: Optional file path to write the generated YAML to disk.

    Returns:
        ScenarioTemplate containing configuration details and generated YAML content.
    """
    content = build_scenario_yaml(
        template_type=template_type,
        target_url=target_url,
        concurrency=concurrency,
        duration=duration,
    )

    written_path: str | None = None
    if output_path:
        p = Path(output_path).resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        written_path = str(p)

    return ScenarioTemplate(
        template_type=template_type.lower().strip(),
        target_url=target_url,
        concurrency=concurrency,
        duration=duration,
        content=content,
        output_path=written_path,
    )
