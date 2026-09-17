"""Scenario validation tool for Pummel."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

from pummel_mcp.models import ValidationResult
from pummel_mcp.runner import execute_pummel, parse_validation_output


async def validate_scenario(
    scenario_path: str,
    overrides: Sequence[str] | None = None,
) -> ValidationResult:
    """Validate a Pummel scenario file without launching load.

    Performs complete syntax validation, configuration normalization,
    data source file verification, and Goose attack plan translation.

    Args:
        scenario_path: Absolute or relative path to the YAML/JSON/TOML scenario.
        overrides: Optional list of key=value overrides (e.g. ['execution.0.concurrency=5']).

    Returns:
        ValidationResult with validation status, checks, and any error details.
    """
    path = Path(scenario_path).resolve()
    if not path.is_file():
        return ValidationResult(
            is_valid=False,
            syntax_valid=False,
            normalization_successful=False,
            translation_successful=False,
            error=f"Scenario file not found at: {path}",
            raw_output="",
        )

    args: list[str] = [str(path), "--dry-run"]
    if overrides:
        for override in overrides:
            args.extend(["-o", override])

    exit_code, stdout, stderr = await execute_pummel(args, cwd=str(path.parent))
    return parse_validation_output(exit_code, stdout, stderr)
