"""Tests for Pummel MCP resources."""

from __future__ import annotations

import pytest

from pummel_mcp.resources import RESOURCES
from pummel_mcp.server import create_server


def test_resources_registry():
    expected_uris = [
        "pummel://templates/smoke",
        "pummel://templates/load",
        "pummel://templates/stress",
        "pummel://templates/spike",
        "pummel://docs/syntax",
        "pummel://docs/cli",
    ]
    for uri in expected_uris:
        assert uri in RESOURCES
        item = RESOURCES[uri]
        assert "name" in item
        assert "description" in item
        assert "mimeType" in item
        assert len(item["content"]) > 20


@pytest.mark.asyncio
async def test_server_read_resource():
    server = create_server()
    contents = await server.read_resource("pummel://templates/smoke")
    assert len(contents) > 0
    text = contents[0].content
    assert "execution:" in text
    assert "smoke" in text
