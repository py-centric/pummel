import React, { useState } from 'react';
import {
  CheckCircle2,
  Plus,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react';
import { usePummel } from '../context/PummelContext';
import {
  formatWebhookPayload,
  PROVIDER_META,
  validateWebhookUrl,
  type WebhookProvider,
} from '../engine/webhookIntegrations';

export function IntegrationsTabPanel() {
  const {
    webhookIntegrations,
    webhookDeliveries,
    selectedCluster,
    addWebhookIntegration,
    toggleWebhookIntegration,
    removeWebhookIntegration,
    sendTestWebhookAlert,
  } = usePummel();

  const [provider, setProvider] = useState<WebhookProvider>('slack');
  const [name, setName] = useState('');
  const [channelLabel, setChannelLabel] = useState('#perf-alerts');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [minSeverity, setMinSeverity] = useState<'warning' | 'critical'>('warning');
  const [formError, setFormError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [previewProvider, setPreviewProvider] = useState<WebhookProvider>('slack');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateWebhookUrl(webhookUrl, provider);
    if (!check.valid) {
      setFormError(check.error ?? 'Enter a valid HTTPS webhook URL.');
      return;
    }
    setFormError(null);
    const created = addWebhookIntegration({
      provider,
      name,
      webhookUrl,
      channelLabel,
      minSeverity,
    });
    setName('');
    setWebhookUrl('');
    setStatusNote(
      `Saved ${PROVIDER_META[created.provider].label} webhook "${created.name}" to localStorage.`
    );
  };

  const handleTestSend = (id: string, label: string) => {
    sendTestWebhookAlert(id);
    setStatusNote(
      `Dispatched test threshold alert to "${label}" and logged delivery in Execution Logs.`
    );
  };

  const samplePayload = JSON.stringify(
    formatWebhookPayload(
      previewProvider,
      {
        ruleName: 'p95 Latency Threshold Guard',
        severity: 'critical',
        message: 'p95 latency 268.4ms exceeded 200ms threshold during distributed run.',
        observedValue: 268.4,
        threshold: 200,
      },
      selectedCluster.name
    ),
    null,
    2
  );

  return (
    <div className="space-y-6" data-testid="compliance-integrations-panel">
      {/* Configure Outgoing Webhook Form */}
      <section
        aria-label="Configure Outgoing Alert Webhooks"
        className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Webhook className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                Outgoing Alert Webhooks (Slack, Discord, Microsoft Teams)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Automatically dispatch formatted threshold breach alerts when latency or error-rate
                rules trigger.
              </p>
            </div>
          </div>

          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {webhookIntegrations.filter((w) => w.enabled).length} active /{' '}
            {webhookIntegrations.length} configured
          </span>
        </div>

        <form
          onSubmit={handleAdd}
          className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-5 sm:grid-cols-2 lg:grid-cols-12 dark:border-slate-800 dark:bg-slate-950/50"
        >
          <div className="lg:col-span-2">
            <label
              htmlFor="webhook-provider-select"
              className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Platform
            </label>
            <select
              id="webhook-provider-select"
              value={provider}
              onChange={(e) => {
                const next = e.target.value as WebhookProvider;
                setProvider(next);
                setPreviewProvider(next);
              }}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
              <option value="teams">Microsoft Teams</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="webhook-name-input"
              className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Integration Name
            </label>
            <input
              id="webhook-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="SRE Oncall Channel"
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="lg:col-span-4">
            <label
              htmlFor="webhook-url-input"
              className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Outgoing Webhook URL (HTTPS)
            </label>
            <input
              id="webhook-url-input"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder={PROVIDER_META[provider].placeholderUrl}
              required
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="webhook-channel-input"
              className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Channel / Room
            </label>
            <input
              id="webhook-channel-input"
              type="text"
              value={channelLabel}
              onChange={(e) => setChannelLabel(e.target.value)}
              placeholder="#perf-alerts"
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="lg:col-span-2 flex flex-col justify-end">
            <label
              htmlFor="webhook-severity-select"
              className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Trigger On
            </label>
            <div className="mt-1 flex items-center gap-2">
              <select
                id="webhook-severity-select"
                value={minSeverity}
                onChange={(e) => setMinSeverity(e.target.value as 'warning' | 'critical')}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="warning">Warning+</option>
                <option value="critical">Critical</option>
              </select>
              <button
                type="submit"
                data-testid="add-webhook-button"
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </button>
            </div>
          </div>

          {formError && (
            <div className="sm:col-span-2 lg:col-span-12 text-xs font-medium text-red-700 dark:text-red-400">
              {formError}
            </div>
          )}
          {statusNote && (
            <div className="sm:col-span-2 lg:col-span-12 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {statusNote}
            </div>
          )}
        </form>

        {/* Configured Webhooks List */}
        <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800/80">
          {webhookIntegrations.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No outgoing webhooks configured yet. Add a Slack, Discord, or Microsoft Teams webhook
              above to forward threshold violations.
            </div>
          ) : (
            webhookIntegrations.map((hook) => (
              <div
                key={hook.id}
                data-testid="webhook-integration-row"
                className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {PROVIDER_META[hook.provider].label}
                    </span>
                    <span className="font-semibold text-slate-950 dark:text-slate-100">
                      {hook.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {hook.channelLabel}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-orange-700 dark:text-orange-400">
                      min: {hook.minSeverity}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {hook.webhookUrl} · Sent: {hook.deliveryCount}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTestSend(hook.id, hook.name)}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Send className="h-3 w-3" aria-hidden="true" />
                    Send Test Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWebhookIntegration(hook.id)}
                    aria-pressed={hook.enabled}
                    className={`inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-semibold whitespace-nowrap ${
                      hook.enabled
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400'
                    }`}
                  >
                    {hook.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWebhookIntegration(hook.id)}
                    aria-label={`Remove webhook ${hook.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Payload Schema Preview & Delivery History */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section
          aria-label="Webhook Payload Preview"
          className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-950 dark:text-slate-50">
              Formatted Webhook Payload Preview
            </h3>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              {(['slack', 'discord', 'teams'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreviewProvider(p)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                    previewProvider === p
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {PROVIDER_META[p].label}
                </button>
              ))}
            </div>
          </div>
          <pre className="max-h-60 overflow-auto bg-[#0B1120] p-4 font-mono text-[11px] leading-relaxed text-slate-200">
            <code>{samplePayload}</code>
          </pre>
        </section>

        <section
          aria-label="Recent Webhook Deliveries"
          className="min-w-0 rounded-xl border border-slate-200 bg-white lg:col-span-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-950 dark:text-slate-50">
              Recent Webhook Deliveries
            </h3>
          </div>
          <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto px-5 dark:divide-slate-800/80">
            {webhookDeliveries.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No webhook alerts dispatched yet. Click &ldquo;Send Test Alert&rdquo; or trigger an
                alert breach to record a delivery.
              </div>
            ) : (
              webhookDeliveries.map((d) => (
                <div key={d.id} className="py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {PROVIDER_META[d.provider].label} · {d.integrationName}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-emerald-700 dark:text-emerald-400">
                      {d.status}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {d.summary}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
