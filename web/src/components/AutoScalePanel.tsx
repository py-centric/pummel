import React from 'react';
import { Gauge, Scale, Zap } from 'lucide-react';
import type { AutoScaleConfig, AutoScaleEventSummary } from '../engine/autoScaling';

interface AutoScalePanelProps {
  config: AutoScaleConfig;
  currentWorkerCount: number;
  currentRps: number;
  lastScaleEvent: AutoScaleEventSummary | null;
  onUpdateConfig: (patch: Partial<AutoScaleConfig>) => void;
}

export function AutoScalePanel({
  config,
  currentWorkerCount,
  currentRps,
  lastScaleEvent,
  onUpdateConfig,
}: AutoScalePanelProps) {
  return (
    <section
      aria-label="Auto-Scaling Simulation Rules"
      data-testid="auto-scaling-panel"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <Scale className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Worker Auto-Scaling Simulation
              </h2>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                  config.enabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {config.enabled ? 'Policy Active' : 'Manual Fleet'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Automatically provision or drain gRPC worker nodes when aggregate throughput crosses
              defined RPS thresholds.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
            Fleet: <strong>{currentWorkerCount}</strong> / {config.maxWorkers} nodes · Live:{' '}
            <strong>{currentRps.toLocaleString()}</strong> rps
          </span>
          <button
            type="button"
            data-testid="toggle-autoscale-btn"
            aria-pressed={config.enabled}
            onClick={() => onUpdateConfig({ enabled: !config.enabled })}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              config.enabled
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white'
            }`}
          >
            <Zap className="h-3 w-3" aria-hidden="true" />
            {config.enabled ? 'Disable Auto-Scale' : 'Enable Auto-Scale'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 sm:px-5">
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Scale-Up RPS (&ge;)
          </span>
          <input
            type="number"
            min={100}
            step={50}
            value={config.scaleUpRpsThreshold}
            onChange={(e) =>
              onUpdateConfig({ scaleUpRpsThreshold: Math.max(100, Number(e.target.value) || 100) })
            }
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Scale-Down RPS (&le;)
          </span>
          <input
            type="number"
            min={50}
            step={50}
            value={config.scaleDownRpsThreshold}
            onChange={(e) =>
              onUpdateConfig({ scaleDownRpsThreshold: Math.max(50, Number(e.target.value) || 50) })
            }
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Min / Max Workers
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              aria-label="Minimum workers"
              min={1}
              max={config.maxWorkers}
              value={config.minWorkers}
              onChange={(e) =>
                onUpdateConfig({
                  minWorkers: Math.max(1, Math.min(config.maxWorkers, Number(e.target.value) || 1)),
                })
              }
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <span className="font-mono text-xs text-slate-400">/</span>
            <input
              type="number"
              aria-label="Maximum workers"
              min={config.minWorkers}
              max={24}
              value={config.maxWorkers}
              onChange={(e) =>
                onUpdateConfig({
                  maxWorkers: Math.max(config.minWorkers, Math.min(24, Number(e.target.value) || 8)),
                })
              }
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Step Size
          </span>
          <select
            value={String(config.scaleStep)}
            onChange={(e) => onUpdateConfig({ scaleStep: Number(e.target.value) })}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="1">+1 Worker / step</option>
            <option value="2">+2 Workers / step</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Cooldown (sec)
          </span>
          <input
            type="number"
            min={2}
            max={60}
            value={config.cooldownSec}
            onChange={(e) =>
              onUpdateConfig({ cooldownSec: Math.max(2, Number(e.target.value) || 5) })
            }
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
      </div>

      {lastScaleEvent && (
        <div
          data-testid="last-autoscale-event"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-2 font-mono text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300"
        >
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            Last action at T+{lastScaleEvent.elapsedSec}s:{' '}
            <strong>
              {lastScaleEvent.action === 'scale_up' ? 'SCALED UP' : 'SCALED DOWN'} (
              {lastScaleEvent.fromCount} → {lastScaleEvent.toCount} workers)
            </strong>
          </span>
          <span className="text-slate-500 dark:text-slate-400">{lastScaleEvent.reason}</span>
        </div>
      )}
    </section>
  );
}
