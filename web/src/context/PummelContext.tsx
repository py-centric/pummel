import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  DistributedConfig,
  DistributedRunState,
  PummelConfig,
  RunLogEntry,
  ValidationDiagnostic,
  WorkerNode,
} from '../types/pummel';
import {
  createDefaultPresetConfig,
  parseRawConfigCheck,
  runDryRunValidation,
  serializeConfig,
} from '../engine/configEngine';
import {
  createInitialClusterState,
  distributeVUs,
  startDistributedRun,
  stepDistributedRun,
  stopDistributedRun,
} from '../engine/distributedSim';
import {
  buildSimulatedBreachSnapshot,
  createDefaultAlertRules,
  evaluateAlertThresholds,
  type AlertNotification,
  type AlertThresholdRule,
} from '../engine/alertingEngine';
import {
  TEST_CLUSTER_PROFILES,
  applyClusterTargetToConfig,
  buildClusterWorkers,
  createQuickRunStartLogs,
  getTestClusterById,
  type TestClusterProfile,
} from '../engine/testClusters';
import {
  createScheduledTestTask,
  findDueScheduledTests,
  loadScheduledTestsFromStorage,
  markScheduledTaskExecuted,
  saveScheduledTestsToStorage,
  sortScheduledTests,
  type ScheduledTestTask,
  type ScheduleRecurrence,
} from '../engine/scheduledTests';
import {
  analyzeTelemetryAnomalies,
  createAnomalyLogEntry,
  DEFAULT_ANOMALY_CONFIG,
  type AnomalyDetectorConfig,
  type DetectedAnomaly,
} from '../engine/anomalyDetector';
import {
  createWebhookIntegration,
  createWebhookLogEntry,
  formatWebhookPayload,
  loadWebhookIntegrations,
  saveWebhookIntegrations,
  selectMatchingWebhooks,
  type WebhookDeliveryRecord,
  type WebhookIntegration,
  type WebhookProvider,
} from '../engine/webhookIntegrations';
import {
  captureRunHeatmapSnapshot,
  loadRecordedRunHeatmaps,
  saveRecordedRunHeatmaps,
  type RecordedRunHeatmap,
} from '../engine/latencyComparison';
import {
  applyAutoScaleAction,
  DEFAULT_AUTO_SCALE_CONFIG,
  evaluateAutoScaling,
  type AutoScaleConfig,
  type AutoScaleEventSummary,
} from '../engine/autoScaling';
import {
  createRecordedSessionFromRun,
  loadRecordedSessions,
  saveRecordedSessions,
  type RecordedTestSession,
} from '../engine/sessionReplay';

function prependLog(existing: RunLogEntry[], entry: RunLogEntry): RunLogEntry[] {
  return [entry, ...existing].slice(0, 120);
}

function prependLogs(existing: RunLogEntry[], entries: RunLogEntry[]): RunLogEntry[] {
  if (entries.length === 0) return existing;
  return [...entries, ...existing].slice(0, 120);
}

export type BrowserNotificationPerm = 'default' | 'granted' | 'denied' | 'unsupported';

function getBrowserNotificationPermission(): BrowserNotificationPerm {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  return window.Notification.permission;
}

interface PummelContextValue {
  config: PummelConfig;
  runState: DistributedRunState;
  diagnostics: ValidationDiagnostic[];
  lastAuditAt: string;
  alertRules: AlertThresholdRule[];
  activeAlerts: AlertNotification[];
  selectedClusterId: string;
  selectedCluster: TestClusterProfile;
  scheduledTests: ScheduledTestTask[];
  anomalyConfig: AnomalyDetectorConfig;
  recentAnomalies: DetectedAnomaly[];
  notificationPermission: BrowserNotificationPerm;
  postRunAnalysisOpen: boolean;
  webhookIntegrations: WebhookIntegration[];
  webhookDeliveries: WebhookDeliveryRecord[];
  recordedRunHeatmaps: RecordedRunHeatmap[];
  autoScaleConfig: AutoScaleConfig;
  lastScaleEvent: AutoScaleEventSummary | null;
  recordedSessions: RecordedTestSession[];
  startRun: () => void;
  pauseRun: () => void;
  resumeRun: () => void;
  stopRun: () => void;
  resetRun: () => void;
  toggleChaosFault: () => void;
  addWorker: (region?: string) => void;
  cycleWorkerStatus: (workerId: string) => void;
  removeWorker: (workerId: string) => void;
  updateDistributedConfig: (patch: Partial<DistributedConfig>) => void;
  applyWorkspaceConfig: (nextConfig: PummelConfig, rawText?: string, unknownFields?: string[]) => void;
  selectCluster: (clusterId: string) => void;
  switchActiveCluster: (clusterId: string) => void;
  quickRunConfig: (params: {
    nextConfig: PummelConfig;
    clusterId: string;
    rawText?: string;
    unknownFields?: string[];
  }) => TestClusterProfile;
  rerunAudit: () => void;
  clearLogs: () => void;
  addAlertRule: (rule: Omit<AlertThresholdRule, 'id'>) => void;
  toggleAlertRule: (ruleId: string) => void;
  removeAlertRule: (ruleId: string) => void;
  simulateAlertBreach: (targetRuleId?: string) => void;
  dismissAlert: (alertId: string) => void;
  clearAlerts: () => void;
  addScheduledTest: (input: {
    label: string;
    clusterId: string;
    scheduledAtIso: string;
    recurrence: ScheduleRecurrence;
    specConfig?: PummelConfig;
    rawText?: string;
    format?: PummelConfig['reporting'] extends never ? never : 'yaml' | 'json' | 'toml';
  }) => ScheduledTestTask;
  toggleScheduledTest: (taskId: string) => void;
  removeScheduledTest: (taskId: string) => void;
  runScheduledTestNow: (taskId: string) => TestClusterProfile | null;
  updateAnomalyConfig: (patch: Partial<AnomalyDetectorConfig>) => void;
  requestBrowserNotificationPermission: () => Promise<BrowserNotificationPerm>;
  dismissRecentAnomalies: () => void;
  openPostRunAnalysis: () => void;
  closePostRunAnalysis: () => void;
  addWebhookIntegration: (input: {
    provider: WebhookProvider;
    name: string;
    webhookUrl: string;
    channelLabel: string;
    minSeverity: 'warning' | 'critical';
  }) => WebhookIntegration;
  toggleWebhookIntegration: (id: string) => void;
  removeWebhookIntegration: (id: string) => void;
  sendTestWebhookAlert: (id: string) => void;
  captureCurrentRunHeatmap: (customLabel?: string) => RecordedRunHeatmap | null;
  updateAutoScaleConfig: (patch: Partial<AutoScaleConfig>) => void;
  recordCurrentSession: (customLabel?: string) => RecordedTestSession | null;
  deleteRecordedSession: (sessionId: string) => void;
}

const PummelContext = createContext<PummelContextValue | null>(null);

const WORKER_REGIONS = ['eu-west-2', 'us-east-1', 'ap-southeast-1', 'eu-central-1', 'us-west-2'];

export function PummelProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PummelConfig>(() => createDefaultPresetConfig());
  const [runState, setRunState] = useState<DistributedRunState>(() =>
    createInitialClusterState(createDefaultPresetConfig())
  );
  const [diagnostics, setDiagnostics] = useState<ValidationDiagnostic[]>(() => {
    const initial = createDefaultPresetConfig();
    return runDryRunValidation(initial, serializeConfig(initial, 'yaml'));
  });
  const [lastAuditAt, setLastAuditAt] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [alertRules, setAlertRules] = useState<AlertThresholdRule[]>(() =>
    createDefaultAlertRules()
  );
  const [activeAlerts, setActiveAlerts] = useState<AlertNotification[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(TEST_CLUSTER_PROFILES[0].id);

  // Scheduled Quick Runs (localStorage)
  const [scheduledTests, setScheduledTests] = useState<ScheduledTestTask[]>(() =>
    loadScheduledTestsFromStorage()
  );

  // Anomaly Detection & Browser Notifications
  const [anomalyConfig, setAnomalyConfig] = useState<AnomalyDetectorConfig>(
    DEFAULT_ANOMALY_CONFIG
  );
  const [recentAnomalies, setRecentAnomalies] = useState<DetectedAnomaly[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPerm>(
    () => getBrowserNotificationPermission()
  );

  // Post-Run Analysis Modal
  const [postRunAnalysisOpen, setPostRunAnalysisOpen] = useState(false);

  // Webhook Integrations (localStorage)
  const [webhookIntegrations, setWebhookIntegrations] = useState<WebhookIntegration[]>(() =>
    loadWebhookIntegrations()
  );
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDeliveryRecord[]>([]);

  // Latency Heatmap Comparison Snapshots (localStorage)
  const [recordedRunHeatmaps, setRecordedRunHeatmaps] = useState<RecordedRunHeatmap[]>(() =>
    loadRecordedRunHeatmaps()
  );

  // Auto-Scaling Simulation
  const [autoScaleConfig, setAutoScaleConfig] = useState<AutoScaleConfig>(
    DEFAULT_AUTO_SCALE_CONFIG
  );
  const [lastScaleEvent, setLastScaleEvent] = useState<AutoScaleEventSummary | null>(null);

  // Recorded Test Sessions & Timeline Replay (localStorage)
  const [recordedSessions, setRecordedSessions] = useState<RecordedTestSession[]>(() =>
    loadRecordedSessions()
  );

  const lastBreachedRulesRef = useRef<Set<string>>(new Set());
  const seenAnomalyIdsRef = useRef<Set<string>>(new Set());
  const lastScaleAtElapsedRef = useRef<number | null>(null);
  const prevStatusRef = useRef<DistributedRunState['status']>(runState.status);
  const webhookIntegrationsRef = useRef(webhookIntegrations);
  webhookIntegrationsRef.current = webhookIntegrations;
  const anomalyConfigRef = useRef(anomalyConfig);
  anomalyConfigRef.current = anomalyConfig;
  const autoScaleConfigRef = useRef(autoScaleConfig);
  autoScaleConfigRef.current = autoScaleConfig;

  const selectedCluster = useMemo(
    () => getTestClusterById(selectedClusterId),
    [selectedClusterId]
  );

  // Persist localStorage-backed collections
  useEffect(() => {
    saveScheduledTestsToStorage(scheduledTests);
  }, [scheduledTests]);

  useEffect(() => {
    saveWebhookIntegrations(webhookIntegrations);
  }, [webhookIntegrations]);

  useEffect(() => {
    saveRecordedRunHeatmaps(recordedRunHeatmaps);
  }, [recordedRunHeatmaps]);

  useEffect(() => {
    saveRecordedSessions(recordedSessions);
  }, [recordedSessions]);

  const dispatchWebhooksForNotifications = useCallback(
    (
      notifications: readonly AlertNotification[],
      clusterName: string,
      timestampSec: number
    ): RunLogEntry[] => {
      const hooks = webhookIntegrationsRef.current;
      if (hooks.length === 0 || notifications.length === 0) return [];

      const deliveryLogs: RunLogEntry[] = [];
      const newDeliveries: WebhookDeliveryRecord[] = [];
      const hitCounts = new Map<string, number>();

      for (const notif of notifications) {
        const matching = selectMatchingWebhooks(hooks, notif.severity);
        for (const hook of matching) {
          const payload = formatWebhookPayload(hook.provider, notif, clusterName);
          const summary = `${notif.ruleName}: ${notif.message}`;
          newDeliveries.push({
            id: `del-${hook.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            integrationId: hook.id,
            provider: hook.provider,
            integrationName: hook.name,
            timestampIso: new Date().toISOString(),
            status: 'simulated',
            summary,
            payloadPreview: JSON.stringify(payload),
          });
          deliveryLogs.push(
            createWebhookLogEntry({
              integration: hook,
              summary: notif.ruleName,
              timestampSec,
            })
          );
          hitCounts.set(hook.id, (hitCounts.get(hook.id) ?? 0) + 1);
        }
      }

      if (newDeliveries.length > 0) {
        const nowIso = new Date().toISOString();
        setWebhookDeliveries((prev) => [...newDeliveries, ...prev].slice(0, 30));
        setWebhookIntegrations((prev) =>
          prev.map((h) => {
            const inc = hitCounts.get(h.id);
            return inc
              ? { ...h, deliveryCount: h.deliveryCount + inc, lastDeliveredAtIso: nowIso }
              : h;
          })
        );
      }

      return deliveryLogs;
    },
    []
  );

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
          const unseen = analysis.anomalies.filter(
            (a) => !seenAnomalyIdsRef.current.has(a.id)
          );
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
  }, [runState.status, config, alertRules, selectedCluster.name, dispatchWebhooksForNotifications]);

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
  }, [runState, config, selectedCluster]);

  const startRun = useCallback(() => {
    lastBreachedRulesRef.current.clear();
    seenAnomalyIdsRef.current.clear();
    lastScaleAtElapsedRef.current = null;
    setRecentAnomalies([]);
    setLastScaleEvent(null);
    setPostRunAnalysisOpen(false);
    setRunState((prev) => startDistributedRun(prev, config));
  }, [config]);

  const pauseRun = useCallback(() => {
    setRunState((prev) => {
      if (prev.status !== 'running') return prev;
      return {
        ...prev,
        status: 'paused',
        logs: prependLog(prev.logs, {
          id: `log-pause-${Date.now()}`,
          timestampSec: prev.elapsedSec,
          level: 'GRPC',
          source: 'coordinator',
          message: 'Broadcasted PauseExecution RPC to active workers.',
        }),
      };
    });
  }, []);

  const resumeRun = useCallback(() => {
    setRunState((prev) => {
      if (prev.status !== 'paused') return prev;
      return {
        ...prev,
        status: 'running',
        logs: prependLog(prev.logs, {
          id: `log-resume-${Date.now()}`,
          timestampSec: prev.elapsedSec,
          level: 'GRPC',
          source: 'coordinator',
          message: 'Resumed distributed execution across worker streams.',
        }),
      };
    });
  }, []);

  const stopRun = useCallback(() => {
    setRunState((prev) => {
      const stopped = stopDistributedRun(prev, 'user');
      if (stopped.history.length > 0) {
        const recorded = createRecordedSessionFromRun({
          runState: stopped,
          config,
          clusterId: selectedCluster.id,
          clusterName: selectedCluster.name,
        });
        setRecordedSessions((curr) => [recorded, ...curr].slice(0, 15));
      }
      return stopped;
    });
  }, [config, selectedCluster]);

  const resetRun = useCallback(() => {
    lastBreachedRulesRef.current.clear();
    seenAnomalyIdsRef.current.clear();
    lastScaleAtElapsedRef.current = null;
    setRecentAnomalies([]);
    setLastScaleEvent(null);
    setPostRunAnalysisOpen(false);
    setRunState((prev) => createInitialClusterState(config, prev.workers));
  }, [config]);

  const toggleChaosFault = useCallback(() => {
    setRunState((prev) => {
      const nextChaos = !prev.chaosFaultActive;
      return {
        ...prev,
        chaosFaultActive: nextChaos,
        logs: prependLog(prev.logs, {
          id: `log-chaos-${Date.now()}`,
          timestampSec: prev.elapsedSec,
          level: 'CHAOS',
          source: 'toxiproxy',
          message: nextChaos
            ? 'Injected Toxiproxy latency + packet-drop fault (expect p95 latency & fail-rate spike).'
            : 'Removed Toxiproxy fault injection; traffic returning to baseline.',
        }),
      };
    });
  }, []);

  const addWorker = useCallback(
    (region?: string) => {
      setRunState((prev) => {
        const nextNum = prev.workers.length + 1;
        const chosenRegion =
          region ?? WORKER_REGIONS[prev.workers.length % WORKER_REGIONS.length];
        const newWorker: WorkerNode = {
          id: `worker-${chosenRegion}-${String(nextNum).padStart(2, '0')}`,
          hostname: `pummel-wrk-${String(nextNum).padStart(2, '0')}.internal`,
          region: chosenRegion,
          grpcEndpoint: `10.42.${(nextNum % 4) + 1}.${10 + nextNum}:50052`,
          cpuCores: nextNum % 2 === 0 ? 16 : 8,
          capacityWeight: nextNum % 2 === 0 ? 2 : 1,
          assignedVUs: 0,
          activeVUs: 0,
          currentRps: 0,
          avgLatencyMs: 0,
          errorRatePct: 0,
          cpuUsagePct: 5,
          memoryMb: 104,
          lastHeartbeatMs: 21,
          status: prev.status === 'running' ? 'running' : 'ready',
        };
        const updatedWorkers = distributeVUs(
          prev.targetConcurrency,
          [...prev.workers, newWorker],
          config.distributed.shardStrategy
        );
        return {
          ...prev,
          workers: updatedWorkers,
          logs: prependLog(prev.logs, {
            id: `log-add-${newWorker.id}-${Date.now()}`,
            timestampSec: prev.elapsedSec,
            level: 'GRPC',
            source: 'coordinator',
            message: `Registered ${newWorker.id} (${newWorker.grpcEndpoint}) and rebalanced VU shards.`,
          }),
        };
      });
    },
    [config.distributed.shardStrategy]
  );

  const cycleWorkerStatus = useCallback(
    (workerId: string) => {
      setRunState((prev) => {
        const mapped = prev.workers.map((w) => {
          if (w.id !== workerId) return w;
          const nextStatus: WorkerNode['status'] =
            w.status === 'offline'
              ? prev.status === 'running'
                ? 'running'
                : 'ready'
              : w.status === 'degraded'
                ? 'offline'
                : 'degraded';
          return { ...w, status: nextStatus };
        });
        const rebalanced = distributeVUs(
          prev.targetConcurrency,
          mapped,
          config.distributed.shardStrategy
        );
        const changed = rebalanced.find((w) => w.id === workerId);
        return {
          ...prev,
          workers: rebalanced,
          logs: prependLog(prev.logs, {
            id: `log-wrk-status-${workerId}-${Date.now()}`,
            timestampSec: prev.elapsedSec,
            level: changed?.status === 'offline' ? 'WARN' : 'GRPC',
            source: workerId,
            message: `Node state set to "${changed?.status ?? 'ready'}"; VU shard rebalanced to ${changed?.assignedVUs ?? 0} VUs.`,
          }),
        };
      });
    },
    [config.distributed.shardStrategy]
  );

  const removeWorker = useCallback(
    (workerId: string) => {
      setRunState((prev) => {
        if (prev.workers.length <= 1) return prev;
        const filtered = prev.workers.filter((w) => w.id !== workerId);
        const rebalanced = distributeVUs(
          prev.targetConcurrency,
          filtered,
          config.distributed.shardStrategy
        );
        return {
          ...prev,
          workers: rebalanced,
          logs: prependLog(prev.logs, {
            id: `log-rm-${workerId}-${Date.now()}`,
            timestampSec: prev.elapsedSec,
            level: 'GRPC',
            source: 'coordinator',
            message: `Drained and detached worker ${workerId}; remaining nodes rebalanced.`,
          }),
        };
      });
    },
    [config.distributed.shardStrategy]
  );

  const updateDistributedConfig = useCallback((patch: Partial<DistributedConfig>) => {
    setConfig((prev) => {
      const next: PummelConfig = {
        ...prev,
        distributed: {
          ...prev.distributed,
          ...patch,
        },
      };
      setRunState((cur) => ({
        ...cur,
        workers: distributeVUs(cur.targetConcurrency, cur.workers, next.distributed.shardStrategy),
      }));
      setDiagnostics(runDryRunValidation(next, serializeConfig(next, 'yaml')));
      return next;
    });
  }, []);

  const applyWorkspaceConfig = useCallback(
    (nextConfig: PummelConfig, rawText?: string, unknownFields: string[] = []) => {
      setConfig(nextConfig);
      const text = rawText ?? serializeConfig(nextConfig, 'yaml');
      setDiagnostics(runDryRunValidation(nextConfig, text, unknownFields));
      setRunState((prev) => createInitialClusterState(nextConfig, prev.workers));
      setLastAuditAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    },
    []
  );

  const selectCluster = useCallback((clusterId: string) => {
    setSelectedClusterId(getTestClusterById(clusterId).id);
  }, []);

  const switchActiveCluster = useCallback(
    (clusterId: string) => {
      const cluster = getTestClusterById(clusterId);
      const targeted = applyClusterTargetToConfig(config, cluster);
      const workers = buildClusterWorkers(cluster);
      setSelectedClusterId(cluster.id);
      setConfig(targeted);
      setDiagnostics(runDryRunValidation(targeted, serializeConfig(targeted, 'yaml')));
      lastBreachedRulesRef.current.clear();
      seenAnomalyIdsRef.current.clear();
      lastScaleAtElapsedRef.current = null;
      const nextState = createInitialClusterState(targeted, workers);
      setRunState({
        ...nextState,
        logs: prependLog(nextState.logs, {
          id: `log-cluster-switch-${cluster.id}-${Date.now()}`,
          timestampSec: 0,
          level: 'GRPC',
          source: 'coordinator',
          message: `Switched active target cluster to ${cluster.name} (${cluster.coordinatorBind} · ${workers.length} nodes).`,
        }),
      });
    },
    [config]
  );

  const quickRunConfig = useCallback(
    (params: {
      nextConfig: PummelConfig;
      clusterId: string;
      rawText?: string;
      unknownFields?: string[];
    }) => {
      const cluster = getTestClusterById(params.clusterId);
      const targetedConfig = applyClusterTargetToConfig(params.nextConfig, cluster);
      const workers = buildClusterWorkers(cluster);
      const text = params.rawText ?? serializeConfig(targetedConfig, 'yaml');

      setSelectedClusterId(cluster.id);
      setConfig(targetedConfig);
      setDiagnostics(runDryRunValidation(targetedConfig, text, params.unknownFields ?? []));
      lastBreachedRulesRef.current.clear();
      seenAnomalyIdsRef.current.clear();
      lastScaleAtElapsedRef.current = null;
      setRecentAnomalies([]);
      setLastScaleEvent(null);
      setPostRunAnalysisOpen(false);

      const initialized = createInitialClusterState(targetedConfig, workers);
      const started = startDistributedRun(initialized, targetedConfig);
      const dispatchLogs = createQuickRunStartLogs({
        config: targetedConfig,
        cluster,
        timestampSec: started.elapsedSec,
      });

      setRunState({
        ...started,
        logs: prependLogs(started.logs, dispatchLogs),
      });
      setLastAuditAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );

      return cluster;
    },
    []
  );

  const rerunAudit = useCallback(() => {
    setDiagnostics(runDryRunValidation(config, serializeConfig(config, 'yaml')));
    setLastAuditAt(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  }, [config]);

  const clearLogs = useCallback(() => {
    setRunState((prev) => ({
      ...prev,
      logs: [],
    }));
  }, []);

  const addAlertRule = useCallback((ruleInput: Omit<AlertThresholdRule, 'id'>) => {
    const newRule: AlertThresholdRule = {
      ...ruleInput,
      id: `alert-rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    setAlertRules((prev) => [...prev, newRule]);
  }, []);

  const toggleAlertRule = useCallback((ruleId: string) => {
    setAlertRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  }, []);

  const removeAlertRule = useCallback((ruleId: string) => {
    setAlertRules((prev) => prev.filter((r) => r.id !== ruleId));
  }, []);

  const simulateAlertBreach = useCallback(
    (targetRuleId?: string) => {
      const rulesToEval = targetRuleId
        ? alertRules.map((r) =>
            r.id === targetRuleId ? { ...r, enabled: true } : { ...r, enabled: false }
          )
        : alertRules;
      const syntheticSnapshot = buildSimulatedBreachSnapshot(rulesToEval, targetRuleId);

      setRunState((prev) => {
        const evalOut = evaluateAlertThresholds({
          rules: rulesToEval,
          snapshot: syntheticSnapshot,
          timestampSec: prev.elapsedSec,
        });

        let extraWhLogs: RunLogEntry[] = [];
        if (evalOut.notifications.length > 0) {
          setActiveAlerts((curr) => [...evalOut.notifications, ...curr].slice(0, 15));
          extraWhLogs = dispatchWebhooksForNotifications(
            evalOut.notifications,
            selectedCluster.name,
            prev.elapsedSec
          );
        }

        return {
          ...prev,
          globalAvgMs: prev.globalAvgMs > 0 ? prev.globalAvgMs : syntheticSnapshot.avgLatencyMs,
          globalP95Ms: Math.max(prev.globalP95Ms, syntheticSnapshot.p95LatencyMs),
          globalP99Ms: Math.max(prev.globalP99Ms, syntheticSnapshot.p99LatencyMs),
          globalFailRatePct: Math.max(prev.globalFailRatePct, syntheticSnapshot.errorRatePct),
          logs: prependLogs(prev.logs, [...evalOut.logEntries, ...extraWhLogs]),
        };
      });
    },
    [alertRules, selectedCluster.name, dispatchWebhooksForNotifications]
  );

  const dismissAlert = useCallback((alertId: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const clearAlerts = useCallback(() => {
    setActiveAlerts([]);
  }, []);

  // Scheduled Tests management + automatic scheduler polling
  const addScheduledTest = useCallback(
    (input: {
      label: string;
      clusterId: string;
      scheduledAtIso: string;
      recurrence: ScheduleRecurrence;
      specConfig?: PummelConfig;
      rawText?: string;
      format?: 'yaml' | 'json' | 'toml';
    }) => {
      const specCfg = input.specConfig ?? config;
      const fmt = input.format ?? 'yaml';
      const raw = input.rawText ?? serializeConfig(specCfg, fmt);
      const cluster = getTestClusterById(input.clusterId);
      const totalVUs = specCfg.execution.reduce((s, ex) => s + ex.concurrency, 0);
      const task = createScheduledTestTask({
        label: input.label,
        specName: specCfg.name,
        format: fmt,
        rawText: raw,
        concurrency: totalVUs,
        clusterId: cluster.id,
        clusterName: cluster.name,
        scheduledAtIso: input.scheduledAtIso,
        recurrence: input.recurrence,
      });
      setScheduledTests((prev) => sortScheduledTests([task, ...prev]));
      return task;
    },
    [config]
  );

  const toggleScheduledTest = useCallback((taskId: string) => {
    setScheduledTests((prev) =>
      sortScheduledTests(prev.map((t) => (t.id === taskId ? { ...t, enabled: !t.enabled } : t)))
    );
  }, []);

  const removeScheduledTest = useCallback((taskId: string) => {
    setScheduledTests((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const runScheduledTestNow = useCallback(
    (taskId: string): TestClusterProfile | null => {
      const task = scheduledTests.find((t) => t.id === taskId);
      if (!task) return null;
      const parsed = parseRawConfigCheck(task.rawText, task.format, config);
      const cluster = quickRunConfig({
        nextConfig: parsed.config,
        clusterId: task.clusterId,
        rawText: task.rawText,
        unknownFields: parsed.unknownFields,
      });
      setScheduledTests((prev) =>
        sortScheduledTests(
          prev.map((t) => (t.id === taskId ? markScheduledTaskExecuted(t, Date.now()) : t))
        )
      );
      return cluster;
    },
    [scheduledTests, config, quickRunConfig]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      const due = findDueScheduledTests(scheduledTests, Date.now());
      if (due.length === 0) return;
      const first = due[0];
      const parsed = parseRawConfigCheck(first.rawText, first.format, config);
      quickRunConfig({
        nextConfig: parsed.config,
        clusterId: first.clusterId,
        rawText: first.rawText,
        unknownFields: parsed.unknownFields,
      });
      const dueIds = new Set(due.map((d) => d.id));
      setScheduledTests((prev) =>
        sortScheduledTests(
          prev.map((t) => (dueIds.has(t.id) ? markScheduledTaskExecuted(t, Date.now()) : t))
        )
      );
    }, 5000);
    return () => window.clearInterval(interval);
  }, [scheduledTests, config, quickRunConfig]);

  const updateAnomalyConfig = useCallback((patch: Partial<AnomalyDetectorConfig>) => {
    setAnomalyConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return 'unsupported' as const;
    }
    try {
      const res = await window.Notification.requestPermission();
      setNotificationPermission(res);
      return res;
    } catch {
      return getBrowserNotificationPermission();
    }
  }, []);

  const dismissRecentAnomalies = useCallback(() => {
    setRecentAnomalies([]);
  }, []);

  const openPostRunAnalysis = useCallback(() => {
    setPostRunAnalysisOpen(true);
  }, []);

  const closePostRunAnalysis = useCallback(() => {
    setPostRunAnalysisOpen(false);
  }, []);

  const addWebhookIntegration = useCallback(
    (input: {
      provider: WebhookProvider;
      name: string;
      webhookUrl: string;
      channelLabel: string;
      minSeverity: 'warning' | 'critical';
    }) => {
      const created = createWebhookIntegration(input);
      setWebhookIntegrations((prev) => [created, ...prev]);
      return created;
    },
    []
  );

  const toggleWebhookIntegration = useCallback((id: string) => {
    setWebhookIntegrations((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );
  }, []);

  const removeWebhookIntegration = useCallback((id: string) => {
    setWebhookIntegrations((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const sendTestWebhookAlert = useCallback(
    (id: string) => {
      const target = webhookIntegrations.find((w) => w.id === id);
      if (!target) return;
      const sampleAlert = {
        ruleName: 'p95 Latency Threshold Guard (Test)',
        severity: 'critical' as const,
        message: 'Simulated threshold violation: p95 latency 245.0ms > 200ms SLA limit.',
        observedValue: 245.0,
        threshold: 200,
      };
      const payload = formatWebhookPayload(target.provider, sampleAlert, selectedCluster.name);
      const record: WebhookDeliveryRecord = {
        id: `del-test-${Date.now()}`,
        integrationId: target.id,
        provider: target.provider,
        integrationName: target.name,
        timestampIso: new Date().toISOString(),
        status: 'simulated',
        summary: sampleAlert.message,
        payloadPreview: JSON.stringify(payload),
      };
      setWebhookDeliveries((prev) => [record, ...prev].slice(0, 30));
      setWebhookIntegrations((prev) =>
        prev.map((w) =>
          w.id === id
            ? {
                ...w,
                deliveryCount: w.deliveryCount + 1,
                lastDeliveredAtIso: new Date().toISOString(),
              }
            : w
        )
      );
      setRunState((prev) => ({
        ...prev,
        logs: prependLog(
          prev.logs,
          createWebhookLogEntry({
            integration: target,
            summary: sampleAlert.ruleName,
            timestampSec: prev.elapsedSec,
          })
        ),
      }));
    },
    [webhookIntegrations, selectedCluster.name]
  );

  const captureCurrentRunHeatmap = useCallback(
    (customLabel?: string): RecordedRunHeatmap | null => {
      if (runState.endpoints.length === 0) return null;
      const stamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const snap = captureRunHeatmapSnapshot({
        label: customLabel?.trim() || `${config.name} (${selectedCluster.name} · ${stamp})`,
        clusterName: selectedCluster.name,
        targetConcurrency: runState.targetConcurrency,
        globalP95Ms: runState.globalP95Ms,
        globalP99Ms: runState.globalP99Ms,
        endpoints: runState.endpoints,
      });
      setRecordedRunHeatmaps((prev) => [snap, ...prev].slice(0, 12));
      return snap;
    },
    [runState, config.name, selectedCluster.name]
  );

  const updateAutoScaleConfig = useCallback((patch: Partial<AutoScaleConfig>) => {
    setAutoScaleConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const recordCurrentSession = useCallback(
    (customLabel?: string): RecordedTestSession | null => {
      if (runState.history.length === 0 && runState.logs.length === 0) return null;
      const recorded = createRecordedSessionFromRun({
        runState,
        config,
        clusterId: selectedCluster.id,
        clusterName: selectedCluster.name,
        label: customLabel,
      });
      setRecordedSessions((prev) => [recorded, ...prev].slice(0, 15));
      return recorded;
    },
    [runState, config, selectedCluster]
  );

  const deleteRecordedSession = useCallback((sessionId: string) => {
    setRecordedSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  const value = useMemo<PummelContextValue>(
    () => ({
      config,
      runState,
      diagnostics,
      lastAuditAt,
      alertRules,
      activeAlerts,
      selectedClusterId,
      selectedCluster,
      scheduledTests,
      anomalyConfig,
      recentAnomalies,
      notificationPermission,
      postRunAnalysisOpen,
      webhookIntegrations,
      webhookDeliveries,
      recordedRunHeatmaps,
      autoScaleConfig,
      lastScaleEvent,
      recordedSessions,
      startRun,
      pauseRun,
      resumeRun,
      stopRun,
      resetRun,
      toggleChaosFault,
      addWorker,
      cycleWorkerStatus,
      removeWorker,
      updateDistributedConfig,
      applyWorkspaceConfig,
      selectCluster,
      switchActiveCluster,
      quickRunConfig,
      rerunAudit,
      clearLogs,
      addAlertRule,
      toggleAlertRule,
      removeAlertRule,
      simulateAlertBreach,
      dismissAlert,
      clearAlerts,
      addScheduledTest,
      toggleScheduledTest,
      removeScheduledTest,
      runScheduledTestNow,
      updateAnomalyConfig,
      requestBrowserNotificationPermission,
      dismissRecentAnomalies,
      openPostRunAnalysis,
      closePostRunAnalysis,
      addWebhookIntegration,
      toggleWebhookIntegration,
      removeWebhookIntegration,
      sendTestWebhookAlert,
      captureCurrentRunHeatmap,
      updateAutoScaleConfig,
      recordCurrentSession,
      deleteRecordedSession,
    }),
    [
      config,
      runState,
      diagnostics,
      lastAuditAt,
      alertRules,
      activeAlerts,
      selectedClusterId,
      selectedCluster,
      scheduledTests,
      anomalyConfig,
      recentAnomalies,
      notificationPermission,
      postRunAnalysisOpen,
      webhookIntegrations,
      webhookDeliveries,
      recordedRunHeatmaps,
      autoScaleConfig,
      lastScaleEvent,
      recordedSessions,
      startRun,
      pauseRun,
      resumeRun,
      stopRun,
      resetRun,
      toggleChaosFault,
      addWorker,
      cycleWorkerStatus,
      removeWorker,
      updateDistributedConfig,
      applyWorkspaceConfig,
      selectCluster,
      switchActiveCluster,
      quickRunConfig,
      rerunAudit,
      clearLogs,
      addAlertRule,
      toggleAlertRule,
      removeAlertRule,
      simulateAlertBreach,
      dismissAlert,
      clearAlerts,
      addScheduledTest,
      toggleScheduledTest,
      removeScheduledTest,
      runScheduledTestNow,
      updateAnomalyConfig,
      requestBrowserNotificationPermission,
      dismissRecentAnomalies,
      openPostRunAnalysis,
      closePostRunAnalysis,
      addWebhookIntegration,
      toggleWebhookIntegration,
      removeWebhookIntegration,
      sendTestWebhookAlert,
      captureCurrentRunHeatmap,
      updateAutoScaleConfig,
      recordCurrentSession,
      deleteRecordedSession,
    ]
  );

  return <PummelContext.Provider value={value}>{children}</PummelContext.Provider>;
}

export function usePummel(): PummelContextValue {
  const ctx = useContext(PummelContext);
  if (!ctx) {
    throw new Error('usePummel must be used within a PummelProvider');
  }
  return ctx;
}
