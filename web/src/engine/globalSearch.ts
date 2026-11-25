import type {
  ComplianceRequirement,
  DistributedRunState,
  PummelConfig,
} from '../types/pummel';
import { LOAD_TEST_TEMPLATES } from './templateLibrary';

import type { WorkspaceProject, WorkspaceSession } from './projectSessions';

export type SearchCategory = 'all' | 'session' | 'config' | 'worker' | 'compliance';

export interface GlobalSearchResult {
  id: string;
  category: Exclude<SearchCategory, 'all'>;
  title: string;
  subtitle: string;
  meta: string;
  route: '/' | '/workspace' | '/compliance' | '/sessions';
  navigationState?: Record<string, string>;
  sessionId?: string;
  score: number;
}

function computeMatchScore(query: string, primary: string, secondary: string): number {
  if (!query) return 10;
  const q = query.toLowerCase();
  const p = primary.toLowerCase();
  const s = secondary.toLowerCase();

  if (p === q) return 100;
  if (p.startsWith(q)) return 85;
  if (p.includes(q)) return 65;
  if (s.includes(q)) return 40;
  return 0;
}

export function searchPummelEntities(params: {
  query: string;
  category?: SearchCategory;
  config: PummelConfig;
  runState: DistributedRunState;
  complianceItems: readonly ComplianceRequirement[];
  projects?: readonly WorkspaceProject[];
  sessions?: readonly WorkspaceSession[];
  limit?: number;
}): GlobalSearchResult[] {
  const {
    query,
    category = 'all',
    config,
    runState,
    complianceItems,
    projects = [],
    sessions = [],
    limit = 12,
  } = params;
  const trimmed = query.trim();
  const results: GlobalSearchResult[] = [];

  // 0. Multiproject Sessions & Workspaces
  if ((category === 'all' || category === 'session') && sessions.length > 0) {
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    for (const sess of sessions) {
      if (sess.archived) continue;
      const proj = projectMap.get(sess.projectId);
      const primary = `${sess.title} ${proj?.name ?? ''} ${proj?.shortCode ?? ''}`;
      const secondary = `session project ${sess.branch} ${proj?.repoSlug ?? ''} ${proj?.workspacePath ?? ''} ${sess.selectedClusterId} ${sess.config.name}`;
      const score = computeMatchScore(trimmed, primary, secondary);
      if (score > 0) {
        const vus = sess.config.execution[0]?.concurrency ?? 0;
        results.push({
          id: `sess-${sess.id}`,
          category: 'session',
          title: `${proj ? `${proj.name} / ` : ''}${sess.title}`,
          subtitle: `${sess.branch} · ${vus.toLocaleString()} VUs · ${sess.selectedClusterId}`,
          meta: sess.runState.status === 'running' ? 'RUNNING' : 'SESSION',
          route: '/workspace',
          sessionId: sess.id,
          score: score + 4,
        });
      }
    }
  }

  // 1. Test Configurations (active spec, pummel.yaml/toml/json filenames, scenarios, and template library)
  if (category === 'all' || category === 'config') {
    const activeScore = computeMatchScore(
      trimmed,
      `${config.name} pummel.yaml pummel.toml pummel.json`,
      `${config.distributed.coordinatorBind} ${config.distributed.shardStrategy} ${Object.keys(config.scenarios).join(' ')}`
    );
    if (activeScore > 0) {
      results.push({
        id: 'cfg-active',
        category: 'config',
        title: `${config.name} (pummel.yaml)`,
        subtitle: `Active spec · ${config.execution[0]?.concurrency ?? 0} VUs · ${Object.keys(config.scenarios).length} scenarios`,
        meta: 'Active Spec',
        route: '/workspace',
        score: activeScore + 5,
      });
    }

    for (const [scenarioName, sc] of Object.entries(config.scenarios)) {
      const reqSummary = sc.requests.map((r) => `${r.protocol} ${r.label} ${r.url}`).join(' ');
      const score = computeMatchScore(trimmed, scenarioName, reqSummary);
      if (score > 0 && trimmed.length > 0) {
        results.push({
          id: `cfg-scenario-${scenarioName}`,
          category: 'config',
          title: `Scenario: ${scenarioName}`,
          subtitle: `${sc.requests.length} request(s) · weight ${sc.weight} · think-time ${sc.thinkTimeMs}ms`,
          meta: 'Scenario',
          route: '/workspace',
          score,
        });
      }
    }

    for (const tpl of LOAD_TEST_TEMPLATES) {
      const score = computeMatchScore(
        trimmed,
        `${tpl.name} ${tpl.pattern} ${tpl.id}.yaml`,
        `${tpl.summary} ${tpl.protocols.join(' ')} ${tpl.concurrency}`
      );
      if (score > 0) {
        results.push({
          id: `cfg-tpl-${tpl.id}`,
          category: 'config',
          title: `${tpl.name} (${tpl.id}.yaml)`,
          subtitle: `${tpl.pattern.toUpperCase()} pattern · ${tpl.concurrency.toLocaleString()} VUs · ${tpl.durationSec}s`,
          meta: 'Template',
          route: '/workspace',
          navigationState: { templateId: tpl.id },
          score,
        });
      }
    }
  }

  // 2. Active Cluster Workers
  if (category === 'all' || category === 'worker') {
    for (const w of runState.workers) {
      const secondary = `cluster coordinator ${w.hostname} ${w.region} ${w.grpcEndpoint} ${w.status} ${w.assignedVUs} vus`;
      const score = computeMatchScore(trimmed, w.id, secondary);
      if (score > 0) {
        results.push({
          id: `wrk-${w.id}`,
          category: 'worker',
          title: w.id,
          subtitle: `${w.region} · ${w.grpcEndpoint} · ${w.activeVUs}/${w.assignedVUs} VUs`,
          meta: w.status.toUpperCase(),
          route: '/',
          navigationState: { focusWorkerId: w.id },
          score: score + 2,
        });
      }
    }
  }

  // 3. Compliance Reports (FR-01..FR-17 & NFRs)
  if (category === 'all' || category === 'compliance') {
    for (const item of complianceItems) {
      const primary = `${item.id} ${item.title}`;
      const secondary = `${item.group} ${item.category} ${item.requirement} ${item.evidence} ${item.status}`;
      const score = computeMatchScore(trimmed, primary, secondary);
      if (score > 0) {
        results.push({
          id: `cmp-${item.id}`,
          category: 'compliance',
          title: `${item.id}: ${item.title}`,
          subtitle: `${item.category} · ${item.evidence}`,
          meta: item.status.toUpperCase(),
          route: '/compliance',
          navigationState: { searchQuery: item.id },
          score,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  // When query is empty, return balanced top items across categories
  if (!trimmed && category === 'all') {
    const sessItems = results.filter((r) => r.category === 'session').slice(0, 3);
    const configs = results.filter((r) => r.category === 'config').slice(0, 3);
    const workers = results.filter((r) => r.category === 'worker').slice(0, 3);
    const compliance = results.filter((r) => r.category === 'compliance').slice(0, 3);
    return [...sessItems, ...configs, ...workers, ...compliance].slice(0, limit);
  }

  return results.slice(0, limit);
}
