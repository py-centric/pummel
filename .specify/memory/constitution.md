<!--
Sync Impact Report:
Version change: 1.0.0 → 2.0.0
Bump rationale: MAJOR: Comprehensive overhaul of core principles and governance, consolidating into 5 core non-negotiable principles, multi-language quality and static analysis standards, Taskfile task runner architecture, observability and SLO definitions, single gateway pod architecture, comprehensive protocol specifications (REST/FastAPI, GraphQL, gRPC, Webhooks), multi-platform frontend/Flutter UI standards, resilience engineering, and formal ADR process.
Modified principles:
- I. Library-First → Replaced by I. Test-Driven Development (TDD)
- II. CLI Interface → Subsumed under III. Code Quality & Consistency and dedicated CLI framework specifications
- III. Test-First (NON-NEGOTIABLE) → I. Test-Driven Development (TDD) (coverage thresholds elevated to 90% backend, 80% frontend/CLI)
- IV. Integration Testing → Subsumed under I. Test-Driven Development (TDD) and Resilience, Cloud Emulation & Database Governance
- V. Automation & Verification → Subsumed under III. Code Quality & Consistency and V. Clean Version Control
- VI. Conventional & Atomic Commits → V. Clean Version Control & Commit Hygiene
- VII. History Management → V. Clean Version Control & Commit Hygiene
- VIII. Licensing & Compliance → Expanded in IV. Comprehensive Documentation and Supply Chain Security & Repository Hygiene
- IX. Pedantic Observability → Replaced and expanded by Observability, SLAs/SLOs & Health Probes
- X. Security-First Architecture → II. Security-First Architecture (strengthened with fernet, argon2, bandit, and strict key hygiene)
- XI. Simplicity & YAGNI → Replaced by Governance and ADR process
Added sections:
- III. Code Quality & Consistency (including Mandatory Post-Implementation Static Code Analysis and Typography & Punctuation Standard)
- IV. Comprehensive Documentation & Code-Based Diagramming
- Task Runner Architecture (Taskfile.yml)
- Observability, SLAs/SLOs & Health Probes
- Single Exposed Gateway Port & Pod Boundary Architecture
- Standardized Typer CLI Framework
- FastAPI, GraphQL & Web API Standards
- gRPC Design & Performance Standards
- Webhook Delivery & Integration Standards
- Python Stack Design & uv Standard
- Go Stack Design
- Rust CLI/TUI Stack Design
- Frontend & Multi-Platform UI/UX Architecture
- AI & Machine Learning Stack Design
- Resilience, Cloud Emulation & Database Governance
- Supply Chain Security & Repository Hygiene
- Governance: Architectural Flexibility & Technology Evaluation (ADR Process), Contributor Email Masking, Runtime Guidance
Removed sections:
- Quality Gates & Documentation (restructured into III, IV, and Supply Chain Security)
- Development Workflow (restructured into Task Runner, Hooks, and Clean Version Control)
Follow-up TODOs: none
Templates requiring updates:
- .specify/templates/plan-template.md
- .specify/templates/spec-template.md
- .specify/templates/tasks-template.md
-->

# pummel Constitution

## Core Principles

### I. Test-Driven Development (TDD)

All development MUST strictly adhere to the Red-Green-Refactor cycle. Tests MUST be written first to fail (Red), implemented to pass (Green), then optimized (Refactor). Unit, integration, and end-to-end tests MUST be written for each feature prior to implementation. Code coverage MUST meet or exceed 90% for core backend domain logic and services, and 80% for frontend UI components and CLI tools. Tests MUST pass in both local pre-commit hooks and GitHub Actions CI.

### II. Security-First Architecture

Security is integrated into the core architecture. ALL data MUST be encrypted at rest and in transit, with the sole exception of UUIDs. Symmetric encryption MUST use cryptography.fernet. All hashing MUST use a minimum of SHA256. End-to-end encryption (E2EE) MUST be implemented on the user side for all private messages. passlib or argon2-cffi MUST be used for all credential handling. uvx bandit backend -r MUST report no high-severity issues before any commit.

### III. Code Quality & Consistency

All code MUST pass language-specific linting and formatting checks before commit: ruff and ty for Python; golangci-lint and go fmt for Go; cargo clippy and cargo fmt for Rust; flutter analyze for Dart. Static type annotations are mandatory. vulture MUST be executed to prevent dead code accumulation. Source code files MUST maintain high cohesion and low coupling; monolithic "god files" and sprawling multi-responsibility classes/functions are strictly prohibited. Single large files MUST be split into modular, reusable, and single-purpose components. Inline comments MUST be avoided unless absolutely necessary; descriptive variable and function names MUST be used instead.

**Mandatory Post-Implementation Static Code Analysis**:
Immediately following every implementation step, feature addition, bug fix, or automated code generation workflow (including AI-driven commands or workflow tasks such as specify.implement), relevant static code analysis tasks (e.g. task lint, uvx ruff check, uvx ty check, flutter analyze, golangci-lint, cargo clippy) MUST be executed across all modified submodules. All static analysis checks and formatting verification MUST pass cleanly without warnings before code is staged or committed to version control.

**Typography & Punctuation Standard**:
Em-dashes MUST NOT be used anywhere in the project ecosystem, including documentation, source code comments, docstrings, UI string literals, commit messages, or localization files. Standard hyphens (-), colons (:), or parentheses MUST be used instead to maintain clean, predictable character rendering across all platforms and terminals.

### IV. Comprehensive Documentation & Code-Based Diagramming

Detailed documentation is essential for maintainability and commercial readiness. Sphinx MUST be used to generate the central documentation portal for both backend and frontend. Language-native doc generators (cargo doc for Rust, dart doc for Flutter, godoc for Go) MAY be used to build API references, provided their HTML outputs are compiled or linked into the Sphinx portal. Google-style docstrings MUST be used for all Python functions and classes. READMEs serve high-level TLDR documentation; Sphinx serves thorough in-depth documentation.

**Mandatory Dependencies, Licensing & Commercialization Section**:
Sphinx documentation MUST include a dedicated, auto-generated or verified section detailing all third-party libraries, modules, and dependencies across every language in the stack. This section MUST explicitly document:
- Inventory: Package names, exact pinned versions, and official OSI license types.
- License Classification: Categorization into Permissive (e.g., MIT, Apache 2.0, BSD), Weak Copyleft (e.g., LGPL, MPL), or Strong Copyleft (e.g., GPL, AGPL).
- Commercialization & Monetization Implications: Legal and operational implications for commercial software distribution, proprietary SaaS/cloud hosting (e.g., AGPL network trigger risks), source code disclosure obligations, patent grants, and mandatory copyright attributions. Automated license audit tools (pip-licenses, go-licenses, cargo-license) MUST be integrated into build pipelines.

**Mandatory Code-Based Diagramming**:
- Architecture, data flows, sequence interactions, and module relationships MUST be documented using code-based diagramming tools rather than manual image editors.
- Python Diagrams: Use the diagrams Python package (diagrams.aws, diagrams.onprem, diagrams.programming, etc.) to programmatically generate cloud and service architecture diagrams.
- Mermaid Diagrams: Embedded inline in Markdown (.md) documentation files and rendered in Sphinx using sphinxcontrib-mermaid. Flowcharts, sequence diagrams, state machines, and ER diagrams MUST be written as Mermaid code blocks.
- Generated diagram artifacts MUST be compiled into Sphinx build outputs during CI/CD.

### V. Clean Version Control & Commit Hygiene

A clean, linear history is mandatory. Commits MUST use conventional commit messages (feat:, fix:, docs:, refactor:, test:, chore:) and be atomic (one logical change per commit). An atomic commit MUST be created immediately after completion of each discrete task. Always rebase to main; merge commits are PROHIBITED. Pre-commit and pre-push hooks are mandatory.

## Task Runner Architecture (Taskfile.yml)

- Canonical Task Entrypoint: Task (go-task) is the mandatory command runner across all environments. Developers and CI pipelines MUST use task commands rather than raw shell scripts or Makefiles.
- Cross-Platform Compatibility: Taskfiles MUST use Task's built-in cross-platform shell interpreter (mvdan/sh) to guarantee identical command behavior across Windows, macOS, and Linux without requiring WSL or Git Bash.
- Container CLI Autodetect: Taskfiles MUST dynamically detect container runtimes, preferring podman / podman-compose and falling back to docker / docker compose.
- Runtime Execution Control: Tasks MUST support dynamic variable overrides for execution mode (MODE=local vs MODE=container), custom host ports (PORT=8000), debug levels (LOG_LEVEL=debug), target UI devices (DEVICE=chrome, DEVICE=android), build targets (BUILD_TYPE=apk, BUILD_TYPE=web), and SSH parameters (SSH_HOST, SSH_KEY, SSH_PORT).
- Hybrid Execution Standard (task dev:hybrid): Standardized task command to boot containerized background infrastructure while running host-native UI debugging on target platforms (macOS, Windows, Linux, Android, iOS, Chrome). Network resolution MUST automatically inject host loopback endpoints (http://10.0.2.2:PORT for Android emulators, http://127.0.0.1:PORT for Web/Desktop/iOS Simulators).

## Observability, SLAs/SLOs & Health Probes

### Service Level Objectives (SLOs) & SLAs

- Availability SLO: Services MUST maintain >= 99.9% uptime over a rolling 30-day window.
- Latency SLO: REST/GraphQL/gRPC APIs MUST achieve p95 latency < 200ms and p99 latency < 500ms for standard read/write requests.
- Error Budget Governance: Depletion of > 50% error budget triggers mandatory architectural review; 100% depletion freezes feature deployment in favor of stability fixes.

### Unified Observability Stack

- OpenTelemetry (OTel): All backend services MUST expose OpenTelemetry metrics and traces propagated via standard headers (Trace-ID).
- Prometheus & Grafana: Prometheus MUST scrape /metrics endpoints across services; Grafana serves as the central operational dashboard. Extensive Grafana dashboards MUST be generated.
- Loki & Grafana Alloy: Structured JSON logs MUST be pushed or collected via Grafana Alloy into Loki for log aggregation and correlation with OTel traces.

### Standardized Health & Metric Endpoints

All HTTP/gRPC backend microservices MUST implement the following probes:
- /health or /healthz: General service health status JSON response.
- /health/liveness: Fast check returning HTTP 200 to indicate process execution without external dependency checks.
- /health/readiness: Deep dependency check verifying connectivity to Redis, MongoDB, and message queues before receiving traffic.
- /metrics: Prometheus-compatible exposition format for OTel metrics.

## Single Exposed Gateway Port & Pod Boundary Architecture

- Project Pod Boundary: In local and hybrid execution environments (task up, task dev:hybrid), all background infrastructure containers (Redis, Mongo, OpenSearch, Prometheus, Loki, Alloy, Grafana) MUST run inside a single project-named Pod (pod-pummel).
- Single Host Gateway Port: A single reverse-proxy gateway (e.g., Traefik, Nginx, Envoy) MUST expose only ONE host HTTP port for Web Dashboards and HTTP APIs:
  - /docs & /redoc: Interactive API Documentation.
  - /grafana: Operational Monitoring Dashboards.
  - /prometheus: Time-Series Metrics Server.
  - /loki & /alloy: Log Aggregation & Telemetry Collector.
  - /opensearch: Vector Search UI / API.
- Binary Wire Protocol Direct Port Mapping: Custom non-HTTP binary wire protocols (MongoDB Wire Protocol on 27017, Redis RESP on 6379, gRPC HTTP/2 transport on 50051) MUST map dedicated container ports directly on the pod interface, separated from HTTP path multiplexing.
- Port Allocation & Port Syncing: Local development defaults to deterministic ports (PORT=8000) for host DX. Concurrent CI or matrix pipelines MUST dynamically assign unprivileged ports. The allocated gateway port MUST be automatically injected into sub-projects and UI builds via --dart-define=API_URL=... or environment variables at build time.

## Standardized Typer CLI Framework

- Standard Python CLI Engine: All Python CLI entrypoints MUST be implemented using Typer paired with rich for formatted terminal rendering.
- Strict stderr Logging Redirection: Boot loggers and system initialization messages MUST direct structured logs strictly to sys.stderr. Programmatic stdout MUST remain completely clean for output data, piped streams, and --help flags.
- Unified Root Taxonomy: All Python application CLIs MUST implement standardized top-level commands:
  - serve: Launch backend service and/or web interfaces.
  - test: Execute pytest test suite with preset environment flags.
  - seed: Populate databases with Faker test records.
  - clear: Truncate database collections (requires --force confirmation).
  - reset: Compound task executing clear followed by seed.
  - setup: Interactive onboarding wizard for configuring local settings and secrets.
  - doctor: Comprehensive system health and dependency diagnostic check.
  - backup: Create database snapshots (mongodump).
  - restore: Restore database from snapshots (mongorestore).
  - loadtest: Execute performance benchmark suites (bzt / python-bzt).
  - admin: User management and administrative operations.
  - secrets: Local secrets management CLI integration (gopass/openbao).
- Subcommand Group Isolation: Project-specific or domain-unique commands MUST be namespaced under dedicated subcommand groups (e.g., uv run . github ..., uv run . flutter ..., uv run . mcp ...).

## FastAPI, GraphQL & Web API Standards

- REST Web Services: FastAPI using Pydantic models for validation, serialization, and OpenAPI schema generation.
- GraphQL APIs: Strawberry is mandated for Python GraphQL services due to its type-hint native design, dataclass syntax, async execution, and seamless FastAPI integration. Strawberry DataLoaders MUST be used to prevent N+1 query overhead across resolvers.
- Persistence & Messaging Infrastructure:
  - MongoDB via Motor and Beanie (async).
  - Redis or Valkey for caching and session management.
  - Memgraph via Strawberry for graph operations.
  - Asynchronous messaging MUST use RabbitMQ for complex routing, Kafka for high-throughput streaming, or Redis/Valkey Streams for lightweight event processing.
  - Load and performance testing MUST use bzt (Taurus) / python-bzt.
- Error Handling & Headers:
  - REST error responses MUST strictly comply with RFC 7807 (Problem Details) standard JSON formats.
  - GraphQL error responses MUST utilize Strawberry error extensions.
  - Idempotency-Key header MUST be required for non-idempotENT POST/mutation endpoints.
  - Trace-ID header MUST be propagated across requests for OpenTelemetry trace correlation.
- Rate Limiting & Protection: Use slowapi for REST rate limiting, and enforce GraphQL query depth and complexity limiters in Strawberry.

## gRPC Design & Performance Standards

- Schema-First Protobuf Contracts: All gRPC interfaces MUST be defined in .proto files adhering to Protocol Buffers v3 specification. Proto files MUST be organized in a centralized proto/ directory or dedicated schema repository.
- Tooling & Linting: buf MUST be used for linting proto files (buf lint), checking breaking changes (buf breaking), and generating language-specific stubs (buf generate). Manual protoc scripts are strictly prohibited.
- Backward Compatibility Rules: Protocol definitions MUST strictly preserve backward compatibility. Field tags MUST NEVER be renumbered or reused. Removed fields MUST be marked with the reserved keyword.
- Deadlines & Context Propagation: Every gRPC client call MUST enforce an explicit deadline (context.WithTimeout in Go, timeout kwarg in Python, grpc-timeout header). Servers MUST respect incoming client deadlines and abort downstream operations upon cancellation.
- Health Checking Protocol: All gRPC services MUST implement the standard gRPC Health Checking Protocol (grpc.health.v1.Health).
- Status Code Mapping: Errors MUST use canonical gRPC status codes (INVALID_ARGUMENT, UNAUTHENTICATED, PERMISSION_DENIED, NOT_FOUND, RESOURCE_EXHAUSTED, INTERNAL, UNAVAILABLE) accompanied by rich error details (google.rpc.Status).
- Interceptors: Cross-cutting concerns (authentication, OpenTelemetry tracing, structured logging, panic recovery) MUST be implemented using gRPC client and server interceptors.

## Webhook Delivery & Integration Standards

- Payload Signing & Cryptographic Verification: All outbound webhooks MUST include a cryptographic signature header (X-Signature-256) computed as an HMAC-SHA256 hash of the raw HTTP request body using a shared secret. Receivers MUST verify signatures before processing payloads.
- Idempotency & Event Identifiers: Every webhook delivery MUST include a unique event ID (X-Webhook-ID) and event type (X-Webhook-Event, e.g. order.created.v1). Receivers MUST log and deduplicate processed event IDs to guarantee idempotent execution.
- Asynchronous Queue-Backed Delivery: Webhooks MUST NEVER be delivered inline during synchronous HTTP request handling. Outbound events MUST be published to a durable message broker (Redis Streams, RabbitMQ, Kafka) and dispatched asynchronously by background workers.
- Retry Policies & Exponential Backoff: Webhook delivery workers MUST retry failed delivery attempts (HTTP 4xx/5xx or connection timeouts) using exponential backoff with randomized jitter (e.g. 5s, 30s, 5m, 30m, 2h). Maximum retry duration MUST NOT exceed 24 hours.
- Circuit Breaking & Dead-Letter Queues (DLQ): Webhook destinations failing continuously beyond a configurable threshold (e.g., 50 consecutive failures) MUST be automatically paused, alerting the subscriber. Unprocessable messages MUST be routed to a Dead-Letter Queue (DLQ) for inspection.
- Timeout Restrictions: Webhook HTTP POST requests MUST enforce a strict response timeout (maximum 5 seconds) to prevent worker pool starvation.

## Python Stack Design & uv Standard

- Strict uv Ecosystem Standard: uv is the exclusive package manager, workspace lockfile engine (uv.lock), and build tool (uv build).
- Mandatory uv run & uvx Execution Directive: All Python scripts, tests, servers, and tooling extensions MUST be invoked via uv run (e.g., uv run pytest, uv run uvicorn) or uvx (e.g., uvx ty check, uvx ruff check, uvx bandit). Direct unmanaged python or pip calls are strictly prohibited.
- Project Structure: Modular single-purpose components (routers/, services/, models/, schemas/, dependencies/, utils/, middleware/). Monolithic god files are banned. Entrypoints MUST reside in backend/main.py or backend/__main__.py.
- Environment & Secrets Handling: Public non-sensitive settings reside in config/settings.env. Sensitive credentials reside in config/secrets.env (git-ignored) or are injected dynamically at runtime via openbao / gopass.
- Logging & Data: Standard logging module with JSON formatting; raw print() statements are prohibited in production. Python dataclasses or Pydantic models MUST be used for typed data structures.

## Go Stack Design

- Project Structure: Strictly adhere to Standard Go Project Layout (cmd/ for entrypoints, internal/ for private business logic, pkg/ for public libraries).
- Framework & Libraries: go-chi/chi for REST routing, gqlgen for schema-first GraphQL, sqlc for type-safe database queries, jackc/pgx for PostgreSQL, go-playground/validator/v10 for struct validation.
- Concurrency & Errors: context.Context MUST be passed as first parameter to async calls. Bare goroutines are PROHIBITED; use sync.WaitGroup or errgroup.Group. Use Go 1.13+ error wrapping (fmt.Errorf("...: %w", err)).
- Observability & Linting: Structured log/slog in JSON format. Continuous checks via golangci-lint and gosec.

## Rust CLI/TUI Stack Design

- Runtime & Concurrency: tokio for async runtime.
- CLI & TUI Libraries: clap (derive feature) for argument parsing, ratatui for terminal interfaces, crossterm for cross-platform rendering.
- Error Handling & Observability: anyhow for application error contexts, thiserror for typed domain enums, tracing and tracing-subscriber for async-aware logging.
- Code Quality: Strict enforcement via cargo clippy -- -W clippy::pedantic -W clippy::security, cargo check, and cargo test with rstest.

## Frontend & Multi-Platform UI/UX Architecture

- Code Quality & Static Analysis: flutter analyze MUST pass cleanly without warnings before any commit.
- Mandatory PyCentric Branding & Attribution:
  - ALL user-facing web dashboards, mobile applications, desktop applications, and landing interfaces MUST display explicit attribution to PyCentric (e.g., "Copyright PyCentric", "Developed by PyCentric", or "Built by PyCentric") in footer elements, about dialogs, or splash screens, unless explicitly instructed otherwise by the user.
  - Where applicable, application startup routines MUST incorporate PyCentric branding on the splash screen or initial boot screen.
- Responsive & Adaptive Multi-Platform Layouts:
  - UI layouts MUST adapt gracefully across Mobile (phones), Tablets, Desktop (macOS, Windows, Linux), and Web targets.
  - Breakpoint System: Apps MUST implement an explicit breakpoint grid (e.g., Compact < 600dp, Medium 600-840dp, Expanded > 840dp).
  - Adaptive Navigation: Use BottomNavigationBar for compact screens, NavigationRail for medium tablet screens, and full NavigationDrawer / Permanent Sidebar for expanded desktop / web layouts.
  - Fluid Grids & Scaling: Fixed pixel dimensions MUST be avoided; responsive layout builders (LayoutBuilder, MediaQuery, Flex, GridView) MUST be used for dynamic content adaptation.
- User Experience (UX), Ergonomics & Theme Modes:
  - Three Theme Modes Required: Applications MUST support Adaptive Light mode, Dark mode, and High Contrast mode based on system settings or explicit user selection to ensure visual accessibility across all environments.
  - Minimum Touch Targets: Interactive UI elements MUST maintain a minimum touch target size of 48x48dp on touch devices.
  - State Feedback & Skeleton States: All async actions MUST provide immediate visual feedback (loading skeletons, progress indicators, disabled buttons during pending mutations).
  - Optimistic UI Updates: UI state SHOULD update optimistically for low-risk user interactions while maintaining automatic rollback handling on network failure.
  - Desktop & Web Ergonomics: Full support for keyboard navigation (FocusTraversalGroup), hover states, context menus, mouse scrollwheels, and standard keyboard shortcuts (e.g., Cmd/Ctrl+F, Cmd/Ctrl+S, Esc).
- Zero-Data, Error & Offline Resilience:
  - Meaningful Empty States: Never present a blank white screen when lists or search results are empty. Empty states MUST include an illustrative icon, descriptive title, explanation, and primary call-to-action (CTA).
  - Actionable Error Recovery: Replace status codes with clear copy and in-place "Retry" mechanisms. Isolate widget failures without crashing entire screens.
  - Offline & Connectivity Awareness: Provide subtle status indicators when network connectivity changes. Display stale cached data with explicit timestamps and support optimistic offline queuing.
- Form Ergonomics & Input Design:
  - Real-Time Inline Validation: Validate input fields as users type or on blur, accompanied by clear visual indicators and explanatory error text below the input field.
  - Platform-Native Inputs: Pass explicit input types (email, phone, numeric) for smart keyboard selection, implement OS autofill hints, debounce submit buttons, and enforce tab focus traversal.
- Typographic Scale & OS Scaling:
  - Adhere to explicit typographic hierarchies (Display, Headline, Title, Body, Caption).
  - Respect OS-level text scaling settings and enforce explicit overflow handling (TextOverflow.ellipsis, scroll views) to prevent layout pixel overflow errors.
- Motion, Micro-Interactions & Reduced Motion:
  - Purposeful Motion: Use motion (150-300ms) to establish spatial relationships (shared axis transitions, sliding drawers).
  - Reduced Motion Compliance: Respect system preferences for reduced motion (prefers-reduced-motion / MediaQuery.disableAnimations) by replacing slide/scale animations with cross-fades or instant state updates.
- Interface Fluidity & Performance (60/120 FPS Target):
  - Background Processing: Offload computational tasks (JSON parsing, data transformations, crypto) to isolates or background threads to maintain 60/120 FPS.
  - Widget Virtualization: Always use lazy-loading virtualized lists (ListView.builder, GridView.builder) for collections larger than 10 items.
- Asset Optimization & Fallback Selection:
  - Prefer SVG vector graphics (flutter_svg) over raster PNG images for resolution independence across high-DPI displays. Use WebP/AVIF compression and blurhash/skeleton placeholders during asset downloads.
  - Fallback Asset & Icon Selection: For Flutter applications and UI layouts, if an explicit image asset or icon is not explicitly provided in design specifications, the AI or developer MUST select an appropriate, contextually relevant standard system icon (e.g., Material Icons or CupertinoIcons) or vector fallback to ensure clean and complete UI rendering.
- Dialog, Modal & Notification Hierarchy:
  - Snackbars & Toasts: Non-intrusive, passive feedback ("Draft saved") with optional Undo action.
  - Banners: Persistent inline system alerts without blocking interaction.
  - Modals & Dialogs: Intrusive, high-stakes decisions or destructive actions ("Delete Account").
- Web & Deep-Linking State Synchronization:
  - Every major view or filter MUST reflect in browser URL paths with standard browser Back/Forward navigation support and direct deep-linking capability.
- Accessibility (a11y) & Interaction Standards:
  - All interactive UI components MUST provide Semantics labels and screen reader compatibility (WCAG 2.1 AA compliance).
  - Standard UI interactions MUST include descriptive tooltips for icons/actions, expressive hover states for cursor targets, clear visual focus indicators for keyboard traversal, and high-contrast text rendering.
- Strict Localization (i18n) & Internationalization:
  - All user-facing text strings MUST reside in .arb localization files (l10n). Hardcoded string literals in UI widgets are strictly prohibited.
  - Locale-Aware Formatting: Dates, times, numbers, percentages, and currencies MUST be formatted using locale-aware formatters (e.g., intl package).
  - Pluralization & Gender Support: Pluralization rules MUST be explicitly handled in .arb files using ICU message syntax rather than custom string concatenation.
- Testing & Architecture: Comprehensive widget, unit, and integration testing using standard Flutter test tools. Consistent logging infrastructure across mobile, desktop, and web targets.

## AI & Machine Learning Stack Design

- AI Frameworks & Services: pydantic-ai for agentic frameworks, promptfoo for prompt evaluation, ollama for local service execution, OpenSearch for vector embeddings/full-text search, Memgraph via Strawberry for knowledge graphs.
- ML/DL Frameworks: scikit-learn for traditional ML, pytorch or tensorflow/keras for deep learning, pandas and numpy for data manipulation.
- Pipeline Governance: Preprocessing pipelines MUST use Pipeline and ColumnTransformer. Scikit-learn models saved with joblib; Keras models saved in .keras or SavedModel formats.
- Reproducibility & Execution: Explicit random seeds mandated across all stochastic functions. Models MUST be device-agnostic with CPU fallback and active VRAM memory management. MLflow for experiment tracking.

## Resilience, Cloud Emulation & Database Governance

- Network Timeouts & Retries: All HTTP/gRPC clients and database connections MUST configure explicit timeouts. External calls MUST use exponential backoff with full jitter via tenacity or language equivalents.
- Cloud Emulation & Integration Testing Infrastructure: For cloud-native local development and integration testing, local cloud service emulators MUST be used instead of live public cloud provider endpoints: floci for unified AWS/GCP/Azure emulation; fakecloud for AWS service mocks; localgcp or minisky for GCP service mocks.
- Graceful Process Termination: Backend services MUST listen for SIGTERM and SIGINT signals to gracefully complete active requests, flush telemetry buffers, and release database locks within a configurable grace period (e.g. 15 seconds).
- Zero-Downtime Schema Evolution: Database migrations MUST follow the Expand-Contract (Parallel Run) pattern. Schema changes MUST be backward-compatible with running application versions. Tooling: Alembic for Python SQL, Atlas/golang-migrate for Go, versioned Beanie migrations for Mongo.

## Supply Chain Security & Repository Hygiene

- OSI Licensing & Automated Audits: Dependencies across Python, Go, Rust, Dart, and Node MUST use OSI-compliant licenses (MIT, Apache 2.0, BSD). Copyleft licenses (GPL, AGPL) require explicit maintainer justification and architectural approval. Automated license audits MUST feed Sphinx documentation.
- Software Bill of Materials (SBOM) & Vulnerability Scanning: CI pipelines MUST generate SBOM artifacts using syft and scan containers/dependencies using trivy, uv audit, govulncheck, and cargo audit.
- Version Control Exclusions (.gitignore & .dockerignore):
  - MUST exclude secret credentials (config/secrets.env, .env, *.pem, *.key).
  - MUST exclude toolchain caches (.venv/, .pytest_cache/, .ruff_cache/, .ty_cache/, __pycache__/, .task/).
  - MUST exclude build artifacts (dist/, build/, bin/, *.egg-info/, .dart_tool/, target/).
  - MUST exclude AI agent context, prompt, and guidance files (agent.md, .agent/, .claude/, .cursor/, .copilot/, *.prompt.md) unless explicitly instructed otherwise by the user.
  - MUST exclude speckit, specification, and feature prompt artifacts (.specify/, .speckit/, specs/, *.spec.md) unless explicitly instructed otherwise by the user.
  - MUST exclude constitution definitions and architecture analysis artifacts (constitution.py, constitution.md, constitution_analysis.md) unless explicitly instructed otherwise by the user.
  - MUST exclude OS metadata (.DS_Store, Thumbs.db).
  - .dockerignore MUST explicitly exclude .git/, .github/, docs/, and test files (tests/) to minimize build context transfer times.
- Contributor Privacy: If the project is open source, contributor email addresses MUST be masked in git commits and public documentation to safeguard developer privacy.

## Governance

### Architectural Flexibility & Technology Evaluation (ADR Process)

The technology choices defined across this Constitution (e.g., FastAPI, MongoDB, Redis, Motor) serve as the primary baseline for standard microservices. However, technology stack flexibility is explicitly permitted when dictated by domain requirements.

- Scope of Alternatives: Where specific domain requirements dictate alternative frameworks, databases, or messaging paradigms (e.g., Django or Flask for admin/ORM web apps, PostgreSQL or CockroachDB for relational transactions, ZeroMQ or NATS for high-throughput IPC), teams MAY evaluate and propose alternative stack components.
- Mandatory Architectural Decision Record (ADR): Before writing production code or introducing non-standard technologies, the team MUST author a formal ADR documenting:
  1. Problem Context & Technical Rationale: Clear explanation of why the baseline stack is insufficient.
  2. Evaluated Alternatives Matrix: Structured evaluation comparing at least two viable technologies across latency, throughput, developer ergonomics, operational complexity, and ecosystem maturity.
  3. Operational & Observability Footprint: Impact on deployment, container image size, OpenTelemetry/logging integration, and maintenance overhead.
  4. Licensing & Supply Chain Audit: Verification of OSI-compliant licensing and commercialization risks.
  5. Data & Schema Migration Strategy: Proposed evolution pattern (Expand-Contract) if replacing a persistence engine.
- Approval Gate: The ADR MUST be reviewed and approved by lead architects and project maintainers before code integration into main.

### Governance Rules & Amendment Policy

This Constitution supersedes all other development practices and guidelines. All pull requests and code reviews MUST verify compliance with these principles. Amendments require:

1. Documentation of the proposed change and rationale.
2. Approval from project maintainers.
3. Migration plan for any breaking governance changes.
4. Version increment per semantic rules (MAJOR for incompatible changes, MINOR for new principles, PATCH for clarifications).

Use `.specify/memory/` guidance files for runtime development guidance.

**Version**: 2.0.0 | **Ratified**: 2026-04-12 | **Last Amended**: 2026-09-16
