Third-Party Dependencies and OSI Licensing
==========================================

This document details the licensing compliance, third-party dependency inventory, and supply chain governance for pummel in accordance with the project constitution and Open Source Initiative (OSI) standards.

License Architecture and Permissive Policy
------------------------------------------

Pummel and its core dependencies are distributed strictly under permissive Open Source Initiative (OSI) compliant licenses, predominantly dual-licensed under **MIT** and **Apache-2.0**.

Pummel does **not** link against or include any copyleft-licensed dependencies (such as GPL, AGPL, or LGPL). This guarantees:

* **Commercial Freedom**: Pummel can be used, embedded, and distributed within proprietary enterprise environments without triggering source disclosure obligations.
* **No Viral Licensing Contamination**: All third-party crates adhere to permissive attribution and disclaimer clauses.
* **Zero Royalty Obligations**: Free from patent or royalty encumbrances.

Dependency Inventory and License Matrix
---------------------------------------

The following matrix provides a complete inventory of production and optional dependencies categorized by functional domain and license.

Core Execution Engine
~~~~~~~~~~~~~~~~~~~~~

.. list-table::
   :widths: 25 20 55
   :header-rows: 1

   * - Crate
     - License
     - Description and Purpose
   * - ``goose``
     - Apache-2.0 / MIT
     - High-performance, asynchronous load generator framework.
   * - ``tokio``
     - MIT
     - Event-driven non-blocking asynchronous runtime.
   * - ``clap``
     - Apache-2.0 / MIT
     - Command-line argument parsing and CLI interface.
   * - ``thiserror``
     - Apache-2.0 / MIT
     - Structured domain error derivation.

Data Serialization and File Formats
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. list-table::
   :widths: 25 20 55
   :header-rows: 1

   * - Crate
     - License
     - Description and Purpose
   * - ``serde``
     - Apache-2.0 / MIT
     - Generic serialization and deserialization framework.
   * - ``serde_json``
     - Apache-2.0 / MIT
     - JSON data formatting and parsing.
   * - ``serde_yaml``
     - Apache-2.0 / MIT
     - Taurus and native YAML scenario parsing.
   * - ``toml``
     - Apache-2.0 / MIT
     - TOML configuration file deserialization.
   * - ``csv``
     - MIT / Unlicense
     - High-speed CSV dataset feeder.
   * - ``quick-xml``
     - MIT
     - High-performance XML parsing and JUnit report output.

Protocols and Networking
~~~~~~~~~~~~~~~~~~~~~~~~

.. list-table::
   :widths: 25 20 55
   :header-rows: 1

   * - Crate
     - License
     - Description and Purpose
   * - ``axum``
     - MIT
     - Ergonomic HTTP server for dynamic control and metrics API.
   * - ``tokio-tungstenite``
     - MIT
     - WebSocket protocol implementation over Tokio.
   * - ``futures-util``
     - Apache-2.0 / MIT
     - Stream and future combinators.
   * - ``tonic`` (optional)
     - Apache-2.0
     - High-performance gRPC client and transport.
   * - ``prost`` (optional)
     - Apache-2.0
     - Protocol Buffers implementation for Rust.
   * - ``prost-reflect`` (optional)
     - Apache-2.0 / MIT
     - Dynamic Protobuf reflection without precompiled schemas.

Observability and Utilities
~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. list-table::
   :widths: 25 20 55
   :header-rows: 1

   * - Crate
     - License
     - Description and Purpose
   * - ``tracing``
     - MIT
     - Structured diagnostics and application telemetry.
   * - ``tracing-subscriber``
     - MIT
     - Telemetry filtering and logging formatting.
   * - ``regex``
     - Apache-2.0 / MIT
     - Regular expression variable extraction.
   * - ``serde_json_path``
     - Apache-2.0 / MIT
     - JSONPath query evaluation for response assertions.
   * - ``influxdb`` (optional)
     - MIT
     - Time-series metrics shipping to InfluxDB v1/v2.
   * - ``fake`` (optional)
     - Apache-2.0 / MIT
     - Dynamic synthetic data generation for test macros.
   * - ``uuid`` (optional)
     - Apache-2.0 / MIT
     - Universally unique identifier generation.
   * - ``sxd-document`` / ``sxd-xpath`` (optional)
     - Apache-2.0 / MIT
     - Full XPath 2.0 evaluation for XML assertions.

Supply Chain Governance and Auditing
------------------------------------

Continuous automated audits are enforced across all build and release pipelines:

1. **Vulnerability Auditing**: ``cargo audit`` evaluates every dependency against the RustSec Advisory Database on every pull request.
2. **SBOM Generation**: Software Bill of Materials (SBOM) is automatically generated during release builds using ``syft``.
3. **Strict Transitive License Gating**: CI checks ensure no transitive copyleft dependencies are introduced during dependency updates.
