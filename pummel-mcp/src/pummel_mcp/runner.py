"""Pummel binary discovery and asynchronous execution runner.

Invokes the installed pummel binary from PATH or standard user binary
directories without project path dependencies.
"""

from __future__ import annotations

import asyncio
import os
import re
import shutil
from pathlib import Path
from typing import Sequence

from pummel_mcp.models import LoadTestMetrics, ValidationResult


def find_pummel_binary() -> str:
    """Locate the installed pummel executable without project path dependencies."""
    binary = shutil.which("pummel")
    if binary:
        return binary

    candidates = [
        Path.home() / ".cargo" / "bin" / "pummel",
        Path.home() / ".local" / "bin" / "pummel",
        Path("/usr/local/bin/pummel"),
        Path("/usr/bin/pummel"),
    ]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)

    raise FileNotFoundError(
        "The 'pummel' binary was not found in PATH or standard binary directories "
        "(~/.cargo/bin, ~/.local/bin). Please install it via 'cargo install --path .' "
        "or ensure it is located in your system PATH."
    )


async def execute_pummel(
    args: Sequence[str],
    cwd: str | None = None,
    timeout: float | None = None,
) -> tuple[int, str, str]:
    """Execute the pummel binary with arguments asynchronously.

    Returns:
        tuple of (exit_code, stdout, stderr)
    """
    binary_path = find_pummel_binary()
    cmd = [binary_path, *args]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )

    try:
        if timeout:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
        else:
            stdout_bytes, stderr_bytes = await proc.communicate()
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise TimeoutError(f"Pummel execution timed out after {timeout} seconds")

    exit_code = proc.returncode if proc.returncode is not None else 1
    stdout = stdout_bytes.decode("utf-8", errors="replace")
    stderr = stderr_bytes.decode("utf-8", errors="replace")
    return exit_code, stdout, stderr


def parse_validation_output(
    exit_code: int, stdout: str, stderr: str
) -> ValidationResult:
    """Parse dry-run console output into a ValidationResult model."""
    combined = f"{stdout}\n{stderr}".strip()
    is_valid = exit_code == 0 and "Validation Successful" in combined

    syntax_valid = exit_code == 0 or (
        "Serde" not in combined and "Parsing configuration" in combined
    )
    normalization_successful = exit_code == 0 or (
        "Normalizing configuration" in combined and "Serde" not in combined
    )
    translation_successful = exit_code == 0 or "Translating to Goose Attack" in combined

    data_sources: dict[str, str] = {}
    ds_matches = re.findall(r"\[(OK|FAIL)\] Verifying data-source:\s*([^\n]+)", combined)
    for status, path in ds_matches:
        data_sources[path.strip()] = "verified" if status == "OK" else "missing"

    warnings: list[str] = []
    warn_matches = re.findall(r"(?:WARN|Warning|WARNING):?\s*([^\n]+)", combined)
    for warn in warn_matches:
        warnings.append(warn.strip())

    error: str | None = None
    if not is_valid:
        err_match = re.search(r"(Error:[^\n]+(?:\n\s+[^\n]+)*)", combined)
        if err_match:
            error = err_match.group(1).strip()
        else:
            error = combined if combined else f"Validation failed with exit code {exit_code}"

    return ValidationResult(
        is_valid=is_valid,
        syntax_valid=syntax_valid,
        normalization_successful=normalization_successful,
        translation_successful=translation_successful,
        data_sources=data_sources,
        warnings=warnings,
        error=error,
        raw_output=combined,
    )


def parse_metrics_output(
    exit_code: int, stdout: str, stderr: str
) -> LoadTestMetrics:
    """Parse Pummel and Goose execution summary output into LoadTestMetrics."""
    combined = f"{stdout}\n{stderr}".strip()

    total_requests = 0
    failed_requests = 0
    throughput_rps = 0.0
    avg_response_time_ms = 0.0
    p90_ms = 0.0
    p95_ms = 0.0
    p99_ms = 0.0
    sla_breaches: list[str] = []

    # Parse PER REQUEST METRICS Aggregated line:
    # Aggregated | 50 | 50 (100%) | 5.00 | 5.00
    req_match = re.search(
        r"Aggregated\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)(?:\s*\([^\)]*\))?\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)",
        combined,
    )
    if req_match:
        try:
            total_requests = int(req_match.group(1).replace(",", ""))
            failed_requests = int(req_match.group(2).replace(",", ""))
            throughput_rps = float(req_match.group(3))
        except (ValueError, IndexError):
            pass

    # Parse PER REQUEST METRICS Latency Aggregated line:
    # Aggregated | 3.40 | 2 | 7 | 3
    lat_match = re.search(
        r"Aggregated\s*\|\s*([\d.]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)",
        combined,
    )
    if lat_match:
        try:
            avg_response_time_ms = float(lat_match.group(1))
        except (ValueError, IndexError):
            pass

    # Parse Slowest page load percentiles:
    # Name | 50% | 75% | 98% | 99% | 99.9% | 99.99%
    # Aggregated | 3 | 4 | 6 | 7 | 7 | 7
    perc_section = re.search(
        r"Slowest page load within specified percentile of requests.*?"
        r"Aggregated\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)",
        combined,
        re.DOTALL,
    )
    if perc_section:
        try:
            p75 = float(perc_section.group(2).replace(",", ""))
            p98 = float(perc_section.group(3).replace(",", ""))
            p99 = float(perc_section.group(4).replace(",", ""))
            # Use p75 / p98 / p99 to populate standard percentiles
            p90_ms = round((p75 + p98) / 2.0, 2)
            p95_ms = round((p75 + 3.0 * p98) / 4.0, 2)
            p99_ms = p99
        except (ValueError, IndexError):
            pass

    # Find SLA breaches or assertion failures
    sla_matches = re.findall(
        r"(?:SLA violation|Assertion Failed|\[SLA\].*?breached):?\s*([^\n]*)",
        combined,
        re.IGNORECASE,
    )
    for breach in sla_matches:
        cleaned = breach.strip()
        if cleaned:
            sla_breaches.append(cleaned)
        else:
            sla_breaches.append("Assertion / SLA threshold violated")

    success = exit_code == 0 and len(sla_breaches) == 0

    return LoadTestMetrics(
        success=success,
        exit_code=exit_code,
        total_requests=total_requests,
        failed_requests=failed_requests,
        throughput_rps=throughput_rps,
        avg_response_time_ms=avg_response_time_ms,
        p90_ms=p90_ms,
        p95_ms=p95_ms,
        p99_ms=p99_ms,
        sla_breaches=sla_breaches,
        raw_output=combined,
    )
