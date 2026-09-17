"""CLI entrypoint for running the Pummel MCP server."""

from __future__ import annotations

import sys
import click

from pummel_mcp.server import create_server


@click.command()
@click.option(
    "--transport",
    default="stdio",
    type=click.Choice(["stdio", "sse", "streamable-http"], case_sensitive=False),
    help="Transport protocol to run the MCP server on (default: stdio)",
)
@click.option(
    "--host",
    default="127.0.0.1",
    help="Host to bind on for SSE / streamable-http transport",
)
@click.option(
    "--port",
    default=8001,
    type=int,
    help="Port to listen on for SSE / streamable-http transport",
)
def main(transport: str, host: str, port: int) -> None:
    """Run the Pummel Model Context Protocol server."""
    server = create_server()
    if transport == "stdio":
        server.run("stdio")
    elif transport == "sse":
        server.run("sse", host=host, port=port)
    else:
        server.run("streamable-http", host=host, port=port)


if __name__ == "__main__":
    main()
