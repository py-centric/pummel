"""Tests for Pummel MCP server setup and tool invocation."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from click.testing import CliRunner

from pummel_mcp.__main__ import main
from pummel_mcp.server import create_server


@pytest.mark.asyncio
async def test_create_server_lists_all_tools():
    server = create_server()
    tools = await server.list_tools()
    tool_names = {t.name for t in tools}
    expected = {
        "validate_scenario",
        "run_load_test",
        "run_mock_test",
        "get_live_metrics",
        "stop_load_test",
        "generate_scenario",
    }
    assert expected.issubset(tool_names)


@pytest.mark.asyncio
async def test_server_call_tools_delegation(tmp_path):
    server = create_server()

    # 1. validate_scenario
    with patch(
        "pummel_mcp.server.validate_scenario",
        new_callable=AsyncMock,
    ) as mock_val:
        from pummel_mcp.models import ValidationResult

        mock_val.return_value = ValidationResult(
            is_valid=True,
            syntax_valid=True,
            normalization_successful=True,
            translation_successful=True,
        )
        res = await server.call_tool(
            "validate_scenario", {"scenario_path": "/path/to/test.yaml"}
        )
        assert res.is_error is False
        mock_val.assert_called_once_with(
            scenario_path="/path/to/test.yaml", overrides=None
        )

    # 2. run_load_test
    with patch(
        "pummel_mcp.server.run_load_test",
        new_callable=AsyncMock,
    ) as mock_run:
        from pummel_mcp.models import LoadTestMetrics

        mock_run.return_value = LoadTestMetrics(
            success=True,
            exit_code=0,
            total_requests=10,
        )
        res = await server.call_tool(
            "run_load_test", {"scenario_path": "/path/to/test.yaml"}
        )
        assert res.is_error is False
        mock_run.assert_called_once()

    # 3. run_mock_test
    with patch(
        "pummel_mcp.server.run_mock_test",
        new_callable=AsyncMock,
    ) as mock_mock:
        mock_mock.return_value = LoadTestMetrics(
            success=True,
            exit_code=0,
            total_requests=5,
        )
        res = await server.call_tool(
            "run_mock_test", {"scenario_path": "/path/to/test.yaml"}
        )
        assert res.is_error is False
        mock_mock.assert_called_once()

    # 4. get_live_metrics
    with patch(
        "pummel_mcp.server.get_live_metrics",
        new_callable=AsyncMock,
    ) as mock_metrics:
        from pummel_mcp.models import LiveMetrics

        mock_metrics.return_value = LiveMetrics(
            status="RUNNING",
            active_users=5,
            request_count=100,
            error_rate=0.01,
            avg_latency_ms=15.2,
            control_url="http://127.0.0.1:8000/metrics",
        )
        res = await server.call_tool("get_live_metrics", {})
        assert res.is_error is False
        mock_metrics.assert_called_once()

    # 5. stop_load_test
    with patch(
        "pummel_mcp.server.stop_load_test",
        new_callable=AsyncMock,
    ) as mock_stop:
        mock_stop.return_value = {"status": "STOP_INITIATED", "message": "OK"}
        res = await server.call_tool("stop_load_test", {})
        assert res.is_error is False
        mock_stop.assert_called_once()

    # 6. generate_scenario
    with patch(
        "pummel_mcp.server.generate_scenario",
        new_callable=AsyncMock,
    ) as mock_gen:
        from pummel_mcp.models import ScenarioTemplate

        mock_gen.return_value = ScenarioTemplate(
            template_type="smoke",
            target_url="http://localhost:8080",
            concurrency=2,
            duration="10s",
            content="execution:\n- concurrency: 2",
        )
        res = await server.call_tool(
            "generate_scenario",
            {"template_type": "smoke", "target_url": "http://localhost:8080"},
        )
        assert res.is_error is False
        mock_gen.assert_called_once()


def test_cli_main_transports():
    runner = CliRunner()

    with patch("pummel_mcp.server.MCPServer.run") as mock_run:
        # stdio
        result = runner.invoke(main, ["--transport", "stdio"])
        assert result.exit_code == 0
        mock_run.assert_called_with("stdio")

        # sse
        result = runner.invoke(
            main, ["--transport", "sse", "--host", "0.0.0.0", "--port", "9000"]
        )
        assert result.exit_code == 0
        mock_run.assert_called_with("sse", host="0.0.0.0", port=9000)

        # streamable-http
        result = runner.invoke(
            main,
            ["--transport", "streamable-http", "--host", "0.0.0.0", "--port", "9001"],
        )
        assert result.exit_code == 0
        mock_run.assert_called_with("streamable-http", host="0.0.0.0", port=9001)
