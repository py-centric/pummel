"""Load test execution tool for Pummel."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

from pummel_mcp.models import LoadTestMetrics
from pummel_mcp.runner import execute_pummel, parse_metrics_output


async def run_load_test(
    scenario_path: str,
    overrides: Sequence[str] | None = None,
    timeout: float | None = None,
) -> LoadTestMetrics:
    """Execute a Pummel load test using the installed pummel binary.

    Runs the test scenarios defined in the configuration file against the target
    endpoints, collecting throughput, latency percentiles, error rates, and SLA evaluations.

    Args:
        scenario_path: Path to the scenario configuration file.
        overrides: Optional list of key=value overrides (e.g. ['execution.0.concurrency=20']).
        timeout: Optional execution timeout in seconds.

    Returns:
        LoadTestMetrics containing aggregated latency, throughput, and error metrics.
    """
    path = Path(scenario_path).resolve()
    if not path.is_file():
        return LoadTestMetrics(
            success=False,
            exit_code=1,
            raw_output=f"Scenario file not found at: {path}",
            sla_breaches=[f"File not found: {path}"],
        )

    args: list[str] = [str(path)]
    if overrides:
        for override in overrides:
            args.extend(["-o", override])

    exit_code, stdout, stderr = await execute_pummel(
        args, cwd=str(path.parent), timeout=timeout
    )
    return parse_metrics_output(exit_code, stdout, stderr)
