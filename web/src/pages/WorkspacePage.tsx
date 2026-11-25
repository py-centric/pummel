import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  Camera,
  Check,
  Copy,
  GitCompare,
  Play,
  Plus,
  Square,
  Terminal,
  Upload,
  Zap,
} from 'lucide-react';
import { usePummel } from '../context/PummelContext';
import { YamlCodeEditor } from '../components/YamlCodeEditor';
import { TemplateLibrarySidebar } from '../components/TemplateLibrarySidebar';
import { ExportConfigMenu } from '../components/ExportConfigMenu';
import { ConfigSnapshotsBar } from '../components/ConfigSnapshotsBar';
import { SnapshotDiffViewer } from '../components/SnapshotDiffViewer';
import { ScheduleTestPanel } from '../components/ScheduleTestPanel';
import { ExecutionLogsPanel } from '../components/ExecutionLogsPanel';
import { PipelineStatusWidget } from '../components/PipelineStatusWidget';
import { ScenarioBenchmarkPanel } from '../components/ScenarioBenchmarkPanel';
import { GitHooksPanel } from '../components/GitHooksPanel';
import { applyBenchmarkScenarioToConfig, type BenchmarkScenario } from '../engine/scenarioBenchmarking';
import { TEST_CLUSTER_PROFILES } from '../engine/testClusters';
import type { ScheduleRecurrence } from '../engine/scheduledTests';
import type { ConfigFormat, PummelConfig } from '../types/pummel';
import { getTemplateById, type LoadTestTemplate } from '../engine/templateLibrary';
import {
  buildConfigExportArtifact,
  type DownloadExportFormat,
} from '../engine/exportDownload';
import {
  createSnapshotRecord,
  deleteConfigSnapshot,
  listConfigSnapshots,
  saveConfigSnapshot,
  sortSnapshotsNewestFirst,
  type ConfigSnapshot,
} from '../engine/snapshotStore';
import {
  applyCliOverrides,
  createDefaultPresetConfig,
  exportPummelConfig,
  importExternalSpec,
  normalizeInheritance,
  parseRawConfigCheck,
  runDryRunValidation,
  serializeConfig,
} from '../engine/configEngine';

type ExportTarget = 'k6' | 'locust' | 'taurus' | 'postman' | 'goose' | 'distributed';

interface WorkspaceLocationState {
  templateId?: string;
}

const SAMPLE_POSTMAN = JSON.stringify(
  {
    info: {
      name: 'Payments Gateway v2',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [
      {
        name: 'POST /v2/intents',
        request: { method: 'POST', url: { raw: 'https://pay.internal/v2/intents' } },
      },
      {
        name: 'GET /v2/intents/status',
        request: { method: 'GET', url: { raw: 'https://pay.internal/v2/intents/status' } },
      },
    ],
  },
  null,
  2
);

const SAMPLE_HAR = JSON.stringify(
  {
    log: {
      version: '1.2',
      entries: [
        { request: { method: 'GET', url: 'https://cdn.shop.internal/assets/hero.png' } },
        { request: { method: 'GET', url: 'https://api.shop.internal/v1/catalog' } },
        { request: { method: 'POST', url: 'https://api.shop.internal/v1/cart/items' } },
      ],
    },
  },
  null,
  2
);

const SAMPLE_OPENAPI = JSON.stringify(
  {
    openapi: '3.1.0',
    info: { title: 'Inventory gRPC Gateway' },
    paths: {
      '/v1/inventory/stock': { get: {} },
      '/v1/inventory/reserve': { post: {} },
    },
  },
  null,
  2
);

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
  const [copiedExport, setCopiedExport] = useState(false);

  const [importInput, setImportInput] = useState(SAMPLE_HAR);
  const [importResult, setImportResult] = useState<{
    detectedFormat: string;
    yaml: string;
    summary: string;
  } | null>(null);

  const [snapshots, setSnapshots] = useState<ConfigSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBaseId, setCompareBaseId] = useState<string | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [schedulePanelOpen, setSchedulePanelOpen] = useState(false);
  const [logsStreamOpen, setLogsStreamOpen] = useState(() => runState.status === 'running');

  useEffect(() => {
    let active = true;
    listConfigSnapshots()
      .then((items) => {
        if (!active) return;
        setSnapshots(items);
        if (items.length >= 2) {
          setCompareBaseId(items[1].id);
          setCompareTargetId(items[0].id);
        } else if (items.length === 1) {
          setCompareBaseId(items[0].id);
          setCompareTargetId(items[0].id);
        }
        setSnapshotError(null);
      })
      .catch((err) => {
        if (!active) return;
        setSnapshotError(
          err instanceof Error ? err.message : 'Unable to access IndexedDB snapshots.'
        );
      })
      .finally(() => {
        if (active) setSnapshotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
    const base = createDefaultPresetConfig();
    base.name = 'Pre-Flight Security Policy Demo';
    base.api.bindAddress = '0.0.0.0';
    base.scenarios.auth.dataSources[0].path = '../../etc/passwd';
    const serialized =
      serializeConfig(base, 'yaml') +
      '\nlegacy_block: true\n# leaked: ${env.AWS_SECRET_ACCESS_KEY}';
    setFormat('yaml');
    setActiveTemplateId(null);
    setDraftConfig(base);
    setRawText(serialized);
    const parsed = parseRawConfigCheck(serialized, 'yaml', base);
    setDiagnostics(runDryRunValidation(parsed.config, serialized, parsed.unknownFields));
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
      `Quick Run launched "${parsed.config.name}" against ${cluster.name} (${cluster.coordinatorBind})  --  streaming telemetry logs below.`
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
    setStatusMessage(
      `Scheduled "${created.label}" (${created.clusterName}) in localStorage.`
    );
  };

  const handleRunScheduledNow = (taskId: string) => {
    const cluster = runScheduledTestNow(taskId);
    if (cluster) {
      setLogsStreamOpen(true);
      setStatusMessage(
        `Executed scheduled Quick Run on ${cluster.name}  --  streaming logs below.`
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

  const handleImportConvert = () => {
    const converted = importExternalSpec(importInput);
    setImportResult(converted);
    if (converted.yaml) {
      setFormat('yaml');
      setActiveTemplateId(null);
      setRawText(converted.yaml);
      setStatusMessage(converted.summary);
    }
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportedOutput);
      setCopiedExport(true);
      window.setTimeout(() => setCopiedExport(false), 1600);
    } catch {
      setCopiedExport(false);
    }
  };

  const handleExportDownload = (target: DownloadExportFormat) => {
    const parsed = parseRawConfigCheck(rawText, format, draftConfig);
    setParseError(parsed.parseError ?? null);
    setDraftConfig(parsed.config);
    setExportTarget(target);

    const artifact = buildConfigExportArtifact(parsed.config, target);
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

    setStatusMessage(`Exported ${artifact.label} (${artifact.filename}).`);
  };

  const handleSaveSnapshot = async (customLabel = '') => {
    try {
      const parsed = parseRawConfigCheck(rawText, format, draftConfig);
      setParseError(parsed.parseError ?? null);
      setDraftConfig(parsed.config);
      const record = createSnapshotRecord({
        label: customLabel,
        config: parsed.config,
        format,
        rawText,
      });
      await saveConfigSnapshot(record);
      setSnapshots((prev) => {
        const next = sortSnapshotsNewestFirst([record, ...prev]);
        if (next.length >= 2) {
          setCompareBaseId((currBase) => currBase ?? next[1].id);
          setCompareTargetId(record.id);
        } else {
          setCompareBaseId(record.id);
          setCompareTargetId(record.id);
        }
        return next;
      });
      setActiveSnapshotId(record.id);
      setSnapshotError(null);
      setStatusMessage(
        `Saved snapshot "${record.label}" (${record.format.toUpperCase()} · ${record.concurrency.toLocaleString()} VUs) to IndexedDB.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save snapshot to IndexedDB.';
      setSnapshotError(msg);
      setStatusMessage(msg);
    }
  };

  const handleRestoreSnapshot = (snapshot: ConfigSnapshot) => {
    const parsed = parseRawConfigCheck(snapshot.rawText, snapshot.format, draftConfig);
    setFormat(snapshot.format);
    setRawText(snapshot.rawText);
    setDraftConfig(parsed.config);
    setParseError(parsed.parseError ?? null);
    setDiagnostics(runDryRunValidation(parsed.config, snapshot.rawText, parsed.unknownFields));
    setActiveTemplateId(null);
    setActiveSnapshotId(snapshot.id);
    setAppliedOverrides([]);
    setStatusMessage(
      `Restored snapshot "${snapshot.label}" (${snapshot.format.toUpperCase()} · ${snapshot.concurrency.toLocaleString()} VUs).`
    );
  };

  const handleDeleteSnapshot = async (id: string) => {
    try {
      const target = snapshots.find((s) => s.id === id);
      await deleteConfigSnapshot(id);
      setSnapshots((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (compareBaseId === id) {
          setCompareBaseId(next[1]?.id ?? next[0]?.id ?? null);
        }
        if (compareTargetId === id) {
          setCompareTargetId(next[0]?.id ?? null);
        }
        return next;
      });
      if (activeSnapshotId === id) {
        setActiveSnapshotId(null);
      }
      setSnapshotError(null);
      if (target) {
        setStatusMessage(`Deleted snapshot "${target.label}" from IndexedDB.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete snapshot from IndexedDB.';
      setSnapshotError(msg);
    }
  };

  const handleToggleCompare = () => {
    setCompareOpen((prev) => {
      const nextOpen = !prev;
      if (nextOpen && snapshots.length >= 2) {
        setCompareBaseId((curr) =>
          curr && snapshots.some((s) => s.id === curr) ? curr : snapshots[1].id
        );
        setCompareTargetId((curr) =>
          curr && snapshots.some((s) => s.id === curr) ? curr : snapshots[0].id
        );
      }
      return nextOpen;
    });
  };

  const handleCompareSnapshot = (id: string) => {
    setCompareOpen(true);
    if (!compareBaseId || compareBaseId === id) {
      const fallbackOther = snapshots.find((s) => s.id !== id)?.id ?? id;
      setCompareBaseId(fallbackOther);
      setCompareTargetId(id);
    } else {
      setCompareTargetId(id);
    }
  };

  const handleSwapCompareSides = () => {
    setCompareBaseId(compareTargetId);
    setCompareTargetId(compareBaseId);
  };

  const handleSeedComparisonPair = async () => {
    try {
      const baseCfg = createDefaultPresetConfig();
      const baseRecord = createSnapshotRecord({
        label: 'Baseline 600 VU',
        config: baseCfg,
        format: 'yaml',
        rawText: serializeConfig(baseCfg, 'yaml'),
        now: new Date(Date.now() - 1000),
      });

      const spikeTemplate = getTemplateById('spike');
      const spikeCfg = spikeTemplate ? spikeTemplate.buildConfig() : applyCliOverrides(baseCfg, ['execution.0.concurrency=1400']);
      const spikeRecord = createSnapshotRecord({
        label: 'Spike 1,400 VU',
        config: spikeCfg,
        format: 'yaml',
        rawText: serializeConfig(spikeCfg, 'yaml'),
        now: new Date(),
      });

      await saveConfigSnapshot(baseRecord);
      await saveConfigSnapshot(spikeRecord);

      setSnapshots((prev) =>
        sortSnapshotsNewestFirst([spikeRecord, baseRecord, ...prev])
      );
      setCompareBaseId(baseRecord.id);
      setCompareTargetId(spikeRecord.id);
      setCompareOpen(true);
      setSnapshotError(null);
      setStatusMessage(
        'Saved "Baseline 600 VU" and "Spike 1,400 VU" snapshots to IndexedDB for side-by-side comparison.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to seed comparison snapshots.';
      setSnapshotError(msg);
    }
  };

  const errorCount =
    diagnostics.filter((d) => d.severity === 'error').length + (parseError ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50 text-balance">
            Declarative Configuration Workspace
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Inject load-testing patterns from the Template Library, save &amp; compare IndexedDB
            iteration snapshots, edit syntax-highlighted YAML/TOML/JSON specs, and transpile across formats.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="sr-only">Target Test Cluster for Quick Run</span>
            <select
              id="quick-run-cluster-select"
              aria-label="Target test cluster for Quick Run"
              value={selectedClusterId}
              onChange={(e) => selectCluster(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {TEST_CLUSTER_PROFILES.map((cluster) => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.name} ({cluster.region})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="workspace-quick-run-btn"
            onClick={handleQuickRun}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            Quick Run
          </button>
          {runState.status === 'running' && (
            <button
              type="button"
              onClick={stopRun}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap shrink-0"
            >
              <Square className="h-3 w-3 fill-current" aria-hidden="true" />
              Stop
            </button>
          )}
          <button
            type="button"
            data-testid="workspace-schedule-test-btn"
            aria-pressed={schedulePanelOpen}
            onClick={() => setSchedulePanelOpen((prev) => !prev)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              schedulePanelOpen
                ? 'border-orange-500 bg-orange-50 text-orange-800 dark:border-orange-500/80 dark:bg-orange-950/40 dark:text-orange-300'
                : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Schedule Test
            {scheduledTests.length > 0 && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {scheduledTests.length}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-pressed={logsStreamOpen}
            onClick={() => setLogsStreamOpen((prev) => !prev)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
            Logs ({runState.logs.length})
          </button>
          <button
            type="button"
            onClick={() => void handleSaveSnapshot()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            Snapshot
          </button>
          <button
            type="button"
            onClick={handleToggleCompare}
            aria-pressed={compareOpen}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              compareOpen
                ? 'border-orange-500 bg-orange-50 text-orange-800 dark:border-orange-500/80 dark:bg-orange-950/40 dark:text-orange-300'
                : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
            Compare
          </button>
          <ExportConfigMenu onExportFormat={handleExportDownload} />
          <button
            type="button"
            onClick={handleDryRun}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Run Dry-Run
          </button>
          <button
            type="button"
            onClick={handleLoadIntoCluster}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            Load into Cluster
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* CLI Override Bar */}
      <section
        aria-label="CLI dot-path overrides"
        className="rounded-xl border border-slate-200 bg-white p-4 sm:px-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">Active Spec:</span>{' '}
            {draftConfig.name}
            {statusMessage && (
              <>
                <span aria-hidden="true" className="mx-2 text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <span>{statusMessage}</span>
              </>
            )}
          </div>

          <form onSubmit={handleApplyOverride} className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="cli-override-input"
              className="text-xs font-medium text-slate-600 whitespace-nowrap dark:text-slate-400"
            >
              CLI Override (-o)
            </label>
            <input
              id="cli-override-input"
              type="text"
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              placeholder="execution.0.concurrency=900"
              className="h-9 w-full min-w-[210px] rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none sm:w-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Apply Override
            </button>
          </form>
        </div>

        {appliedOverrides.length > 0 && (
          <div className="mt-2.5 border-t border-slate-100 pt-2.5 font-mono text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Active flags: {appliedOverrides.map((o) => `-o ${o}`).join(' ')}
          </div>
        )}
      </section>

      {/* Schedule Recurring Quick Run Panel */}
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

      {/* Quick Run Immediate Execution Logs Stream */}
      {logsStreamOpen && (
        <div data-testid="workspace-execution-logs">
          <ExecutionLogsPanel
            logs={runState.logs}
            runStatus={runState.status}
            onClearLogs={clearLogs}
          />
        </div>
      )}

      {/* IndexedDB Config Snapshots Bar */}
      <ConfigSnapshotsBar
        snapshots={snapshots}
        activeSnapshotId={activeSnapshotId}
        compareOpen={compareOpen}
        compareBaseId={compareBaseId}
        compareTargetId={compareTargetId}
        loading={snapshotsLoading}
        error={snapshotError}
        onSaveSnapshot={handleSaveSnapshot}
        onRestoreSnapshot={handleRestoreSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
        onToggleCompare={handleToggleCompare}
        onCompareSnapshot={handleCompareSnapshot}
      />

      {/* Side-by-Side Snapshot Comparison Panel */}
      {compareOpen && (
        <SnapshotDiffViewer
          snapshots={snapshots}
          baseSnapshotId={compareBaseId}
          targetSnapshotId={compareTargetId}
          onSelectBase={setCompareBaseId}
          onSelectTarget={setCompareTargetId}
          onSwap={handleSwapCompareSides}
          onClose={() => setCompareOpen(false)}
          onRestoreSnapshot={handleRestoreSnapshot}
          onSeedComparisonPair={handleSeedComparisonPair}
        />
      )}

      {/* Primary Authoring Split: Template Library Sidebar + Wide Syntax-Highlighted YAML Editor */}
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-4 xl:col-span-3">
          <TemplateLibrarySidebar
            activeTemplateId={activeTemplateId}
            onSelectTemplate={handleSelectTemplate}
            onLoadSecurityDemo={handleLoadSecurityDemo}
          />
        </div>

        <section
          aria-label="Multi-format configuration editor"
          className="min-w-0 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-8 xl:col-span-9 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div
              className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
              role="tablist"
            >
              {(['yaml', 'toml', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  role="tab"
                  aria-selected={format === fmt}
                  onClick={() => handleFormatChange(fmt)}
                  className={`rounded-md px-3 py-1 text-xs font-medium uppercase ${
                    format === fmt
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {inheritedPairs.length > 0
                ? `Normalized: ${inheritedPairs[0]}`
                : 'No dot-notation inheritance'}
            </span>
          </div>

          <YamlCodeEditor
            id="pummel-config-editor"
            value={rawText}
            format={format}
            onChange={(nextVal) => {
              setRawText(nextVal);
              setActiveTemplateId(null);
            }}
            ariaLabel="Pummel load-testing specification editor"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Scenario: {normalized.execution[0]?.scenario ?? 'default'} · Concurrency:{' '}
              {normalized.execution[0]?.concurrency ?? 0} VUs · Quorum:{' '}
              {normalized.distributed.quorumWorkers}
            </span>
            <span>Strict schema: deny_unknown_fields</span>
          </div>
        </section>
      </div>

      {/* Validation & Multi-Target Exporter Split */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section
          aria-label="Dry-run pre-flight validation results"
          className="min-w-0 flex flex-col rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Dry-Run Validator (--dry-run)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Zero network traffic · checks schema, paths, size limits, and secrets.
              </p>
            </div>
            <span
              className={`font-mono text-xs font-semibold whitespace-nowrap shrink-0 ${
                errorCount > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {errorCount > 0 ? `${errorCount} FAIL` : 'ALL PASS'}
            </span>
          </div>

          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto px-5 py-2 dark:divide-slate-800/80">
            {parseError && (
              <div className="py-3 text-xs">
                <div className="font-mono font-semibold text-red-700 dark:text-red-400">
                  [SERDE] Parse Error
                </div>
                <p className="mt-1 text-slate-700 dark:text-slate-300">{parseError}</p>
              </div>
            )}
            {diagnostics.map((diag) => (
              <div key={diag.id} className="py-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-mono font-semibold ${
                      diag.severity === 'error'
                        ? 'text-red-700 dark:text-red-400'
                        : diag.severity === 'warning'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {diag.tag} {diag.field}
                  </span>
                  <span className="font-mono text-[11px] uppercase text-slate-400 dark:text-slate-500">
                    {diag.severity}
                  </span>
                </div>
                <p className="mt-1 text-slate-700 dark:text-slate-300">{diag.message}</p>
                {diag.remediation && (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Fix: {diag.remediation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section
          aria-label="Multi-Target Exporter"
          className="min-w-0 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div
              className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
              role="tablist"
            >
              {(
                [
                  { id: 'distributed', label: 'Cluster CLI' },
                  { id: 'k6', label: 'k6 (JS)' },
                  { id: 'locust', label: 'Locust' },
                  { id: 'goose', label: 'Goose' },
                  { id: 'taurus', label: 'Taurus' },
                  { id: 'postman', label: 'Postman' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={exportTarget === t.id}
                  onClick={() => setExportTarget(t.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                    exportTarget === t.id
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopyExport}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {copiedExport ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy Output
                </>
              )}
            </button>
          </div>

          <pre className="flex-1 max-h-80 overflow-auto bg-[#0B1120] p-4 font-mono text-xs leading-relaxed text-slate-200">
            <code>{exportedOutput}</code>
          </pre>
        </section>
      </div>

      {/* Specification Importer */}
      <section
        aria-label="Specification Importer"
        className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Import into Pummel YAML
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Auto-detects Postman v2.1, HAR v1.2 (filters static assets), and OpenAPI 3.x.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Sample input:</span>
            <button
              type="button"
              onClick={() => setImportInput(SAMPLE_POSTMAN)}
              className="font-medium text-slate-700 underline-offset-4 hover:text-orange-700 hover:underline dark:text-slate-300 dark:hover:text-orange-400"
            >
              Postman v2.1
            </button>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              ·
            </span>
            <button
              type="button"
              onClick={() => setImportInput(SAMPLE_HAR)}
              className="font-medium text-slate-700 underline-offset-4 hover:text-orange-700 hover:underline dark:text-slate-300 dark:hover:text-orange-400"
            >
              Browser HAR
            </button>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              ·
            </span>
            <button
              type="button"
              onClick={() => setImportInput(SAMPLE_OPENAPI)}
              className="font-medium text-slate-700 underline-offset-4 hover:text-orange-700 hover:underline dark:text-slate-300 dark:hover:text-orange-400"
            >
              OpenAPI 3.1
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <label htmlFor="import-spec-textarea" className="sr-only">
            Paste Postman, HAR, or OpenAPI specification
          </label>
          <textarea
            id="import-spec-textarea"
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            rows={5}
            spellCheck={false}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:bg-slate-950"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleImportConvert}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Convert to Pummel YAML
            </button>
            {importResult && (
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {importResult.summary}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* CI/CD Pipeline Status (GitHub Actions / GitLab CI) */}
      <PipelineStatusWidget activeSpecName={draftConfig.name} />

      {/* Scenario Benchmarking & Side-by-Side Comparison */}
      <ScenarioBenchmarkPanel
        activeConfig={draftConfig}
        onLoadScenarioIntoEditor={handleLoadBenchmarkScenario}
      />

      {/* Git Hooks: prek, Python pre-commit & standard .githooks/ */}
      <GitHooksPanel activeConfig={draftConfig} />
    </div>
  );
}

