import type {
  ConfigFormat,
  DistributedRunState,
  PummelConfig,
  ScenarioConfig,
  ValidationDiagnostic,
} from '../../types/pummel';

export function createDefaultPresetConfig(): PummelConfig {
  return {
    name: 'Distributed Checkout & gRPC Fulfillment',
    execution: [
      {
        scenario: 'auth.checkout',
        concurrency: 600,
        rampUpSec: 15,
        holdForSec: 45,
        pacing: {
          rate: 1800,
          per: 'second',
          randomize: true,
        },
      },
    ],
    scenarios: {
      auth: {
        name: 'auth',
        weight: 1,
        thinkTimeMs: 120,
        onStart: [],
        requests: [
          {
            label: 'POST /v1/auth/session',
            url: 'https://api.storefront.internal/v1/auth/session',
            method: 'POST',
            protocol: 'http',
            timeoutMs: 1500,
            body: '{"email":"${faker.email}","trace_id":"${uuid}"}',
            assertions: ['http-code == 200', 'body contains "session_token"'],
            extractors: ['jsonpath: $.session_token -> token'],
          },
        ],
        dataSources: [
          {
            path: 'data/users.csv',
            delimiter: ',',
            quoted: true,
            loopData: true,
            ordered: false,
            estimatedSizeBytes: 2_400_000,
          },
        ],
      },
      'auth.checkout': {
        name: 'auth.checkout',
        weight: 3,
        thinkTimeMs: 200,
        onStart: [],
        requests: [
          {
            label: 'gRPC OrderService/ReserveInventory',
            url: 'grpc://inventory.internal:50051/orders.OrderService/ReserveInventory',
            method: 'POST',
            protocol: 'grpc',
            grpcMode: 'unary',
            timeoutMs: 800,
            body: '{"sku":"${sku}","qty":1}',
            assertions: ['grpc-status == OK'],
          },
          {
            label: 'POST /v1/checkout/commit',
            url: 'https://api.storefront.internal/v1/checkout/commit',
            method: 'POST',
            protocol: 'http',
            timeoutMs: 2000,
            body: '{"session":"${token}","currency":"USD"}',
            assertions: ['http-code == 201', 'not body contains "DECLINED"'],
            condition: 'token != ""',
          },
          {
            label: 'WS /v1/orders/stream',
            url: 'wss://stream.storefront.internal/v1/orders/stream',
            method: 'GET',
            protocol: 'websocket',
            timeoutMs: 1200,
            assertions: ['frame contains "CONFIRMED"'],
          },
        ],
        dataSources: [
          {
            path: 'data/skus.csv',
            delimiter: ',',
            quoted: true,
            loopData: true,
            ordered: true,
            estimatedSizeBytes: 840_000,
          },
        ],
      },
    },
    distributed: {
      enabled: true,
      coordinatorBind: '127.0.0.1:50051',
      quorumWorkers: 2,
      shardStrategy: 'weighted-capacity',
      heartbeatIntervalMs: 1000,
      telemetryFlushMs: 500,
      tlsMode: 'mtls',
      tuiEnabled: true,
    },
    sla: [
      {
        id: 'sla-p95',
        metric: 'p95-response-time',
        comparator: '>',
        threshold: 180,
        unit: 'ms',
        action: 'warn',
      },
      {
        id: 'sla-fail-rate',
        metric: 'fail-rate',
        comparator: '>',
        threshold: 3.5,
        unit: '%',
        action: 'stop',
      },
      {
        id: 'sla-grpc-p99',
        metric: 'p99-response-time',
        comparator: '>',
        threshold: 250,
        unit: 'ms',
        subject: 'gRPC OrderService/ReserveInventory',
        action: 'exec:./scripts/scale-inventory.sh --replicas=6',
      },
    ],
    services: [
      {
        phase: 'prepare',
        name: 'Verify Toxiproxy Sidecar',
        command: 'toxiproxy-cli list --host 127.0.0.1:8474',
        platform: 'unix',
      },
      {
        phase: 'startup',
        name: 'Warm Cache & Seed Feature Flags',
        command: './scripts/warm-edge-cache.sh --env staging',
        platform: 'unix',
      },
      {
        phase: 'shutdown',
        name: 'Remove Toxiproxy Faults & Flush Metrics',
        command: 'toxiproxy-cli toxic remove --all && ./scripts/flush-influx.sh',
        platform: 'unix',
      },
    ],
    api: {
      enabled: true,
      bindAddress: '127.0.0.1',
      port: 8089,
    },
    reporting: ['cli', 'junit-xml', 'html', 'influxdb'],
  };
}

export function serializeConfig(config: PummelConfig, format: ConfigFormat): string {
  if (format === 'json') {
    return JSON.stringify(config, null, 2);
  }

  if (format === 'toml') {
    const exec = config.execution[0];
    const lines: string[] = [
      `name = "${config.name}"`,
      '',
      '[distributed]',
      `enabled = ${config.distributed.enabled}`,
      `coordinator_bind = "${config.distributed.coordinatorBind}"`,
      `quorum_workers = ${config.distributed.quorumWorkers}`,
      `shard_strategy = "${config.distributed.shardStrategy}"`,
      `heartbeat_interval_ms = ${config.distributed.heartbeatIntervalMs}`,
      `tls_mode = "${config.distributed.tlsMode}"`,
      `tui_enabled = ${config.distributed.tuiEnabled}`,
      '',
      '[[execution]]',
      `scenario = "${exec?.scenario ?? 'default'}"`,
      `concurrency = ${exec?.concurrency ?? 200}`,
      `ramp-up = "${exec?.rampUpSec ?? 15}s"`,
      `hold-for = "${exec?.holdForSec ?? 45}s"`,
      '',
      '[api]',
      `enabled = ${config.api.enabled}`,
      `bind_address = "${config.api.bindAddress}"`,
      `port = ${config.api.port}`,
    ];

    for (const [name, sc] of Object.entries(config.scenarios)) {
      lines.push('', `[scenarios."${name}"]`);
      lines.push(`weight = ${sc.weight}`);
      lines.push(`think_time_ms = ${sc.thinkTimeMs}`);
      for (const req of sc.requests) {
        lines.push(`  [[scenarios."${name}".requests]]`);
        lines.push(`  label = "${req.label}"`);
        lines.push(`  method = "${req.method}"`);
        lines.push(`  protocol = "${req.protocol}"`);
        lines.push(`  url = "${req.url}"`);
      }
    }

    for (const sla of config.sla) {
      lines.push('', '[[sla]]');
      lines.push(`metric = "${sla.metric}"`);
      lines.push(`comparator = "${sla.comparator}"`);
      lines.push(`threshold = ${sla.threshold}`);
      lines.push(`action = "${sla.action}"`);
      if (sla.subject) lines.push(`subject = "${sla.subject}"`);
    }

    return lines.join('\n');
  }

  // YAML serialization
  const lines: string[] = [
    `name: "${config.name}"`,
    'distributed:',
    `  enabled: ${config.distributed.enabled}`,
    `  coordinator-bind: "${config.distributed.coordinatorBind}"`,
    `  quorum-workers: ${config.distributed.quorumWorkers}`,
    `  shard-strategy: ${config.distributed.shardStrategy}`,
    `  heartbeat-interval-ms: ${config.distributed.heartbeatIntervalMs}`,
    `  tls-mode: ${config.distributed.tlsMode}`,
    `  tui-enabled: ${config.distributed.tuiEnabled}`,
    'execution:',
  ];

  for (const exec of config.execution) {
    lines.push(`  - scenario: ${exec.scenario}`);
    lines.push(`    concurrency: ${exec.concurrency}`);
    lines.push(`    ramp-up: ${exec.rampUpSec}s`);
    lines.push(`    hold-for: ${exec.holdForSec}s`);
    if (exec.pacing) {
      lines.push('    pacing:');
      lines.push(`      rate: ${exec.pacing.rate}`);
      lines.push(`      per: ${exec.pacing.per}`);
      lines.push(`      randomize: ${exec.pacing.randomize}`);
    }
  }

  lines.push('scenarios:');
  for (const [name, sc] of Object.entries(config.scenarios)) {
    lines.push(`  ${name}:`);
    lines.push(`    weight: ${sc.weight}`);
    lines.push(`    think-time: ${sc.thinkTimeMs}ms`);
    if (sc.dataSources.length > 0) {
      lines.push('    data-sources:');
      for (const ds of sc.dataSources) {
        lines.push(`      - path: "${ds.path}"`);
        lines.push(`        delimiter: "${ds.delimiter ?? ','}"`);
        lines.push(`        loop: ${ds.loopData ?? true}`);
      }
    }
    if (sc.onStart.length > 0) {
      lines.push('    on_start:');
      for (const r of sc.onStart) {
        lines.push(`      - label: "${r.label}"`);
        lines.push(`        protocol: ${r.protocol}`);
        lines.push(`        url: "${r.url}"`);
      }
    }
    lines.push('    requests:');
    for (const r of sc.requests) {
      lines.push(`      - label: "${r.label}"`);
      lines.push(`        method: ${r.method}`);
      lines.push(`        protocol: ${r.protocol}`);
      lines.push(`        url: "${r.url}"`);
      if (r.body) lines.push(`        body: '${r.body}'`);
      if (r.bodyFile) lines.push(`        body-file: "${r.bodyFile}"`);
    }
  }

  lines.push('sla:');
  for (const s of config.sla) {
    lines.push(`  - metric: ${s.metric}`);
    lines.push(`    condition: "${s.comparator} ${s.threshold}${s.unit}"`);
    if (s.subject) lines.push(`    subject: "${s.subject}"`);
    lines.push(`    action: "${s.action}"`);
  }

  lines.push('api:');
  lines.push(`  enabled: ${config.api.enabled}`);
  lines.push(`  bind-address: "${config.api.bindAddress}"`);
  lines.push(`  port: ${config.api.port}`);

  lines.push('reporting:');
  for (const r of config.reporting) {
    lines.push(`  - module: ${r}`);
  }

  return lines.join('\n');
}
