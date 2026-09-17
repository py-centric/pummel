"""Tests for the Pummel binary execution runner."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pummel_mcp.runner import (
    execute_pummel,
    find_pummel_binary,
    parse_metrics_output,
    parse_validation_output,
)


def test_find_pummel_binary_which(monkeypatch):
    monkeypatch.setattr("shutil.which", lambda cmd: "/usr/bin/pummel")
    assert find_pummel_binary() == "/usr/bin/pummel"


def test_find_pummel_binary_candidates(monkeypatch, tmp_path):
    monkeypatch.setattr("shutil.which", lambda cmd: None)
    fake_cargo_bin = tmp_path / "cargo_bin"
    fake_cargo_bin.mkdir()
    fake_pummel = fake_cargo_bin / "pummel"
    fake_pummel.write_text("#!/bin/sh\nexit 0")
    fake_pummel.chmod(0o755)

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    # Patch candidate search to hit our tmp directory
    with patch("pummel_mcp.runner.Path.home", return_value=tmp_path):
        candidate_p = tmp_path / ".cargo" / "bin" / "pummel"
        candidate_p.parent.mkdir(parents=True, exist_ok=True)
        candidate_p.write_text("#!/bin/sh\nexit 0")
        candidate_p.chmod(0o755)
        assert find_pummel_binary() == str(candidate_p)


def test_find_pummel_binary_not_found(monkeypatch):
    monkeypatch.setattr("shutil.which", lambda cmd: None)
    with patch("pathlib.Path.is_file", return_value=False):
        with pytest.raises(FileNotFoundError, match="binary was not found"):
            find_pummel_binary()


@pytest.mark.asyncio
async def test_execute_pummel_success():
    with patch("pummel_mcp.runner.find_pummel_binary", return_value="/bin/pummel"):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(
            return_value=(b"Standard Output", b"Standard Error")
        )

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            code, stdout, stderr = await execute_pummel(["--help"])
            assert code == 0
            assert stdout == "Standard Output"
            assert stderr == "Standard Error"


@pytest.mark.asyncio
async def test_execute_pummel_timeout():
    with patch("pummel_mcp.runner.find_pummel_binary", return_value="/bin/pummel"):
        mock_proc = MagicMock()
        mock_proc.kill = MagicMock()
        mock_proc.communicate = AsyncMock(
            side_effect=[asyncio.TimeoutError(), (b"", b"")]
        )

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with pytest.raises(TimeoutError, match="timed out"):
                await execute_pummel(["test.yaml"], timeout=0.01)
            mock_proc.kill.assert_called_once()


def test_parse_validation_output_success():
    stdout = """2026-09-17 INFO pummel: Parsing YAML config
[OK] Parsing configuration
[OK] Normalizing configuration
[OK] Verifying data-source: users.csv
[OK] Translating to Goose Attack
Validation Successful.
"""
    result = parse_validation_output(0, stdout, "")
    assert result.is_valid is True
    assert result.syntax_valid is True
    assert result.normalization_successful is True
    assert result.translation_successful is True
    assert result.data_sources == {"users.csv": "verified"}
    assert result.error is None


def test_parse_validation_output_failure():
    stderr = """Error: Serde { message: "unknown field `port`", file_path: Some("test.yaml") }"""
    result = parse_validation_output(1, "", stderr)
    assert result.is_valid is False
    assert result.syntax_valid is False
    assert "unknown field" in (result.error or "")


def test_parse_validation_output_warnings_and_data_sources():
    combined = """[FAIL] Verifying data-source: missing.csv
WARN: Deprecated option used
Validation failed with exit code 1
"""
    result = parse_validation_output(1, combined, "")
    assert result.is_valid is False
    assert result.data_sources == {"missing.csv": "missing"}
    assert "Deprecated option used" in result.warnings


def test_parse_metrics_output_success():
    output = """
 === PER REQUEST METRICS ===
 ------------------------------------------------------------------------------
 Name                     |        # reqs |        # fails |    req/s |  fail/s
 -------------------------+---------------+----------------+----------+--------
 Aggregated               |           100 |         2 (2%) |    10.00 |    0.20
 ------------------------------------------------------------------------------
 Aggregated               |         12.50 |          5 |          35 |         10
 ------------------------------------------------------------------------------
 Slowest page load within specified percentile of requests (in ms):
 ------------------------------------------------------------------------------
 Name                     |    50% |    75% |    98% |    99% |  99.9% | 99.99%
 -------------------------+--------+--------+--------+--------+--------+-------
 Aggregated               |      8 |     14 |     28 |     35 |     40 |     45
"""
    metrics = parse_metrics_output(0, output, "")
    assert metrics.success is True
    assert metrics.total_requests == 100
    assert metrics.failed_requests == 2
    assert metrics.throughput_rps == 10.0
    assert metrics.avg_response_time_ms == 12.5
    assert metrics.p90_ms == 21.0
    assert metrics.p99_ms == 35.0
    assert len(metrics.sla_breaches) == 0


def test_parse_metrics_output_sla_breach():
    output = """
SLA violation: avg-response-time threshold exceeded (600ms > 500ms)
Assertion Failed: http-code 500
"""
    metrics = parse_metrics_output(1, output, "")
    assert metrics.success is False
    assert metrics.exit_code == 1
    assert len(metrics.sla_breaches) == 2
