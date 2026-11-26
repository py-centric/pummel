import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { DistributedRunState, RunLogEntry } from '../../types/pummel';
import {
  buildSimulatedBreachSnapshot,
  createDefaultAlertRules,
  evaluateAlertThresholds,
  type AlertNotification,
  type AlertThresholdRule,
} from '../../engine/alertingEngine';
import {
  createWebhookIntegration,
  createWebhookLogEntry,
  formatWebhookPayload,
  loadWebhookIntegrations,
  saveWebhookIntegrations,
  selectMatchingWebhooks,
  type WebhookDeliveryRecord,
  type WebhookIntegration,
  type WebhookProvider,
} from '../../engine/webhookIntegrations';
import { prependLog, prependLogs } from './types';

interface UseAlertingAndWebhooksParams {
  selectedClusterName: string;
  setRunState: Dispatch<SetStateAction<DistributedRunState>>;
}

export function useAlertingAndWebhooks({
  selectedClusterName,
  setRunState,
}: UseAlertingAndWebhooksParams) {
  const [alertRules, setAlertRules] = useState<AlertThresholdRule[]>(() =>
    createDefaultAlertRules()
  );
  const [activeAlerts, setActiveAlerts] = useState<AlertNotification[]>([]);
  const [webhookIntegrations, setWebhookIntegrations] = useState<WebhookIntegration[]>(() =>
    loadWebhookIntegrations()
  );
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDeliveryRecord[]>([]);

  const webhookIntegrationsRef = useRef(webhookIntegrations);
  webhookIntegrationsRef.current = webhookIntegrations;

  useEffect(() => {
    saveWebhookIntegrations(webhookIntegrations);
  }, [webhookIntegrations]);

  const dispatchWebhooksForNotifications = useCallback(
    (
      notifications: readonly AlertNotification[],
      clusterName: string,
      timestampSec: number
    ): RunLogEntry[] => {
      const hooks = webhookIntegrationsRef.current;
      if (hooks.length === 0 || notifications.length === 0) return [];

      const deliveryLogs: RunLogEntry[] = [];
      const newDeliveries: WebhookDeliveryRecord[] = [];
      const hitCounts = new Map<string, number>();

      for (const notif of notifications) {
        const matching = selectMatchingWebhooks(hooks, notif.severity);
        for (const hook of matching) {
          const payload = formatWebhookPayload(hook.provider, notif, clusterName);
          const summary = `${notif.ruleName}: ${notif.message}`;
          newDeliveries.push({
            id: `del-${hook.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            integrationId: hook.id,
            provider: hook.provider,
            integrationName: hook.name,
            timestampIso: new Date().toISOString(),
            status: 'simulated',
            summary,
            payloadPreview: JSON.stringify(payload),
          });
          deliveryLogs.push(
            createWebhookLogEntry({
              integration: hook,
              summary: notif.ruleName,
              timestampSec,
            })
          );
          hitCounts.set(hook.id, (hitCounts.get(hook.id) ?? 0) + 1);
        }
      }

      if (newDeliveries.length > 0) {
        const nowIso = new Date().toISOString();
        setWebhookDeliveries((prev) => [...newDeliveries, ...prev].slice(0, 30));
        setWebhookIntegrations((prev) =>
          prev.map((h) => {
            const inc = hitCounts.get(h.id);
            return inc
              ? { ...h, deliveryCount: h.deliveryCount + inc, lastDeliveredAtIso: nowIso }
              : h;
          })
        );
      }

      return deliveryLogs;
    },
    []
  );

  const addAlertRule = useCallback((ruleInput: Omit<AlertThresholdRule, 'id'>) => {
    const newRule: AlertThresholdRule = {
      ...ruleInput,
      id: `alert-rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    setAlertRules((prev) => [...prev, newRule]);
  }, []);

  const toggleAlertRule = useCallback((ruleId: string) => {
    setAlertRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  }, []);

  const removeAlertRule = useCallback((ruleId: string) => {
    setAlertRules((prev) => prev.filter((r) => r.id !== ruleId));
  }, []);

  const simulateAlertBreach = useCallback(
    (targetRuleId?: string) => {
      const rulesToEval = targetRuleId
        ? alertRules.map((r) =>
            r.id === targetRuleId ? { ...r, enabled: true } : { ...r, enabled: false }
          )
        : alertRules;
      const syntheticSnapshot = buildSimulatedBreachSnapshot(rulesToEval, targetRuleId);

      setRunState((prev) => {
        const evalOut = evaluateAlertThresholds({
          rules: rulesToEval,
          snapshot: syntheticSnapshot,
          timestampSec: prev.elapsedSec,
        });

        let extraWhLogs: RunLogEntry[] = [];
        if (evalOut.notifications.length > 0) {
          setActiveAlerts((curr) => [...evalOut.notifications, ...curr].slice(0, 15));
          extraWhLogs = dispatchWebhooksForNotifications(
            evalOut.notifications,
            selectedClusterName,
            prev.elapsedSec
          );
        }

        return {
          ...prev,
          globalAvgMs: prev.globalAvgMs > 0 ? prev.globalAvgMs : syntheticSnapshot.avgLatencyMs,
          globalP95Ms: Math.max(prev.globalP95Ms, syntheticSnapshot.p95LatencyMs),
          globalP99Ms: Math.max(prev.globalP99Ms, syntheticSnapshot.p99LatencyMs),
          globalFailRatePct: Math.max(prev.globalFailRatePct, syntheticSnapshot.errorRatePct),
          logs: prependLogs(prev.logs, [...evalOut.logEntries, ...extraWhLogs]),
        };
      });
    },
    [alertRules, selectedClusterName, dispatchWebhooksForNotifications, setRunState]
  );

  const dismissAlert = useCallback((alertId: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const clearAlerts = useCallback(() => {
    setActiveAlerts([]);
  }, []);

  const addWebhookIntegration = useCallback(
    (input: {
      provider: WebhookProvider;
      name: string;
      webhookUrl: string;
      channelLabel: string;
      minSeverity: 'warning' | 'critical';
    }) => {
      const created = createWebhookIntegration(input);
      setWebhookIntegrations((prev) => [created, ...prev]);
      return created;
    },
    []
  );

  const toggleWebhookIntegration = useCallback((id: string) => {
    setWebhookIntegrations((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );
  }, []);

  const removeWebhookIntegration = useCallback((id: string) => {
    setWebhookIntegrations((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const sendTestWebhookAlert = useCallback(
    (id: string) => {
      const target = webhookIntegrations.find((w) => w.id === id);
      if (!target) return;
      const sampleAlert = {
        ruleName: 'p95 Latency Threshold Guard (Test)',
        severity: 'critical' as const,
        message: 'Simulated threshold violation: p95 latency 245.0ms > 200ms SLA limit.',
        observedValue: 245.0,
        threshold: 200,
      };
      const payload = formatWebhookPayload(target.provider, sampleAlert, selectedClusterName);
      const record: WebhookDeliveryRecord = {
        id: `del-test-${Date.now()}`,
        integrationId: target.id,
        provider: target.provider,
        integrationName: target.name,
        timestampIso: new Date().toISOString(),
        status: 'simulated',
        summary: sampleAlert.message,
        payloadPreview: JSON.stringify(payload),
      };
      setWebhookDeliveries((prev) => [record, ...prev].slice(0, 30));
      setWebhookIntegrations((prev) =>
        prev.map((w) =>
          w.id === id
            ? {
                ...w,
                deliveryCount: w.deliveryCount + 1,
                lastDeliveredAtIso: new Date().toISOString(),
              }
            : w
        )
      );
      setRunState((prev) => ({
        ...prev,
        logs: prependLog(
          prev.logs,
          createWebhookLogEntry({
            integration: target,
            summary: sampleAlert.ruleName,
            timestampSec: prev.elapsedSec,
          })
        ),
      }));
    },
    [webhookIntegrations, selectedClusterName, setRunState]
  );

  return {
    alertRules,
    activeAlerts,
    setActiveAlerts,
    webhookIntegrations,
    webhookDeliveries,
    dispatchWebhooksForNotifications,
    addAlertRule,
    toggleAlertRule,
    removeAlertRule,
    simulateAlertBreach,
    dismissAlert,
    clearAlerts,
    addWebhookIntegration,
    toggleWebhookIntegration,
    removeWebhookIntegration,
    sendTestWebhookAlert,
  };
}
