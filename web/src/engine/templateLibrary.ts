import type { PummelConfig } from '../types/pummel';
import { createDefaultPresetConfig } from './configEngine';

export type LoadTestPattern = 'smoke' | 'spike' | 'stress' | 'load' | 'chaos';

export interface LoadTestTemplate {
  id: string;
  pattern: LoadTestPattern;
  name: string;
  summary: string;
  concurrency: number;
  durationSec: number;
  quorumWorkers: number;
  protocols: ('HTTP' | 'gRPC' | 'WS')[];
  buildConfig: () => PummelConfig;
}

export const LOAD_TEST_TEMPLATES: readonly LoadTestTemplate[] = [
  {
    id: 'smoke',
    pattern: 'smoke',
    name: 'Smoke Verification',
    summary: 'Low-concurrency sanity check validating endpoints, extractors, and zero-error assertions.',
    concurrency: 20,
    durationSec: 25,
    quorumWorkers: 1,
    protocols: ['HTTP', 'gRPC'],
    buildConfig: () => {
      const base = createDefaultPresetConfig();
      base.name = 'Smoke Verification Suite';
      base.execution = [
        {
          scenario: 'smoke_health',
          concurrency: 20,
          rampUpSec: 5,
          holdForSec: 20,
          pacing: { rate: 60, per: 'second', randomize: false },
        },
      ];
      base.scenarios = {
        smoke_health: {
          name: 'smoke_health',
          weight: 1,
          thinkTimeMs: 250,
          onStart: [],
          requests: [
            {
              label: 'GET /v1/health/ready',
              url: 'https://api.storefront.internal/v1/health/ready',
              method: 'GET',
              protocol: 'http',
              timeoutMs: 800,
              assertions: ['http-code == 200', 'body contains "ok"'],
            },
            {
              label: 'gRPC Health/Check',
              url: 'grpc://inventory.internal:50051/grpc.health.v1.Health/Check',
              method: 'POST',
              protocol: 'grpc',
              grpcMode: 'unary',
              timeoutMs: 500,
              body: '{"service":"inventory"}',
              assertions: ['grpc-status == OK'],
            },
          ],
          dataSources: [],
        },
      };
      base.distributed.quorumWorkers = 1;
      base.sla = [
        {
          id: 'smoke-fail',
          metric: 'fail-rate',
          comparator: '>',
          threshold: 0.5,
          unit: '%',
          action: 'stop',
        },
        {
          id: 'smoke-p95',
          metric: 'p95-response-time',
          comparator: '>',
          threshold: 120,
          unit: 'ms',
          action: 'warn',
        },
      ];
      base.services = [];
      return base;
    },
  },
  {
    id: 'spike',
    pattern: 'spike',
    name: 'Traffic Spike Surge',
    summary: 'Sudden 1,400 VU flash-sale burst with 8s ramp-up and automated horizontal scale-out hook.',
    concurrency: 1400,
    durationSec: 48,
    quorumWorkers: 3,
    protocols: ['HTTP', 'gRPC', 'WS'],
    buildConfig: () => {
      const base = createDefaultPresetConfig();
      base.name = 'Flash-Sale Spike Surge (1,400 VUs)';
      base.execution = [
        {
          scenario: 'auth.checkout',
          concurrency: 1400,
          rampUpSec: 8,
          holdForSec: 40,
          pacing: { rate: 3200, per: 'second', randomize: true },
        },
      ];
      base.distributed.quorumWorkers = 3;
      base.distributed.shardStrategy = 'weighted-capacity';
      base.sla = [
        {
          id: 'spike-p95',
          metric: 'p95-response-time',
          comparator: '>',
          threshold: 220,
          unit: 'ms',
          action: 'warn',
        },
        {
          id: 'spike-fail',
          metric: 'fail-rate',
          comparator: '>',
          threshold: 4.0,
          unit: '%',
          action: 'stop',
        },
        {
          id: 'spike-autoscale',
          metric: 'p99-response-time',
          comparator: '>',
          threshold: 300,
          unit: 'ms',
          subject: 'gRPC OrderService/ReserveInventory',
          action: 'exec:./scripts/scale-inventory.sh --replicas=12',
        },
      ];
      return base;
    },
  },
  {
    id: 'stress',
    pattern: 'stress',
    name: 'Breaking-Point Stress',
    summary: 'Sustained 2,200 VU saturation ramp to uncover tail-latency cliffs and connection pool exhaustion.',
    concurrency: 2200,
    durationSec: 120,
    quorumWorkers: 3,
    protocols: ['HTTP', 'gRPC', 'WS'],
    buildConfig: () => {
      const base = createDefaultPresetConfig();
      base.name = 'Saturation Stress Envelope (2,200 VUs)';
      base.execution = [
        {
          scenario: 'auth.checkout',
          concurrency: 2200,
          rampUpSec: 30,
          holdForSec: 90,
        },
      ];
      base.distributed.quorumWorkers = 3;
      base.distributed.shardStrategy = 'weighted-capacity';
      base.sla = [
        {
          id: 'stress-p99',
          metric: 'p99-response-time',
          comparator: '>',
          threshold: 450,
          unit: 'ms',
          action: 'warn',
        },
        {
          id: 'stress-fail',
          metric: 'fail-rate',
          comparator: '>',
          threshold: 5.0,
          unit: '%',
          action: 'stop',
        },
      ];
      return base;
    },
  },
  {
    id: 'load',
    pattern: 'load',
    name: 'Steady Load Baseline',
    summary: 'Nominal 600 VU checkout & gRPC fulfillment profile with dot-notation inheritance and pacing.',
    concurrency: 600,
    durationSec: 60,
    quorumWorkers: 2,
    protocols: ['HTTP', 'gRPC', 'WS'],
    buildConfig: () => createDefaultPresetConfig(),
  },
  {
    id: 'chaos',
    pattern: 'chaos',
    name: 'Chaos Fault Injection',
    summary: '400 VU Toxiproxy resilience test with ordered prepare/startup/shutdown hooks and guaranteed teardown.',
    concurrency: 400,
    durationSec: 55,
    quorumWorkers: 2,
    protocols: ['HTTP', 'gRPC'],
    buildConfig: () => {
      const base = createDefaultPresetConfig();
      base.name = 'Toxiproxy Chaos Resilience';
      base.execution = [
        {
          scenario: 'auth.checkout',
          concurrency: 400,
          rampUpSec: 10,
          holdForSec: 45,
          pacing: { rate: 1100, per: 'second', randomize: true },
        },
      ];
      base.distributed.quorumWorkers = 2;
      base.services = [
        {
          phase: 'prepare',
          name: 'Create Toxiproxy Upstream Proxy',
          command: 'toxiproxy-cli create inventory_grpc -l 127.0.0.1:25051 -u 10.42.0.9:50051',
          platform: 'unix',
        },
        {
          phase: 'startup',
          name: 'Inject 120ms Latency + 20ms Jitter Toxic',
          command: 'toxiproxy-cli toxic add -t latency -a latency=120 -a jitter=20 inventory_grpc',
          platform: 'unix',
        },
        {
          phase: 'shutdown',
          name: 'Remove All Toxics & Verify Recovery',
          command: 'toxiproxy-cli toxic remove --all && ./scripts/verify-recovery.sh',
          platform: 'unix',
        },
      ];
      return base;
    },
  },
];

export function filterLoadTestTemplates(
  templates: readonly LoadTestTemplate[],
  pattern: LoadTestPattern | 'all'
): LoadTestTemplate[] {
  if (pattern === 'all') return [...templates];
  return templates.filter((t) => t.pattern === pattern);
}

export function getTemplateById(id: string): LoadTestTemplate | undefined {
  return LOAD_TEST_TEMPLATES.find((t) => t.id === id);
}
