import React from 'react';
import { AlertTriangle, BellRing, Plus, X } from 'lucide-react';
import {
  ALERT_METRIC_METADATA,
  type AlertChannel,
  type AlertMetricType,
  type AlertNotification,
  type AlertSeverity,
} from '../../engine/alertingEngine';

interface ActiveAlertNotificationsStripProps {
  activeAlerts: AlertNotification[];
  onDismissAlert: (id: string) => void;
  onClearAlerts: () => void;
}

export function ActiveAlertNotificationsStrip({
  activeAlerts,
  onDismissAlert,
  onClearAlerts,
}: ActiveAlertNotificationsStripProps) {
  if (activeAlerts.length === 0) return null;

  return (
    <div
      data-testid="active-alert-notifications"
      role="region"
      aria-label="Triggered visual alert notifications"
      className="border-b border-red-200 bg-red-50/70 px-5 py-3.5 dark:border-red-900/50 dark:bg-red-950/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-red-900 dark:text-red-200">
          <BellRing className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
          <span>Triggered Alert Notifications ({activeAlerts.length})</span>
          <span className="font-normal text-red-700/80 dark:text-red-300/80">
            · Streamed to Cluster Overview Execution Logs
          </span>
        </div>
        <button
          type="button"
          onClick={onClearAlerts}
          className="text-xs font-medium text-red-800 underline-offset-2 hover:underline dark:text-red-300"
        >
          Clear All Alerts
        </button>
      </div>

      <ul className="space-y-1.5">
        {activeAlerts.slice(0, 4).map((notif) => (
          <li
            key={notif.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
              notif.severity === 'critical'
                ? 'border-red-300 bg-white text-red-950 dark:border-red-800/80 dark:bg-slate-900 dark:text-red-100'
                : 'border-amber-300 bg-white text-amber-950 dark:border-amber-800/80 dark:bg-slate-900 dark:text-amber-100'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <AlertTriangle
                className={`h-3.5 w-3.5 shrink-0 ${
                  notif.severity === 'critical'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
                aria-hidden="true"
              />
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                  notif.severity === 'critical'
                    ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {notif.severity}
              </span>
              <span className="truncate font-mono text-xs">{notif.message}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                {notif.createdAt}
              </span>
              <button
                type="button"
                onClick={() => onDismissAlert(notif.id)}
                aria-label={`Dismiss alert ${notif.ruleName}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface AlertRuleFormProps {
  name: string;
  metric: AlertMetricType;
  thresholdInput: string;
  severity: AlertSeverity;
  channel: AlertChannel;
  formError: string | null;
  onNameChange: (value: string) => void;
  onMetricChange: (value: AlertMetricType) => void;
  onThresholdChange: (value: string) => void;
  onSeverityChange: (value: AlertSeverity) => void;
  onChannelChange: (value: AlertChannel) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AlertRuleForm({
  name,
  metric,
  thresholdInput,
  severity,
  channel,
  formError,
  onNameChange,
  onMetricChange,
  onThresholdChange,
  onSeverityChange,
  onChannelChange,
  onSubmit,
}: AlertRuleFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="border-b border-slate-200 bg-slate-50/60 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/50"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-3">
          <label
            htmlFor="alert-rule-name"
            className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
          >
            Rule Name
          </label>
          <input
            id="alert-rule-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Checkout p95 Spike"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="lg:col-span-2">
          <label
            htmlFor="alert-rule-metric"
            className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
          >
            Metric
          </label>
          <select
            id="alert-rule-metric"
            value={metric}
            onChange={(e) => onMetricChange(e.target.value as AlertMetricType)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {(Object.keys(ALERT_METRIC_METADATA) as AlertMetricType[]).map((m) => (
              <option key={m} value={m}>
                {ALERT_METRIC_METADATA[m].label}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <label
            htmlFor="alert-rule-threshold"
            className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
          >
            Threshold (&gt; {ALERT_METRIC_METADATA[metric].unit})
          </label>
          <input
            id="alert-rule-threshold"
            type="number"
            step="0.1"
            min="0.1"
            value={thresholdInput}
            onChange={(e) => onThresholdChange(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="lg:col-span-2">
          <label
            htmlFor="alert-rule-severity"
            className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
          >
            Severity
          </label>
          <select
            id="alert-rule-severity"
            value={severity}
            onChange={(e) => onSeverityChange(e.target.value as AlertSeverity)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="warning">Warning (WARN)</option>
            <option value="critical">Critical (SLA)</option>
          </select>
        </div>

        <div className="lg:col-span-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="alert-rule-channel"
              className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
            >
              Notification Target
            </label>
            <select
              id="alert-rule-channel"
              value={channel}
              onChange={(e) => onChannelChange(e.target.value as AlertChannel)}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="both">Visual + Execution Log</option>
              <option value="visual">Visual Banner Only</option>
              <option value="log">Execution Log Only</option>
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Rule
          </button>
        </div>
      </div>

      {formError && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          {formError}
        </p>
      )}
    </form>
  );
}
