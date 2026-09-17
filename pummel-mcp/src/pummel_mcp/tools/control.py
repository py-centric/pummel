"""Runtime tuning and control API tools for Pummel."""

from __future__ import annotations

import httpx

from pummel_mcp.models import LiveMetrics


async def get_live_metrics(
    control_url: str = "http://127.0.0.1:8000/metrics",
) -> LiveMetrics:
    """Retrieve real-time metrics from a running Pummel instance's HTTP control API.

    Queries the /metrics endpoint exposed by Pummel when the API is enabled
    (-o api.enabled=true -o api.port=8000).

    Args:
        control_url: Target URL of the Pummel metrics endpoint.

    Returns:
        LiveMetrics snapshot containing current request count, error rate, and average latency.
    """
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(control_url)
            if response.status_code != 200:
                return LiveMetrics(
                    status=f"ERROR_{response.status_code}",
                    active_users=0,
                    request_count=0,
                    error_rate=0.0,
                    avg_latency_ms=0.0,
                    control_url=control_url,
                )

            data = response.json()
            endpoints = data.get("endpoints", {})
            total_requests = 0
            total_failures = 0
            total_time_ms = 0

            for stats in endpoints.values():
                total_requests += stats.get("count", 0)
                total_failures += stats.get("failures", 0)
                total_time_ms += stats.get("total_time_ms", 0)

            error_rate = (
                (total_failures / total_requests) if total_requests > 0 else 0.0
            )
            avg_latency = (
                (total_time_ms / total_requests) if total_requests > 0 else 0.0
            )

            return LiveMetrics(
                status="RUNNING",
                active_users=len(endpoints),
                request_count=total_requests,
                error_rate=round(error_rate, 4),
                avg_latency_ms=round(avg_latency, 2),
                control_url=control_url,
            )
    except (httpx.ConnectError, httpx.TimeoutException):
        return LiveMetrics(
            status="INACTIVE",
            active_users=0,
            request_count=0,
            error_rate=0.0,
            avg_latency_ms=0.0,
            control_url=control_url,
        )
    except Exception as exc:
        return LiveMetrics(
            status=f"ERROR: {exc}",
            active_users=0,
            request_count=0,
            error_rate=0.0,
            avg_latency_ms=0.0,
            control_url=control_url,
        )


async def stop_load_test(
    control_url: str = "http://127.0.0.1:8000/control/stop",
) -> dict[str, str]:
    """Gracefully abort a running Pummel load test via its HTTP control API.

    Sends a POST request to the /control/stop endpoint, causing Pummel to initiate
    graceful shutdown of all active virtual users and write final reports.

    Args:
        control_url: Target URL of the Pummel stop endpoint.

    Returns:
        Dictionary containing the status and server response message.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(control_url)
            if response.status_code == 200:
                return {
                    "status": "STOP_INITIATED",
                    "message": response.text or "Load test stop initiated",
                }
            return {
                "status": f"HTTP_{response.status_code}",
                "message": response.text,
            }
    except httpx.ConnectError:
        return {
            "status": "NOT_RUNNING",
            "message": f"No active Pummel instance listening at {control_url}",
        }
    except Exception as exc:
        return {
            "status": "ERROR",
            "message": f"Failed to stop test: {exc}",
        }
