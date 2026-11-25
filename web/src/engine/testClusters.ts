import type { PummelConfig, RunLogEntry, WorkerNode } from '../types/pummel';

export interface TestClusterProfile {
  id: string;
  name: string;
  environment: 'production' | 'staging' | 'canary' | 'sandbox';
  region: string;
  coordinatorBind: string;
  tlsMode: 'mtls' | 'tls' | 'plaintext-local';
  quorumWorkers: number;
  workers: readonly {
    id: string;
    hostname: string;
    region: string;
    grpcEndpoint: string;
    cpuCores: number;
    capacityWeight: number;
    lastHeartbeatMs: number;
  }[];
}

export const TEST_CLUSTER_PROFILES: readonly TestClusterProfile[] = [
  {
    id: 'prod-eu-west',
    name: 'EU-West Primary',
    environment: 'production',
    region: 'eu-west-2',
    coordinatorBind: '127.0.0.1:50051',
    tlsMode: 'mtls',
    quorumWorkers: 2,
    workers: [
      {
        id: 'worker-eu-west-01',
        hostname: 'pummel-wrk-01.internal',
        region: 'eu-west-2',
        grpcEndpoint: '10.42.1.11:50052',
        cpuCores: 16,
        capacityWeight: 2,
        lastHeartbeatMs: 14,
      },
      {
        id: 'worker-eu-west-02',
        hostname: 'pummel-wrk-02.internal',
        region: 'eu-west-2',
        grpcEndpoint: '10.42.1.12:50052',
        cpuCores: 16,
        capacityWeight: 2,
        lastHeartbeatMs: 18,
      },
      {
        id: 'worker-us-east-01',
        hostname: 'pummel-wrk-03.internal',
        region: 'us-east-1',
        grpcEndpoint: '10.42.2.21:50052',
        cpuCores: 8,
        capacityWeight: 1,
        lastHeartbeatMs: 39,
      },
    ],
  },
  {
    id: 'staging-us-east',
    name: 'US-East Staging',
    environment: 'staging',
    region: 'us-east-1',
    coordinatorBind: '10.44.8.10:50051',
    tlsMode: 'tls',
    quorumWorkers: 2,
    workers: [
      {
        id: 'worker-stg-use1-01',
        hostname: 'pummel-stg-01.us-east.internal',
        region: 'us-east-1',
        grpcEndpoint: '10.44.8.21:50052',
        cpuCores: 16,
        capacityWeight: 2,
        lastHeartbeatMs: 12,
      },
      {
        id: 'worker-stg-use1-02',
        hostname: 'pummel-stg-02.us-east.internal',
        region: 'us-east-1',
        grpcEndpoint: '10.44.8.22:50052',
        cpuCores: 16,
        capacityWeight: 2,
        lastHeartbeatMs: 15,
      },
      {
        id: 'worker-stg-usw2-01',
        hostname: 'pummel-stg-03.us-west.internal',
        region: 'us-west-2',
        grpcEndpoint: '10.44.9.14:50052',
        cpuCores: 8,
        capacityWeight: 1,
        lastHeartbeatMs: 31,
      },
    ],
  },
  {
    id: 'canary-ap-south',
    name: 'AP-South Canary',
    environment: 'canary',
    region: 'ap-southeast-1',
    coordinatorBind: '10.88.4.20:50051',
    tlsMode: 'mtls',
    quorumWorkers: 2,
    workers: [
      {
        id: 'worker-can-apse1-01',
        hostname: 'pummel-can-01.ap.internal',
        region: 'ap-southeast-1',
        grpcEndpoint: '10.88.4.31:50052',
        cpuCores: 16,
        capacityWeight: 2,
        lastHeartbeatMs: 19,
      },
      {
        id: 'worker-can-apse1-02',
        hostname: 'pummel-can-02.ap.internal',
        region: 'ap-southeast-1',
        grpcEndpoint: '10.88.4.32:50052',
        cpuCores: 16,
        capacityWeight: 2,
        lastHeartbeatMs: 22,
      },
    ],
  },
  {
    id: 'local-dev-mesh',
    name: 'Local Sandbox Mesh',
    environment: 'sandbox',
    region: 'local-dev',
    coordinatorBind: '127.0.0.1:50061',
    tlsMode: 'plaintext-local',
    quorumWorkers: 1,
    workers: [
      {
        id: 'worker-local-01',
        hostname: 'localhost-wrk-01.local',
        region: 'local-dev',
        grpcEndpoint: '127.0.0.1:50062',
        cpuCores: 8,
        capacityWeight: 1,
        lastHeartbeatMs: 4,
      },
      {
        id: 'worker-local-02',
        hostname: 'localhost-wrk-02.local',
        region: 'local-dev',
        grpcEndpoint: '127.0.0.1:50063',
        cpuCores: 8,
        capacityWeight: 1,
        lastHeartbeatMs: 5,
      },
    ],
  },
];

export function getTestClusterById(clusterId: string): TestClusterProfile {
  return (
    TEST_CLUSTER_PROFILES.find((cluster) => cluster.id === clusterId) ??
    TEST_CLUSTER_PROFILES[0]
  );
}

export function buildClusterWorkers(cluster: TestClusterProfile): WorkerNode[] {
  return cluster.workers.map((w, idx) => ({
    id: w.id,
    hostname: w.hostname,
    region: w.region,
    grpcEndpoint: w.grpcEndpoint,
    cpuCores: w.cpuCores,
    capacityWeight: w.capacityWeight,
    assignedVUs: 0,
    activeVUs: 0,
    currentRps: 0,
    avgLatencyMs: 0,
    errorRatePct: 0,
    cpuUsagePct: 4 + idx,
    memoryMb: 96 + idx * 14,
    lastHeartbeatMs: w.lastHeartbeatMs,
    status: 'ready',
  }));
}

/**
 * Projects the selected test cluster's coordinator bind, TLS transport mode,
 * and safe quorum floor onto a PummelConfig without mutating the original object.
 */
export function applyClusterTargetToConfig(
  config: PummelConfig,
  cluster: TestClusterProfile
): PummelConfig {
  const safeQuorum = Math.max(
    1,
    Math.min(config.distributed.quorumWorkers, cluster.workers.length)
  );
  return {
    ...config,
    distributed: {
      ...config.distributed,
      enabled: true,
      coordinatorBind: cluster.coordinatorBind,
      tlsMode: cluster.tlsMode,
      quorumWorkers: safeQuorum,
    },
  };
}

/**
 * Generates immediate structured Execution Log entries when Quick Run dispatches
 * the active YAML specification to a target test cluster.
 */
export function createQuickRunStartLogs(params: {
  config: PummelConfig;
  cluster: TestClusterProfile;
  timestampSec?: number;
}): RunLogEntry[] {
  const { config, cluster, timestampSec = 0 } = params;
  const totalVUs = config.execution.reduce((sum, ex) => sum + ex.concurrency, 0);
  const stamp = Date.now();

  return [
    {
      id: `log-qr-dispatch-${stamp}-1`,
      timestampSec,
      level: 'GRPC',
      source: 'quick-run',
      message: `Dispatched "${config.name}" (${totalVUs.toLocaleString()} VUs) to cluster ${cluster.name} (${cluster.coordinatorBind} · ${cluster.tlsMode.toUpperCase()}).`,
    },
    {
      id: `log-qr-workers-${stamp}-2`,
      timestampSec,
      level: 'INFO',
      source: cluster.id,
      message: `Cluster ${cluster.id} attached ${cluster.workers.length} worker nodes (${cluster.workers.map((w) => w.id).join(', ')}); streaming live telemetry.`,
    },
  ];
}
