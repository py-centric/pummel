import type { EndpointMetrics, ProtocolType } from '../types/pummel';

export interface LatencyBucketDef {
  id: string;
  label: string;
  minMs: number;
  maxMs: number | null; // null = open-ended upper bound
}

export const LATENCY_HEATMAP_BUCKETS: readonly LatencyBucketDef[] = [
  { id: 'b-0-25', label: '0-25ms', minMs: 0, maxMs: 25 },
  { id: 'b-25-50', label: '25-50ms', minMs: 25, maxMs: 50 },
  { id: 'b-50-100', label: '50-100ms', minMs: 50, maxMs: 100 },
  { id: 'b-100-150', label: '100-150ms', minMs: 100, maxMs: 150 },
  { id: 'b-150-200', label: '150-200ms', minMs: 150, maxMs: 200 },
  { id: 'b-200-300', label: '200-300ms', minMs: 200, maxMs: 300 },
  { id: 'b-300-plus', label: '300ms+', minMs: 300, maxMs: null },
];

export const LATENCY_BUCKETS = LATENCY_HEATMAP_BUCKETS;

export type HeatmapScaleMode = 'global' | 'row';

export interface HeatmapCell {
  bucketId: string;
  bucketLabel: string;
  minMs: number;
  maxMs: number | null;
  count: number;
  sharePct: number;
  intensity: number; // 0..1 normalized
  isOutlier: boolean;
}

export interface HeatmapEndpointRow {
  endpoint: string;
  protocol: ProtocolType;
  sampleCount: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  outlierCount: number;
  outlierPct: number;
  cells: HeatmapCell[];
}

export interface LatencyHeatmapMatrix {
  buckets: readonly LatencyBucketDef[];
  rows: HeatmapEndpointRow[];
  totalSamples: number;
  totalOutliers: number;
  maxCellCount: number;
  outlierThresholdMs: number;
}

export function resolveLatencyBucketIndex(
  latencyMs: number,
  buckets: readonly LatencyBucketDef[] = LATENCY_HEATMAP_BUCKETS
): number {
  const safe = Math.max(0, latencyMs);
  for (let i = 0; i < buckets.length; i += 1) {
    const b = buckets[i];
    if (b.maxMs === null || safe < b.maxMs) {
      return i;
    }
  }
  return buckets.length - 1;
}

export function buildLatencyHeatmap(
  endpoints: readonly EndpointMetrics[],
  options?: {
    scaleMode?: HeatmapScaleMode;
    outlierThresholdMs?: number;
  }
): LatencyHeatmapMatrix {
  const scaleMode = options?.scaleMode ?? 'global';
  const outlierThresholdMs = options?.outlierThresholdMs ?? 180;
  const buckets = LATENCY_HEATMAP_BUCKETS;

  let totalSamples = 0;
  let totalOutliers = 0;
  let globalMaxCount = 0;

  const rawRows = endpoints.map((ep) => {
    const counts = new Array<number>(buckets.length).fill(0);
    let epOutliers = 0;
    const effectiveOutlierCutoff = Math.max(
      150,
      ep.p95Ms > 0 ? Math.min(outlierThresholdMs, ep.p95Ms) : outlierThresholdMs
    );

    for (const sample of ep.timingsMs) {
      const idx = resolveLatencyBucketIndex(sample, buckets);
      counts[idx] += 1;
      if (sample >= effectiveOutlierCutoff) {
        epOutliers += 1;
      }
    }

    const rowMax = counts.reduce((m, c) => (c > m ? c : m), 0);
    if (rowMax > globalMaxCount) globalMaxCount = rowMax;

    totalSamples += ep.timingsMs.length;
    totalOutliers += epOutliers;

    return {
      ep,
      counts,
      rowMax,
      epOutliers,
      effectiveOutlierCutoff,
    };
  });

  const rows: HeatmapEndpointRow[] = rawRows.map(
    ({ ep, counts, rowMax, epOutliers, effectiveOutlierCutoff }) => {
      const sampleCount = ep.timingsMs.length;
      const denom = scaleMode === 'row' ? rowMax : globalMaxCount;

      const cells: HeatmapCell[] = buckets.map((b, idx) => {
        const count = counts[idx];
        const sharePct = sampleCount > 0 ? Number(((count / sampleCount) * 100).toFixed(1)) : 0;
        const intensity = denom > 0 && count > 0 ? Math.min(1, count / denom) : 0;
        const isOutlier =
          count > 0 &&
          (b.minMs >= outlierThresholdMs ||
            (ep.p95Ms > 0 && b.minMs >= ep.p95Ms) ||
            (b.maxMs === null && b.minMs >= effectiveOutlierCutoff));

        return {
          bucketId: b.id,
          bucketLabel: b.label,
          minMs: b.minMs,
          maxMs: b.maxMs,
          count,
          sharePct,
          intensity,
          isOutlier,
        };
      });

      return {
        endpoint: ep.label,
        protocol: ep.protocol,
        sampleCount,
        avgMs: ep.avgMs,
        p50Ms: ep.p50Ms,
        p90Ms: ep.p90Ms,
        p95Ms: ep.p95Ms,
        p99Ms: ep.p99Ms,
        outlierCount: epOutliers,
        outlierPct: sampleCount > 0 ? Number(((epOutliers / sampleCount) * 100).toFixed(1)) : 0,
        cells,
      };
    }
  );

  return {
    buckets,
    rows,
    totalSamples,
    totalOutliers,
    maxCellCount: globalMaxCount,
    outlierThresholdMs,
  };
}
