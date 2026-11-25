export type ConfigFormat = 'yaml' | 'json' | 'toml';

export type ProtocolType = 'http' | 'websocket' | 'grpc';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';

export type GrpcMode = 'unary' | 'server-streaming' | 'client-streaming' | 'bidi-streaming';

export type SlaMetric =
  | 'fail-rate'
  | 'avg-response-time'
  | 'p90-response-time'
  | 'p95-response-time'
  | 'p99-response-time'
  | 'throughput';

export type SlaComparator = '>' | '<' | '>=' | '<=';

export type SlaAction = 'stop' | 'warn' | 'continue' | `exec:${string}`;

export interface SlaCriterion {
  id: string;
  metric: SlaMetric;
  comparator: SlaComparator;
  threshold: number;
  unit: '%' | 'ms' | 'rps';
  subject?: string;
  action: SlaAction;
  timeframeSec?: number;
}

export interface PacingConfig {
  rate: number;
  per: 'second' | 'minute';
  randomize: boolean;
}

export interface DataSourceConfig {
  path: string;
  delimiter?: string;
  quoted?: boolean;
  loopData?: boolean;
  ordered?: boolean;
  estimatedSizeBytes?: number;
}

export interface ScenarioRequest {
  label: string;
  url: string;
  method: HttpMethod;
  protocol: ProtocolType;
  grpcMode?: GrpcMode;
  timeoutMs?: number;
  body?: string;
  bodyFile?: string;
  assertions?: string[];
  extractors?: string[];
  condition?: string;
}

export interface ScenarioConfig {
  name: string;
  weight: number;
  thinkTimeMs: number;
  onStart: ScenarioRequest[];
  requests: ScenarioRequest[];
  dataSources: DataSourceConfig[];
}

export interface DistributedConfig {
  enabled: boolean;
  coordinatorBind: string;
  quorumWorkers: number;
  shardStrategy: 'weighted-capacity' | 'round-robin';
  heartbeatIntervalMs: number;
  telemetryFlushMs: number;
  tlsMode: 'mtls' | 'tls' | 'plaintext-local';
  tuiEnabled: boolean;
}

export interface ChaosHook {
  phase: 'prepare' | 'startup' | 'shutdown';
  name: string;
  command: string;
  platform: 'unix' | 'windows';
}

export interface ControlApiConfig {
  enabled: boolean;
  bindAddress: string;
  port: number;
}

export interface ExecutionPlan {
  scenario: string;
  concurrency: number;
  rampUpSec: number;
  holdForSec: number;
  throughputLimit?: number;
  pacing?: PacingConfig;
}

export interface PummelConfig {
  name: string;
  execution: ExecutionPlan[];
  scenarios: Record<string, ScenarioConfig>;
  distributed: DistributedConfig;
  sla: SlaCriterion[];
  services: ChaosHook[];
  api: ControlApiConfig;
  reporting: ('cli' | 'junit-xml' | 'html' | 'influxdb')[];
}

export type WorkerStatus = 'ready' | 'running' | 'degraded' | 'offline';

export interface WorkerNode {
  id: string;
  hostname: string;
  region: string;
  grpcEndpoint: string;
  cpuCores: number;
  capacityWeight: number;
  assignedVUs: number;
  activeVUs: number;
  currentRps: number;
  avgLatencyMs: number;
  errorRatePct: number;
  cpuUsagePct: number;
  memoryMb: number;
  lastHeartbeatMs: number;
  status: WorkerStatus;
}

export interface EndpointMetrics {
  label: string;
  protocol: ProtocolType;
  totalRequests: number;
  failedRequests: number;
  timingsMs: number[];
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  currentRps: number;
}

export interface SlaEvaluationResult {
  criterion: SlaCriterion;
  currentValue: number;
  breached: boolean;
  triggeredAction?: string;
  breachCount: number;
}

export interface ChaosHookExecution {
  phase: 'prepare' | 'startup' | 'shutdown';
  name: string;
  command: string;
  status: 'pending' | 'completed' | 'failed';
  timestampSec: number;
}

export interface RunLogEntry {
  id: string;
  timestampSec: number;
  level: 'INFO' | 'WARN' | 'SLA' | 'CHAOS' | 'GRPC';
  source: string;
  message: string;
}

export type RunStatus = 'idle' | 'preparing' | 'running' | 'paused' | 'aborted_sla' | 'completed';

export interface TelemetryPoint {
  elapsedSec: number;
  rps: number;
  activeVUs: number;
  avgMs?: number;
  p95Ms: number;
  p99Ms?: number;
  failRatePct: number;
}

export interface DistributedRunState {
  status: RunStatus;
  phase: 'idle' | 'prepare' | 'ramp-up' | 'hold-for' | 'shutdown' | 'done';
  elapsedSec: number;
  totalDurationSec: number;
  targetConcurrency: number;
  activeVUs: number;
  totalRequests: number;
  totalFailures: number;
  currentRps: number;
  globalAvgMs: number;
  globalP90Ms: number;
  globalP95Ms: number;
  globalP99Ms: number;
  globalFailRatePct: number;
  chaosFaultActive: boolean;
  workers: WorkerNode[];
  endpoints: EndpointMetrics[];
  slaResults: SlaEvaluationResult[];
  execHooksTriggered: string[];
  hookExecutions: ChaosHookExecution[];
  history: TelemetryPoint[];
  logs: RunLogEntry[];
}

export type DiagnosticTag =
  | '[IO]'
  | '[SERDE]'
  | '[GOOSE]'
  | '[VALIDATION]'
  | '[MOCK]'
  | '[NETWORK]'
  | '[SLA]'
  | '[ENV]'
  | '[NOT IMPLEMENTED]'
  | '[INTERNAL]';

export interface ValidationDiagnostic {
  id: string;
  tag: DiagnosticTag;
  severity: 'error' | 'warning' | 'pass';
  field: string;
  message: string;
  remediation?: string;
}

export interface ComplianceRequirement {
  id: string;
  group: 'Functional' | 'Non-Functional';
  category: string;
  title: string;
  requirement: string;
  status: 'pass' | 'warning' | 'fail';
  evidence: string;
  verificationMethod: string;
}
