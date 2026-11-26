import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  DistributedRunState,
  PummelConfig,
  ValidationDiagnostic,
} from '../../types/pummel';
import { runDryRunValidation, serializeConfig } from '../../engine/configEngine';
import {
  createInitialClusterState,
  startDistributedRun,
  stopDistributedRun,
} from '../../engine/distributedSim';
import {
  applyClusterTargetToConfig,
  buildClusterWorkers,
  createQuickRunStartLogs,
  getTestClusterById,
  type TestClusterProfile,
} from '../../engine/testClusters';
import { createRecordedSessionFromRun, type RecordedTestSession } from '../../engine/sessionReplay';
import type { DetectedAnomaly } from '../../engine/anomalyDetector';
import type { AutoScaleEventSummary } from '../../engine/autoScaling';
import { prependLog, prependLogs } from './types';
import { useWorkerManagementActions } from './useWorkerManagementActions';

interface UseWorkerClusterActionsParams {
  config: PummelConfig;
  selectedCluster: TestClusterProfile;
  setConfig: Dispatch<SetStateAction<PummelConfig>>;
  setRunState: Dispatch<SetStateAction<DistributedRunState>>;
  setDiagnostics: Dispatch<SetStateAction<ValidationDiagnostic[]>>;
  setLastAuditAt: Dispatch<SetStateAction<string>>;
  setSelectedClusterId: Dispatch<SetStateAction<string>>;
  setRecentAnomalies: Dispatch<SetStateAction<DetectedAnomaly[]>>;
  setLastScaleEvent: Dispatch<SetStateAction<AutoScaleEventSummary | null>>;
  setPostRunAnalysisOpen: Dispatch<SetStateAction<boolean>>;
  setRecordedSessions: Dispatch<SetStateAction<RecordedTestSession[]>>;
  lastBreachedRulesRef: MutableRefObject<Set<string>>;
  seenAnomalyIdsRef: MutableRefObject<Set<string>>;
  lastScaleAtElapsedRef: MutableRefObject<number | null>;
}

export function useWorkerClusterActions({
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
}: UseWorkerClusterActionsParams) {
  const workerActions = useWorkerManagementActions({
    shardStrategy: config.distributed.shardStrategy,
    setConfig,
    setRunState,
    setDiagnostics,
  });

  const startRun = useCallback(() => {
    lastBreachedRulesRef.current.clear();
    seenAnomalyIdsRef.current.clear();
    lastScaleAtElapsedRef.current = null;
    setRecentAnomalies([]);
    setLastScaleEvent(null);
    setPostRunAnalysisOpen(false);
    setRunState((prev) => startDistributedRun(prev, config));
  }, [
    config,
    lastBreachedRulesRef,
    seenAnomalyIdsRef,
    lastScaleAtElapsedRef,
    setRecentAnomalies,
    setLastScaleEvent,
    setPostRunAnalysisOpen,
    setRunState,
  ]);

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
  }, [setRunState]);

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
  }, [setRunState]);

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
  }, [config, selectedCluster, setRunState, setRecordedSessions]);

  const resetRun = useCallback(() => {
    lastBreachedRulesRef.current.clear();
    seenAnomalyIdsRef.current.clear();
    lastScaleAtElapsedRef.current = null;
    setRecentAnomalies([]);
    setLastScaleEvent(null);
    setPostRunAnalysisOpen(false);
    setRunState((prev) => createInitialClusterState(config, prev.workers));
  }, [
    config,
    lastBreachedRulesRef,
    seenAnomalyIdsRef,
    lastScaleAtElapsedRef,
    setRecentAnomalies,
    setLastScaleEvent,
    setPostRunAnalysisOpen,
    setRunState,
  ]);

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
  }, [setRunState]);

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
    [setConfig, setDiagnostics, setRunState, setLastAuditAt]
  );

  const selectCluster = useCallback(
    (clusterId: string) => {
      setSelectedClusterId(getTestClusterById(clusterId).id);
    },
    [setSelectedClusterId]
  );

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
    [
      config,
      setSelectedClusterId,
      setConfig,
      setDiagnostics,
      lastBreachedRulesRef,
      seenAnomalyIdsRef,
      lastScaleAtElapsedRef,
      setRunState,
    ]
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
    [
      setSelectedClusterId,
      setConfig,
      setDiagnostics,
      lastBreachedRulesRef,
      seenAnomalyIdsRef,
      lastScaleAtElapsedRef,
      setRecentAnomalies,
      setLastScaleEvent,
      setPostRunAnalysisOpen,
      setRunState,
      setLastAuditAt,
    ]
  );

  const rerunAudit = useCallback(() => {
    setDiagnostics(runDryRunValidation(config, serializeConfig(config, 'yaml')));
    setLastAuditAt(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  }, [config, setDiagnostics, setLastAuditAt]);

  const clearLogs = useCallback(() => {
    setRunState((prev) => ({
      ...prev,
      logs: [],
    }));
  }, [setRunState]);

  return {
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
    resetRun,
    toggleChaosFault,
    ...workerActions,
    applyWorkspaceConfig,
    selectCluster,
    switchActiveCluster,
    quickRunConfig,
    rerunAudit,
    clearLogs,
  };
}
