import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebhookIntegration,
  formatWebhookPayload,
  loadWebhookIntegrations,
  saveWebhookIntegrations,
  selectMatchingWebhooks,
  validateWebhookUrl,
} from './webhookIntegrations';

test('validateWebhookUrl requires HTTPS and valid URL format', () => {
  assert.equal(validateWebhookUrl('', 'slack').valid, false);
  assert.equal(validateWebhookUrl('http://hooks.slack.com/services/a/b/c', 'slack').valid, false);
  assert.equal(validateWebhookUrl('https://hooks.slack.com/services/T1/B2/SECRET', 'slack').valid, true);
  assert.equal(validateWebhookUrl('https://discord.com/api/webhooks/123/abc', 'discord').valid, true);
});

test('formatWebhookPayload formats distinct Slack, Discord, and Teams payloads', () => {
  const alert = {
    ruleName: 'p95 Latency Guard',
    severity: 'critical' as const,
    message: 'p95 latency 295ms exceeded 200ms',
    observedValue: 295,
    threshold: 200,
  };

  const slack = formatWebhookPayload('slack', alert, 'EU-West Primary');
  assert.ok(Array.isArray(slack.blocks));
  assert.match(String(slack.text), /CRITICAL/);

  const discord = formatWebhookPayload('discord', alert, 'EU-West Primary');
  assert.ok(Array.isArray(discord.embeds));

  const teams = formatWebhookPayload('teams', alert, 'EU-West Primary');
  assert.equal(teams['@type'], 'MessageCard');
});

test('selectMatchingWebhooks filters by enabled flag and minimum severity and round-trips storage', () => {
  const w1 = createWebhookIntegration({
    provider: 'slack',
    name: 'SRE Critical',
    webhookUrl: 'https://hooks.slack.com/services/T1/B1/X1',
    channelLabel: '#sre-critical',
    minSeverity: 'critical',
  });
  const w2 = createWebhookIntegration({
    provider: 'teams',
    name: 'Perf Warnings',
    webhookUrl: 'https://contoso.webhook.office.com/webhookb2/abc',
    channelLabel: 'Perf Engineering',
    minSeverity: 'warning',
  });

  assert.equal(selectMatchingWebhooks([w1, w2], 'warning').length, 1);
  assert.equal(selectMatchingWebhooks([w1, w2], 'critical').length, 2);

  const mem = new Map<string, string>();
  const store = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };
  saveWebhookIntegrations([w1, w2], store);
  assert.equal(loadWebhookIntegrations(store).length, 2);
});
