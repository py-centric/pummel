"""Pydantic data models for the Pummel MCP server."""

from pydantic import BaseModel, Field


class ValidationResult(BaseModel):
    """Result of validating a Pummel or Taurus scenario."""

    is_valid: bool = Field(description="Whether the configuration passed all validation checks")
    syntax_valid: bool = Field(description="Whether the scenario file has valid syntax")
    normalization_successful: bool = Field(default=True, description="Whether schema normalization succeeded")
    translation_successful: bool = Field(default=True, description="Whether translation to Goose attack succeeded")
    data_sources: dict[str, str] = Field(default_factory=dict, description="Status of required data-source files")
    warnings: list[str] = Field(default_factory=list, description="Validation or security warnings (e.g. sensitive env vars)")
    error: str | None = Field(default=None, description="Detailed error message if validation failed")
    raw_output: str = Field(default="", description="Console output from dry-run validation")


class LoadTestMetrics(BaseModel):
    """Execution summary and metrics from a Pummel load test."""

    success: bool = Field(description="Whether the test execution completed successfully without SLA breaches")
    exit_code: int = Field(description="Process exit code")
    total_requests: int = Field(default=0, description="Total requests sent during test")
    failed_requests: int = Field(default=0, description="Total failed requests")
    throughput_rps: float = Field(default=0.0, description="Average requests per second")
    avg_response_time_ms: float = Field(default=0.0, description="Average response time in milliseconds")
    p90_ms: float = Field(default=0.0, description="90th percentile latency in milliseconds")
    p95_ms: float = Field(default=0.0, description="95th percentile latency in milliseconds")
    p99_ms: float = Field(default=0.0, description="99th percentile latency in milliseconds")
    sla_breaches: list[str] = Field(default_factory=list, description="Recorded SLA threshold violations")
    raw_output: str = Field(default="", description="Console summary output from the attack")


class LiveMetrics(BaseModel):
    """Real-time metrics polled from Pummel's HTTP control API."""

    status: str = Field(description="Current status of the running load test")
    active_users: int = Field(default=0, description="Currently active virtual users")
    request_count: int = Field(default=0, description="Cumulative requests processed")
    error_rate: float = Field(default=0.0, description="Failure rate between 0.0 and 1.0")
    avg_latency_ms: float = Field(default=0.0, description="Current average response time in ms")
    control_url: str = Field(description="Target control API URL queried")


class ScenarioTemplate(BaseModel):
    """Generated scenario template definition."""

    template_type: str = Field(description="Type of template generated: smoke, load, stress, spike, chaos")
    target_url: str = Field(description="Base target URL configured in the scenario")
    concurrency: int = Field(description="Configured concurrency")
    duration: str = Field(description="Configured test duration")
    content: str = Field(description="Full YAML configuration content")
    output_path: str | None = Field(default=None, description="Destination path if written to disk")
