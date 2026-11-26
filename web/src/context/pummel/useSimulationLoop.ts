import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { DistributedRunState, PummelConfig, RunLogEntry } from '../../types/pummel';
import { stepDistributedRun } from '../../engine/distributedSim';
import {
  evaluateAlertThresholds,
  type AlertNotification,
  type AlertThresholdRule,
} from '../../engine/alertingEngine';
import {
  analyzeTelemetryAnomalies,
  createAnomalyLogEntry,
  type AnomalyDetectorConfig,
  type DetectedAnomaly,
} from '../../engine/anomalyDetector';
import {
  applyAutoScaleAction,
  evaluateAutoScaling,
  type AutoScaleConfig,
  type AutoScaleEventSummary,
} from '../../engine/autoScaling';
import {
  captureRunHeatmapSnapshot,
  type RecordedRunHeatmap,
} from '../../engine/latencyComparison';
import {
  createRecordedSessionFromRun,
  type RecordedTestSession,
} from '../../engine/sessionReplay';
import type { TestClusterProfile } from '../../engine/testClusters';
import { prependLogs } from './types';

interface UseSimulationLoopParams {
  config: PummelConfig;
  runState: DistributedRunState;
  setRunState: Dispatch<SetStateAction<DistributedRunState>>;
  alertRules: AlertThresholdRule[];
  selectedCluster: TestClusterProfile;
  anomalyConfigRef: MutableRefObject<AnomalyDetectorConfig>;
  autoScaleConfigRef: MutableRefObject<AutoScaleConfig>;
  lastBreachedRulesRef: MutableRefObject<Set<string>>;
  seenAnomalyIdsRef: MutableRefObject<Set<string>>;
  lastScaleAtElapsedRef: MutableRefObject<number | null>;
  prevStatusRef: MutableRefObject<DistributedRunState['status']>;
  dispatchWebhooksForNotifications: (
    notifications: readonly AlertNotification[],
    clusterName: string,
    timestampSec: number
  ) => RunLogEntry[];
  setActiveAlerts: Dispatch<SetStateAction<AlertNotification[]>>;
  setRecentAnomalies: Dispatch<SetStateAction<DetectedAnomaly[]>>;
  setLastScaleEvent: Dispatch<SetStateAction<AutoScaleEventSummary | null>>;
  setPostRunAnalysisOpen: Dispatch<SetStateAction<boolean>>;
  setRecordedRunHeatmaps: Dispatch<SetStateAction<RecordedRunHeatmap[]>>;
  setRecordedSessions: Dispatch<SetStateAction<RecordedTestSession[]>>;
}

export function useSimulationLoop({
  config,
  runState,
  setRunState,
  alertRules,
  selectedCluster,
  anomalyConfigRef,
  autoScaleConfigRef,
  lastBreachedRulesRef,
  seenAnomalyIdsRef,
  lastScaleAtElapsedRef,
  prevStatusRef,
  dispatchWebhooksForNotifications,
  setActiveAlerts,
  setRecentAnomalies,
  setLastScaleEvent,
  setPostRunAnalysisOpen,
  setRecordedRunHeatmaps,
  setRecordedSessions,
}: UseSimulationLoopParams) {
  // Live 1-second execution, Alerting, Anomaly Detection, Auto-Scaling, & Webhook loop
  useEffect(() => {
    if (runState.status !== 'running') return undefined;
    const timer = window.setInterval(() => {
      setRunState((prev) => {
        let next = stepDistributedRun(prev, config, 1);
        const extraLogs: RunLogEntry[] = [];

        // 1. Evaluate Alerting Thresholds
        const evalOut = evaluateAlertThresholds({
          rules: alertRules,
          snapshot: {
            avgLatencyMs: next.globalAvgMs,
            p95LatencyMs: next.globalP95Ms,
            p99LatencyMs: next.globalP99Ms,
            errorRatePct: next.globalFailRatePct,
          },
          timestampSec: next.elapsedSec,
        });

        const prevBreached = lastBreachedRulesRef.current;
        const freshNotifs = evalOut.notifications.filter(
          (n) => !prevBreached.has(n.ruleId) || next.elapsedSec % 4 === 0
        );
        const freshAlertLogs = evalOut.logEntries.filter((_, idx) => {
          const ruleId = evalOut.breachedRuleIds[idx];
          return !prevBreached.has(ruleId) || next.elapsedSec % 4 === 0;
        });
        lastBreachedRulesRef.current = new Set(evalOut.breachedRuleIds);

        if (freshNotifs.length > 0) {
          setActiveAlerts((curr) => [...freshNotifs, ...curr].slice(0, 15));
          const whLogs = dispatchWebhooksForNotifications(
            freshNotifs,
            selectedCluster.name,
            next.elapsedSec
          );
          extraLogs.push(...freshAlertLogs, ...whLogs);
        } else if (freshAlertLogs.length > 0) {
          extraLogs.push(...freshAlertLogs);
        }

        // 2. Statistical Anomaly Detection
        const anomCfg = anomalyConfigRef.current;
        if (anomCfg.enabled && next.history.length >= 4) {
          const analysis = analyzeTelemetryAnomalies(next.history, anomCfg);
          const unseen = analysis.anomalies.filter((a) => !seenAnomalyIdsRef.current.has(a.id));
          if (unseen.length > 0) {
            unseen.forEach((a) => seenAnomalyIdsRef.current.add(a.id));
            setRecentAnomalies((curr) => [...unseen.slice().reverse(), ...curr].slice(0, 10));
            extraLogs.push(...unseen.map(createAnomalyLogEntry));

            if (
              anomCfg.browserNotificationsEnabled &&
              typeof window !== 'undefined' &&
              typeof window.Notification !== 'undefined' &&
              window.Notification.permission === 'granted'
            ) {
              const latest = unseen[unseen.length - 1];
              try {
                new window.Notification('Pummel Performance Anomaly Detected', {
                  body: `${selectedCluster.name} (T+${latest.elapsedSec}s): ${latest.message}`,
                });
              } catch {
                // Ignore Notification instantiation errors in restricted iframe environments
              }
            }
          }
        }

        // 3. Auto-Scaling Simulation Evaluation
        const scaleCfg = autoScaleConfigRef.current;
        if (scaleCfg.enabled && next.status === 'running') {
          const onlineWorkers = next.workers.filter((w) => w.status !== 'offline').length;
          const scaleEval = evaluateAutoScaling({
            config: scaleCfg,
            currentOnlineWorkers: onlineWorkers,
            currentTotalWorkers: next.workers.length,
            currentRps: next.currentRps,
            elapsedSec: next.elapsedSec,
            lastScaleAtElapsedSec: lastScaleAtElapsedRef.current,
          });
          if (scaleEval.action !== 'none') {
            const scaleOut = applyAutoScaleAction({
              evaluation: scaleEval,
              workers: next.workers,
              targetConcurrency: next.targetConcurrency,
              shardStrategy: config.distributed.shardStrategy,
              elapsedSec: next.elapsedSec,
              currentRps: next.currentRps,
              isRunning: true,
            });
            lastScaleAtElapsedRef.current = next.elapsedSec;
            next = {
              ...next,
              workers: scaleOut.workers,
            };
            if (scaleOut.logEntry) {
              extraLogs.push(scaleOut.logEntry);
            }
            if (scaleOut.eventSummary) {
              setLastScaleEvent(scaleOut.eventSummary);
            }
          }
        }

        if (extraLogs.length > 0) {
          return {
            ...next,
            logs: prependLogs(next.logs, extraLogs),
          };
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [
    runState.status,
    config,
    alertRules,
    selectedCluster.name,
    dispatchWebhooksForNotifications,
    setRunState,
    setActiveAlerts,
    setRecentAnomalies,
    setLastScaleEvent,
    anomalyConfigRef,
    autoScaleConfigRef,
    lastBreachedRulesRef,
    seenAnomalyIdsRef,
    lastScaleAtElapsedRef,
  ]);

  // Auto-open Post-Run Analysis Modal & Auto-record Session + Heatmap on completion/abort
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = runState.status;

    const transitionedToDone =
      prevStatus === 'running' &&
      (runState.status === 'completed' || runState.status === 'aborted_sla');

    if (transitionedToDone) {
      setPostRunAnalysisOpen(true);

      if (runState.endpoints.some((e) => e.totalRequests > 0)) {
        const snap = captureRunHeatmapSnapshot({
          label: `${config.name} (${selectedCluster.name} · ${runState.elapsedSec}s)`,
          clusterName: selectedCluster.name,
          targetConcurrency: runState.targetConcurrency,
          globalP95Ms: runState.globalP95Ms,
          globalP99Ms: runState.globalP99Ms,
          endpoints: runState.endpoints,
        });
        setRecordedRunHeatmaps((prev) => [snap, ...prev].slice(0, 12));
      }

      if (runState.history.length > 0) {
        const recorded = createRecordedSessionFromRun({
          runState,
          config,
          clusterId: selectedCluster.id,
          clusterName: selectedCluster.name,
        });
        setRecordedSessions((prev) => [recorded, ...prev].slice(0, 15));
      }
    }
  }, [
    runState,
    config,
    selectedCluster,
    prevStatusRef,
    setPostRunAnalysisOpen,
    setRecordedRunHeatmaps,
    setRecordedSessions,
  ]);
}
