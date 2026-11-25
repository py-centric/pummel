import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileBarChart2, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
import { MAX_TIMINGS } from '../engine/distributedSim';
import { buildPostRunAnalysisReport } from '../engine/postRunAnalysis';
import { buildReplayFrameAtIndex } from '../engine/sessionReplay';
import {
  buildLogTimelineExportArtifact,
  type LogTimelineExportFormat,
} from '../engine/logTimelineExport';
import type { DistributedRunState } from '../types/pummel';

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

  // Timeline Replay state
  const [activeReplaySessionId, setActiveReplaySessionId] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);

  const activeReplaySession = useMemo(
    () =>
      activeReplaySessionId
        ? recordedSessions.find((s) => s.id === activeReplaySessionId) ?? null
        : null,
    [activeReplaySessionId, recordedSessions]
  );

  // Auto-advance replay timeline when Play is active
  useEffect(() => {
    if (!activeReplaySession || !replayPlaying) return undefined;
    const maxIdx = Math.max(0, activeReplaySession.history.length - 1);
    if (replayIndex >= maxIdx) {
      setReplayPlaying(false);
      return undefined;
    }
    const intervalMs = Math.max(180, Math.round(1000 / replaySpeed));
    const timer = window.setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= maxIdx) {
          setReplayPlaying(false);
          return maxIdx;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [activeReplaySession, replayPlaying, replaySpeed, replayIndex]);

  // Project either replayed session frame or live runState cleanly
  const effectiveRunState: DistributedRunState = useMemo(() => {
    if (!activeReplaySession) return runState;
    const frame = buildReplayFrameAtIndex(activeReplaySession, replayIndex);
    return {
      ...runState,
      status: activeReplaySession.endStatus,
      elapsedSec: frame.elapsedSec,
      targetConcurrency: activeReplaySession.targetConcurrency,
      activeVUs: frame.activeVUs,
      totalRequests: activeReplaySession.totalRequests,
      totalFailures: activeReplaySession.totalFailures,
      currentRps: frame.currentRps,
      globalAvgMs: frame.globalAvgMs,
      globalP90Ms: frame.globalP90Ms,
      globalP95Ms: frame.globalP95Ms,
      globalP99Ms: frame.globalP99Ms,
      globalFailRatePct: frame.globalFailRatePct,
      workers:
        activeReplaySession.workersSnapshot.length > 0
          ? activeReplaySession.workersSnapshot
          : runState.workers,
      endpoints:
        activeReplaySession.endpoints.length > 0
          ? activeReplaySession.endpoints
          : runState.endpoints,
      slaResults:
        activeReplaySession.slaResults.length > 0
          ? activeReplaySession.slaResults
          : runState.slaResults,
      hookExecutions:
        activeReplaySession.hookExecutions.length > 0
          ? activeReplaySession.hookExecutions
          : runState.hookExecutions,
      history: frame.historySlice,
      logs: frame.logsSlice,
    };
  }, [activeReplaySession, replayIndex, runState]);

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

  const handleStartReplay = (sessionId: string) => {
    const target = recordedSessions.find((s) => s.id === sessionId);
    if (!target) return;
    setActiveReplaySessionId(target.id);
    setReplayIndex(Math.max(0, target.history.length - 1));
    setReplayPlaying(false);
    setExportStatusMessage(`Entered Replay Mode: "${target.label}".`);
  };

  const handleExitReplay = () => {
    setActiveReplaySessionId(null);
    setReplayPlaying(false);
    setReplayIndex(0);
    setExportStatusMessage('Returned to live cluster telemetry stream.');
  };

  const handleDeleteSession = (sessionId: string) => {
    if (activeReplaySessionId === sessionId) {
      setActiveReplaySessionId(null);
      setReplayPlaying(false);
      setReplayIndex(0);
    }
    deleteRecordedSession(sessionId);
    setExportStatusMessage('Deleted recorded session from localStorage.');
  };

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
            <FileBarChart2 className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
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
        activeReplaySessionId={activeReplaySessionId}
        replayIndex={replayIndex}
        replayPlaying={replayPlaying}
        replaySpeed={replaySpeed}
        canRecordCurrent={runState.history.length > 0 || runState.logs.length > 0}
        onRecordCurrentSession={handleRecordCurrentSession}
        onStartReplay={handleStartReplay}
        onExitReplay={handleExitReplay}
        onScrubIndex={(idx) => {
          setReplayPlaying(false);
          setReplayIndex(idx);
        }}
        onTogglePlayReplay={() => setReplayPlaying((prev) => !prev)}
        onChangeSpeed={setReplaySpeed}
        onDeleteSession={handleDeleteSession}
      />

      {/* Top KPI Strip */}
      <section
        aria-label="Live cluster metrics summary"
        className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-800 dark:bg-slate-800"
      >
        <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Active Virtual Users
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">
            {effectiveRunState.activeVUs.toLocaleString()}
            <span className="ml-1.5 text-sm font-normal text-slate-400 dark:text-slate-500">
              / {effectiveRunState.targetConcurrency.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {onlineWorkers} online · quorum {config.distributed.quorumWorkers}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Aggregate Throughput
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">
            {effectiveRunState.currentRps.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">
              req/s
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {effectiveRunState.totalRequests.toLocaleString()} total requests
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Global p95 Latency
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-orange-700 dark:text-orange-400">
            {effectiveRunState.globalP95Ms.toFixed(1)}
            <span className="ml-0.5 text-sm font-normal text-slate-500 dark:text-slate-400">
              ms
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            avg {effectiveRunState.globalAvgMs.toFixed(1)}ms · p90{' '}
            {effectiveRunState.globalP90Ms.toFixed(1)}ms
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Global p99 Latency
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
            {effectiveRunState.globalP99Ms.toFixed(1)}
            <span className="ml-0.5 text-sm font-normal text-slate-500 dark:text-slate-400">
              ms
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            tail spread +
            {Math.max(0, effectiveRunState.globalP99Ms - effectiveRunState.globalP95Ms).toFixed(1)}ms
            vs p95
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Error Rate &amp; SLA Guard
          </div>
          <div
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              breachedSlas > 0 || effectiveRunState.status === 'aborted_sla'
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {effectiveRunState.globalFailRatePct.toFixed(2)}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {breachedSlas > 0
              ? `${breachedSlas} SLA rule${breachedSlas === 1 ? '' : 's'} breached`
              : `${effectiveRunState.slaResults.length} SLA rules nominal`}
          </div>
        </div>
      </section>

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
            currentWorkerCount={effectiveRunState.workers.filter((w) => w.status !== 'offline').length}
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
      <section
        aria-label="Distributed gRPC Worker Fleet"
        className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              gRPC Coordinator &amp; Worker Fleet
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Manage worker nodes, shard allocation strategy, and simulated network partitions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="whitespace-nowrap">Sharding</span>
              <select
                aria-label="VU sharding strategy"
                value={config.distributed.shardStrategy}
                onChange={(e) =>
                  updateDistributedConfig({
                    shardStrategy: e.target.value as 'weighted-capacity' | 'round-robin',
                  })
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="weighted-capacity">Weighted Capacity</option>
                <option value="round-robin">Round Robin</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="whitespace-nowrap">Transport</span>
              <select
                aria-label="gRPC transport security mode"
                value={config.distributed.tlsMode}
                onChange={(e) =>
                  updateDistributedConfig({
                    tlsMode: e.target.value as 'mtls' | 'tls' | 'plaintext-local',
                  })
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="mtls">mTLS</option>
                <option value="tls">TLS</option>
                <option value="plaintext-local">Local Plaintext</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => addWorker()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Worker
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Worker Node</th>
                <th className="px-4 py-3">Region / gRPC Endpoint</th>
                <th className="px-4 py-3 text-right">Weight</th>
                <th className="px-4 py-3 text-right">Assigned VUs</th>
                <th className="px-4 py-3 text-right">Throughput</th>
                <th className="px-4 py-3 text-right">Avg Latency</th>
                <th className="px-4 py-3 text-right">CPU / Mem</th>
                <th className="px-4 py-3">State</th>
                <th className="px-5 py-3 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800/80">
              {effectiveRunState.workers.map((worker) => {
                const isFocused = focusedWorkerId === worker.id;
                return (
                  <tr
                    key={worker.id}
                    id={`worker-row-${worker.id}`}
                    data-focused={isFocused ? 'true' : undefined}
                    className={`transition-colors ${
                      isFocused
                        ? 'bg-orange-50/80 dark:bg-orange-950/35'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {worker.id}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">{worker.hostname}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                      <div>{worker.region}</div>
                      <div className="text-slate-400 dark:text-slate-50">
                        {worker.grpcEndpoint}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {worker.capacityWeight}x · {worker.cpuCores}c
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {worker.activeVUs} / {worker.assignedVUs}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {worker.currentRps.toLocaleString()} rps
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {worker.avgLatencyMs.toFixed(1)} ms
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {worker.cpuUsagePct}% · {worker.memoryMb} MB
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          worker.status === 'offline'
                            ? 'text-red-700 dark:text-red-400'
                            : worker.status === 'degraded'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {worker.status === 'running'
                          ? 'Running'
                          : worker.status === 'ready'
                            ? 'Ready'
                            : worker.status === 'degraded'
                              ? 'Degraded'
                              : 'Offline'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => cycleWorkerStatus(worker.id)}
                          aria-label={`Cycle fault state for ${worker.id}`}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden="true" />
                          {worker.status === 'offline'
                            ? 'Restore'
                            : worker.status === 'degraded'
                              ? 'Take Offline'
                              : 'Degrade'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeWorker(worker.id)}
                          disabled={effectiveRunState.workers.length <= 1}
                          aria-label={`Remove worker ${worker.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom 2-Column Split: Per-Endpoint Latency & Chaos Lifecycle Hooks */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section
          aria-label="Per-Endpoint Protocol Telemetry"
          className="min-w-0 rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                Endpoint Telemetry Summary
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Multi-protocol breakdown capped at {MAX_TIMINGS.toLocaleString()} samples per endpoint.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-2.5">Endpoint</th>
                  <th className="px-3 py-2.5">Protocol</th>
                  <th className="px-3 py-2.5 text-right">Requests</th>
                  <th className="px-3 py-2.5 text-right">p95</th>
                  <th className="px-3 py-2.5 text-right">p99</th>
                  <th className="px-5 py-2.5 text-right">Buffer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {effectiveRunState.endpoints.map((ep) => (
                  <tr
                    key={ep.label}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {ep.label}
                    </td>
                    <td className="px-3 py-3 font-mono uppercase text-slate-600 dark:text-slate-400">
                      {ep.protocol}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {ep.totalRequests.toLocaleString()}
                      {ep.failedRequests > 0 && (
                        <span className="ml-1 text-red-600 dark:text-red-400">
                          ({ep.failedRequests} err)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {ep.p95Ms.toFixed(1)} ms
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {ep.p99Ms.toFixed(1)} ms
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {ep.timingsMs.length.toLocaleString()} / {MAX_TIMINGS.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-label="Chaos Lifecycle Hooks"
          className="min-w-0 rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Chaos Lifecycle Hooks
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Ordered prepare → startup → test → shutdown execution with guaranteed teardown.
            </p>
          </div>
          <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800/80">
            {effectiveRunState.hookExecutions.map((hook) => (
              <div key={`${hook.phase}-${hook.name}`} className="py-3.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {hook.phase.toUpperCase()} · {hook.name}
                  </span>
                  <span
                    className={`font-mono font-medium ${
                      hook.status === 'completed'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : hook.status === 'failed'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {hook.status === 'completed'
                      ? `Completed (T+${hook.timestampSec}s)`
                      : hook.status === 'failed'
                        ? 'Failed'
                        : 'Pending'}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-500 break-all dark:text-slate-400">
                  $ {hook.command}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Real-Time Execution Logs Stream + CSV/JSON Historical Export */}
      <div id="cluster-execution-logs">
        <ExecutionLogsPanel
          logs={effectiveRunState.logs}
          runStatus={effectiveRunState.status}
          onClearLogs={clearLogs}
          onExportLogsTimeline={handleExportLogsTimeline}
        />
      </div>

      {/* Post-Run Analysis Modal (auto-opens after completion/abort or via header button) */}
      <PostRunAnalysisModal
        open={postRunAnalysisOpen}
        report={postRunReport}
        onClose={closePostRunAnalysis}
        onRunAgain={startRun}
      />
    </div>
  );
}
