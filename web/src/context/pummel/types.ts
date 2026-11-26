import type {
  DistributedConfig,
  DistributedRunState,
  PummelConfig,
  RunLogEntry,
  ValidationDiagnostic,
} from '../../types/pummel';
import type { AlertNotification, AlertThresholdRule } from '../../engine/alertingEngine';
import type { TestClusterProfile } from '../../engine/testClusters';
import type { ScheduledTestTask, ScheduleRecurrence } from '../../engine/scheduledTests';
import type { AnomalyDetectorConfig, DetectedAnomaly } from '../../engine/anomalyDetector';
import type {
  WebhookDeliveryRecord,
  WebhookIntegration,
  WebhookProvider,
} from '../../engine/webhookIntegrations';
import type { RecordedRunHeatmap } from '../../engine/latencyComparison';
import type { AutoScaleConfig, AutoScaleEventSummary } from '../../engine/autoScaling';
import type { RecordedTestSession } from '../../engine/sessionReplay';

export type BrowserNotificationPerm = 'default' | 'granted' | 'denied' | 'unsupported';

export const WORKER_REGIONS = [
  'eu-west-2',
  'us-east-1',
  'ap-southeast-1',
  'eu-central-1',
  'us-west-2',
];

export function prependLog(existing: RunLogEntry[], entry: RunLogEntry): RunLogEntry[] {
  return [entry, ...existing].slice(0, 120);
}

export function prependLogs(existing: RunLogEntry[], entries: RunLogEntry[]): RunLogEntry[] {
  if (entries.length === 0) return existing;
  return [...entries, ...existing].slice(0, 120);
}

export function getBrowserNotificationPermission(): BrowserNotificationPerm {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export interface PummelContextValue {
  config: PummelConfig;
  runState: DistributedRunState;
  diagnostics: ValidationDiagnostic[];
  lastAuditAt: string;
  alertRules: AlertThresholdRule[];
  activeAlerts: AlertNotification[];
  selectedClusterId: string;
  selectedCluster: TestClusterProfile;
  scheduledTests: ScheduledTestTask[];
  anomalyConfig: AnomalyDetectorConfig;
  recentAnomalies: DetectedAnomaly[];
  notificationPermission: BrowserNotificationPerm;
  postRunAnalysisOpen: boolean;
  webhookIntegrations: WebhookIntegration[];
  webhookDeliveries: WebhookDeliveryRecord[];
  recordedRunHeatmaps: RecordedRunHeatmap[];
  autoScaleConfig: AutoScaleConfig;
  lastScaleEvent: AutoScaleEventSummary | null;
  recordedSessions: RecordedTestSession[];
  startRun: () => void;
  pauseRun: () => void;
  resumeRun: () => void;
  stopRun: () => void;
  resetRun: () => void;
  toggleChaosFault: () => void;
  addWorker: (region?: string) => void;
  cycleWorkerStatus: (workerId: string) => void;
  removeWorker: (workerId: string) => void;
  updateDistributedConfig: (patch: Partial<DistributedConfig>) => void;
  applyWorkspaceConfig: (
    nextConfig: PummelConfig,
    rawText?: string,
    unknownFields?: string[]
  ) => void;
  selectCluster: (clusterId: string) => void;
  switchActiveCluster: (clusterId: string) => void;
  quickRunConfig: (params: {
    nextConfig: PummelConfig;
    clusterId: string;
    rawText?: string;
    unknownFields?: string[];
  }) => TestClusterProfile;
  rerunAudit: () => void;
  clearLogs: () => void;
  addAlertRule: (rule: Omit<AlertThresholdRule, 'id'>) => void;
  toggleAlertRule: (ruleId: string) => void;
  removeAlertRule: (ruleId: string) => void;
  simulateAlertBreach: (targetRuleId?: string) => void;
  dismissAlert: (alertId: string) => void;
  clearAlerts: () => void;
  addScheduledTest: (input: {
    label: string;
    clusterId: string;
    scheduledAtIso: string;
    recurrence: ScheduleRecurrence;
    specConfig?: PummelConfig;
    rawText?: string;
    format?: PummelConfig['reporting'] extends never ? never : 'yaml' | 'json' | 'toml';
  }) => ScheduledTestTask;
  toggleScheduledTest: (taskId: string) => void;
  removeScheduledTest: (taskId: string) => void;
  runScheduledTestNow: (taskId: string) => TestClusterProfile | null;
  updateAnomalyConfig: (patch: Partial<AnomalyDetectorConfig>) => void;
  requestBrowserNotificationPermission: () => Promise<BrowserNotificationPerm>;
  dismissRecentAnomalies: () => void;
  openPostRunAnalysis: () => void;
  closePostRunAnalysis: () => void;
  addWebhookIntegration: (input: {
    provider: WebhookProvider;
    name: string;
    webhookUrl: string;
    channelLabel: string;
    minSeverity: 'warning' | 'critical';
  }) => WebhookIntegration;
  toggleWebhookIntegration: (id: string) => void;
  removeWebhookIntegration: (id: string) => void;
  sendTestWebhookAlert: (id: string) => void;
  captureCurrentRunHeatmap: (customLabel?: string) => RecordedRunHeatmap | null;
  updateAutoScaleConfig: (patch: Partial<AutoScaleConfig>) => void;
  recordCurrentSession: (customLabel?: string) => RecordedTestSession | null;
  deleteRecordedSession: (sessionId: string) => void;
}
