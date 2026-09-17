"""MCP Server implementation for Pummel load testing engine."""

from __future__ import annotations

import sys
from typing import Any

try:
    from mcp.server import MCPServer
except ImportError:  # pragma: no cover
    try:
        from mcp.server.fastmcp import FastMCP as MCPServer
    except ImportError:
        from mcp.server.mcpserver import MCPServer

from pummel_mcp.models import (
    LiveMetrics,
    LoadTestMetrics,
    ScenarioTemplate,
    ValidationResult,
)
from pummel_mcp.prompts.pummel_prompts import PROMPTS
from pummel_mcp.resources.pummel_resources import RESOURCES
from pummel_mcp.tools.control import get_live_metrics, stop_load_test
from pummel_mcp.tools.mock_test import run_mock_test
from pummel_mcp.tools.run_test import run_load_test
from pummel_mcp.tools.template import generate_scenario
from pummel_mcp.tools.validate import validate_scenario


def create_server() -> MCPServer:
    """Create and configure the Pummel MCP server with all tools, resources, and prompts."""
    mcp = MCPServer(
        name="pummel",
        version="0.1.0",
        description="Model Context Protocol server for the Pummel load testing engine",
    )

    # 1. Register Tools
    @mcp.tool(
        name="validate_scenario",
        description="Validate a Pummel load testing scenario file with dry-run without generating traffic.",
    )
    async def tool_validate_scenario(
        scenario_path: str,
        overrides: list[str] | None = None,
    ) -> ValidationResult:
        return await validate_scenario(scenario_path=scenario_path, overrides=overrides)

    @mcp.tool(
        name="run_load_test",
        description="Execute a Pummel load test using the installed pummel binary against target endpoints.",
    )
    async def tool_run_load_test(
        scenario_path: str,
        overrides: list[str] | None = None,
        timeout: float | None = None,
    ) -> LoadTestMetrics:
        return await run_load_test(
            scenario_path=scenario_path, overrides=overrides, timeout=timeout
        )

    @mcp.tool(
        name="run_mock_test",
        description="Execute a Pummel test against an internal mock HTTP server without hitting external targets.",
    )
    async def tool_run_mock_test(
        scenario_path: str,
        overrides: list[str] | None = None,
        timeout: float | None = None,
    ) -> LoadTestMetrics:
        return await run_mock_test(
            scenario_path=scenario_path, overrides=overrides, timeout=timeout
        )

    @mcp.tool(
        name="get_live_metrics",
        description="Query real-time metrics from a running Pummel instance's HTTP control API.",
    )
    async def tool_get_live_metrics(
        control_url: str = "http://127.0.0.1:8000/metrics",
    ) -> LiveMetrics:
        return await get_live_metrics(control_url=control_url)

    @mcp.tool(
        name="stop_load_test",
        description="Gracefully abort a running Pummel load test via its HTTP control API.",
    )
    async def tool_stop_load_test(
        control_url: str = "http://127.0.0.1:8000/control/stop",
    ) -> dict[str, str]:
        return await stop_load_test(control_url=control_url)

    @mcp.tool(
        name="generate_scenario",
        description="Generate a valid, production-ready Pummel scenario configuration (smoke, load, stress, spike, chaos).",
    )
    async def tool_generate_scenario(
        template_type: str = "load",
        target_url: str = "http://localhost:8080",
        concurrency: int = 10,
        duration: str = "30s",
        output_path: str | None = None,
    ) -> ScenarioTemplate:
        return await generate_scenario(
            template_type=template_type,
            target_url=target_url,
            concurrency=concurrency,
            duration=duration,
            output_path=output_path,
        )

    # 2. Register Resources
    for uri, item in RESOURCES.items():
        content = item["content"]
        mime = item["mimeType"]
        name = item["name"]
        desc = item["description"]

        def make_resource_reader(c: str):
            def reader() -> str:
                return c
            return reader

        mcp.resource(
            uri=uri,
            name=name,
            description=desc,
            mime_type=mime,
        )(make_resource_reader(content))

    # 3. Register Prompts
    @mcp.prompt(
        name="design_load_test",
        description="Guides the generation of a comprehensive, production-grade Pummel load test scenario.",
    )
    def prompt_design_load_test(
        target_url: str,
        target_rps: str = "100",
        concurrency: str = "20",
        sla_latency_ms: str = "500",
    ) -> str:
        tpl = PROMPTS["design_load_test"]["template"]
        return tpl.format(
            target_url=target_url,
            target_rps=target_rps,
            concurrency=concurrency,
            sla_latency_ms=sla_latency_ms,
        )

    @mcp.prompt(
        name="analyze_test_metrics",
        description="Analyzes raw Pummel load test execution metrics to identify latency bottlenecks, error spikes, and SLA compliance.",
    )
    def prompt_analyze_test_metrics(
        metrics_summary: str,
        performance_goals: str = "p95 < 500ms, error rate < 0.1%",
    ) -> str:
        tpl = PROMPTS["analyze_test_metrics"]["template"]
        return tpl.format(
            metrics_summary=metrics_summary,
            performance_goals=performance_goals,
        )

    @mcp.prompt(
        name="debug_scenario",
        description="Diagnoses and resolves syntax, normalization, or data-source errors in Pummel configuration files.",
    )
    def prompt_debug_scenario(
        scenario_content: str,
        error_message: str,
    ) -> str:
        tpl = PROMPTS["debug_scenario"]["template"]
        return tpl.format(
            scenario_content=scenario_content,
            error_message=error_message,
        )

    return mcp
