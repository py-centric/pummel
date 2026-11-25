import type { SlaCriterion, TelemetryPoint } from '../types/pummel';

export interface ChartTelemetryDatum {
  timeLabel: string;
  elapsedSec: number;
  rps: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  activeVUs: number;
  failRatePct: number;
}

export interface TelemetryChartSummary {
  points: ChartTelemetryDatum[];
  peakRps: number;
  avgRps: number;
  peakP95Ms: number;
  peakP99Ms: number;
  latestRps: number;
  latestAvgMs: number;
  latestP95Ms: number;
  latestP99Ms: number;
  latestActiveVUs: number;
  p95SlaThresholdMs: number | null;
}

export function buildTelemetryChartSummary(
  history: readonly TelemetryPoint[],
  slaCriteria: readonly SlaCriterion[]
): TelemetryChartSummary {
  const p95Rule = slaCriteria.find(
    (s) => s.metric === 'p95-response-time' && !s.subject
  );
  const p95SlaThresholdMs = p95Rule ? p95Rule.threshold : null;

  if (history.length === 0) {
    return {
      points: [],
      peakRps: 0,
      avgRps: 0,
      peakP95Ms: 0,
      peakP99Ms: 0,
      latestRps: 0,
      latestAvgMs: 0,
      latestP95Ms: 0,
      latestP99Ms: 0,
      latestActiveVUs: 0,
      p95SlaThresholdMs,
    };
  }

  const points: ChartTelemetryDatum[] = history.map((pt) => {
    const p95Ms = Number(pt.p95Ms.toFixed(1));
    const avgMs =
      typeof pt.avgMs === 'number'
        ? Number(pt.avgMs.toFixed(1))
        : Number((p95Ms * 0.62).toFixed(1));
    const p99Ms =
      typeof pt.p99Ms === 'number'
        ? Number(pt.p99Ms.toFixed(1))
        : Number((p95Ms * 1.24).toFixed(1));

    return {
      timeLabel: `T+${pt.elapsedSec}s`,
      elapsedSec: pt.elapsedSec,
      rps: pt.rps,
      avgMs,
      p95Ms,
      p99Ms,
      activeVUs: pt.activeVUs,
      failRatePct: Number(pt.failRatePct.toFixed(2)),
    };
  });

  let peakRps = 0;
  let rpsSum = 0;
  let peakP95Ms = 0;
  let peakP99Ms = 0;

  for (const p of points) {
    if (p.rps > peakRps) peakRps = p.rps;
    if (p.p95Ms > peakP95Ms) peakP95Ms = p.p95Ms;
    if (p.p99Ms > peakP99Ms) peakP99Ms = p.p99Ms;
    rpsSum += p.rps;
  }

  const latest = points[points.length - 1];

  return {
    points,
    peakRps,
    avgRps: Math.round(rpsSum / points.length),
    peakP95Ms: Number(peakP95Ms.toFixed(1)),
    peakP99Ms: Number(peakP99Ms.toFixed(1)),
    latestRps: latest.rps,
    latestAvgMs: latest.avgMs,
    latestP95Ms: latest.p95Ms,
    latestP99Ms: latest.p99Ms,
    latestActiveVUs: latest.activeVUs,
    p95SlaThresholdMs,
  };
}
