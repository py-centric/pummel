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
  DistributedRunState,
  PummelConfig,
  ValidationDiagnostic,
} from '../types/pummel';
import {
  createDefaultPresetConfig,
  runDryRunValidation,
  serializeConfig,
} from '../engine/configEngine';
import { createInitialClusterState } from '../engine/distributedSim';
import { TEST_CLUSTER_PROFILES, getTestClusterById } from '../engine/testClusters';
import {
  DEFAULT_ANOMALY_CONFIG,
  type AnomalyDetectorConfig,
  type DetectedAnomaly,
} from '../engine/anomalyDetector';
import {
  captureRunHeatmapSnapshot,
  loadRecordedRunHeatmaps,
  saveRecordedRunHeatmaps,
  type RecordedRunHeatmap,
} from '../engine/latencyComparison';
import {
  DEFAULT_AUTO_SCALE_CONFIG,
  type AutoScaleConfig,
  type AutoScaleEventSummary,
} from '../engine/autoScaling';
import {
  createRecordedSessionFromRun,
  loadRecordedSessions,
  saveRecordedSessions,
  type RecordedTestSession,
} from '../engine/sessionReplay';
import {
  getBrowserNotificationPermission,
  type BrowserNotificationPerm,
  type PummelContextValue,
} from './pummel/types';
import { useAlertingAndWebhooks } from './pummel/useAlertingAndWebhooks';
import { useWorkerClusterActions } from './pummel/useWorkerClusterActions';
import { useScheduledTests } from './pummel/useScheduledTests';
import { useSimulationLoop } from './pummel/useSimulationLoop';

export type { BrowserNotificationPerm };

const PummelContext = createContext<PummelContextValue | null>(null);

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
  const [selectedClusterId, setSelectedClusterId] = useState<string>(TEST_CLUSTER_PROFILES[0].id);

  const [anomalyConfig, setAnomalyConfig] = useState<AnomalyDetectorConfig>(DEFAULT_ANOMALY_CONFIG);
  const [recentAnomalies, setRecentAnomalies] = useState<DetectedAnomaly[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPerm>(
    () => getBrowserNotificationPermission()
  );
  const [postRunAnalysisOpen, setPostRunAnalysisOpen] = useState(false);
  const [recordedRunHeatmaps, setRecordedRunHeatmaps] = useState<RecordedRunHeatmap[]>(() =>
    loadRecordedRunHeatmaps()
  );
  const [autoScaleConfig, setAutoScaleConfig] = useState<AutoScaleConfig>(DEFAULT_AUTO_SCALE_CONFIG);
  const [lastScaleEvent, setLastScaleEvent] = useState<AutoScaleEventSummary | null>(null);
  const [recordedSessions, setRecordedSessions] = useState<RecordedTestSession[]>(() =>
    loadRecordedSessions()
  );

  const lastBreachedRulesRef = useRef<Set<string>>(new Set());
  const seenAnomalyIdsRef = useRef<Set<string>>(new Set());
  const lastScaleAtElapsedRef = useRef<number | null>(null);
  const prevStatusRef = useRef<DistributedRunState['status']>(runState.status);
  const anomalyConfigRef = useRef(anomalyConfig);
  anomalyConfigRef.current = anomalyConfig;
  const autoScaleConfigRef = useRef(autoScaleConfig);
  autoScaleConfigRef.current = autoScaleConfig;

  const selectedCluster = useMemo(
    () => getTestClusterById(selectedClusterId),
    [selectedClusterId]
  );

  useEffect(() => {
    saveRecordedRunHeatmaps(recordedRunHeatmaps);
  }, [recordedRunHeatmaps]);

  useEffect(() => {
    saveRecordedSessions(recordedSessions);
  }, [recordedSessions]);

  const alerting = useAlertingAndWebhooks({
    selectedClusterName: selectedCluster.name,
    setRunState,
  });

  useSimulationLoop({
    config,
    runState,
    setRunState,
    alertRules: alerting.alertRules,
    selectedCluster,
    anomalyConfigRef,
    autoScaleConfigRef,
    lastBreachedRulesRef,
    seenAnomalyIdsRef,
    lastScaleAtElapsedRef,
    prevStatusRef,
    dispatchWebhooksForNotifications: alerting.dispatchWebhooksForNotifications,
    setActiveAlerts: alerting.setActiveAlerts,
    setRecentAnomalies,
    setLastScaleEvent,
    setPostRunAnalysisOpen,
    setRecordedRunHeatmaps,
    setRecordedSessions,
  });

  const clusterActions = useWorkerClusterActions({
    config,
    selectedCluster,
    setConfig,
    setRunState,
    setDiagnostics,
    setLastAuditAt,
    setSelectedClusterId,
    setRecentAnomalies,
    setLastScaleEvent,
    setPostRunAnalysisOpen,
    setRecordedSessions,
    lastBreachedRulesRef,
    seenAnomalyIdsRef,
    lastScaleAtElapsedRef,
  });

  const scheduler = useScheduledTests({
    config,
    quickRunConfig: clusterActions.quickRunConfig,
  });

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
      alertRules: alerting.alertRules,
      activeAlerts: alerting.activeAlerts,
      selectedClusterId,
      selectedCluster,
      scheduledTests: scheduler.scheduledTests,
      anomalyConfig,
      recentAnomalies,
      notificationPermission,
      postRunAnalysisOpen,
      webhookIntegrations: alerting.webhookIntegrations,
      webhookDeliveries: alerting.webhookDeliveries,
      recordedRunHeatmaps,
      autoScaleConfig,
      lastScaleEvent,
      recordedSessions,
      ...clusterActions,
      addAlertRule: alerting.addAlertRule,
      toggleAlertRule: alerting.toggleAlertRule,
      removeAlertRule: alerting.removeAlertRule,
      simulateAlertBreach: alerting.simulateAlertBreach,
      dismissAlert: alerting.dismissAlert,
      clearAlerts: alerting.clearAlerts,
      addScheduledTest: scheduler.addScheduledTest,
      toggleScheduledTest: scheduler.toggleScheduledTest,
      removeScheduledTest: scheduler.removeScheduledTest,
      runScheduledTestNow: scheduler.runScheduledTestNow,
      updateAnomalyConfig,
      requestBrowserNotificationPermission,
      dismissRecentAnomalies,
      openPostRunAnalysis,
      closePostRunAnalysis,
      addWebhookIntegration: alerting.addWebhookIntegration,
      toggleWebhookIntegration: alerting.toggleWebhookIntegration,
      removeWebhookIntegration: alerting.removeWebhookIntegration,
      sendTestWebhookAlert: alerting.sendTestWebhookAlert,
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
      alerting,
      selectedClusterId,
      selectedCluster,
      scheduler,
      anomalyConfig,
      recentAnomalies,
      notificationPermission,
      postRunAnalysisOpen,
      recordedRunHeatmaps,
      autoScaleConfig,
      lastScaleEvent,
      recordedSessions,
      clusterActions,
      updateAnomalyConfig,
      requestBrowserNotificationPermission,
      dismissRecentAnomalies,
      openPostRunAnalysis,
      closePostRunAnalysis,
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
