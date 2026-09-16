# ADR-001: Adoption of Rust and Goose for High-Performance Load Testing Engine

- **Status**: Accepted
- **Deciders**: PyCentric Architecture Board, Chief Technology Officer, Platform Engineering Lead
- **Date**: 2026-09-17
- **Technical Domain**: Load Generation, Distributed Systems, Protocol Simulation

---

## 1. Context and Problem Statement

Load testing engines simulate high-concurrency traffic against mission-critical microservices and infrastructure. To deliver reliable test results, the load generator itself must satisfy strict non-functional constraints:

1. **Deterministic Latency Measurement**: The load generator must not introduce synthetic latency spikes or measurement jitter caused by Garbage Collection (GC) pauses or runtime runtime stops.
2. **Extreme Concurrency with Minimal Footprint**: Generating hundreds of thousands of requests per second across HTTP, WebSocket, and gRPC protocols must consume predictable, minimal CPU and memory resources per Virtual User (VU).
3. **Declarative Specification Execution**: The engine must interpret industry-standard Taurus specifications and simplified native shorthands without sacrificing execution throughput.

The default baseline runtime (e.g. Python microservice stacks) is insufficient for high-throughput load generation due to Global Interpreter Lock (GIL) bottlenecks, memory footprint per process, and GC-induced tail latency skew.

---

## 2. Decision Outcome

We decided to build **Pummel** using **Rust (2024 edition)** and the **Goose** load testing framework.

### Consequences and Positive Impact
- **Zero GC Latency Skew**: No garbage collection pauses guarantee that recorded p95, p99, and p99.9 latency metrics represent true target behavior.
- **Minimal Resource Overhead**: Single-binary deployment with asynchronous Tokio tasks enables tens of thousands of concurrent virtual users per node with minimal RAM footprint.
- **Memory Safety without Runtime Penalty**: Compile-time ownership guarantees eliminate race conditions, memory leaks, and null pointer crashes under peak stress.
- **Dynamic Protocol Extensibility**: Native async integration with Tonic (gRPC), Tokio-Tungstenite (WebSocket), and Axum (dynamic control plane).

---

## 3. Evaluated Alternatives Matrix

| Criterion | Rust + Goose (Chosen) | Go + k6 | Python + Locust |
| :--- | :--- | :--- | :--- |
| **Runtime Model** | Compiled native async (Tokio) | Compiled Go runtime (Goroutines) | Interpreted Python (Gevent/Asyncio) |
| **GC Pauses / Jitter** | Zero (Deterministic) | Low (Go GC pauses at high heap allocation) | High (GIL bottlenecks, Python GC sweeps) |
| **Max Throughput** | Very High (100k+ req/sec per core) | High (50k-80k req/sec per core) | Moderate (5k-15k req/sec per core) |
| **Memory per 10k VUs** | ~50 MB | ~180 MB | ~600 MB - 1.2 GB |
| **Deployment Footprint** | Single static binary (<25 MB image) | Single static binary (~40 MB image) | Python interpreter + virtualenv (~120 MB) |
| **Observability** | Tracing, InfluxDB, Prometheus/Axum | Custom k6 metrics and statsd | Web UI and CSV export |
| **Supply Chain & Licensing** | 100% Permissive (MIT / Apache-2.0) | AGPL-3.0 (Grafana k6 core restriction) | MIT |

### Analysis of Alternatives

- **Go + k6**: While k6 offers strong throughput and single-binary deployment, its core engine is licensed under AGPL-3.0, introducing commercialization constraints and vendor risk for enterprise integration. Furthermore, while Go's garbage collector is tuned for low pause times, high object allocation rates under stress testing still manifest tail-latency measurement anomalies.
- **Python + Locust**: Locust provides good Python developer ergonomics, but Python's Global Interpreter Lock (GIL) and process-based scaling impose heavy CPU and memory overhead, requiring complex multi-process coordination for medium workloads.
- **Rust + Goose**: Offers the ideal balance of unmatched raw throughput, zero GC pauses, strict memory safety, and complete commercial freedom via dual MIT / Apache-2.0 licensing.

---

## 4. Operational and Observability Footprint

1. **Packaging & Image Size**: Pummel compiles down to a single static binary. When packaged into a scratch or distroless container, total image size is under 25 MB.
2. **Observability Integration**:
   - Structured tracing via `tracing` and `tracing-subscriber` supporting configurable JSON formatting and environment filtering.
   - Real-time metric export to InfluxDB with worker-level synchronization.
   - Dynamic control API running on Axum providing live status checks and graceful shutdown hooks.
3. **Operational Simplicity**: No external runtime interpreters, JVMs, or dynamic library dependencies are required on target worker nodes.

---

## 5. Licensing and Supply Chain Security

All core and optional dependencies within Pummel have been audited for Open Source Initiative (OSI) compliance:

- **Core Framework**: Goose (Apache-2.0 / MIT), Tokio (MIT).
- **Serialization & Parsing**: Serde, Serde_YAML, Serde_JSON, TOML (MIT / Apache-2.0).
- **Networking & Protocols**: Tonic (Apache-2.0), Tokio-Tungstenite (MIT), Axum (MIT).
- **Data & Text Processing**: Regex, Quick-XML, CSV, Serde_JSON_Path (MIT / Apache-2.0).
- **Risk Assessment**: Zero copyleft (GPL / AGPL) licenses exist in the dependency tree. All dependencies are fully compliant with commercial distribution and private hosting requirements. Automated vulnerability audits are continuously executed via `cargo audit` in CI pipelines.

---

## 6. Schema and Architecture Evolution Strategy

Pummel adopts an **Expand-Contract (Parallel Run)** evolution pattern for test specifications:

1. **Expand**: Pummel deserializes both legacy Taurus YAML/JSON configurations and native shorthand definitions through unified internal AST structures.
2. **Validate**: Strict validation schemas and normalized representations ensure forward compatibility without breaking existing Taurus-based CI pipelines.
3. **Contract**: Deprecated features or unsupported runner directives issue explicit warnings while maintaining stable fallback execution paths.

---

## 7. Approval and Ratification

This Architectural Decision Record is ratified and enforced across the Pummel repository under Constitution v2.0.0 governance.
