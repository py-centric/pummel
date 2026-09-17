"""Tests for Pummel MCP prompts."""

from __future__ import annotations

import pytest

from pummel_mcp.prompts import PROMPTS
from pummel_mcp.server import create_server


def test_prompts_registry():
    expected_prompts = [
        "design_load_test",
        "analyze_test_metrics",
        "debug_scenario",
    ]
    for p_name in expected_prompts:
        assert p_name in PROMPTS
        item = PROMPTS[p_name]
        assert "name" in item
        assert "description" in item
        assert "arguments" in item
        assert "template" in item


@pytest.mark.asyncio
async def test_server_get_prompts():
    server = create_server()

    # 1. design_load_test
    res_design = await server.get_prompt(
        "design_load_test", {"target_url": "http://example.com/api"}
    )
    assert "http://example.com/api" in res_design.messages[0].content.text

    # 2. analyze_test_metrics
    res_analyze = await server.get_prompt(
        "analyze_test_metrics",
        {"metrics_summary": "p95: 120ms, 1000 RPS, 0 errors"},
    )
    assert "1000 RPS" in res_analyze.messages[0].content.text

    # 3. debug_scenario
    res_debug = await server.get_prompt(
        "debug_scenario",
        {
            "scenario_content": "execution:\n- concurrency: 5",
            "error_message": "unknown field `xyz`",
        },
    )
    assert "unknown field `xyz`" in res_debug.messages[0].content.text
