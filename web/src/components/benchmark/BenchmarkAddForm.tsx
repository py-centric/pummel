import React from 'react';
import { Check } from 'lucide-react';
import type {
  BenchmarkExecutorType,
  BenchmarkScenario,
} from '../../engine/scenarioBenchmarking';

export interface BenchmarkFormValues {
  name: string;
  profileTag: BenchmarkScenario['profileTag'];
  concurrencyVUs: number;
  rampUpSec: number;
  holdForSec: number;
  targetRpsCap: string;
  executor: BenchmarkExecutorType;
  thinkTimeMs: number;
  p95SlaMs: number;
  maxErrorRatePct: number;
  workerShards: number;
  notes: string;
}

interface BenchmarkAddFormProps {
  values: BenchmarkFormValues;
  formError: string | null;
  onChange: <K extends keyof BenchmarkFormValues>(field: K, value: BenchmarkFormValues[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function BenchmarkAddForm({
  values,
  formError,
  onChange,
  onSubmit,
}: BenchmarkAddFormProps) {
  return (
    <form
      onSubmit={onSubmit}
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
            value={values.name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="e.g. Soak, Canary, Flash Spike"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Profile Tag
          </span>
          <select
            value={values.profileTag}
            onChange={(e) =>
              onChange('profileTag', e.target.value as BenchmarkScenario['profileTag'])
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
            value={values.concurrencyVUs}
            onChange={(e) => onChange('concurrencyVUs', Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Protocol Executor
          </span>
          <select
            value={values.executor}
            onChange={(e) => onChange('executor', e.target.value as BenchmarkExecutorType)}
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
            value={values.rampUpSec}
            onChange={(e) => onChange('rampUpSec', Math.max(0, Number(e.target.value) || 0))}
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
            value={values.holdForSec}
            onChange={(e) => onChange('holdForSec', Math.max(1, Number(e.target.value) || 1))}
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
            value={values.targetRpsCap}
            onChange={(e) => onChange('targetRpsCap', e.target.value)}
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
              value={values.p95SlaMs}
              onChange={(e) => onChange('p95SlaMs', Math.max(10, Number(e.target.value) || 100))}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              type="number"
              aria-label="Max error rate percent"
              min={0.05}
              step={0.1}
              value={values.maxErrorRatePct}
              onChange={(e) =>
                onChange('maxErrorRatePct', Math.max(0.05, Number(e.target.value) || 1))
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
            value={values.thinkTimeMs}
            onChange={(e) => onChange('thinkTimeMs', Math.max(0, Number(e.target.value) || 0))}
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
            value={values.workerShards}
            onChange={(e) => onChange('workerShards', Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Description / Intent
          </span>
          <input
            type="text"
            value={values.notes}
            onChange={(e) => onChange('notes', e.target.value)}
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
  );
}
