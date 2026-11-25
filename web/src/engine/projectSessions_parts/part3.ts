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

export function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function compactRunStateForStorage(runState: DistributedRunState): DistributedRunState {
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
