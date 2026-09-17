"""Tests for all Pummel MCP tools."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from pummel_mcp.models import LoadTestMetrics, ValidationResult
from pummel_mcp.tools import (
    generate_scenario,
    get_live_metrics,
    run_load_test,
    run_mock_test,
    stop_load_test,
    validate_scenario,
)


@pytest.mark.asyncio
async def test_validate_scenario_file_not_found():
    res = await validate_scenario("/non/existent/path/scenario.yaml")
    assert res.is_valid is False
    assert "not found" in (res.error or "")


@pytest.mark.asyncio
async def test_validate_scenario_success(tmp_path):
    sc_file = tmp_path / "valid.yaml"
    sc_file.write_text("dummy")

    with patch(
        "pummel_mcp.tools.validate.execute_pummel",
        new_callable=AsyncMock,
        return_value=(0, "[OK] Parsing\nValidation Successful.", ""),
    ) as mock_exec:
        res = await validate_scenario(str(sc_file), overrides=["key=value"])
        assert res.is_valid is True
        mock_exec.assert_called_once()
        args = mock_exec.call_args[0][0]
        assert "-o" in args
        assert "key=value" in args


@pytest.mark.asyncio
async def test_run_load_test_file_not_found():
    res = await run_load_test("/non/existent/scenario.yaml")
    assert res.success is False
    assert res.exit_code == 1


@pytest.mark.asyncio
async def test_run_load_test_success(tmp_path):
    sc_file = tmp_path / "test.yaml"
    sc_file.write_text("dummy")

    mock_metrics = LoadTestMetrics(
        success=True,
        exit_code=0,
        total_requests=50,
        throughput_rps=5.0,
    )
    with patch(
        "pummel_mcp.tools.run_test.execute_pummel",
        new_callable=AsyncMock,
        return_value=(0, "Aggregated | 50 | 0 | 5.0 | 0.0", ""),
    ), patch(
        "pummel_mcp.tools.run_test.parse_metrics_output",
        return_value=mock_metrics,
    ):
        res = await run_load_test(str(sc_file), overrides=["execution.0.concurrency=5"])
        assert res.success is True
        assert res.total_requests == 50


@pytest.mark.asyncio
async def test_run_mock_test_file_not_found():
    res = await run_mock_test("/non/existent/scenario.yaml")
    assert res.success is False
    assert res.exit_code == 1


@pytest.mark.asyncio
async def test_run_mock_test_success(tmp_path):
    sc_file = tmp_path / "test.yaml"
    sc_file.write_text("dummy")

    with patch(
        "pummel_mcp.tools.mock_test.execute_pummel",
        new_callable=AsyncMock,
        return_value=(0, "Aggregated | 20 | 0 | 2.0 | 0.0", ""),
    ) as mock_exec:
        res = await run_mock_test(str(sc_file), overrides=["key=value"])
        assert res.exit_code == 0
        args = mock_exec.call_args[0][0]
        assert "--mock-run" in args
        assert "-o" in args
        assert "key=value" in args


@pytest.mark.asyncio
async def test_get_live_metrics_running():
    fake_json = {
        "endpoints": {
            "login": {
                "count": 100,
                "failures": 2,
                "total_time_ms": 2500,
            },
            "search": {
                "count": 50,
                "failures": 0,
                "total_time_ms": 1000,
            },
        }
    }
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: fake_json
        mock_get.return_value = mock_resp

        res = await get_live_metrics()
        assert res.status == "RUNNING"
        assert res.request_count == 150
        assert res.error_rate > 0.0
        assert res.avg_latency_ms > 0.0


@pytest.mark.asyncio
async def test_get_live_metrics_http_error():
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = AsyncMock()
        mock_resp.status_code = 503
        mock_get.return_value = mock_resp

        res = await get_live_metrics()
        assert "ERROR_503" in res.status


@pytest.mark.asyncio
async def test_get_live_metrics_inactive():
    with patch(
        "httpx.AsyncClient.get",
        side_effect=httpx.ConnectError("Connection refused"),
    ):
        res = await get_live_metrics()
        assert res.status == "INACTIVE"
        assert res.request_count == 0


@pytest.mark.asyncio
async def test_get_live_metrics_generic_error():
    with patch("httpx.AsyncClient.get", side_effect=RuntimeError("Boom")):
        res = await get_live_metrics()
        assert "ERROR: Boom" in res.status


@pytest.mark.asyncio
async def test_stop_load_test_success():
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.text = "Load test stop initiated"
        mock_post.return_value = mock_resp

        res = await stop_load_test()
        assert res["status"] == "STOP_INITIATED"


@pytest.mark.asyncio
async def test_stop_load_test_not_running():
    with patch(
        "httpx.AsyncClient.post",
        side_effect=httpx.ConnectError("Connection refused"),
    ):
        res = await stop_load_test()
        assert res["status"] == "NOT_RUNNING"


@pytest.mark.asyncio
async def test_stop_load_test_http_error():
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = AsyncMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal error"
        mock_post.return_value = mock_resp

        res = await stop_load_test()
        assert res["status"] == "HTTP_500"


@pytest.mark.asyncio
async def test_stop_load_test_generic_error():
    with patch("httpx.AsyncClient.post", side_effect=RuntimeError("Broken")):
        res = await stop_load_test()
        assert res["status"] == "ERROR"


@pytest.mark.asyncio
async def test_generate_scenario_templates(tmp_path):
    templates = ["smoke", "stress", "spike", "chaos", "load"]
    for tpl in templates:
        out_file = tmp_path / f"{tpl}.yaml"
        res = await generate_scenario(
            template_type=tpl,
            target_url="http://api.service.local:9000",
            concurrency=25,
            duration="1m",
            output_path=str(out_file),
        )
        assert res.template_type == tpl
        assert res.output_path == str(out_file)
        assert out_file.is_file()
        assert "execution:" in res.content
        assert "scenarios:" in res.content
