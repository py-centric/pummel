import type {
  ConfigFormat,
  DistributedRunState,
  PummelConfig,
  ScenarioConfig,
  ValidationDiagnostic,
} from '../../types/pummel';
import { normalizeInheritance, xmlEscape } from './part1';
import { serializeConfig } from './part2';


export function exportPummelConfig(
  config: PummelConfig,
  target: 'k6' | 'locust' | 'taurus' | 'postman' | 'goose' | 'distributed'
): string {
  const { normalized } = normalizeInheritance(config);
  const exec = normalized.execution[0];
  const scenario: ScenarioConfig | undefined =
    (exec && normalized.scenarios[exec.scenario]) || Object.values(normalized.scenarios)[0];
  const requests = scenario ? [...scenario.onStart, ...scenario.requests] : [];

  if (target === 'k6') {
    const reqLines = requests
      .map(
        (r) =>
          `  const res_${r.label.replace(/[^a-zA-Z0-9]/g, '_')} = http.${r.method.toLowerCase()}('${r.url}'${r.body ? `, '${r.body}'` : ''});\n  check(res_${r.label.replace(/[^a-zA-Z0-9]/g, '_')}, { '${r.label} ok': (r) => r.status < 400 });`
      )
      .join('\n');

    return `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '${exec?.rampUpSec ?? 15}s', target: ${exec?.concurrency ?? 200} },
    { duration: '${exec?.holdForSec ?? 45}s', target: ${exec?.concurrency ?? 200} },
  ],
  thresholds: {
    http_req_duration: ['p(95)<${normalized.sla.find((s) => s.metric === 'p95-response-time')?.threshold ?? 200}'],
    http_req_failed: ['rate<${((normalized.sla.find((s) => s.metric === 'fail-rate')?.threshold ?? 5) / 100).toFixed(3)}'],
  },
};

export default function () {
${reqLines || "  http.get('https://example.internal/health');"}
  sleep(${((scenario?.thinkTimeMs ?? 150) / 1000).toFixed(2)});
}`;
  }

  if (target === 'locust') {
    const tasks = requests
      .map(
        (r, i) => `    @task(${i === 0 ? 2 : 1})
    def step_${i + 1}(self):
        self.client.${r.method.toLowerCase()}("${r.url}", name="${r.label}")`
      )
      .join('\n\n');

    return `from locust import HttpUser, LoadTestShape, task, between

class PummelExportUser(HttpUser):
    wait_time = between(0.1, ${((scenario?.thinkTimeMs ?? 200) / 1000).toFixed(2)})

${tasks || '    @task\n    def health(self):\n        self.client.get("/health")'}

class RampAndHoldShape(LoadTestShape):
    def tick(self):
        run_time = self.get_run_time()
        if run_time < ${exec?.rampUpSec ?? 15}:
            return (${exec?.concurrency ?? 200}, ${Math.max(1, Math.round((exec?.concurrency ?? 200) / Math.max(1, exec?.rampUpSec ?? 15)))})
        if run_time < ${(exec?.rampUpSec ?? 15) + (exec?.holdForSec ?? 45)}:
            return (${exec?.concurrency ?? 200}, 10)
        return None`;
  }

  if (target === 'postman') {
    return JSON.stringify(
      {
        info: {
          name: normalized.name,
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: requests.map((r) => ({
          name: r.label,
          request: {
            method: r.method,
            url: { raw: r.url },
            ...(r.body ? { body: { mode: 'raw', raw: r.body } } : {}),
          },
        })),
      },
      null,
      2
    );
  }

  if (target === 'goose') {
    const txFns = requests
      .map(
        (r, i) => `async fn tx_${i + 1}(user: &mut GooseUser) -> TransactionResult {
    let _res = user.${r.method === 'POST' ? 'post' : 'get'}("${r.url}"${r.method === 'POST' ? `, "${(r.body ?? '{}').replace(/"/g, '\\"')}"` : ''}).await?;
    Ok(())
}`
      )
      .join('\n\n');

    return `use goose::prelude::*;

${txFns}

#[tokio::main]
async fn main() -> Result<(), GooseError> {
    GooseAttack::initialize()?
        .register_scenario(
            scenario!("${exec?.scenario ?? 'default'}")
${requests.map((_, i) => `                .register_transaction(transaction!(tx_${i + 1}))`).join('\n')}
        )
        .execute()
        .await?;
    Ok(())
}`;
  }

  if (target === 'distributed') {
    return `# Launch Pummel Distributed Coordinator with Ratatui TUI
pummel run pummel.yaml \\
  --mode distributed \\
  --role coordinator \\
  --coordinator-bind ${normalized.distributed.coordinatorBind} \\
  --quorum ${normalized.distributed.quorumWorkers} \\
  --shard-strategy ${normalized.distributed.shardStrategy} \\
  --tui

# Attach Worker Nodes (run on each load-gen host)
pummel worker join \\
  --coordinator ${normalized.distributed.coordinatorBind} \\
  --tls ${normalized.distributed.tlsMode} \\
  --heartbeat-ms ${normalized.distributed.heartbeatIntervalMs}`;
  }

  return serializeConfig(normalized, 'yaml');
}

export function importExternalSpec(
  rawInput: string
): { detectedFormat: 'postman' | 'har' | 'openapi' | 'unknown'; yaml: string; summary: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      detectedFormat: 'unknown',
      yaml: '',
      summary: 'Input is empty.',
    };
  }

  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    if (json.log && typeof json.log === 'object') {
      const entries = ((json.log as { entries?: { request?: { method?: string; url?: string } }[] }).entries ?? [])
        .filter((e) => {
          const url = e.request?.url ?? '';
          return !/\.(png|jpg|jpeg|svg|css|woff2?|ico)(\?|$)/i.test(url);
        });
      const yaml = [
        'name: "Imported HAR Scenario"',
        'execution:',
        '  - scenario: har_replay',
        '    concurrency: 100',
        '    ramp-up: 10s',
        '    hold-for: 30s',
        'scenarios:',
        '  har_replay:',
        '    requests:',
        ...entries.map(
          (e, i) =>
            `      - label: "${e.request?.method ?? 'GET'} #${i + 1}"\n        method: ${e.request?.method ?? 'GET'}\n        protocol: http\n        url: "${e.request?.url ?? 'https://example.internal/'}"`
        ),
      ].join('\n');
      return {
        detectedFormat: 'har',
        yaml,
        summary: `Auto-detected HAR v1.2 (${entries.length} API requests preserved after static-asset filtering).`,
      };
    }

    if (json.info && Array.isArray(json.item)) {
      const items = json.item as { name?: string; request?: { method?: string; url?: string | { raw?: string } } }[];
      const yaml = [
        `name: "${(json.info as { name?: string }).name ?? 'Imported Postman Collection'}"`,
        'execution:',
        '  - scenario: postman_flow',
        '    concurrency: 150',
        '    ramp-up: 15s',
        '    hold-for: 45s',
        'scenarios:',
        '  postman_flow:',
        '    requests:',
        ...items.map((it, i) => {
          const rawUrl =
            typeof it.request?.url === 'string'
              ? it.request.url
              : it.request?.url?.raw ?? 'https://api.example.internal/';
          return `      - label: "${it.name ?? `Request ${i + 1}`}"\n        method: ${it.request?.method ?? 'GET'}\n        protocol: http\n        url: "${rawUrl}"`;
        }),
      ].join('\n');
      return {
        detectedFormat: 'postman',
        yaml,
        summary: `Auto-detected Postman Collection v2.1 (${items.length} request items converted).`,
      };
    }

    if (json.openapi && json.paths && typeof json.paths === 'object') {
      const paths = Object.entries(json.paths as Record<string, Record<string, unknown>>);
      const reqLines: string[] = [];
      for (const [pathStr, methods] of paths) {
        for (const method of Object.keys(methods)) {
          reqLines.push(
            `      - label: "${method.toUpperCase()} ${pathStr}"\n        method: ${method.toUpperCase()}\n        protocol: http\n        url: "https://api.example.internal${pathStr}"`
          );
        }
      }
      return {
        detectedFormat: 'openapi',
        yaml: [
          `name: "${(json.info as { title?: string })?.title ?? 'Imported OpenAPI Spec'}"`,
          'execution:',
          '  - scenario: openapi_suite',
          '    concurrency: 200',
          '    ramp-up: 15s',
          '    hold-for: 60s',
          'scenarios:',
          '  openapi_suite:',
          '    requests:',
          ...reqLines,
        ].join('\n'),
        summary: `Auto-detected OpenAPI ${String(json.openapi)} (${reqLines.length} endpoints converted).`,
      };
    }
  } catch {
    if (/^openapi:\s*3\./m.test(trimmed)) {
      return {
        detectedFormat: 'openapi',
        yaml: `name: "Imported OpenAPI YAML"\nexecution:\n  - scenario: openapi_yaml\n    concurrency: 120\n    ramp-up: 10s\n    hold-for: 30s\nscenarios:\n  openapi_yaml:\n    requests:\n      - label: "GET /v1/health"\n        method: GET\n        protocol: http\n        url: "https://api.example.internal/v1/health"`,
        summary: 'Auto-detected OpenAPI 3.x YAML specification.',
      };
    }
  }

  return {
    detectedFormat: 'unknown',
    yaml: '',
    summary: 'Unrecognized specification format. Provide Postman v2.1 JSON, HAR v1.2 JSON, or OpenAPI 3.0 JSON/YAML.',
  };
}

export function generateJunitXml(state: DistributedRunState, suiteName: string): string {
  const escapedSuite = xmlEscape(suiteName);
  const failures = state.slaResults.filter((r) => r.breached).length;
  const cases = state.slaResults
    .map((res) => {
      const name = xmlEscape(
        `${res.criterion.subject ?? 'global'} :: ${res.criterion.metric} ${res.criterion.comparator} ${res.criterion.threshold}${res.criterion.unit}`
      );
      if (res.breached) {
        const msg = xmlEscape(
          `SLA breached: observed ${res.currentValue}${res.criterion.unit} (action=${res.criterion.action})`
        );
        return `  <testcase classname="pummel.sla" name="${name}" time="${state.elapsedSec}">\n    <failure message="${msg}" type="SlaBreach"/>\n  </testcase>`;
      }
      return `  <testcase classname="pummel.sla" name="${name}" time="${state.elapsedSec}"/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${escapedSuite}" tests="${state.slaResults.length}" failures="${failures}" time="${state.elapsedSec}">
${cases}
</testsuite>`;
}
