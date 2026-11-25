import type { WorkerNode, WorkerStatus } from '../types/pummel';

export type NodeHealthSeverity = 'healthy' | 'elevated' | 'bottleneck' | 'offline';
export type BottleneckResource = 'CPU' | 'RAM' | 'NET' | 'OFFLINE' | null;

export interface WorkerHealthSnapshot {
  workerId: string;
  hostname: string;
  region: string;
  status: WorkerStatus;
  cpuCores: number;
  cpuPct: number;
  ramUsedMb: number;
  ramTotalMb: number;
  ramPct: number;
  networkMbps: number;
  networkCapacityMbps: number;
  networkPct: number;
  txMbps: number;
  rxMbps: number;
  lastHeartbeatMs: number;
  severity: NodeHealthSeverity;
  bottleneckResource: BottleneckResource;
  diagnosis: string;
}

export interface ClusterHealthSummary {
  totalNodes: number;
  onlineNodes: number;
  bottleneckCount: number;
  elevatedCount: number;
  offlineCount: number;
  avgCpuPct: number;
  avgRamPct: number;
  totalNetworkMbps: number;
  peakCpuPct: number;
  peakRamPct: number;
  peakNetworkPct: number;
  nodes: WorkerHealthSnapshot[];
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Computes real-time CPU, RAM, and Network utilization + node-level bottleneck
 * diagnostics for a single distributed gRPC worker node.
 */
export function computeWorkerHealthSnapshot(
  worker: WorkerNode,
  chaosFaultActive: boolean = false
): WorkerHealthSnapshot {
  // Worker container heap/NIC profiles scale with provisioned core tier
  const ramTotalMb = worker.cpuCores >= 16 ? 1024 : 512;
  const networkCapacityMbps = worker.cpuCores >= 16 ? 1000 : 500;

  if (worker.status === 'offline') {
    return {
      workerId: worker.id,
      hostname: worker.hostname,
      region: worker.region,
      status: worker.status,
      cpuCores: worker.cpuCores,
      cpuPct: 0,
      ramUsedMb: 0,
      ramTotalMb,
      ramPct: 0,
      networkMbps: 0,
      networkCapacityMbps,
      networkPct: 0,
      txMbps: 0,
      rxMbps: 0,
      lastHeartbeatMs: worker.lastHeartbeatMs,
      severity: 'offline',
      bottleneckResource: 'OFFLINE',
      diagnosis: 'Worker unreachable  --  gRPC heartbeat missed; shards reassigned.',
    };
  }

  const degradedMultiplier = worker.status === 'degraded' ? 1.28 : 1.0;
  const chaosNetOverhead = chaosFaultActive ? 1.25 : 1.0;

  const cpuPct = clampPct(worker.cpuUsagePct * (worker.status === 'degraded' ? 1.15 : 1.0));
  const ramUsedMb = Math.min(ramTotalMb, Math.max(0, Math.round(worker.memoryMb * degradedMultiplier)));
  const ramPct = clampPct((ramUsedMb / ramTotalMb) * 100);

  // Estimate outbound request payload + inbound response + gRPC telemetry stream bandwidth
  const baseIdleMbps = worker.status === 'running' || worker.currentRps > 0 ? 12 : 4;
  const trafficMbps =
    worker.currentRps * 0.44 * chaosNetOverhead + worker.activeVUs * 0.18 * degradedMultiplier;
  const networkMbps = Number(
    Math.min(networkCapacityMbps, baseIdleMbps + trafficMbps).toFixed(1)
  );
  const networkPct = clampPct((networkMbps / networkCapacityMbps) * 100);
  const txMbps = Number((networkMbps * 0.38).toFixed(1));
  const rxMbps = Number((networkMbps - txMbps).toFixed(1));

  // Identify the dominant resource pressure
  const pressures: { resource: 'CPU' | 'RAM' | 'NET'; pct: number }[] = [
    { resource: 'CPU', pct: cpuPct },
    { resource: 'RAM', pct: ramPct },
    { resource: 'NET', pct: networkPct },
  ];
  pressures.sort((a, b) => b.pct - a.pct);
  const peak = pressures[0];

  let severity: NodeHealthSeverity = 'healthy';
  let bottleneckResource: BottleneckResource = null;
  let diagnosis = 'Nominal headroom across CPU, RAM, and network interface.';

  if (peak.pct >= 80 || (worker.status === 'degraded' && peak.pct >= 60)) {
    severity = 'bottleneck';
    bottleneckResource = peak.resource;
    if (peak.resource === 'CPU') {
      diagnosis = `CPU saturation at ${cpuPct}% (${worker.cpuCores}c)  --  add workers or lower VU shard.`;
    } else if (peak.resource === 'RAM') {
      diagnosis = `Memory pressure at ${ramPct}% (${ramUsedMb}/${ramTotalMb} MB)  --  trim VU buffers.`;
    } else {
      diagnosis = `NIC saturation at ${networkMbps} Mbps (${networkPct}%)  --  throttle payload RPS.`;
    }
  } else if (peak.pct >= 60 || worker.status === 'degraded') {
    severity = 'elevated';
    bottleneckResource = peak.pct >= 60 ? peak.resource : null;
    if (worker.status === 'degraded') {
      diagnosis = `Degraded node (${worker.avgLatencyMs.toFixed(1)}ms avg)  --  watch ${peak.resource} at ${peak.pct}%.`;
    } else {
      diagnosis = `Elevated ${peak.resource} utilization (${peak.pct}%)  --  approaching saturation.`;
    }
  }

  return {
    workerId: worker.id,
    hostname: worker.hostname,
    region: worker.region,
    status: worker.status,
    cpuCores: worker.cpuCores,
    cpuPct,
    ramUsedMb,
    ramTotalMb,
    ramPct,
    networkMbps,
    networkCapacityMbps,
    networkPct,
    txMbps,
    rxMbps,
    lastHeartbeatMs: worker.lastHeartbeatMs,
    severity,
    bottleneckResource,
    diagnosis,
  };
}

export function computeClusterHealthSummary(
  workers: readonly WorkerNode[],
  chaosFaultActive: boolean = false
): ClusterHealthSummary {
  const nodes = workers.map((w) => computeWorkerHealthSnapshot(w, chaosFaultActive));
  const online = nodes.filter((n) => n.severity !== 'offline');
  const onlineCount = online.length;

  const avgCpuPct =
    onlineCount > 0
      ? Math.round(online.reduce((sum, n) => sum + n.cpuPct, 0) / onlineCount)
      : 0;
  const avgRamPct =
    onlineCount > 0
      ? Math.round(online.reduce((sum, n) => sum + n.ramPct, 0) / onlineCount)
      : 0;
  const totalNetworkMbps = Number(
    online.reduce((sum, n) => sum + n.networkMbps, 0).toFixed(1)
  );

  const peakCpuPct = online.reduce((max, n) => Math.max(max, n.cpuPct), 0);
  const peakRamPct = online.reduce((max, n) => Math.max(max, n.ramPct), 0);
  const peakNetworkPct = online.reduce((max, n) => Math.max(max, n.networkPct), 0);

  return {
    totalNodes: nodes.length,
    onlineNodes: onlineCount,
    bottleneckCount: nodes.filter((n) => n.severity === 'bottleneck').length,
    elevatedCount: nodes.filter((n) => n.severity === 'elevated').length,
    offlineCount: nodes.filter((n) => n.severity === 'offline').length,
    avgCpuPct,
    avgRamPct,
    totalNetworkMbps,
    peakCpuPct,
    peakRamPct,
    peakNetworkPct,
    nodes,
  };
}
