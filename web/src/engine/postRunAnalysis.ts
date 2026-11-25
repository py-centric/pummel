import type {
  DistributedRunState,
  PummelConfig,
  SlaCriterion,
  SlaEvaluationResult,
} from '../types/pummel';

export type PostRunVerdict = 'passed' | 'warning' | 'failed';

export interface PostRunSlaRow {
  id: string;
  label: string;
  subject: string;
  thresholdLabel: string;
  observedLabel: string;
  breached: boolean;
  breachCount: number;
  action: SlaCriterion['action'];
}

export interface PostRunAnalysisReport {
  specName: string;
  clusterName: string;
  coordinatorBind: string;
  endStatus: DistributedRunState['status'];
  verdict: PostRunVerdict;
  elapsedSec: number;
  targetConcurrency: number;
  totalRequests: number;
  totalFailures: number;
  errorRatePct: number;
  peakRps: number;
  avgRps: number;
  peakAvgLatencyMs: number;
  peakP95Ms: number;
  peakP99Ms: number;
  finalP95Ms: number;
  finalP99Ms: number;
  passedSlaCount: number;
  breachedSlaCount: number;
  slaRows: PostRunSlaRow[];
  slowestEndpointLabel: string | null;
  slowestEndpointP99Ms: number;
}

function formatMetricName(metric: SlaCriterion['metric']): string {
  switch (metric) {
    case 'fail-rate':
      return 'Error Rate';
    case 'avg-response-time':
      return 'Avg Latency';
    case 'p90-response-time':
      return 'p90 Latency';
    case 'p95-response-time':
      return 'p95 Latency';
    case 'p99-response-time':
      return 'p99 Latency';
    case 'throughput':
      return 'Throughput';
  }
}

function formatValueWithUnit(value: number, unit: SlaCriterion['unit']): string {
  if (unit === '%') return `${value.toFixed(2)}%`;
  if (unit === 'rps') return `${Math.round(value).toLocaleString()} rps`;
  return `${value.toFixed(1)} ms`;
}

/**
 * Computes a deterministic Post-Run Analysis report comparing peak latency,
 * error rate, and throughput against all configured SLA thresholds.
 */
export function buildPostRunAnalysisReport(params: {
  runState: DistributedRunState;
  config: PummelConfig;
  clusterName: string;
}): PostRunAnalysisReport {
  const { runState, config, clusterName } = params;

  const history = runState.history;
  const peakRps = history.reduce((max, pt) => Math.max(max, pt.rps), runState.currentRps);
  const avgRps =
    history.length > 0
      ? Math.round(history.reduce((sum, pt) => sum + pt.rps, 0) / history.length)
      : runState.currentRps;
  const peakP95Ms = Number(
    history.reduce((max, pt) => Math.max(max, pt.p95Ms), runState.globalP95Ms).toFixed(1)
  );
  const peakP99Ms = Number(
    history
      .reduce((max, pt) => Math.max(max, pt.p99Ms ?? pt.p95Ms * 1.25), runState.globalP99Ms)
      .toFixed(1)
  );
  const peakAvgLatencyMs = Number(
    history
      .reduce((max, pt) => Math.max(max, pt.avgMs ?? 0), runState.globalAvgMs)
      .toFixed(1)
  );

  const errorRatePct =
    runState.totalRequests > 0
      ? Number(((runState.totalFailures / runState.totalRequests) * 100).toFixed(2))
      : runState.globalFailRatePct;

  const slaRows: PostRunSlaRow[] = runState.slaResults.map((res: SlaEvaluationResult) => ({
    id: res.criterion.id,
    label: formatMetricName(res.criterion.metric),
    subject: res.criterion.subject ?? 'Global Cluster',
    thresholdLabel: `${res.criterion.comparator} ${formatValueWithUnit(
      res.criterion.threshold,
      res.criterion.unit
    )}`,
    observedLabel: formatValueWithUnit(res.currentValue, res.criterion.unit),
    breached: res.breached || res.breachCount > 0,
    breachCount: res.breachCount,
    action: res.criterion.action,
  }));

  const breachedSlaCount = slaRows.filter((row) => row.breached).length;
  const passedSlaCount = slaRows.length - breachedSlaCount;

  const hasStopBreach =
    runState.status === 'aborted_sla' ||
    slaRows.some((row) => row.breached && row.action === 'stop');

  const verdict: PostRunVerdict = hasStopBreach
    ? 'failed'
    : breachedSlaCount > 0 || errorRatePct >= 2
      ? 'warning'
      : 'passed';

  let slowestEndpointLabel: string | null = null;
  let slowestEndpointP99Ms = 0;
  for (const ep of runState.endpoints) {
    if (ep.p99Ms >= slowestEndpointP99Ms) {
      slowestEndpointP99Ms = ep.p99Ms;
      slowestEndpointLabel = ep.label;
    }
  }

  return {
    specName: config.name,
    clusterName,
    coordinatorBind: config.distributed.coordinatorBind,
    endStatus: runState.status,
    verdict,
    elapsedSec: runState.elapsedSec,
    targetConcurrency: runState.targetConcurrency,
    totalRequests: runState.totalRequests,
    totalFailures: runState.totalFailures,
    errorRatePct,
    peakRps,
    avgRps,
    peakAvgLatencyMs,
    peakP95Ms,
    peakP99Ms,
    finalP95Ms: runState.globalP95Ms,
    finalP99Ms: runState.globalP99Ms,
    passedSlaCount,
    breachedSlaCount,
    slaRows,
    slowestEndpointLabel,
    slowestEndpointP99Ms: Number(slowestEndpointP99Ms.toFixed(1)),
  };
}
