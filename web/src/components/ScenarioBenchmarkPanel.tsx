import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Camera,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';
import type { PummelConfig } from '../types/pummel';
import {
  buildBenchmarkScenarioFromConfig,
  buildComparisonMatrix,
  loadBenchmarkScenarios,
  saveBenchmarkScenarios,
  type BenchmarkExecutorType,
  type BenchmarkScenario,
} from '../engine/scenarioBenchmarking';

interface ScenarioBenchmarkPanelProps {
  activeConfig: PummelConfig;
  onLoadScenarioIntoEditor: (scenario: BenchmarkScenario) => void;
}

export function ScenarioBenchmarkPanel({
  activeConfig,
  onLoadScenarioIntoEditor,
}: ScenarioBenchmarkPanelProps) {
  const [scenarios, setScenarios] = useState<BenchmarkScenario[]>(() =>
    loadBenchmarkScenarios()
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    loadBenchmarkScenarios()
      .slice(0, 3)
      .map((s) => s.id)
  );
  const [showAddForm, setShowAddForm] = useState(false);

  // New scenario form state
  const [name, setName] = useState('Soak');
  const [profileTag, setProfileTag] = useState<BenchmarkScenario['profileTag']>('soak');
  const [concurrencyVUs, setConcurrencyVUs] = useState(500);
  const [rampUpSec, setRampUpSec] = useState(60);
  const [holdForSec, setHoldForSec] = useState(600);
  const [targetRpsCap, setTargetRpsCap] = useState<string>('1200');
  const [executor, setExecutor] = useState<BenchmarkExecutorType>('http');
  const [thinkTimeMs, setThinkTimeMs] = useState(180);
  const [p95SlaMs, setP95SlaMs] = useState(210);
  const [maxErrorRatePct, setMaxErrorRatePct] = useState(1.0);
  const [workerShards, setWorkerShards] = useState(4);
  const [notes, setNotes] = useState('Long-duration memory leak and connection-pool stability check.');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    saveBenchmarkScenarios(scenarios);
  }, [scenarios]);

  const comparedScenarios = useMemo(
    () => scenarios.filter((s) => selectedIds.includes(s.id)),
    [scenarios, selectedIds]
  );

  const comparisonRows = useMemo(
    () => buildComparisonMatrix(comparedScenarios),
    [comparedScenarios]
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCaptureActiveEditor = () => {
    const captured = buildBenchmarkScenarioFromConfig({
      config: activeConfig,
      name: `${activeConfig.name} (${activeConfig.execution[0]?.concurrency ?? 0} VU)`,
      profileTag: 'custom',
    });
    setScenarios((prev) => [captured, ...prev]);
    setSelectedIds((prev) => [captured.id, ...prev.slice(0, 3)]);
  };

  const handleCreateScenario = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Scenario name is required (e.g. Baseline, Stress, Spike, Soak).');
      return;
    }
    const rpsCapNum =
      targetRpsCap.trim() === '' ? null : Math.max(10, Number(targetRpsCap) || 100);

    const created: BenchmarkScenario = {
      id: `bench-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmedName,
      profileTag,
      concurrencyVUs: Math.max(1, concurrencyVUs),
      rampUpSec: Math.max(0, rampUpSec),
      holdForSec: Math.max(1, holdForSec),
      targetRpsCap: rpsCapNum,
      executor,
      thinkTimeMs: Math.max(0, thinkTimeMs),
      p95SlaMs: Math.max(10, p95SlaMs),
      maxErrorRatePct: Math.max(0.01, maxErrorRatePct),
      workerShards: Math.max(1, workerShards),
      notes: notes.trim() || `${trimmedName} load scenario configuration.`,
      createdAtIso: new Date().toISOString(),
    };

    setScenarios((prev) => [created, ...prev]);
    setSelectedIds((prev) => [created.id, ...prev].slice(0, 4));
    setFormError(null);
    setShowAddForm(false);
    setName('');
  };

  const handleDeleteScenario = (id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  return (
    <section
      aria-label="Scenario Benchmarking & Side-by-Side Comparison"
      data-testid="scenario-benchmark-panel"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Scenario Benchmarking
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Define Baseline, Stress, Spike, or custom scenarios and compare execution parameters
              side by side.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCaptureActiveEditor}
            data-testid="benchmark-capture-active-btn"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            Capture Active Spec
          </button>
          <button
            type="button"
            data-testid="benchmark-new-scenario-btn"
            aria-expanded={showAddForm}
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {showAddForm ? 'Close Form' : 'New Scenario'}
          </button>
        </div>
      </div>

      {/* Add Scenario Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateScenario}
          data-testid="benchmark-add-form"
          className="border-b border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/60"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Scenario Name
              </span>
              <input
                type="text"
                required
                data-testid="benchmark-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Soak, Canary, Flash Spike"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Profile Tag
              </span>
              <select
                value={profileTag}
                onChange={(e) =>
                  setProfileTag(e.target.value as BenchmarkScenario['profileTag'])
                }
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="baseline">Baseline</option>
                <option value="stress">Stress</option>
                <option value="spike">Spike</option>
                <option value="soak">Soak</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Concurrency (VUs)
              </span>
              <input
                type="number"
                min={1}
                value={concurrencyVUs}
                onChange={(e) => setConcurrencyVUs(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Protocol Executor
              </span>
              <select
                value={executor}
                onChange={(e) => setExecutor(e.target.value as BenchmarkExecutorType)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs uppercase text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="http">HTTP/2</option>
                <option value="grpc">gRPC</option>
                <option value="websocket">WebSocket</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Ramp-Up (sec)
              </span>
              <input
                type="number"
                min={0}
                value={rampUpSec}
                onChange={(e) => setRampUpSec(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Hold For (sec)
              </span>
              <input
                type="number"
                min={1}
                value={holdForSec}
                onChange={(e) => setHoldForSec(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                RPS Cap (empty = uncapped)
              </span>
              <input
                type="number"
                min={10}
                value={targetRpsCap}
                onChange={(e) => setTargetRpsCap(e.target.value)}
                placeholder="Uncapped"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                p95 SLA (ms) / Error %
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  aria-label="p95 SLA in ms"
                  min={10}
                  value={p95SlaMs}
                  onChange={(e) => setP95SlaMs(Math.max(10, Number(e.target.value) || 100))}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  aria-label="Max error rate percent"
                  min={0.05}
                  step={0.1}
                  value={maxErrorRatePct}
                  onChange={(e) =>
                    setMaxErrorRatePct(Math.max(0.05, Number(e.target.value) || 1))
                  }
                  className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Think Time (ms)
              </span>
              <input
                type="number"
                min={0}
                value={thinkTimeMs}
                onChange={(e) => setThinkTimeMs(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Worker Shards
              </span>
              <input
                type="number"
                min={1}
                max={32}
                value={workerShards}
                onChange={(e) => setWorkerShards(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Description / Intent
              </span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          {formError && (
            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{formError}</p>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="submit"
              data-testid="benchmark-submit-btn"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Add Scenario to Matrix
            </button>
          </div>
        </form>
      )}

      {/* Scenario Selector Strip */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Compare Columns ({comparedScenarios.length} selected):
        </span>
        {scenarios.map((sc) => {
          const isSelected = selectedIds.includes(sc.id);
          return (
            <div
              key={sc.id}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                isSelected
                  ? 'border-orange-500 bg-orange-50/70 text-orange-950 dark:border-orange-500/80 dark:bg-orange-950/35 dark:text-orange-100'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400'
              }`}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleSelected(sc.id)}
                className="font-semibold hover:underline"
              >
                {sc.name}
              </button>
              <span className="font-mono text-[10px] opacity-75">
                ({sc.concurrencyVUs} VU)
              </span>
              <button
                type="button"
                aria-label={`Load ${sc.name} into active YAML editor`}
                title="Load into active YAML editor"
                onClick={() => onLoadScenarioIntoEditor(sc)}
                className="ml-1 rounded p-0.5 text-slate-500 hover:bg-white hover:text-orange-700 dark:hover:bg-slate-800 dark:hover:text-orange-400"
              >
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </button>
              {scenarios.length > 1 && (
                <button
                  type="button"
                  aria-label={`Delete scenario ${sc.name}`}
                  onClick={() => handleDeleteScenario(sc.id)}
                  className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Side-by-Side Comparison Matrix */}
      <div className="overflow-x-auto">
        {comparedScenarios.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Select at least one scenario above to inspect its side-by-side configuration matrix.
          </div>
        ) : (
          <table
            data-testid="scenario-comparison-table"
            className="w-full min-w-[680px] text-left text-xs"
          >
            <thead className="border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/60">
              <tr>
                <th className="w-48 px-5 py-3 font-semibold text-slate-600 dark:text-slate-400">
                  Configuration Parameter
                </th>
                {comparedScenarios.map((sc) => (
                  <th key={sc.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-slate-950 dark:text-slate-50">
                          {sc.name}
                        </span>
                        <span className="ml-1.5 rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {sc.profileTag}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onLoadScenarioIntoEditor(sc)}
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-orange-400 hover:text-orange-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-orange-400"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="mt-0.5 font-normal text-[11px] text-slate-500 dark:text-slate-400">
                      {sc.notes}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {comparisonRows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  <td className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                    {row.label}
                  </td>
                  {row.values.map((cell) => (
                    <td
                      key={cell.scenarioId}
                      className="px-4 py-2.5 font-mono tabular-nums text-slate-900 dark:text-slate-100"
                    >
                      <span
                        className={
                          cell.isMax && row.highlightHighest
                            ? 'font-semibold text-orange-700 dark:text-orange-400'
                            : cell.isMin && !row.highlightHighest
                              ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                              : ''
                        }
                      >
                        {cell.display}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
