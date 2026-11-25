import test from 'node:test';
import assert from 'node:assert/strict';
import { startDistributedRun } from './distributedSim';
import {
  closeSessionTab,
  computeMultiprojectSummary,
  createProjectSession,
  createSeedMultiprojectWorkspace,
  createWorkspaceProject,
  deleteWorkspaceProject,
  filterWorkspaceSessions,
  forkWorkspaceSession,
  loadMultiprojectWorkspace,
  renameWorkspaceSession,
  saveMultiprojectWorkspace,
  stepBackgroundSessions,
  switchWorkspaceSession,
  toggleArchiveWorkspaceSession,
  togglePinWorkspaceSession,
} from './projectSessions';

test('createSeedMultiprojectWorkspace initializes 3 distinct projects and isolated sessions', () => {
  const ws = createSeedMultiprojectWorkspace('2026-11-22T14:00:00.000Z');
  assert.equal(ws.projects.length, 3);
  assert.equal(ws.sessions.length, 4);
  assert.equal(ws.activeProjectId, 'proj-storefront');
  assert.equal(ws.activeSessionId, 'sess-sf-baseline');
  assert.deepEqual(ws.openSessionIds, [
    'sess-sf-baseline',
    'sess-pay-stress',
    'sess-inv-chaos',
  ]);

  const paySession = ws.sessions.find((s) => s.id === 'sess-pay-stress');
  assert.ok(paySession);
  assert.equal(paySession.selectedClusterId, 'us-east-staging');
  assert.equal(paySession.config.execution[0].concurrency, 2200);
});

test('createWorkspaceProject and createProjectSession isolate per-project branches and clusters', () => {
  let ws = createSeedMultiprojectWorkspace('2026-11-22T14:00:00.000Z');
  ws = createWorkspaceProject(ws, {
    name: 'Search Edge API',
    repoSlug: 'platform/search-edge',
    defaultBranch: 'feat/vector-cache',
    defaultClusterId: 'ap-south-canary',
    templateId: 'smoke',
  });

  assert.equal(ws.projects.length, 4);
  const activeProj = ws.projects.find((p) => p.id === ws.activeProjectId);
  assert.ok(activeProj);
  assert.equal(activeProj.shortCode, 'SEA');

  ws = createProjectSession(ws, {
    projectId: activeProj.id,
    title: 'Burst Spike 1400',
    branch: 'worktree/burst-1400',
    templateId: 'spike',
  });

  const activeSess = ws.sessions.find((s) => s.id === ws.activeSessionId);
  assert.ok(activeSess);
  assert.equal(activeSess.projectId, activeProj.id);
  assert.equal(activeSess.branch, 'worktree/burst-1400');
  assert.equal(activeSess.config.execution[0].concurrency, 1400);
  assert.ok(ws.openSessionIds.includes(activeSess.id));
});

test('forkWorkspaceSession clones configuration into an independent worktree session', () => {
  const base = createSeedMultiprojectWorkspace('2026-11-22T14:00:00.000Z');
  const forkedState = forkWorkspaceSession(base, 'sess-pay-stress', 'PCI Stress Canary Fork');

  const forked = forkedState.sessions.find((s) => s.id === forkedState.activeSessionId);
  assert.ok(forked);
  assert.equal(forked.parentSessionId, 'sess-pay-stress');
  assert.equal(forked.projectId, 'proj-payments');
  assert.equal(forked.title, 'PCI Stress Canary Fork');
  assert.match(forked.branch, /^worktree\//);
  assert.equal(forked.selectedClusterId, 'us-east-staging');
  assert.equal(forked.config.execution[0].concurrency, 2200);
});

test('stepBackgroundSessions advances concurrent running sessions in other projects and tracks unread completion', () => {
  let ws = createSeedMultiprojectWorkspace('2026-11-22T14:00:00.000Z');

  ws = {
    ...ws,
    sessions: ws.sessions.map((s) => {
      if (s.id !== 'sess-pay-stress') return s;
      const shortCfg = {
        ...s.config,
        execution: [{ ...s.config.execution[0], rampUpSec: 1, holdForSec: 1 }],
      };
      return {
        ...s,
        config: shortCfg,
        runState: startDistributedRun(
          { ...s.runState, totalDurationSec: 2 },
          shortCfg
        ),
      };
    }),
  };

  const beforeSummary = computeMultiprojectSummary(ws);
  assert.equal(beforeSummary.runningSessionCount, 1);

  ws = stepBackgroundSessions(ws, '2026-11-22T14:00:01.000Z');
  const midPay = ws.sessions.find((s) => s.id === 'sess-pay-stress')!;
  assert.equal(midPay.runState.elapsedSec, 1);
  assert.equal(midPay.unreadCount, 0);

  ws = stepBackgroundSessions(ws, '2026-11-22T14:00:02.000Z');
  const donePay = ws.sessions.find((s) => s.id === 'sess-pay-stress')!;
  assert.equal(donePay.runState.status, 'completed');
  assert.equal(donePay.unreadCount, 1);

  ws = switchWorkspaceSession(ws, 'sess-pay-stress');
  const clearedPay = ws.sessions.find((s) => s.id === 'sess-pay-stress')!;
  assert.equal(clearedPay.unreadCount, 0);
  assert.equal(ws.activeProjectId, 'proj-payments');
});

test('tab closing, archiving, pinning, filtering, project deletion, and localStorage round-trip', () => {
  let ws = createSeedMultiprojectWorkspace('2026-11-22T14:00:00.000Z');
  ws = renameWorkspaceSession(ws, 'sess-sf-baseline', 'Renamed Baseline Gate');
  ws = togglePinWorkspaceSession(ws, 'sess-inv-chaos');
  assert.equal(
    filterWorkspaceSessions(ws, { view: 'pinned' }).some((s) => s.id === 'sess-inv-chaos'),
    true
  );

  ws = closeSessionTab(ws, 'sess-sf-baseline');
  assert.equal(ws.openSessionIds.includes('sess-sf-baseline'), false);
  assert.equal(ws.activeSessionId, 'sess-pay-stress');

  ws = toggleArchiveWorkspaceSession(ws, 'sess-pay-stress');
  assert.equal(filterWorkspaceSessions(ws, { view: 'archived' }).length, 1);
  assert.notEqual(ws.activeSessionId, 'sess-pay-stress');

  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };

  assert.equal(saveMultiprojectWorkspace(ws, mockStorage), true);
  const reloaded = loadMultiprojectWorkspace(mockStorage);
  assert.equal(reloaded.projects.length, 3);
  assert.equal(
    reloaded.sessions.find((s) => s.id === 'sess-sf-baseline')?.title,
    'Renamed Baseline Gate'
  );

  const afterProjDelete = deleteWorkspaceProject(reloaded, 'proj-inventory');
  assert.equal(afterProjDelete.projects.length, 2);
  assert.equal(
    afterProjDelete.sessions.some((s) => s.projectId === 'proj-inventory'),
    false
  );
});
