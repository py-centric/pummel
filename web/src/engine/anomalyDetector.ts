import type { RunLogEntry, TelemetryPoint } from '../types/pummel';

export interface AnomalyDetectorConfig {
  enabled: boolean;
  windowSize: number;
  sigmaThreshold: number;
  browserNotificationsEnabled: boolean;
}

export type AnomalyMetricKind = 'p95_latency' | 'throughput_drop';

export interface DetectedAnomaly {
  id: string;
  elapsedSec: number;
  metric: AnomalyMetricKind;
  value: number;
  movingAverage: number;
  stdDev: number;
  zScore: number;
  deviationPct: number;
  severity: 'warning' | 'critical';
  message: string;
}

export interface AnnotatedTelemetryPoint extends TelemetryPoint {
  timeLabel: string;
  p95MovingAvg: number | null;
  rpsMovingAvg: number | null;
  p95AnomalyValue: number | null;
  rpsAnomalyValue: number | null;
  anomalyReason?: string;
}

export interface AnomalyAnalysisResult {
  points: AnnotatedTelemetryPoint[];
  anomalies: DetectedAnomaly[];
  latestAnomaly: DetectedAnomaly | null;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectorConfig = {
  enabled: true,
  windowSize: 6,
  sigmaThreshold: 2.0,
  browserNotificationsEnabled: true,
};

function computeMeanAndStdDev(values: readonly number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

/**
 * Analyzes telemetry history using a trailing rolling moving average and
 * standard-deviation threshold (z-score) to detect statistically significant
 * latency spikes (p95) and throughput drops (RPS).
 */
export function analyzeTelemetryAnomalies(
  history: readonly TelemetryPoint[],
  config: AnomalyDetectorConfig = DEFAULT_ANOMALY_CONFIG
): AnomalyAnalysisResult {
  const windowSize = Math.max(3, Math.round(config.windowSize));
  const sigmaThreshold = Math.max(1.0, config.sigmaThreshold);

  const anomalies: DetectedAnomaly[] = [];
  const points: AnnotatedTelemetryPoint[] = history.map((point, idx) => {
    const timeLabel = `${point.elapsedSec}s`;

    // Trailing window strictly preceding current point so an outlier does not mask itself
    const startIdx = Math.max(0, idx - windowSize);
    const baselineSlice = history.slice(startIdx, idx);

    if (baselineSlice.length < 3) {
      return {
        ...point,
        timeLabel,
        p95MovingAvg: baselineSlice.length > 0
          ? Number(
              (
                baselineSlice.reduce((s, p) => s + p.p95Ms, 0) / baselineSlice.length
              ).toFixed(1)
            )
          : point.p95Ms,
        rpsMovingAvg: baselineSlice.length > 0
          ? Math.round(
              baselineSlice.reduce((s, p) => s + p.rps, 0) / baselineSlice.length
            )
          : point.rps,
        p95AnomalyValue: null,
        rpsAnomalyValue: null,
      };
    }

    const p95Stats = computeMeanAndStdDev(baselineSlice.map((p) => p.p95Ms));
    const rpsStats = computeMeanAndStdDev(baselineSlice.map((p) => p.rps));

    const p95MovingAvg = Number(p95Stats.mean.toFixed(1));
    const rpsMovingAvg = Math.round(rpsStats.mean);

    // Floor stdDev to prevent tiny flat-line noise from triggering false positives
    const effectiveP95Std = Math.max(p95Stats.stdDev, p95Stats.mean * 0.08, 4);
    const effectiveRpsStd = Math.max(rpsStats.stdDev, rpsStats.mean * 0.1, 15);

    const p95Z = (point.p95Ms - p95Stats.mean) / effectiveP95Std;
    const rpsDropZ = (rpsStats.mean - point.rps) / effectiveRpsStd;

    let p95AnomalyValue: number | null = null;
    let rpsAnomalyValue: number | null = null;
    const reasons: string[] = [];

    if (config.enabled && p95Z >= sigmaThreshold && point.p95Ms >= p95Stats.mean + 15) {
      p95AnomalyValue = point.p95Ms;
      const devPct = p95Stats.mean > 0 ? Math.round(((point.p95Ms - p95Stats.mean) / p95Stats.mean) * 100) : 0;
      const severity = p95Z >= sigmaThreshold + 1.0 ? 'critical' : 'warning';
      const msg = `p95 latency outlier ${point.p95Ms.toFixed(1)}ms (+${devPct}%, +${p95Z.toFixed(1)}σ vs ${p95MovingAvg}ms MA)`;
      reasons.push(msg);
      anomalies.push({
        id: `anom-p95-${point.elapsedSec}`,
        elapsedSec: point.elapsedSec,
        metric: 'p95_latency',
        value: point.p95Ms,
        movingAverage: p95MovingAvg,
        stdDev: Number(effectiveP95Std.toFixed(1)),
        zScore: Number(p95Z.toFixed(2)),
        deviationPct: devPct,
        severity,
        message: msg,
      });
    }

    if (
      config.enabled &&
      rpsStats.mean >= 50 &&
      rpsDropZ >= sigmaThreshold &&
      rpsStats.mean - point.rps >= 40
    ) {
      rpsAnomalyValue = point.rps;
      const devPct = Math.round(((point.rps - rpsStats.mean) / rpsStats.mean) * 100);
      const severity = rpsDropZ >= sigmaThreshold + 1.0 ? 'critical' : 'warning';
      const msg = `Throughput drop ${point.rps.toLocaleString()} rps (${devPct}%, -${rpsDropZ.toFixed(1)}σ vs ${rpsMovingAvg.toLocaleString()} rps MA)`;
      reasons.push(msg);
      anomalies.push({
        id: `anom-rps-${point.elapsedSec}`,
        elapsedSec: point.elapsedSec,
        metric: 'throughput_drop',
        value: point.rps,
        movingAverage: rpsMovingAvg,
        stdDev: Number(effectiveRpsStd.toFixed(1)),
        zScore: Number(rpsDropZ.toFixed(2)),
        deviationPct: devPct,
        severity,
        message: msg,
      });
    }

    return {
      ...point,
      timeLabel,
      p95MovingAvg,
      rpsMovingAvg,
      p95AnomalyValue,
      rpsAnomalyValue,
      anomalyReason: reasons.length > 0 ? reasons.join(' · ') : undefined,
    };
  });

  return {
    points,
    anomalies,
    latestAnomaly: anomalies.length > 0 ? anomalies[anomalies.length - 1] : null,
  };
}

export function createAnomalyLogEntry(anomaly: DetectedAnomaly): RunLogEntry {
  return {
    id: `log-${anomaly.id}-${Date.now()}`,
    timestampSec: anomaly.elapsedSec,
    level: 'WARN',
    source: 'anomaly-detector',
    message: `Anomaly detected: ${anomaly.message}`,
  };
}
