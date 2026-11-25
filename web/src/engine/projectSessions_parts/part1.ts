import type { ConfigFormat, DistributedRunState, PummelConfig } from '../../types/pummel';
import { createDefaultPresetConfig, parseRawConfigCheck, serializeConfig } from '../configEngine';
import { createInitialClusterState, stepDistributedRun } from '../distributedSim';
import type { StorageLike } from '../scheduledTests';
import { getTemplateById } from '../templateLibrary';
import {
  applyClusterTargetToConfig,
  buildClusterWorkers,
  getTestClusterById,
} from '../testClusters';

export interface WorkspaceProject {
  id: string;
  name: string;
  shortCode: string;
  repoSlug: string;
  workspacePath: string;
  defaultBranch: string;
  defaultClusterId: string;
  createdAtIso: string;
}

export interface WorkspaceSession {
  id: string;
  projectId: string;
  title: string;
  branch: string;
  specFormat: ConfigFormat;
  rawSpecText: string;
  config: PummelConfig;
  selectedClusterId: string;
  runState: DistributedRunState;
  pinned: boolean;
  archived: boolean;
  unreadCount: number;
  notes: string;
  parentSessionId?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface MultiprojectWorkspaceState {
  projects: WorkspaceProject[];
  sessions: WorkspaceSession[];
  activeProjectId: string;
  activeSessionId: string;
  openSessionIds: string[];
}

export type SessionViewFilter = 'active' | 'pinned' | 'running' | 'archived';

export interface MultiprojectSummary {
  projectCount: number;
  activeSessionCount: number;
  archivedSessionCount: number;
  openTabCount: number;
  runningSessionCount: number;
  runningProjectCount: number;
  aggregateActiveVUs: number;
  aggregateCurrentRps: number;
  unreadTotal: number;
}

export const MULTIPROJECT_STORAGE_KEY = 'pummel_multiproject_sessions_v1';

export function deriveProjectShortCode(name: string): string {
  const words = name
    .trim()
    .replace(/[^a-zA-Z0-9\s-_]/g, ' ')
    .split(/[\s-_]+/)
    .filter(Boolean);
  if (words.length === 0) return 'PRJ';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildSeededSession(params: {
  id: string;
  projectId: string;
  title: string;
  branch: string;
  config: PummelConfig;
  clusterId: string;
  pinned?: boolean;
  notes: string;
  createdAtIso: string;
}): WorkspaceSession {
  const cluster = getTestClusterById(params.clusterId);
  const targetedConfig =
    params.clusterId === 'eu-west-primary' &&
    params.config.distributed.coordinatorBind === '127.0.0.1:50051'
      ? cloneConfig(params.config)
      : applyClusterTargetToConfig(params.config, cluster);
  const workers =
    params.clusterId === 'eu-west-primary' &&
    params.config.distributed.coordinatorBind === '127.0.0.1:50051'
      ? undefined
      : buildClusterWorkers(cluster);
  const rawSpecText = serializeConfig(targetedConfig, 'yaml');
  const runState = createInitialClusterState(targetedConfig, workers);

  return {
    id: params.id,
    projectId: params.projectId,
    title: params.title,
    branch: params.branch,
    specFormat: 'yaml',
    rawSpecText,
    config: targetedConfig,
    selectedClusterId: cluster.id,
    runState,
    pinned: Boolean(params.pinned),
    archived: false,
    unreadCount: 0,
    notes: params.notes,
    createdAtIso: params.createdAtIso,
    updatedAtIso: params.createdAtIso,
  };
}

export function createSeedMultiprojectWorkspace(
  nowIso = new Date().toISOString()
): MultiprojectWorkspaceState {
  const projects: WorkspaceProject[] = [
    {
      id: 'proj-storefront',
      name: 'Storefront Checkout',
      shortCode: 'SF',
      repoSlug: 'commerce/storefront-checkout',
      workspacePath: '/workspaces/storefront-checkout',
      defaultBranch: 'main',
      defaultClusterId: 'eu-west-primary',
      createdAtIso: nowIso,
    },
    {
      id: 'proj-payments',
      name: 'Payments Gateway v2',
      shortCode: 'PAY',
      repoSlug: 'fintech/payments-gateway-v2',
      workspacePath: '/workspaces/payments-gateway-v2',
      defaultBranch: 'release/2.5',
      defaultClusterId: 'us-east-staging',
      createdAtIso: nowIso,
    },
    {
      id: 'proj-inventory',
      name: 'Inventory gRPC Mesh',
      shortCode: 'INV',
      repoSlug: 'fulfillment/inventory-grpc-mesh',
      workspacePath: '/workspaces/inventory-grpc-mesh',
      defaultBranch: 'feat/mtls-sharding',
      defaultClusterId: 'ap-south-canary',
      createdAtIso: nowIso,
    },
  ];

  const baselineCfg = createDefaultPresetConfig();
  const spikeCfg = getTemplateById('spike')?.buildConfig() ?? createDefaultPresetConfig();
  const stressCfg = getTemplateById('stress')?.buildConfig() ?? createDefaultPresetConfig();
  stressCfg.name = 'Payments PCI Failover Stress (2,200 VUs)';
  const chaosCfg = getTemplateById('chaos')?.buildConfig() ?? createDefaultPresetConfig();
  chaosCfg.name = 'Inventory mTLS Toxiproxy Chaos';

  const sessions: WorkspaceSession[] = [
    buildSeededSession({
      id: 'sess-sf-baseline',
      projectId: 'proj-storefront',
      title: 'Baseline 600 VU Gate',
      branch: 'main',
      config: baselineCfg,
      clusterId: 'eu-west-primary',
      pinned: true,
      notes: 'Primary PR regression gate for HTTP checkout + gRPC inventory reserve.',
      createdAtIso: nowIso,
    }),
    buildSeededSession({
      id: 'sess-sf-spike',
      projectId: 'proj-storefront',
      title: 'Flash-Sale 1,400 VU Spike',
      branch: 'worktree/flash-sale',
      config: spikeCfg,
      clusterId: 'eu-west-primary',
      pinned: false,
      notes: 'Isolated worktree validating 8s burst ramp and replica scale-out hook.',
      createdAtIso: nowIso,
    }),
    buildSeededSession({
      id: 'sess-pay-stress',
      projectId: 'proj-payments',
      title: 'PCI Failover Stress',
      branch: 'release/2.5',
      config: stressCfg,
      clusterId: 'us-east-staging',
      pinned: true,
      notes: 'Sustained 2,200 VU saturation envelope against US-East staging gateway.',
      createdAtIso: nowIso,
    }),
    buildSeededSession({
      id: 'sess-inv-chaos',
      projectId: 'proj-inventory',
      title: 'Toxiproxy mTLS Chaos',
      branch: 'feat/mtls-sharding',
      config: chaosCfg,
      clusterId: 'ap-south-canary',
      pinned: false,
      notes: '120ms latency + 20ms jitter injection across AP-South canary mesh.',
      createdAtIso: nowIso,
    }),
  ];

  return {
    projects,
    sessions,
    activeProjectId: 'proj-storefront',
    activeSessionId: 'sess-sf-baseline',
    openSessionIds: ['sess-sf-baseline', 'sess-pay-stress', 'sess-inv-chaos'],
  };
}

export function createWorkspaceProject(
  state: MultiprojectWorkspaceState,
  input: {
    name: string;
    repoSlug?: string;
    workspacePath?: string;
    defaultBranch?: string;
    defaultClusterId?: string;
    templateId?: string;
    nowIso?: string;
  }
): MultiprojectWorkspaceState {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const cleanName = input.name.trim() || `Project ${state.projects.length + 1}`;
  const slugSafe =
    cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project';
  const repoSlug = input.repoSlug?.trim() || `org/${slugSafe}`;
  const workspacePath = input.workspacePath?.trim() || `/workspaces/${slugSafe}`;
  const defaultBranch = input.defaultBranch?.trim() || 'main';
  const cluster = getTestClusterById(input.defaultClusterId ?? 'eu-west-primary');
  const projectId = `proj-${slugSafe}-${Date.now().toString(36)}`;

  const newProject: WorkspaceProject = {
    id: projectId,
    name: cleanName,
    shortCode: deriveProjectShortCode(cleanName),
    repoSlug,
    workspacePath,
    defaultBranch,
    defaultClusterId: cluster.id,
    createdAtIso: nowIso,
  };

  const tpl = getTemplateById(input.templateId ?? 'load');
  const baseCfg = tpl ? tpl.buildConfig() : createDefaultPresetConfig();
  baseCfg.name = `${cleanName} · ${tpl?.name ?? 'Baseline'}`;
  const targetedCfg = applyClusterTargetToConfig(baseCfg, cluster);
  const workers = buildClusterWorkers(cluster);
  const rawSpecText = serializeConfig(targetedCfg, 'yaml');

  const starterSession: WorkspaceSession = {
    id: `sess-${slugSafe}-${Date.now().toString(36)}`,
    projectId,
    title: `${tpl?.name ?? 'Baseline'} Session`,
    branch: defaultBranch,
    specFormat: 'yaml',
    rawSpecText,
    config: targetedCfg,
    selectedClusterId: cluster.id,
    runState: createInitialClusterState(targetedCfg, workers),
    pinned: false,
    archived: false,
    unreadCount: 0,
    notes: `Initial session for ${cleanName} (${repoSlug}@${defaultBranch}).`,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  return {
    projects: [...state.projects, newProject],
    sessions: [starterSession, ...state.sessions],
    activeProjectId: projectId,
    activeSessionId: starterSession.id,
    openSessionIds: [...state.openSessionIds, starterSession.id],
  };
}
