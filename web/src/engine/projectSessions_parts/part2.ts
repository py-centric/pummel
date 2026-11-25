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
