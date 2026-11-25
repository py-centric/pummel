import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeSpecDocument, tokenizeSpecLine } from './yamlHighlighter';

test('tokenizeSpecLine preserves exact round-trip text across YAML, TOML, and JSON lines', () => {
  const sampleLines = [
    'name: "Distributed Checkout & gRPC Fulfillment"',
    'execution:',
    '  - scenario: auth.checkout',
    '    concurrency: 600',
    '    ramp-up: 15s # gradual ramp',
    '    body: \'{"email":"${faker.email}","trace_id":"${uuid}"}\'',
    '    protocol: grpc',
    '    randomize: true',
    '# Full line comment',
    '[distributed]',
    '  "quorumWorkers": 2,',
    '',
  ];

  for (const line of sampleLines) {
    const tokens = tokenizeSpecLine(line);
    const reconstructed = tokens.map((t) => t.text).join('');
    assert.equal(reconstructed, line);
  }
});

test('tokenizeSpecLine classifies keywords, macros, numbers, protocols, booleans, and comments accurately', () => {
  const dirTokens = tokenizeSpecLine('execution:');
  assert.equal(dirTokens[0].type, 'keyword');
  assert.equal(dirTokens[0].text, 'execution');

  const macroTokens = tokenizeSpecLine('        body: \'{"email":"${faker.email}","id":"${uuid}"}\'');
  const macros = macroTokens.filter((t) => t.type === 'macro').map((t) => t.text);
  assert.deepEqual(macros, ['${faker.email}', '${uuid}']);

  const numAndComment = tokenizeSpecLine('    ramp-up: 15s # warmup window');
  assert.ok(numAndComment.some((t) => t.type === 'number' && t.text === '15s'));
  assert.ok(numAndComment.some((t) => t.type === 'comment' && t.text === '# warmup window'));

  const protoTokens = tokenizeSpecLine('        protocol: grpc');
  assert.ok(protoTokens.some((t) => t.type === 'protocol' && t.text === 'grpc'));

  const boolTokens = tokenizeSpecLine('  enabled: true');
  assert.ok(boolTokens.some((t) => t.type === 'boolean' && t.text === 'true'));
});

test('tokenizeSpecDocument splits multi-line specs preserving line count', () => {
  const doc = 'name: "Demo"\nexecution:\n  - concurrency: 200';
  const rows = tokenizeSpecDocument(doc);
  assert.equal(rows.length, 3);
});
