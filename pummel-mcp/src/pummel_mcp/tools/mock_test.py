"""Internal mock-server load test execution tool for Pummel."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

from pummel_mcp.models import LoadTestMetrics
from pummel_mcp.runner import execute_pummel, parse_metrics_output


async def run_mock_test(
    scenario_path: str,
    overrides: Sequence[str] | None = None,
    timeout: float | None = None,
) -> LoadTestMetrics:
    """Execute a Pummel test against an internal mock HTTP server (--mock-run).

    Spawns an internal mock server on an ephemeral port matching the configured
    scenario endpoints, redirects virtual traffic to the mock server, and measures
    synthetic transaction flow. Ideal for validating complex scenarios without
    impacting production infrastructure.

    Args:
        scenario_path: Path to the scenario configuration file.
        overrides: Optional list of key=value overrides.
        timeout: Optional execution timeout in seconds.

    Returns:
        LoadTestMetrics with execution results against the internal mock server.
    """
    path = Path(scenario_path).resolve()
    if not path.is_file():
        return LoadTestMetrics(
            success=False,
            exit_code=1,
            raw_output=f"Scenario file not found at: {path}",
            sla_breaches=[f"File not found: {path}"],
        )

    args: list[str] = [str(path), "--mock-run"]
    if overrides:
        for override in overrides:
            args.extend(["-o", override])

    exit_code, stdout, stderr = await execute_pummel(
        args, cwd=str(path.parent), timeout=timeout
    )
    return parse_metrics_output(exit_code, stdout, stderr)
