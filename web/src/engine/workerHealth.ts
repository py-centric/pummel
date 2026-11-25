import type { WorkerNode } from '../types/pummel';

export interface WorkerNodeStatusItem {
  id: string;
  region: string;
  grpcEndpoint: string;
  stateLabel: 'Online' | 'Degraded' | 'Offline';
  isOnline: boolean;
  shouldPulse: boolean;
  heartbeatLabel: string;
  assignedVUs: number;
}

export interface WorkerFleetHealthSummary {
  totalCount: number;
  onlineCount: number;
  degradedCount: number;
  offlineCount: number;
  quorumWorkers: number;
  quorumMet: boolean;
  overallState: 'healthy' | 'degraded' | 'quorum-lost';
  overallLabel: string;
  nodes: WorkerNodeStatusItem[];
}

export function summarizeWorkerFleetHealth(
  workers: readonly WorkerNode[],
  quorumWorkers: number
): WorkerFleetHealthSummary {
  let onlineCount = 0;
  let degradedCount = 0;
  let offlineCount = 0;

  const nodes: WorkerNodeStatusItem[] = workers.map((w) => {
    if (w.status === 'offline') {
      offlineCount += 1;
      return {
        id: w.id,
        region: w.region,
        grpcEndpoint: w.grpcEndpoint,
        stateLabel: 'Offline',
        isOnline: false,
        shouldPulse: false,
        heartbeatLabel: 'Disconnected',
        assignedVUs: w.assignedVUs,
      };
    }

    if (w.status === 'degraded') {
      degradedCount += 1;
      return {
        id: w.id,
        region: w.region,
        grpcEndpoint: w.grpcEndpoint,
        stateLabel: 'Degraded',
        isOnline: true,
        shouldPulse: true,
        heartbeatLabel: `${w.lastHeartbeatMs}ms RTT`,
        assignedVUs: w.assignedVUs,
      };
    }

    onlineCount += 1;
    return {
      id: w.id,
      region: w.region,
      grpcEndpoint: w.grpcEndpoint,
      stateLabel: 'Online',
      isOnline: true,
      shouldPulse: true,
      heartbeatLabel: `${w.lastHeartbeatMs}ms RTT`,
      assignedVUs: w.assignedVUs,
    };
  });

  const connectedCount = onlineCount + degradedCount;
  const quorumMet = connectedCount >= quorumWorkers;

  let overallState: WorkerFleetHealthSummary['overallState'] = 'healthy';
  let overallLabel = `All ${connectedCount}/${workers.length} gRPC workers online`;

  if (!quorumMet) {
    overallState = 'quorum-lost';
    overallLabel = `Quorum lost (${connectedCount}/${quorumWorkers} required online)`;
  } else if (offlineCount > 0 || degradedCount > 0) {
    overallState = 'degraded';
    overallLabel = `${connectedCount}/${workers.length} online · ${degradedCount} degraded · ${offlineCount} offline`;
  }

  return {
    totalCount: workers.length,
    onlineCount,
    degradedCount,
    offlineCount,
    quorumWorkers,
    quorumMet,
    overallState,
    overallLabel,
    nodes,
  };
}
