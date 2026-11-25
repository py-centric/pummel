import type { RunStatus, WorkerNode } from '../types/pummel';
import { computeClusterHealthSummary } from './clusterHealth';
import type { TestClusterProfile } from './testClusters';

export type ClusterOperationalState = 'active' | 'degraded' | 'standby' | 'offline';

export interface ClusterCapacityRow {
  clusterId: string;
  name: string;
  environment: TestClusterProfile['environment'];
  region: string;
  coordinatorBind: string;
  tlsMode: TestClusterProfile['tlsMode'];
  isActiveTarget: boolean;
  operationalState: ClusterOperationalState;
  totalWorkers: number;
  onlineWorkers: number;
  totalCpuCores: number;
  maxVuCapacity: number;
  activeVUs: number;
  currentRps: number;
  avgCpuPct: number;
  avgRamPct: number;
  totalNetworkMbps: number;
  bottleneckCount: number;
}

export interface GlobalInfrastructureHealth {
  totalClusters: number;
  healthyClusters: number;
  degradedClusters: number;
  totalWorkers: number;
  onlineWorkers: number;
  totalCpuCores: number;
  totalActiveVUs: number;
  totalMaxVuCapacity: number;
  capacityUtilizationPct: number;
  aggregateRps: number;
  aggregateNetworkMbps: number;
  avgClusterCpuPct: number;
  avgClusterRamPct: number;
  clusters: ClusterCapacityRow[];
}

const VU_PER_CPU_CORE = 35;

/**
 * Aggregates live capacity and health across all configured load-testing clusters
 * to provide a unified global infrastructure capacity overview.
 */
export function buildGlobalClusterHealth(params: {
  profiles: readonly TestClusterProfile[];
  activeClusterId: string;
  activeWorkers: readonly WorkerNode[];
  activeRunStatus: RunStatus;
  activeRps: number;
  chaosFaultActive: boolean;
}): GlobalInfrastructureHealth {
  const {
    profiles,
    activeClusterId,
    activeWorkers,
    activeRunStatus,
    activeRps,
    chaosFaultActive,
  } = params;

  const clusters: ClusterCapacityRow[] = profiles.map((profile, idx) => {
    const isActiveTarget = profile.id === activeClusterId;

    if (isActiveTarget) {
      const health = computeClusterHealthSummary(activeWorkers, chaosFaultActive);
      const totalCpuCores = activeWorkers.reduce((sum, w) => sum + w.cpuCores, 0);
      const maxVuCapacity = totalCpuCores * VU_PER_CPU_CORE;
      const activeVUs = activeWorkers.reduce((sum, w) => sum + w.activeVUs, 0);
      const hasFaults = health.bottleneckCount > 0 || health.offlineCount > 0;

      const operationalState: ClusterOperationalState =
        health.onlineNodes === 0
          ? 'offline'
          : hasFaults
            ? 'degraded'
            : activeRunStatus === 'running'
              ? 'active'
              : 'standby';

      return {
        clusterId: profile.id,
        name: profile.name,
        environment: profile.environment,
        region: profile.region,
        coordinatorBind: profile.coordinatorBind,
        tlsMode: profile.tlsMode,
        isActiveTarget: true,
        operationalState,
        totalWorkers: health.totalNodes,
        onlineWorkers: health.onlineNodes,
        totalCpuCores,
        maxVuCapacity,
        activeVUs,
        currentRps: activeRps,
        avgCpuPct: health.avgCpuPct,
        avgRamPct: health.avgRamPct,
        totalNetworkMbps: health.totalNetworkMbps,
        bottleneckCount: health.bottleneckCount,
      };
    }

    // Peer clusters report deterministic standby/background synthetic probe telemetry
    const totalWorkers = profile.workers.length;
    const totalCpuCores = profile.workers.reduce((sum, w) => sum + w.cpuCores, 0);
    const maxVuCapacity = totalCpuCores * VU_PER_CPU_CORE;
    const peerActiveVUs = profile.environment === 'canary' ? 40 : 0;
    const peerRps = profile.environment === 'canary' ? 115 : 0;
    const peerCpuPct = profile.environment === 'canary' ? 18 : 6 + idx * 2;
    const peerRamPct = profile.environment === 'canary' ? 24 : 14 + idx * 3;
    const peerNetMbps = profile.environment === 'canary' ? 58.4 : Number((8.2 + idx * 2.1).toFixed(1));

    return {
      clusterId: profile.id,
      name: profile.name,
      environment: profile.environment,
      region: profile.region,
      coordinatorBind: profile.coordinatorBind,
      tlsMode: profile.tlsMode,
      isActiveTarget: false,
      operationalState: profile.environment === 'canary' ? 'active' : 'standby',
      totalWorkers,
      onlineWorkers: totalWorkers,
      totalCpuCores,
      maxVuCapacity,
      activeVUs: peerActiveVUs,
      currentRps: peerRps,
      avgCpuPct: peerCpuPct,
      avgRamPct: peerRamPct,
      totalNetworkMbps: peerNetMbps,
      bottleneckCount: 0,
    };
  });

  const totalWorkers = clusters.reduce((sum, c) => sum + c.totalWorkers, 0);
  const onlineWorkers = clusters.reduce((sum, c) => sum + c.onlineWorkers, 0);
  const totalCpuCores = clusters.reduce((sum, c) => sum + c.totalCpuCores, 0);
  const totalActiveVUs = clusters.reduce((sum, c) => sum + c.activeVUs, 0);
  const totalMaxVuCapacity = clusters.reduce((sum, c) => sum + c.maxVuCapacity, 0);
  const aggregateRps = clusters.reduce((sum, c) => sum + c.currentRps, 0);
  const aggregateNetworkMbps = Number(
    clusters.reduce((sum, c) => sum + c.totalNetworkMbps, 0).toFixed(1)
  );
  const capacityUtilizationPct =
    totalMaxVuCapacity > 0
      ? Math.min(100, Math.round((totalActiveVUs / totalMaxVuCapacity) * 100))
      : 0;

  const avgClusterCpuPct =
    clusters.length > 0
      ? Math.round(clusters.reduce((sum, c) => sum + c.avgCpuPct, 0) / clusters.length)
      : 0;
  const avgClusterRamPct =
    clusters.length > 0
      ? Math.round(clusters.reduce((sum, c) => sum + c.avgRamPct, 0) / clusters.length)
      : 0;

  const degradedClusters = clusters.filter(
    (c) => c.operationalState === 'degraded' || c.operationalState === 'offline'
  ).length;
  const healthyClusters = clusters.length - degradedClusters;

  return {
    totalClusters: clusters.length,
    healthyClusters,
    degradedClusters,
    totalWorkers,
    onlineWorkers,
    totalCpuCores,
    totalActiveVUs,
    totalMaxVuCapacity,
    capacityUtilizationPct,
    aggregateRps,
    aggregateNetworkMbps,
    avgClusterCpuPct,
    avgClusterRamPct,
    clusters,
  };
}
