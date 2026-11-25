import type { DistributedConfig, RunLogEntry, WorkerNode } from '../types/pummel';
import { distributeVUs } from './distributedSim';

export interface AutoScaleConfig {
  enabled: boolean;
  minWorkers: number;
  maxWorkers: number;
  scaleUpRpsThreshold: number;
  scaleDownRpsThreshold: number;
  scaleStep: number;
  cooldownSec: number;
}

export interface AutoScaleEvaluation {
  action: 'scale_up' | 'scale_down' | 'none';
  deltaWorkers: number;
  targetWorkerCount: number;
  reason: string;
}

export interface AutoScaleEventSummary {
  action: 'scale_up' | 'scale_down';
  deltaWorkers: number;
  fromCount: number;
  toCount: number;
  elapsedSec: number;
  rps: number;
  reason: string;
}

export const DEFAULT_AUTO_SCALE_CONFIG: AutoScaleConfig = {
  enabled: false,
  minWorkers: 2,
  maxWorkers: 8,
  scaleUpRpsThreshold: 1400,
  scaleDownRpsThreshold: 400,
  scaleStep: 1,
  cooldownSec: 5,
};

const SCALE_REGIONS = ['eu-west-2', 'us-east-1', 'ap-southeast-1', 'eu-central-1', 'us-west-2'];

export function evaluateAutoScaling(params: {
  config: AutoScaleConfig;
  currentOnlineWorkers: number;
  currentTotalWorkers: number;
  currentRps: number;
  elapsedSec: number;
  lastScaleAtElapsedSec: number | null;
}): AutoScaleEvaluation {
  const {
    config,
    currentOnlineWorkers,
    currentTotalWorkers,
    currentRps,
    elapsedSec,
    lastScaleAtElapsedSec,
  } = params;

  if (!config.enabled) {
    return {
      action: 'none',
      deltaWorkers: 0,
      targetWorkerCount: currentTotalWorkers,
      reason: 'Auto-scaling is disabled.',
    };
  }

  const safeMin = Math.max(1, Math.min(config.minWorkers, config.maxWorkers));
  const safeMax = Math.max(safeMin, config.maxWorkers);
  const step = Math.max(1, Math.round(config.scaleStep));
  const cooldown = Math.max(1, Math.round(config.cooldownSec));

  if (
    lastScaleAtElapsedSec !== null &&
    elapsedSec - lastScaleAtElapsedSec < cooldown
  ) {
    const remaining = cooldown - (elapsedSec - lastScaleAtElapsedSec);
    return {
      action: 'none',
      deltaWorkers: 0,
      targetWorkerCount: currentTotalWorkers,
      reason: `Cooldown active (${remaining}s remaining).`,
    };
  }

  if (
    currentRps >= config.scaleUpRpsThreshold &&
    currentTotalWorkers < safeMax
  ) {
    const addCount = Math.min(step, safeMax - currentTotalWorkers);
    return {
      action: 'scale_up',
      deltaWorkers: addCount,
      targetWorkerCount: currentTotalWorkers + addCount,
      reason: `Throughput ${currentRps.toLocaleString()} req/s >= ${config.scaleUpRpsThreshold.toLocaleString()} req/s threshold`,
    };
  }

  if (
    currentRps > 0 &&
    currentRps <= config.scaleDownRpsThreshold &&
    currentOnlineWorkers > safeMin &&
    currentTotalWorkers > safeMin
  ) {
    const removeCount = Math.min(step, currentTotalWorkers - safeMin);
    return {
      action: 'scale_down',
      deltaWorkers: -removeCount,
      targetWorkerCount: currentTotalWorkers - removeCount,
      reason: `Throughput ${currentRps.toLocaleString()} req/s <= ${config.scaleDownRpsThreshold.toLocaleString()} req/s floor`,
    };
  }

  return {
    action: 'none',
    deltaWorkers: 0,
    targetWorkerCount: currentTotalWorkers,
    reason: 'Throughput within nominal scaling band.',
  };
}

export function buildAutoScaledWorker(
  existingWorkers: readonly WorkerNode[],
  sequenceOffset: number,
  isRunning: boolean
): WorkerNode {
  const existingIds = new Set(existingWorkers.map((w) => w.id));
  let seq = existingWorkers.length + 1 + sequenceOffset;
  let region = SCALE_REGIONS[(seq - 1) % SCALE_REGIONS.length];
  let candidateId = `worker-autoscale-${region}-${String(seq).padStart(2, '0')}`;
  while (existingIds.has(candidateId)) {
    seq += 1;
    region = SCALE_REGIONS[(seq - 1) % SCALE_REGIONS.length];
    candidateId = `worker-autoscale-${region}-${String(seq).padStart(2, '0')}`;
  }

  return {
    id: candidateId,
    hostname: `pummel-asg-${String(seq).padStart(2, '0')}.internal`,
    region,
    grpcEndpoint: `10.48.${(seq % 6) + 1}.${20 + (seq % 200)}:50052`,
    cpuCores: 16,
    capacityWeight: 2,
    assignedVUs: 0,
    activeVUs: 0,
    currentRps: 0,
    avgLatencyMs: 0,
    errorRatePct: 0,
    cpuUsagePct: 12,
    memoryMb: 128,
    lastHeartbeatMs: 16,
    status: isRunning ? 'running' : 'ready',
  };
}

export function applyAutoScaleAction(params: {
  evaluation: AutoScaleEvaluation;
  workers: readonly WorkerNode[];
  targetConcurrency: number;
  shardStrategy: DistributedConfig['shardStrategy'];
  elapsedSec: number;
  currentRps: number;
  isRunning: boolean;
}): {
  workers: WorkerNode[];
  logEntry: RunLogEntry | null;
  eventSummary: AutoScaleEventSummary | null;
} {
  const {
    evaluation,
    workers,
    targetConcurrency,
    shardStrategy,
    elapsedSec,
    currentRps,
    isRunning,
  } = params;

  if (evaluation.action === 'none' || evaluation.deltaWorkers === 0) {
    return {
      workers: [...workers],
      logEntry: null,
      eventSummary: null,
    };
  }

  const fromCount = workers.length;
  let nextWorkers = [...workers];

  if (evaluation.action === 'scale_up') {
    for (let i = 0; i < evaluation.deltaWorkers; i += 1) {
      nextWorkers.push(buildAutoScaledWorker(nextWorkers, i, isRunning));
    }
    const rebalanced = distributeVUs(targetConcurrency, nextWorkers, shardStrategy);
    const addedIds = nextWorkers.slice(fromCount).map((w) => w.id).join(', ');
    return {
      workers: rebalanced,
      logEntry: {
        id: `log-autoscale-up-${elapsedSec}-${Date.now()}`,
        timestampSec: elapsedSec,
        level: 'GRPC',
        source: 'autoscaler',
        message: `Auto-scaled UP +${evaluation.deltaWorkers} node (${addedIds}): ${evaluation.reason}; fleet ${fromCount} -> ${rebalanced.length} workers.`,
      },
      eventSummary: {
        action: 'scale_up',
        deltaWorkers: evaluation.deltaWorkers,
        fromCount,
        toCount: rebalanced.length,
        elapsedSec,
        rps: currentRps,
        reason: evaluation.reason,
      },
    };
  }

  const removeCount = Math.min(Math.abs(evaluation.deltaWorkers), Math.max(0, nextWorkers.length - 1));
  if (removeCount === 0) {
    return {
      workers: nextWorkers,
      logEntry: null,
      eventSummary: null,
    };
  }

  const removedIds: string[] = [];
  for (let i = 0; i < removeCount; i += 1) {
    const autoIdx = [...nextWorkers]
      .reverse()
      .findIndex((w) => w.id.startsWith('worker-autoscale-'));
    if (autoIdx !== -1) {
      const realIdx = nextWorkers.length - 1 - autoIdx;
      removedIds.push(nextWorkers[realIdx].id);
      nextWorkers.splice(realIdx, 1);
    } else {
      const popped = nextWorkers.pop();
      if (popped) removedIds.push(popped.id);
    }
  }

  const rebalanced = distributeVUs(targetConcurrency, nextWorkers, shardStrategy);
  return {
    workers: rebalanced,
    logEntry: {
      id: `log-autoscale-down-${elapsedSec}-${Date.now()}`,
      timestampSec: elapsedSec,
      level: 'GRPC',
      source: 'autoscaler',
      message: `Auto-scaled DOWN -${removedIds.length} node (${removedIds.join(', ')}): ${evaluation.reason}; fleet ${fromCount} -> ${rebalanced.length} workers.`,
    },
    eventSummary: {
      action: 'scale_down',
      deltaWorkers: -removedIds.length,
      fromCount,
      toCount: rebalanced.length,
      elapsedSec,
      rps: currentRps,
      reason: evaluation.reason,
    },
  };
}
