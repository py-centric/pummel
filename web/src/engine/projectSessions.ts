import type { ConfigFormat, DistributedRunState, PummelConfig } from '../types/pummel';
import { createDefaultPresetConfig, parseRawConfigCheck, serializeConfig } from './configEngine';
import { createInitialClusterState, stepDistributedRun } from './distributedSim';
import type { StorageLike } from './scheduledTests';
import { getTemplateById } from './templateLibrary';
import {
  applyClusterTargetToConfig,
  buildClusterWorkers,
  getTestClusterById,
} from './testClusters';

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

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildSeededSession(params: {
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

export function deleteWorkspaceProject(
  state: MultiprojectWorkspaceState,
  projectId: string
): MultiprojectWorkspaceState {
  if (state.projects.length <= 1) return state;
  const remainingProjects = state.projects.filter((p) => p.id !== projectId);
  if (remainingProjects.length === 0) return state;

  const removedSessionIds = new Set(
    state.sessions.filter((s) => s.projectId === projectId).map((s) => s.id)
  );
  const remainingSessions = state.sessions.filter((s) => s.projectId !== projectId);
  if (remainingSessions.length === 0) return state;

  const fallbackSession =
    remainingSessions.find((s) => !s.archived) ?? remainingSessions[0];
  const nextOpen = state.openSessionIds.filter((id) => !removedSessionIds.has(id));
  const ensuredOpen = nextOpen.length > 0 ? nextOpen : [fallbackSession.id];
  const nextActiveSessionId = removedSessionIds.has(state.activeSessionId)
    ? ensuredOpen[0]
    : state.activeSessionId;
  const activeSession =
    remainingSessions.find((s) => s.id === nextActiveSessionId) ?? fallbackSession;

  return {
    projects: remainingProjects,
    sessions: remainingSessions,
    activeProjectId: activeSession.projectId,
    activeSessionId: activeSession.id,
    openSessionIds: ensuredOpen.includes(activeSession.id)
      ? ensuredOpen
      : [activeSession.id, ...ensuredOpen],
  };
}

export function createProjectSession(
  state: MultiprojectWorkspaceState,
  input: {
    projectId: string;
    title: string;
    branch?: string;
    templateId?: string;
    clusterId?: string;
    notes?: string;
    customConfig?: PummelConfig;
    nowIso?: string;
  }
): MultiprojectWorkspaceState {
  const project =
    state.projects.find((p) => p.id === input.projectId) ?? state.projects[0];
  if (!project) return state;

  const nowIso = input.nowIso ?? new Date().toISOString();
  const tpl = getTemplateById(input.templateId ?? 'load');
  const rawCfg = input.customConfig
    ? cloneConfig(input.customConfig)
    : tpl
      ? tpl.buildConfig()
      : createDefaultPresetConfig();
  const cleanTitle =
    input.title.trim() || `${tpl?.name ?? 'Load'} #${state.sessions.length + 1}`;
  if (!input.customConfig) {
    rawCfg.name = `${project.name} · ${cleanTitle}`;
  }

  const cluster = getTestClusterById(input.clusterId ?? project.defaultClusterId);
  const targetedCfg = applyClusterTargetToConfig(rawCfg, cluster);
  const workers = buildClusterWorkers(cluster);
  const rawSpecText = serializeConfig(targetedCfg, 'yaml');

  const session: WorkspaceSession = {
    id: `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: project.id,
    title: cleanTitle,
    branch: input.branch?.trim() || project.defaultBranch,
    specFormat: 'yaml',
    rawSpecText,
    config: targetedCfg,
    selectedClusterId: cluster.id,
    runState: createInitialClusterState(targetedCfg, workers),
    pinned: false,
    archived: false,
    unreadCount: 0,
    notes: input.notes?.trim() ?? '',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  return {
    ...state,
    sessions: [session, ...state.sessions],
    activeProjectId: project.id,
    activeSessionId: session.id,
    openSessionIds: state.openSessionIds.includes(session.id)
      ? state.openSessionIds
      : [...state.openSessionIds, session.id],
  };
}

export function forkWorkspaceSession(
  state: MultiprojectWorkspaceState,
  sourceSessionId: string,
  customTitle?: string,
  nowIso = new Date().toISOString()
): MultiprojectWorkspaceState {
  const source = state.sessions.find((s) => s.id === sourceSessionId);
  if (!source) return state;

  const clonedCfg = cloneConfig(source.config);
  const title = customTitle?.trim() || `${source.title} (Fork)`;
  clonedCfg.name = `${source.config.name} (Fork)`;

  const cluster = getTestClusterById(source.selectedClusterId);
  const workers = buildClusterWorkers(cluster);
  const freshRunState = createInitialClusterState(clonedCfg, workers);
  freshRunState.logs = [
    {
      id: `log-fork-${Date.now()}`,
      timestampSec: 0,
      level: 'INFO',
      source: 'session-mgr',
      message: `Forked isolated session from "${source.title}" (${source.branch}).`,
    },
    ...freshRunState.logs,
  ];

  const forkedBranch = source.branch.startsWith('worktree/')
    ? `${source.branch}-fork`
    : `worktree/${source.branch.replace(/[^a-zA-Z0-9-_]/g, '-')}-fork`;

  const forked: WorkspaceSession = {
    id: `sess-fork-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: source.projectId,
    title,
    branch: forkedBranch,
    specFormat: source.specFormat,
    rawSpecText: serializeConfig(clonedCfg, source.specFormat),
    config: clonedCfg,
    selectedClusterId: source.selectedClusterId,
    runState: freshRunState,
    pinned: false,
    archived: false,
    unreadCount: 0,
    notes: source.notes
      ? `Fork of "${source.title}": ${source.notes}`
      : `Forked from "${source.title}".`,
    parentSessionId: source.id,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  return {
    ...state,
    sessions: [forked, ...state.sessions],
    activeProjectId: forked.projectId,
    activeSessionId: forked.id,
    openSessionIds: [...state.openSessionIds, forked.id],
  };
}

export function switchWorkspaceSession(
  state: MultiprojectWorkspaceState,
  sessionId: string
): MultiprojectWorkspaceState {
  const target = state.sessions.find((s) => s.id === sessionId);
  if (!target) return state;

  const updatedSessions = state.sessions.map((s) =>
    s.id === sessionId ? { ...s, archived: false, unreadCount: 0 } : s
  );
  const nextOpen = state.openSessionIds.includes(sessionId)
    ? state.openSessionIds
    : [...state.openSessionIds, sessionId];

  return {
    ...state,
    sessions: updatedSessions,
    activeProjectId: target.projectId,
    activeSessionId: target.id,
    openSessionIds: nextOpen,
  };
}

export function closeSessionTab(
  state: MultiprojectWorkspaceState,
  sessionId: string
): MultiprojectWorkspaceState {
  if (state.openSessionIds.length <= 1 && state.openSessionIds[0] === sessionId) {
    return state;
  }
  const idx = state.openSessionIds.indexOf(sessionId);
  if (idx === -1) return state;

  const nextOpen = state.openSessionIds.filter((id) => id !== sessionId);
  if (state.activeSessionId !== sessionId) {
    return {
      ...state,
      openSessionIds: nextOpen,
    };
  }

  const fallbackId = nextOpen[Math.min(idx, nextOpen.length - 1)] ?? nextOpen[0];
  const fallbackSession = state.sessions.find((s) => s.id === fallbackId);
  if (!fallbackSession) return state;

  return {
    ...state,
    activeProjectId: fallbackSession.projectId,
    activeSessionId: fallbackSession.id,
    openSessionIds: nextOpen,
    sessions: state.sessions.map((s) =>
      s.id === fallbackSession.id ? { ...s, unreadCount: 0 } : s
    ),
  };
}

export function renameWorkspaceSession(
  state: MultiprojectWorkspaceState,
  sessionId: string,
  nextTitle: string,
  nowIso = new Date().toISOString()
): MultiprojectWorkspaceState {
  const trimmed = nextTitle.trim();
  if (!trimmed) return state;
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, title: trimmed, updatedAtIso: nowIso } : s
    ),
  };
}

export function updateWorkspaceSessionNotes(
  state: MultiprojectWorkspaceState,
  sessionId: string,
  notes: string,
  branch?: string,
  nowIso = new Date().toISOString()
): MultiprojectWorkspaceState {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            notes,
            branch: branch !== undefined && branch.trim() ? branch.trim() : s.branch,
            updatedAtIso: nowIso,
          }
        : s
    ),
  };
}

export function togglePinWorkspaceSession(
  state: MultiprojectWorkspaceState,
  sessionId: string
): MultiprojectWorkspaceState {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, pinned: !s.pinned } : s
    ),
  };
}

export function toggleArchiveWorkspaceSession(
  state: MultiprojectWorkspaceState,
  sessionId: string
): MultiprojectWorkspaceState {
  const target = state.sessions.find((s) => s.id === sessionId);
  if (!target) return state;

  if (!target.archived) {
    const activePeers = state.sessions.filter((s) => !s.archived && s.id !== sessionId);
    if (activePeers.length === 0) return state;

    const updatedSessions = state.sessions.map((s) =>
      s.id === sessionId ? { ...s, archived: true, pinned: false } : s
    );
    const filteredOpen = state.openSessionIds.filter((id) => id !== sessionId);
    const nextOpen = filteredOpen.length > 0 ? filteredOpen : [activePeers[0].id];
    const nextActiveId =
      state.activeSessionId === sessionId ? nextOpen[0] : state.activeSessionId;
    const nextActive =
      updatedSessions.find((s) => s.id === nextActiveId) ?? activePeers[0];

    return {
      ...state,
      sessions: updatedSessions,
      activeProjectId: nextActive.projectId,
      activeSessionId: nextActive.id,
      openSessionIds: nextOpen,
    };
  }

  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, archived: false, unreadCount: 0 } : s
    ),
    activeProjectId: target.projectId,
    activeSessionId: target.id,
    openSessionIds: state.openSessionIds.includes(target.id)
      ? state.openSessionIds
      : [...state.openSessionIds, target.id],
  };
}

export function deleteWorkspaceSession(
  state: MultiprojectWorkspaceState,
  sessionId: string
): MultiprojectWorkspaceState {
  if (state.sessions.length <= 1) return state;
  const remaining = state.sessions.filter((s) => s.id !== sessionId);
  const nonArchived = remaining.filter((s) => !s.archived);
  if (nonArchived.length === 0) return state;

  const filteredOpen = state.openSessionIds.filter((id) => id !== sessionId);
  const nextOpen = filteredOpen.length > 0 ? filteredOpen : [nonArchived[0].id];
  const nextActiveId =
    state.activeSessionId === sessionId ? nextOpen[0] : state.activeSessionId;
  const nextActive = remaining.find((s) => s.id === nextActiveId) ?? nonArchived[0];

  return {
    ...state,
    sessions: remaining,
    activeProjectId: nextActive.projectId,
    activeSessionId: nextActive.id,
    openSessionIds: nextOpen,
  };
}

export function stepBackgroundSessions(
  state: MultiprojectWorkspaceState,
  nowIso = new Date().toISOString()
): MultiprojectWorkspaceState {
  let changed = false;
  const nextSessions = state.sessions.map((session) => {
    if (session.id === state.activeSessionId || session.runState.status !== 'running') {
      return session;
    }
    changed = true;
    const nextRun = stepDistributedRun(session.runState, session.config, 1);
    const finished =
      nextRun.status === 'completed' || nextRun.status === 'aborted_sla';
    return {
      ...session,
      runState: nextRun,
      unreadCount: finished ? session.unreadCount + 1 : session.unreadCount,
      updatedAtIso: nowIso,
    };
  });

  return changed ? { ...state, sessions: nextSessions } : state;
}

export function computeMultiprojectSummary(
  state: MultiprojectWorkspaceState
): MultiprojectSummary {
  const activeSessions = state.sessions.filter((s) => !s.archived);
  const archivedSessions = state.sessions.filter((s) => s.archived);
  const runningSessions = activeSessions.filter((s) => s.runState.status === 'running');
  const runningProjects = new Set(runningSessions.map((s) => s.projectId));

  return {
    projectCount: state.projects.length,
    activeSessionCount: activeSessions.length,
    archivedSessionCount: archivedSessions.length,
    openTabCount: state.openSessionIds.length,
    runningSessionCount: runningSessions.length,
    runningProjectCount: runningProjects.size,
    aggregateActiveVUs: runningSessions.reduce((sum, s) => sum + s.runState.activeVUs, 0),
    aggregateCurrentRps: runningSessions.reduce((sum, s) => sum + s.runState.currentRps, 0),
    unreadTotal: activeSessions.reduce((sum, s) => sum + s.unreadCount, 0),
  };
}

export function filterWorkspaceSessions(
  state: MultiprojectWorkspaceState,
  params: {
    projectId?: string | 'all';
    view?: SessionViewFilter;
    query?: string;
  }
): WorkspaceSession[] {
  const { projectId = 'all', view = 'active', query = '' } = params;
  const q = query.trim().toLowerCase();
  const projectMap = new Map(state.projects.map((p) => [p.id, p]));

  return state.sessions
    .filter((s) => {
      if (projectId !== 'all' && s.projectId !== projectId) return false;
      if (view === 'archived') {
        if (!s.archived) return false;
      } else {
        if (s.archived) return false;
        if (view === 'pinned' && !s.pinned) return false;
        if (view === 'running' && s.runState.status !== 'running') return false;
      }

      if (!q) return true;
      const proj = projectMap.get(s.projectId);
      const haystack = [
        s.title,
        s.branch,
        s.config.name,
        s.selectedClusterId,
        s.notes,
        proj?.name ?? '',
        proj?.repoSlug ?? '',
        proj?.workspacePath ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aRunning = a.runState.status === 'running';
      const bRunning = b.runState.status === 'running';
      if (aRunning !== bRunning) return aRunning ? -1 : 1;
      return b.updatedAtIso.localeCompare(a.updatedAtIso);
    });
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function compactRunStateForStorage(runState: DistributedRunState): DistributedRunState {
  return {
    ...runState,
    history: runState.history.slice(-60),
    logs: runState.logs.slice(0, 60),
    endpoints: runState.endpoints.map((ep) => ({
      ...ep,
      timings: ep.timings.slice(-120),
    })),
  };
}

export function saveMultiprojectWorkspace(
  state: MultiprojectWorkspaceState,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    const compact: MultiprojectWorkspaceState = {
      ...state,
      sessions: state.sessions.map((s) => ({
        ...s,
        runState: compactRunStateForStorage(s.runState),
      })),
    };
    storage.setItem(MULTIPROJECT_STORAGE_KEY, JSON.stringify(compact));
    return true;
  } catch {
    return false;
  }
}

export function loadMultiprojectWorkspace(
  storage: StorageLike | null = getDefaultStorage()
): MultiprojectWorkspaceState {
  const fallback = createSeedMultiprojectWorkspace();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(MULTIPROJECT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<MultiprojectWorkspaceState>;
    if (
      !parsed ||
      !Array.isArray(parsed.projects) ||
      parsed.projects.length === 0 ||
      !Array.isArray(parsed.sessions) ||
      parsed.sessions.length === 0
    ) {
      return fallback;
    }

    const validProjectIds = new Set(parsed.projects.map((p) => p.id));
    const hydratedSessions: WorkspaceSession[] = parsed.sessions
      .filter((s) => s && typeof s.id === 'string' && validProjectIds.has(s.projectId))
      .map((s) => {
        const format: ConfigFormat =
          s.specFormat === 'toml' || s.specFormat === 'json' ? s.specFormat : 'yaml';
        const fallbackCfg = createDefaultPresetConfig();
        const cfg =
          s.config && typeof s.config === 'object' && Array.isArray(s.config.execution)
            ? s.config
            : parseRawConfigCheck(s.rawSpecText || '', format, fallbackCfg).config;
        const rawSpecText =
          typeof s.rawSpecText === 'string' && s.rawSpecText.trim()
            ? s.rawSpecText
            : serializeConfig(cfg, format);
        const cluster = getTestClusterById(s.selectedClusterId || 'eu-west-primary');
        const runState =
          s.runState && typeof s.runState === 'object' && Array.isArray(s.runState.workers)
            ? s.runState
            : createInitialClusterState(cfg);

        return {
          id: s.id,
          projectId: s.projectId,
          title: s.title || cfg.name,
          branch: s.branch || 'main',
          specFormat: format,
          rawSpecText,
          config: cfg,
          selectedClusterId: cluster.id,
          runState,
          pinned: Boolean(s.pinned),
          archived: Boolean(s.archived),
          unreadCount: typeof s.unreadCount === 'number' ? s.unreadCount : 0,
          notes: typeof s.notes === 'string' ? s.notes : '',
          parentSessionId: s.parentSessionId,
          createdAtIso: s.createdAtIso || new Date().toISOString(),
          updatedAtIso: s.updatedAtIso || new Date().toISOString(),
        };
      });

    if (hydratedSessions.length === 0) return fallback;

    const nonArchived = hydratedSessions.filter((s) => !s.archived);
    const defaultActive = nonArchived[0] ?? hydratedSessions[0];
    const activeSession =
      hydratedSessions.find((s) => s.id === parsed.activeSessionId && !s.archived) ??
      defaultActive;
    const sessionIds = new Set(hydratedSessions.map((s) => s.id));
    const openIds = Array.isArray(parsed.openSessionIds)
      ? parsed.openSessionIds.filter((id) => sessionIds.has(id))
      : [];
    const openSessionIds = openIds.includes(activeSession.id)
      ? openIds
      : [activeSession.id, ...openIds];

    return {
      projects: parsed.projects,
      sessions: hydratedSessions,
      activeProjectId: activeSession.projectId,
      activeSessionId: activeSession.id,
      openSessionIds,
    };
  } catch {
    return fallback;
  }
}
