import type { AlertNotification } from './alertingEngine';
import type { RunLogEntry } from '../types/pummel';
import type { StorageLike } from './scheduledTests';

export type WebhookProvider = 'slack' | 'discord' | 'teams';

export interface WebhookIntegration {
  id: string;
  provider: WebhookProvider;
  name: string;
  webhookUrl: string;
  channelLabel: string;
  enabled: boolean;
  minSeverity: 'warning' | 'critical';
  createdAtIso: string;
  lastDeliveredAtIso?: string;
  deliveryCount: number;
}

export interface WebhookDeliveryRecord {
  id: string;
  integrationId: string;
  provider: WebhookProvider;
  integrationName: string;
  timestampIso: string;
  status: 'delivered' | 'simulated' | 'failed';
  summary: string;
  payloadPreview: string;
}

export const WEBHOOK_INTEGRATIONS_STORAGE_KEY = 'pummel_webhook_integrations_v1';

export const PROVIDER_META: Record<
  WebhookProvider,
  { label: string; placeholderUrl: string; hostHint: string }
> = {
  slack: {
    label: 'Slack',
    placeholderUrl: 'https://hooks.slack.com/services/T00000/B00000/XXXXXXXX',
    hostHint: 'hooks.slack.com',
  },
  discord: {
    label: 'Discord',
    placeholderUrl: 'https://discord.com/api/webhooks/1234567890/token',
    hostHint: 'discord.com/api/webhooks',
  },
  teams: {
    label: 'Microsoft Teams',
    placeholderUrl: 'https://contoso.webhook.office.com/webhookb2/...',
    hostHint: 'webhook.office.com',
  },
};

export function validateWebhookUrl(
  url: string,
  provider: WebhookProvider
): { valid: boolean; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: 'Webhook URL is required.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Enter a valid HTTPS webhook URL.' };
  }
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Outgoing webhooks must use HTTPS.' };
  }
  if (!parsed.hostname || parsed.hostname.length < 4) {
    return { valid: false, error: `Enter a valid ${PROVIDER_META[provider].label} webhook host.` };
  }
  return { valid: true };
}

export function formatWebhookPayload(
  provider: WebhookProvider,
  alert: Pick<AlertNotification, 'ruleName' | 'severity' | 'message' | 'observedValue' | 'threshold'>,
  clusterName: string
): Record<string, unknown> {
  const badge = alert.severity === 'critical' ? '[CRITICAL]' : '[WARNING]';
  const headline = `${badge} Pummel Threshold Violation · ${clusterName}`;

  if (provider === 'slack') {
    return {
      text: `${headline}: ${alert.message}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: headline },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Rule:*\n${alert.ruleName}` },
            { type: 'mrkdwn', text: `*Severity:*\n${alert.severity.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Observed:*\n${alert.observedValue}` },
            { type: 'mrkdwn', text: `*Threshold:*\n${alert.threshold}` },
          ],
        },
      ],
    };
  }

  if (provider === 'discord') {
    return {
      content: `${headline}  --  ${alert.ruleName}`,
      embeds: [
        {
          title: alert.ruleName,
          description: alert.message,
          color: alert.severity === 'critical' ? 14427686 : 15844367,
          fields: [
            { name: 'Cluster', value: clusterName, inline: true },
            { name: 'Observed', value: String(alert.observedValue), inline: true },
            { name: 'Threshold', value: String(alert.threshold), inline: true },
          ],
        },
      ],
    };
  }

  // Microsoft Teams MessageCard
  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: headline,
    themeColor: alert.severity === 'critical' ? 'DC2626' : 'D97706',
    title: headline,
    sections: [
      {
        activityTitle: alert.ruleName,
        text: alert.message,
        facts: [
          { name: 'Cluster', value: clusterName },
          { name: 'Observed', value: String(alert.observedValue) },
          { name: 'Threshold', value: String(alert.threshold) },
        ],
      },
    ],
  };
}

export function createWebhookIntegration(params: {
  provider: WebhookProvider;
  name: string;
  webhookUrl: string;
  channelLabel: string;
  minSeverity: 'warning' | 'critical';
  now?: Date;
}): WebhookIntegration {
  const now = params.now ?? new Date();
  return {
    id: `wh-${params.provider}-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    provider: params.provider,
    name: params.name.trim() || `${PROVIDER_META[params.provider].label} Alert Hook`,
    webhookUrl: params.webhookUrl.trim(),
    channelLabel: params.channelLabel.trim() || '#sre-load-alerts',
    enabled: true,
    minSeverity: params.minSeverity,
    createdAtIso: now.toISOString(),
    deliveryCount: 0,
  };
}

export function selectMatchingWebhooks(
  integrations: readonly WebhookIntegration[],
  severity: 'warning' | 'critical'
): WebhookIntegration[] {
  return integrations.filter((item) => {
    if (!item.enabled) return false;
    if (item.minSeverity === 'critical' && severity !== 'critical') return false;
    return true;
  });
}

export function createWebhookLogEntry(params: {
  integration: WebhookIntegration;
  summary: string;
  timestampSec: number;
}): RunLogEntry {
  return {
    id: `log-wh-${params.integration.id}-${Date.now()}`,
    timestampSec: params.timestampSec,
    level: 'GRPC',
    source: `webhook:${params.integration.provider}`,
    message: `Dispatched ${PROVIDER_META[params.integration.provider].label} webhook "${params.integration.name}" (${params.integration.channelLabel}): ${params.summary}`,
  };
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return null;
}

export function loadWebhookIntegrations(
  storage: StorageLike | null = getDefaultStorage()
): WebhookIntegration[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(WEBHOOK_INTEGRATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is WebhookIntegration =>
        Boolean(x) &&
        typeof x === 'object' &&
        typeof (x as WebhookIntegration).id === 'string' &&
        typeof (x as WebhookIntegration).webhookUrl === 'string'
    );
  } catch {
    return [];
  }
}

export function saveWebhookIntegrations(
  integrations: readonly WebhookIntegration[],
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WEBHOOK_INTEGRATIONS_STORAGE_KEY, JSON.stringify(integrations));
    return true;
  } catch {
    return false;
  }
}
