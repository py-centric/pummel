import type { EndpointMetrics, ProtocolType } from '../types/pummel';
import { LATENCY_BUCKETS } from './latencyHeatmap';
import type { StorageLike } from './scheduledTests';

export interface RunEndpointHeatmapProfile {
  label: string;
  protocol: ProtocolType;
  p95Ms: number;
  p99Ms: number;
  bucketSharesPct: number[];
}

export interface RecordedRunHeatmap {
  id: string;
  label: string;
  clusterName: string;
  recordedAtIso: string;
  targetConcurrency: number;
  globalP95Ms: number;
  globalP99Ms: number;
  endpoints: RunEndpointHeatmapProfile[];
}

export interface OverlayCellComparison {
  bucketId: string;
  bucketLabel: string;
  baselineSharePct: number;
  targetSharePct: number;
  deltaSharePct: number;
  direction: 'regression' | 'improvement' | 'neutral';
}

export interface EndpointOverlayRow {
  label: string;
  protocol: ProtocolType;
  baselineP95Ms: number;
  targetP95Ms: number;
  p95DeltaMs: number;
  baselineP99Ms: number;
  targetP99Ms: number;
  p99DeltaMs: number;
  status: 'regressed' | 'improved' | 'stable';
  cells: OverlayCellComparison[];
}

export interface LatencyHeatmapOverlayResult {
  baselineRun: RecordedRunHeatmap;
  targetRun: RecordedRunHeatmap;
  rows: EndpointOverlayRow[];
  regressedEndpoints: number;
  improvedEndpoints: number;
  avgP95DeltaMs: number;
  avgP99DeltaMs: number;
}

export const RECORDED_RUN_HEATMAPS_KEY = 'pummel_recorded_run_heatmaps_v1';

function computeBucketSharesFromTimings(timingsMs: readonly number[]): number[] {
  const counts = LATENCY_BUCKETS.map(() => 0);
  if (timingsMs.length === 0) return counts;

  for (const ms of timingsMs) {
    const idx = LATENCY_BUCKETS.findIndex(
      (b) => ms >= b.minMs && (b.maxMs === null || ms < b.maxMs)
    );
    const safeIdx = idx === -1 ? LATENCY_BUCKETS.length - 1 : idx;
    counts[safeIdx] += 1;
  }

  return counts.map((c) => Number(((c / timingsMs.length) * 100).toFixed(1)));
}

export function createSeededRunHeatmaps(): RecordedRunHeatmap[] {
  const now = Date.now();
  return [
    {
      id: 'run-seed-baseline-v24',
      label: 'Release v2.4 Baseline (600 VUs)',
      clusterName: 'EU-West Primary',
      recordedAtIso: new Date(now - 3 * 3600_000).toISOString(),
      targetConcurrency: 600,
      globalP95Ms: 112.4,
      globalP99Ms: 164.8,
      endpoints: [
        {
          label: 'POST /v1/checkout',
          protocol: 'http',
          p95Ms: 124.2,
          p99Ms: 178.5,
          bucketSharesPct: [4.2, 26.8, 39.5, 19.8, 7.2, 1.9, 0.5, 0.1],
        },
        {
          label: 'GET /v1/catalog',
          protocol: 'http',
          p95Ms: 74.6,
          p99Ms: 108.2,
          bucketSharesPct: [18.5, 44.0, 26.5, 8.2, 2.2, 0.5, 0.1, 0.0],
        },
        {
          label: 'InventoryService/Reserve',
          protocol: 'grpc',
          p95Ms: 62.0,
          p99Ms: 91.4,
          bucketSharesPct: [28.0, 46.2, 18.4, 5.6, 1.4, 0.4, 0.0, 0.0],
        },
        {
          label: 'WS /v1/orders/stream',
          protocol: 'websocket',
          p95Ms: 88.5,
          p99Ms: 132.0,
          bucketSharesPct: [12.4, 38.6, 31.2, 12.6, 3.8, 1.1, 0.3, 0.0],
        },
      ],
    },
    {
      id: 'run-seed-canary-v25',
      label: 'Release v2.5 Canary (900 VUs)',
      clusterName: 'US-East Staging',
      recordedAtIso: new Date(now - 45 * 60_000).toISOString(),
      targetConcurrency: 900,
      globalP95Ms: 186.9,
      globalP99Ms: 284.2,
      endpoints: [
        {
          label: 'POST /v1/checkout',
          protocol: 'http',
          p95Ms: 218.6,
          p99Ms: 342.0,
          bucketSharesPct: [1.1, 10.4, 24.0, 27.5, 20.6, 10.8, 4.1, 1.5],
        },
        {
          label: 'GET /v1/catalog',
          protocol: 'http',
          p95Ms: 68.1,
          p99Ms: 96.4,
          bucketSharesPct: [24.2, 46.1, 21.8, 6.1, 1.4, 0.4, 0.0, 0.0],
        },
        {
          label: 'InventoryService/Reserve',
          protocol: 'grpc',
          p95Ms: 118.4,
          p99Ms: 192.5,
          bucketSharesPct: [11.2, 28.4, 30.8, 17.2, 8.1, 3.2, 0.9, 0.2],
        },
        {
          label: 'WS /v1/orders/stream',
          protocol: 'websocket',
          p95Ms: 91.2,
          p99Ms: 138.6,
          bucketSharesPct: [11.0, 36.8, 32.1, 14.0, 4.4, 1.3, 0.4, 0.0],
        },
      ],
    },
  ];
}

export function captureRunHeatmapSnapshot(params: {
  label: string;
  clusterName: string;
  targetConcurrency: number;
  globalP95Ms: number;
  globalP99Ms: number;
  endpoints: readonly EndpointMetrics[];
  now?: Date;
}): RecordedRunHeatmap {
  const now = params.now ?? new Date();
  return {
    id: `run-cap-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    label: params.label,
    clusterName: params.clusterName,
    recordedAtIso: now.toISOString(),
    targetConcurrency: params.targetConcurrency,
    globalP95Ms: Number(params.globalP95Ms.toFixed(1)),
    globalP99Ms: Number(params.globalP99Ms.toFixed(1)),
    endpoints: params.endpoints.map((ep) => ({
      label: ep.label,
      protocol: ep.protocol,
      p95Ms: ep.p95Ms,
      p99Ms: ep.p99Ms,
      bucketSharesPct: computeBucketSharesFromTimings(ep.timingsMs),
    })),
  };
}

/**
 * Overlays two test run heatmaps cell-by-cell to surface latency regressions
 * (right-shifts into slower latency buckets) and improvements (left-shifts).
 */
export function buildLatencyHeatmapOverlay(
  baselineRun: RecordedRunHeatmap,
  targetRun: RecordedRunHeatmap
): LatencyHeatmapOverlayResult {
  const endpointLabels = Array.from(
    new Set([
      ...baselineRun.endpoints.map((e) => e.label),
      ...targetRun.endpoints.map((e) => e.label),
    ])
  );

  const rows: EndpointOverlayRow[] = endpointLabels.map((label) => {
    const baseEp = baselineRun.endpoints.find((e) => e.label === label);
    const targetEp = targetRun.endpoints.find((e) => e.label === label);
    const protocol: ProtocolType = targetEp?.protocol ?? baseEp?.protocol ?? 'http';

    const baselineP95Ms = baseEp?.p95Ms ?? 0;
    const targetP95Ms = targetEp?.p95Ms ?? 0;
    const p95DeltaMs = Number((targetP95Ms - baselineP95Ms).toFixed(1));

    const baselineP99Ms = baseEp?.p99Ms ?? 0;
    const targetP99Ms = targetEp?.p99Ms ?? 0;
    const p99DeltaMs = Number((targetP99Ms - baselineP99Ms).toFixed(1));

    const status: EndpointOverlayRow['status'] =
      p95DeltaMs >= 10 || p99DeltaMs >= 15
        ? 'regressed'
        : p95DeltaMs <= -6 || p99DeltaMs <= -10
          ? 'improved'
          : 'stable';

    const cells: OverlayCellComparison[] = LATENCY_BUCKETS.map((bucket, idx) => {
      const bShare = baseEp?.bucketSharesPct[idx] ?? 0;
      const tShare = targetEp?.bucketSharesPct[idx] ?? 0;
      const delta = Number((tShare - bShare).toFixed(1));

      // Higher density in slower buckets (>= 100ms, idx >= 3) is a regression;
      // higher density in faster buckets (< 100ms, idx < 3) is an improvement.
      let direction: OverlayCellComparison['direction'] = 'neutral';
      if (Math.abs(delta) >= 2.0) {
        if (idx >= 3) {
          direction = delta > 0 ? 'regression' : 'improvement';
        } else {
          direction = delta > 0 ? 'improvement' : 'regression';
        }
      }

      return {
        bucketId: bucket.id,
        bucketLabel: bucket.label,
        baselineSharePct: bShare,
        targetSharePct: tShare,
        deltaSharePct: delta,
        direction,
      };
    });

    return {
      label,
      protocol,
      baselineP95Ms,
      targetP95Ms,
      p95DeltaMs,
      baselineP99Ms,
      targetP99Ms,
      p99DeltaMs,
      status,
      cells,
    };
  });

  const regressedEndpoints = rows.filter((r) => r.status === 'regressed').length;
  const improvedEndpoints = rows.filter((r) => r.status === 'improved').length;
  const avgP95DeltaMs =
    rows.length > 0
      ? Number((rows.reduce((sum, r) => sum + r.p95DeltaMs, 0) / rows.length).toFixed(1))
      : 0;
  const avgP99DeltaMs =
    rows.length > 0
      ? Number((rows.reduce((sum, r) => sum + r.p99DeltaMs, 0) / rows.length).toFixed(1))
      : 0;

  return {
    baselineRun,
    targetRun,
    rows,
    regressedEndpoints,
    improvedEndpoints,
    avgP95DeltaMs,
    avgP99DeltaMs,
  };
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return null;
}

export function loadRecordedRunHeatmaps(
  storage: StorageLike | null = getDefaultStorage()
): RecordedRunHeatmap[] {
  const seeds = createSeededRunHeatmaps();
  if (!storage) return seeds;
  try {
    const raw = storage.getItem(RECORDED_RUN_HEATMAPS_KEY);
    if (!raw) return seeds;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seeds;
    const valid = parsed.filter(
      (item): item is RecordedRunHeatmap =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as RecordedRunHeatmap).id === 'string' &&
        Array.isArray((item as RecordedRunHeatmap).endpoints)
    );
    return valid.length >= 2 ? valid : [...valid, ...seeds];
  } catch {
    return seeds;
  }
}

export function saveRecordedRunHeatmaps(
  runs: readonly RecordedRunHeatmap[],
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RECORDED_RUN_HEATMAPS_KEY, JSON.stringify(runs.slice(0, 12)));
    return true;
  } catch {
    return false;
  }
}
