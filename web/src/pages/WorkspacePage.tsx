import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePummel } from '../context/PummelContext';
import { ConfigSnapshotsBar } from '../components/ConfigSnapshotsBar';
import { SnapshotDiffViewer } from '../components/SnapshotDiffViewer';
import { ScheduleTestPanel } from '../components/ScheduleTestPanel';
import { ExecutionLogsPanel } from '../components/ExecutionLogsPanel';
import { PipelineStatusWidget } from '../components/PipelineStatusWidget';
import { ScenarioBenchmarkPanel } from '../components/ScenarioBenchmarkPanel';
import { GitHooksPanel } from '../components/GitHooksPanel';
import { WorkspaceHeaderBar } from '../components/workspace/WorkspaceHeaderBar';
import { WorkspaceEditorSection } from '../components/workspace/WorkspaceEditorSection';
import {
  SpecImporterSection,
  ValidationAndExporterSplit,
  type ExportTarget,
} from '../components/workspace/WorkspacePanels';
import { useWorkspaceSnapshots } from '../components/workspace/useWorkspaceSnapshots';
import {
  applyBenchmarkScenarioToConfig,
  type BenchmarkScenario,
} from '../engine/scenarioBenchmarking';
import type { ScheduleRecurrence } from '../engine/scheduledTests';
import type { ConfigFormat, PummelConfig } from '../types/pummel';
import { getTemplateById, type LoadTestTemplate } from '../engine/templateLibrary';
import type { DownloadExportFormat } from '../engine/exportDownload';
import {
  applyCliOverrides,
  exportPummelConfig,
  normalizeInheritance,
  parseRawConfigCheck,
  runDryRunValidation,
  serializeConfig,
} from '../engine/configEngine';
import {
  buildSecurityPolicyDemo,
  triggerConfigExportDownload,
} from '../components/workspace/workspaceHelpers';

interface WorkspaceLocationState {
  templateId?: string;
}

export function WorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    config,
    runState,
    selectedClusterId,
    selectCluster,
    quickRunConfig,
    stopRun,
    clearLogs,
    scheduledTests,
    addScheduledTest,
    toggleScheduledTest,
    removeScheduledTest,
    runScheduledTestNow,
    applyWorkspaceConfig,
  } = usePummel();

  const [format, setFormat] = useState<ConfigFormat>('yaml');
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>('load');
  const [draftConfig, setDraftConfig] = useState<PummelConfig>(() => config);
  const [rawText, setRawText] = useState<string>(() => serializeConfig(config, 'yaml'));
  const [overrideInput, setOverrideInput] = useState('execution.0.concurrency=900');
  const [appliedOverrides, setAppliedOverrides] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState(() =>
    runDryRunValidation(config, serializeConfig(config, 'yaml'))
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<ExportTarget>('distributed');
  const [schedulePanelOpen, setSchedulePanelOpen] = useState(false);
  const [logsStreamOpen, setLogsStreamOpen] = useState(() => runState.status === 'running');

  const snapshotManager = useWorkspaceSnapshots({
    draftConfig,
    format,
    rawText,
    onApplyRestored: (next) => {
      setFormat(next.format);
      setRawText(next.rawText);
      setDraftConfig(next.config);
      setParseError(next.parseError);
      setDiagnostics(next.diagnostics);
      setActiveTemplateId(null);
      setAppliedOverrides([]);
      setStatusMessage(next.statusMessage);
    },
    onParsedDraft: (next) => {
      setDraftConfig(next.config);
      setParseError(next.parseError);
      setStatusMessage(next.statusMessage);
    },
    onStatusMessage: setStatusMessage,
  });

  const { normalized, inheritedPairs } = useMemo(
    () => normalizeInheritance(draftConfig),
    [draftConfig]
  );

  const exportedOutput = useMemo(
    () => exportPummelConfig(draftConfig, exportTarget),
    [draftConfig, exportTarget]
  );

  const handleFormatChange = (nextFormat: ConfigFormat) => {
    setFormat(nextFormat);
    setRawText(serializeConfig(draftConfig, nextFormat));
    setParseError(null);
  };

  const handleSelectTemplate = useCallback(
    (template: LoadTestTemplate) => {
      const nextConfig = template.buildConfig();
      const serialized = serializeConfig(nextConfig, format);
      setActiveTemplateId(template.id);
      setDraftConfig(nextConfig);
      setRawText(serialized);
      setAppliedOverrides([]);
      setDiagnostics(runDryRunValidation(nextConfig, serialized));
      setParseError(null);
      setStatusMessage(
        `Injected "${template.name}" (${template.pattern.toUpperCase()} · ${template.concurrency.toLocaleString()} VUs, ${template.durationSec}s) into editor.`
      );
    },
    [format]
  );

  useEffect(() => {
    const state = location.state as WorkspaceLocationState | null;
    if (!state?.templateId) return;
    const tpl = getTemplateById(state.templateId);
    if (tpl) {
      handleSelectTemplate(tpl);
    }
  }, [location.state, handleSelectTemplate]);

  const handleLoadSecurityDemo = () => {
    const demo = buildSecurityPolicyDemo();
    setFormat('yaml');
    setActiveTemplateId(null);
    setDraftConfig(demo.config);
    setRawText(demo.serialized);
    setDiagnostics(demo.diagnostics);
    setParseError(null);
    setStatusMessage(
      'Loaded failing security sample to inspect dry-run [SERDE]/[IO]/[ENV] guards.'
    );
  };

  const handleDryRun = () => {
    const parsed = parseRawConfigCheck(rawText, format, draftConfig);
    setParseError(parsed.parseError ?? null);
    setDraftConfig(parsed.config);
    const results = runDryRunValidation(parsed.config, rawText, parsed.unknownFields);
    setDiagnostics(results);
    const errors = results.filter((d) => d.severity === 'error').length;
    setStatusMessage(
      errors === 0 && !parsed.parseError
        ? 'Dry-run passed: zero network packets sent, schema & security gates verified.'
        : `Dry-run detected ${errors + (parsed.parseError ? 1 : 0)} blocking issue(s).`
    );
  };

  const handleApplyOverride = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = overrideInput.trim();
    if (!trimmed || !trimmed.includes('=')) {
      setStatusMessage(
        'Provide an override in key=value format (e.g. execution.0.concurrency=900).'
      );
      return;
    }
    const nextConfig = applyCliOverrides(draftConfig, [trimmed]);
    const serialized = serializeConfig(nextConfig, format);
    setDraftConfig(nextConfig);
    setRawText(serialized);
    setAppliedOverrides((prev) => [...prev, trimmed]);
    setDiagnostics(runDryRunValidation(nextConfig, serialized));
    setOverrideInput('');
    setStatusMessage(`Applied CLI override: -o ${trimmed}`);
  };

  const handleLoadIntoCluster = () => {
    const parsed = parseRawConfigCheck(rawText, format, draftConfig);
    const results = runDryRunValidation(parsed.config, rawText, parsed.unknownFields);
    setDiagnostics(results);
    setParseError(parsed.parseError ?? null);
    applyWorkspaceConfig(parsed.config, rawText, parsed.unknownFields);
    navigate('/');
  };

  const handleQuickRun = () => {
    const parsed = parseRawConfigCheck(rawText, format, draftConfig);
    const results = runDryRunValidation(parsed.config, rawText, parsed.unknownFields);
    setDiagnostics(results);
    setParseError(parsed.parseError ?? null);
    setDraftConfig(parsed.config);
    const cluster = quickRunConfig({
      nextConfig: parsed.config,
      clusterId: selectedClusterId,
      rawText,
      unknownFields: parsed.unknownFields,
    });
    setLogsStreamOpen(true);
    setStatusMessage(
      `Quick Run launched "${parsed.config.name}" against ${cluster.name} (${cluster.coordinatorBind}) -- streaming telemetry logs below.`
    );
  };

  const handleCreateSchedule = (input: {
    label: string;
    clusterId: string;
    scheduledAtIso: string;
    recurrence: ScheduleRecurrence;
  }) => {
    const parsed = parseRawConfigCheck(rawText, format, draftConfig);
    const created = addScheduledTest({
      label: input.label,
      clusterId: input.clusterId,
      scheduledAtIso: input.scheduledAtIso,
      recurrence: input.recurrence,
      specConfig: parsed.config,
      rawText,
      format,
    });
    setStatusMessage(`Scheduled "${created.label}" (${created.clusterName}) in localStorage.`);
  };

  const handleRunScheduledNow = (taskId: string) => {
    const cluster = runScheduledTestNow(taskId);
    if (cluster) {
      setLogsStreamOpen(true);
      setStatusMessage(
        `Executed scheduled Quick Run on ${cluster.name} -- streaming logs below.`
      );
    }
  };

  const handleLoadBenchmarkScenario = (scenario: BenchmarkScenario) => {
    const nextConfig = applyBenchmarkScenarioToConfig(draftConfig, scenario);
    const serialized = serializeConfig(nextConfig, format);
    setActiveTemplateId(null);
    setDraftConfig(nextConfig);
    setRawText(serialized);
    setDiagnostics(runDryRunValidation(nextConfig, serialized));
    setParseError(null);
    setStatusMessage(
      `Applied benchmark scenario "${scenario.name}" (${scenario.concurrencyVUs.toLocaleString()} VUs · ${scenario.rampUpSec}s ramp / ${scenario.holdForSec}s hold).`
    );
  };

  const handleExportDownload = (target: DownloadExportFormat) => {
    const parsed = parseRawConfigCheck(rawText, format, draftConfig);
    setParseError(parsed.parseError ?? null);
    setDraftConfig(parsed.config);
    setExportTarget(target);
    const artifact = triggerConfigExportDownload(parsed.config, target);
    setStatusMessage(`Exported ${artifact.label} (${artifact.filename}).`);
  };

  const errorCount =
    diagnostics.filter((d) => d.severity === 'error').length + (parseError ? 1 : 0);

  return (
    <div className="space-y-6">
      <WorkspaceHeaderBar
        selectedClusterId={selectedClusterId}
        runStatus={runState.status}
        logsCount={runState.logs.length}
        scheduledCount={scheduledTests.length}
        schedulePanelOpen={schedulePanelOpen}
        logsStreamOpen={logsStreamOpen}
        compareOpen={snapshotManager.compareOpen}
        onSelectCluster={selectCluster}
        onQuickRun={handleQuickRun}
        onStopRun={stopRun}
        onToggleSchedulePanel={() => setSchedulePanelOpen((prev) => !prev)}
        onToggleLogsStream={() => setLogsStreamOpen((prev) => !prev)}
        onSaveSnapshot={() => void snapshotManager.handleSaveSnapshot()}
        onToggleCompare={snapshotManager.handleToggleCompare}
        onExportDownload={handleExportDownload}
        onDryRun={handleDryRun}
        onLoadIntoCluster={handleLoadIntoCluster}
      />

      {schedulePanelOpen && (
        <ScheduleTestPanel
          tasks={scheduledTests}
          activeSpecName={draftConfig.name}
          activeConcurrency={normalized.execution[0]?.concurrency ?? 0}
          activeFormat={format}
          defaultClusterId={selectedClusterId}
          onCreateSchedule={handleCreateSchedule}
          onToggleTask={toggleScheduledTest}
          onDeleteTask={removeScheduledTest}
          onRunTaskNow={handleRunScheduledNow}
          onClose={() => setSchedulePanelOpen(false)}
        />
      )}

      {logsStreamOpen && (
        <div data-testid="workspace-execution-logs">
          <ExecutionLogsPanel
            logs={runState.logs}
            runStatus={runState.status}
            onClearLogs={clearLogs}
          />
        </div>
      )}

      <ConfigSnapshotsBar
        snapshots={snapshotManager.snapshots}
        activeSnapshotId={snapshotManager.activeSnapshotId}
        compareOpen={snapshotManager.compareOpen}
        compareBaseId={snapshotManager.compareBaseId}
        compareTargetId={snapshotManager.compareTargetId}
        loading={snapshotManager.snapshotsLoading}
        error={snapshotManager.snapshotError}
        onSaveSnapshot={snapshotManager.handleSaveSnapshot}
        onRestoreSnapshot={snapshotManager.handleRestoreSnapshot}
        onDeleteSnapshot={snapshotManager.handleDeleteSnapshot}
        onToggleCompare={snapshotManager.handleToggleCompare}
        onCompareSnapshot={snapshotManager.handleCompareSnapshot}
      />

      {snapshotManager.compareOpen && (
        <SnapshotDiffViewer
          snapshots={snapshotManager.snapshots}
          baseSnapshotId={snapshotManager.compareBaseId}
          targetSnapshotId={snapshotManager.compareTargetId}
          onSelectBase={snapshotManager.setCompareBaseId}
          onSelectTarget={snapshotManager.setCompareTargetId}
          onSwap={snapshotManager.handleSwapCompareSides}
          onClose={() => snapshotManager.setCompareOpen(false)}
          onRestoreSnapshot={snapshotManager.handleRestoreSnapshot}
          onSeedComparisonPair={snapshotManager.handleSeedComparisonPair}
        />
      )}

      <WorkspaceEditorSection
        draftConfig={draftConfig}
        normalized={normalized}
        inheritedPairs={inheritedPairs}
        format={format}
        rawText={rawText}
        activeTemplateId={activeTemplateId}
        statusMessage={statusMessage}
        overrideInput={overrideInput}
        appliedOverrides={appliedOverrides}
        onOverrideInputChange={setOverrideInput}
        onApplyOverride={handleApplyOverride}
        onSelectTemplate={handleSelectTemplate}
        onLoadSecurityDemo={handleLoadSecurityDemo}
        onFormatChange={handleFormatChange}
        onRawTextChange={(nextVal) => {
          setRawText(nextVal);
          setActiveTemplateId(null);
        }}
      />

      <ValidationAndExporterSplit
        diagnostics={diagnostics}
        parseError={parseError}
        errorCount={errorCount}
        exportTarget={exportTarget}
        exportedOutput={exportedOutput}
        onSelectExportTarget={setExportTarget}
      />

      <SpecImporterSection
        onImportedYaml={(yaml, summary) => {
          setFormat('yaml');
          setActiveTemplateId(null);
          setRawText(yaml);
          setStatusMessage(summary);
        }}
      />

      <PipelineStatusWidget activeSpecName={draftConfig.name} />

      <ScenarioBenchmarkPanel
        activeConfig={draftConfig}
        onLoadScenarioIntoEditor={handleLoadBenchmarkScenario}
      />

      <GitHooksPanel activeConfig={draftConfig} />
    </div>
  );
}
