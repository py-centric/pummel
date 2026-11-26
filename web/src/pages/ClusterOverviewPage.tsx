import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileBarChart2 } from 'lucide-react';
import { usePummel } from '../context/PummelContext';
import { RatatuiDashboard } from '../components/RatatuiDashboard';
import { PerformanceTrendsChart } from '../components/PerformanceTrendsChart';
import { WorkerStatusIndicator } from '../components/WorkerStatusIndicator';
import { LatencyHeatmap } from '../components/LatencyHeatmap';
import { ExecutionLogsPanel } from '../components/ExecutionLogsPanel';
import { ExportRawDataMenu } from '../components/ExportRawDataMenu';
import { ClusterHealthSidebar } from '../components/ClusterHealthSidebar';
import { SystemEventTimeline } from '../components/SystemEventTimeline';
import { GlobalHealthView } from '../components/GlobalHealthView';
import { LatencyComparisonView } from '../components/LatencyComparisonView';
import { PostRunAnalysisModal } from '../components/PostRunAnalysisModal';
import { AutoScalePanel } from '../components/AutoScalePanel';
import { SessionReplayBar } from '../components/SessionReplayBar';
import { ClusterKpiStrip } from '../components/cluster/ClusterKpiStrip';
import { WorkerFleetTable } from '../components/cluster/WorkerFleetTable';
import { EndpointAndHooksGrid } from '../components/cluster/EndpointAndHooksGrid';
import { useClusterReplay } from '../components/cluster/useClusterReplay';
import { buildPostRunAnalysisReport } from '../engine/postRunAnalysis';
import {
  buildLogTimelineExportArtifact,
  type LogTimelineExportFormat,
} from '../engine/logTimelineExport';

interface ClusterLocationState {
  focusWorkerId?: string;
}

export function ClusterOverviewPage() {
  const location = useLocation();
  const {
    config,
    runState,
    selectedClusterId,
    selectedCluster,
    anomalyConfig,
    notificationPermission,
    postRunAnalysisOpen,
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
    switchActiveCluster,
    clearLogs,
    updateAnomalyConfig,
    requestBrowserNotificationPermission,
    openPostRunAnalysis,
    closePostRunAnalysis,
    captureCurrentRunHeatmap,
    updateAutoScaleConfig,
    recordCurrentSession,
    deleteRecordedSession,
  } = usePummel();

  const [focusedWorkerId, setFocusedWorkerId] = useState<string | null>(null);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);

  const replay = useClusterReplay({
    runState,
    recordedSessions,
    deleteRecordedSession,
    onStatusMessage: setExportStatusMessage,
  });

  const { activeReplaySession, effectiveRunState } = replay;

  const handleFocusWorker = useCallback((workerId: string) => {
    setFocusedWorkerId(workerId);
    window.requestAnimationFrame(() => {
      const row = document.getElementById(`worker-row-${workerId}`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  useEffect(() => {
    const state = location.state as ClusterLocationState | null;
    if (!state?.focusWorkerId) return;
    handleFocusWorker(state.focusWorkerId);
    const timer = window.setTimeout(() => setFocusedWorkerId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [location.state, handleFocusWorker]);

  const handleRecordCurrentSession = () => {
    const recorded = recordCurrentSession();
    if (recorded) {
      setExportStatusMessage(`Recorded session "${recorded.label}" for timeline replay.`);
    }
  };

  const handleExportLogsTimeline = (format: LogTimelineExportFormat) => {
    const artifact = buildLogTimelineExportArtifact({
      logs: effectiveRunState.logs,
      elapsedSec: effectiveRunState.elapsedSec,
      specName: activeReplaySession ? activeReplaySession.specName : config.name,
      clusterName: activeReplaySession ? activeReplaySession.clusterName : selectedCluster.name,
      sessionLabel: activeReplaySession?.label,
      format,
    });

    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = artifact.filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    setExportStatusMessage(
      `Exported ${artifact.filename} (${artifact.logCount} logs · ${artifact.timelineEventCount} timeline events)`
    );
  };

  const postRunReport = useMemo(
    () =>
      buildPostRunAnalysisReport({
        runState: effectiveRunState,
        config,
        clusterName: activeReplaySession ? activeReplaySession.clusterName : selectedCluster.name,
      }),
    [effectiveRunState, config, activeReplaySession, selectedCluster.name]
  );

  const onlineWorkers = effectiveRunState.workers.filter((w) => w.status !== 'offline').length;
  const breachedSlas = effectiveRunState.slaResults.filter((s) => s.breached).length;

  return (
    <div className="space-y-6">
      {/* Page Title & Quick Export / Analysis Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50 text-balance">
            Distributed Load Cluster &amp; Ratatui TUI
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Centralized gRPC coordinator ({config.distributed.coordinatorBind}) ·{' '}
            {config.distributed.shardStrategy} sharding · {config.distributed.tlsMode.toUpperCase()}
            {exportStatusMessage && (
              <span className="ml-2 font-mono text-xs font-medium text-emerald-700 dark:text-emerald-400">
                · {exportStatusMessage}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
          <button
            type="button"
            data-testid="open-post-run-report-btn"
            onClick={openPostRunAnalysis}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileBarChart2
              className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400"
              aria-hidden="true"
            />
            Post-Run Report
          </button>

          <ExportRawDataMenu
            runState={effectiveRunState}
            specName={config.name}
            onExported={(msg) => setExportStatusMessage(msg)}
          />

          <Link
            to="/workspace"
            className="font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline whitespace-nowrap dark:text-slate-300 dark:hover:text-white"
          >
            Edit Scenario Config
          </Link>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
            ·
          </span>
          <Link
            to="/compliance"
            className="font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline whitespace-nowrap dark:text-slate-300 dark:hover:text-white"
          >
            View Compliance Matrix
          </Link>
        </div>
      </div>

      {/* Session Recording & Timeline Replay Controls */}
      <SessionReplayBar
        sessions={recordedSessions}
        activeReplaySessionId={replay.activeReplaySessionId}
        replayIndex={replay.replayIndex}
        replayPlaying={replay.replayPlaying}
        replaySpeed={replay.replaySpeed}
        canRecordCurrent={runState.history.length > 0 || runState.logs.length > 0}
        onRecordCurrentSession={handleRecordCurrentSession}
        onStartReplay={replay.handleStartReplay}
        onExitReplay={replay.handleExitReplay}
        onScrubIndex={replay.handleScrubIndex}
        onTogglePlayReplay={replay.handleTogglePlayReplay}
        onChangeSpeed={replay.setReplaySpeed}
        onDeleteSession={replay.handleDeleteSession}
      />

      {/* Top KPI Strip */}
      <ClusterKpiStrip
        runState={effectiveRunState}
        quorumWorkers={config.distributed.quorumWorkers}
        onlineWorkers={onlineWorkers}
        breachedSlas={breachedSlas}
      />

      {/* Main Split: Telemetry Core + Cluster Health Sidebar */}
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-8 xl:col-span-9">
          <WorkerStatusIndicator
            workers={effectiveRunState.workers}
            quorumWorkers={config.distributed.quorumWorkers}
            coordinatorBind={config.distributed.coordinatorBind}
            onToggleWorker={cycleWorkerStatus}
          />

          <RatatuiDashboard
            config={config}
            runState={effectiveRunState}
            onStart={startRun}
            onPause={pauseRun}
            onResume={resumeRun}
            onStop={stopRun}
            onReset={resetRun}
            onToggleChaos={toggleChaosFault}
          />

          <AutoScalePanel
            config={autoScaleConfig}
            currentWorkerCount={onlineWorkers}
            currentRps={effectiveRunState.currentRps}
            lastScaleEvent={lastScaleEvent}
            onUpdateConfig={updateAutoScaleConfig}
          />

          <PerformanceTrendsChart
            history={effectiveRunState.history}
            slaCriteria={config.sla}
            isRunning={effectiveRunState.status === 'running' && !activeReplaySession}
            onStartRun={startRun}
            anomalyConfig={anomalyConfig}
            onUpdateAnomalyConfig={updateAnomalyConfig}
            notificationPermission={notificationPermission}
            onRequestBrowserNotifications={requestBrowserNotificationPermission}
          />
        </div>

        <div className="min-w-0 lg:sticky lg:top-20 lg:col-span-4 xl:col-span-3">
          <ClusterHealthSidebar
            workers={effectiveRunState.workers}
            chaosFaultActive={effectiveRunState.chaosFaultActive}
            isRunning={effectiveRunState.status === 'running' && !activeReplaySession}
            selectedWorkerId={focusedWorkerId}
            onSelectWorker={handleFocusWorker}
            onCycleWorkerStatus={cycleWorkerStatus}
          />
        </div>
      </div>

      {/* System Event Timeline Derived from Execution Logs */}
      <SystemEventTimeline
        logs={effectiveRunState.logs}
        elapsedSec={effectiveRunState.elapsedSec}
        onInspectLogs={() => {
          document.getElementById('cluster-execution-logs')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }}
      />

      {/* Global Multi-Cluster Health & Infrastructure Capacity */}
      <GlobalHealthView
        activeClusterId={selectedClusterId}
        activeWorkers={effectiveRunState.workers}
        activeRunStatus={effectiveRunState.status}
        activeRps={effectiveRunState.currentRps}
        chaosFaultActive={effectiveRunState.chaosFaultActive}
        onSelectCluster={switchActiveCluster}
      />

      {/* 2D Endpoint Latency Heatmap & Outlier Matrix */}
      <LatencyHeatmap
        endpoints={effectiveRunState.endpoints}
        slaCriteria={config.sla}
        isRunning={effectiveRunState.status === 'running' && !activeReplaySession}
        onStartRun={startRun}
      />

      {/* Side-by-Side Latency Heatmap Comparison Overlay */}
      <LatencyComparisonView
        runs={recordedRunHeatmaps}
        canCaptureCurrent={runState.endpoints.some((e) => e.totalRequests > 0)}
        onCaptureCurrentRun={() => {
          const snap = captureCurrentRunHeatmap();
          if (snap) {
            setExportStatusMessage(`Captured latency snapshot "${snap.label}" for comparison.`);
          }
        }}
      />

      {/* Distributed gRPC Coordinator & Worker Fleet */}
      <WorkerFleetTable
        workers={effectiveRunState.workers}
        distributed={config.distributed}
        focusedWorkerId={focusedWorkerId}
        onUpdateDistributedConfig={updateDistributedConfig}
        onAddWorker={addWorker}
        onCycleWorkerStatus={cycleWorkerStatus}
        onRemoveWorker={removeWorker}
      />

      {/* Bottom 2-Column Split: Per-Endpoint Latency & Chaos Lifecycle Hooks */}
      <EndpointAndHooksGrid
        endpoints={effectiveRunState.endpoints}
        hookExecutions={effectiveRunState.hookExecutions}
      />

      {/* Real-Time Execution Logs Stream + CSV/JSON Historical Export */}
      <div id="cluster-execution-logs">
        <ExecutionLogsPanel
          logs={effectiveRunState.logs}
          runStatus={effectiveRunState.status}
          onClearLogs={clearLogs}
          onExportLogsTimeline={handleExportLogsTimeline}
        />
      </div>

      {/* Post-Run Analysis Modal */}
      <PostRunAnalysisModal
        open={postRunAnalysisOpen}
        report={postRunReport}
        onClose={closePostRunAnalysis}
        onRunAgain={startRun}
      />
    </div>
  );
}
