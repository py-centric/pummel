import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Trash2, Zap } from 'lucide-react';
import { usePummel } from '../context/PummelContext';
import {
  ALERT_METRIC_METADATA,
  formatAlertValue,
  getMetricValueFromSnapshot,
  type AlertChannel,
  type AlertMetricType,
  type AlertSeverity,
} from '../engine/alertingEngine';
import {
  ActiveAlertNotificationsStrip,
  AlertRuleForm,
} from './alerting/AlertRuleControls';

const CHANNEL_LABELS: Record<AlertChannel, string> = {
  both: 'Visual + Execution Log',
  visual: 'Visual Banner Only',
  log: 'Execution Log Only',
};

export function AlertingConfigSection() {
  const {
    runState,
    alertRules,
    activeAlerts,
    addAlertRule,
    toggleAlertRule,
    removeAlertRule,
    simulateAlertBreach,
    dismissAlert,
    clearAlerts,
  } = usePummel();

  const [name, setName] = useState('');
  const [metric, setMetric] = useState<AlertMetricType>('p95-latency');
  const [thresholdInput, setThresholdInput] = useState('165');
  const [severity, setSeverity] = useState<AlertSeverity>('warning');
  const [channel, setChannel] = useState<AlertChannel>('both');
  const [formError, setFormError] = useState<string | null>(null);

  const currentTelemetry = {
    avgLatencyMs: runState.globalAvgMs,
    p95LatencyMs: runState.globalP95Ms,
    p99LatencyMs: runState.globalP99Ms,
    errorRatePct: runState.globalFailRatePct,
  };

  const handleMetricChange = (nextMetric: AlertMetricType) => {
    setMetric(nextMetric);
    setThresholdInput(String(ALERT_METRIC_METADATA[nextMetric].defaultThreshold));
    setFormError(null);
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const parsedThreshold = Number(thresholdInput);

    if (!cleanName) {
      setFormError('Enter an alert rule name (e.g. "Checkout p95 Latency Spike").');
      return;
    }
    if (!Number.isFinite(parsedThreshold) || parsedThreshold <= 0) {
      setFormError('Enter a positive numeric threshold.');
      return;
    }

    addAlertRule({
      name: cleanName,
      metric,
      threshold: parsedThreshold,
      severity,
      channel,
      enabled: true,
    });
    setName('');
    setFormError(null);
  };

  return (
    <section
      aria-label="Latency and Error Rate Alerting Thresholds"
      data-testid="compliance-alerting-section"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-400">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                Alerting &amp; Threshold Rules
              </h2>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {alertRules.filter((r) => r.enabled).length}/{alertRules.length} active
              </span>
              {activeAlerts.length > 0 && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-red-800 dark:bg-red-950/70 dark:text-red-300">
                  {activeAlerts.length} active alert{activeAlerts.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Define latency (p95, p99, avg) and error-rate thresholds that emit visual
              notifications and stream events to Execution Logs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => simulateAlertBreach()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            Simulate Threshold Breach
          </button>
          <Link
            to="/"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Execution Logs
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Live Visual Alert Notifications Strip */}
      <ActiveAlertNotificationsStrip
        activeAlerts={activeAlerts}
        onDismissAlert={dismissAlert}
        onClearAlerts={clearAlerts}
      />

      {/* New Alert Rule Form */}
      <AlertRuleForm
        name={name}
        metric={metric}
        thresholdInput={thresholdInput}
        severity={severity}
        channel={channel}
        formError={formError}
        onNameChange={(val) => {
          setName(val);
          if (formError) setFormError(null);
        }}
        onMetricChange={handleMetricChange}
        onThresholdChange={(val) => {
          setThresholdInput(val);
          if (formError) setFormError(null);
        }}
        onSeverityChange={setSeverity}
        onChannelChange={setChannel}
        onSubmit={handleAddRule}
      />

      {/* Configured Alert Rules Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            <tr>
              <th className="px-5 py-3">Rule Name</th>
              <th className="px-4 py-3">Condition</th>
              <th className="px-4 py-3">Live Telemetry</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Delivery Target</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {alertRules.map((rule) => {
              const observed = getMetricValueFromSnapshot(rule.metric, currentTelemetry);
              const isBreached = rule.enabled && observed > rule.threshold;
              return (
                <tr
                  key={rule.id}
                  data-alert-rule-id={rule.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => toggleAlertRule(rule.id)}
                        aria-label={`Toggle alert rule ${rule.name}`}
                        className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900"
                      />
                      <span
                        className={`font-semibold ${
                          rule.enabled
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-400 line-through dark:text-slate-500'
                        }`}
                      >
                        {rule.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                    {ALERT_METRIC_METADATA[rule.metric].shortLabel} &gt;{' '}
                    {formatAlertValue(rule.metric, rule.threshold)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    <span
                      className={`font-semibold ${
                        isBreached
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {formatAlertValue(rule.metric, observed)} ·{' '}
                      {isBreached ? 'BREACHED' : 'NOMINAL'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                        rule.severity === 'critical'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                      }`}
                    >
                      {rule.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {CHANNEL_LABELS[rule.channel]}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => simulateAlertBreach(rule.id)}
                        aria-label={`Trigger test alert for ${rule.name}`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Zap
                          className="h-3 w-3 text-orange-600 dark:text-orange-400"
                          aria-hidden="true"
                        />
                        Test Alert
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAlertRule(rule.id)}
                        aria-label={`Delete alert rule ${rule.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
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
  );
}
