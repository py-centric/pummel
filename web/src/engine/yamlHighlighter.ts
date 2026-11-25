export type HighlightTokenType =
  | 'plain'
  | 'comment'
  | 'keyword'
  | 'key'
  | 'punctuation'
  | 'string'
  | 'macro'
  | 'number'
  | 'boolean'
  | 'protocol';

export interface HighlightToken {
  type: HighlightTokenType;
  text: string;
}

const TOP_LEVEL_DIRECTIVES = new Set([
  'name',
  'execution',
  'scenarios',
  'distributed',
  'sla',
  'services',
  'api',
  'reporting',
  'modules',
  'requests',
  'on_start',
  'data-sources',
  'pacing',
]);

const PROTOCOL_WORDS = new Set(['http', 'https', 'grpc', 'websocket', 'ws', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'mtls', 'tls']);

function tokenizeStringWithMacros(raw: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const macroRegex = /\$\{[^}]+\}/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null = macroRegex.exec(raw);

  while (match !== null) {
    if (match.index > lastIdx) {
      tokens.push({ type: 'string', text: raw.slice(lastIdx, match.index) });
    }
    tokens.push({ type: 'macro', text: match[0] });
    lastIdx = match.index + match[0].length;
    match = macroRegex.exec(raw);
  }

  if (lastIdx < raw.length) {
    tokens.push({ type: 'string', text: raw.slice(lastIdx) });
  }

  return tokens;
}

function tokenizeValueSegment(segment: string): HighlightToken[] {
  if (!segment) return [];

  // Split trailing inline comment outside quotes
  let inSingle = false;
  let inDouble = false;
  let commentIdx = -1;
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(segment[i - 1]))) {
      commentIdx = i;
      break;
    }
  }

  const valuePart = commentIdx >= 0 ? segment.slice(0, commentIdx) : segment;
  const commentPart = commentIdx >= 0 ? segment.slice(commentIdx) : '';

  const tokens: HighlightToken[] = [];
  const leadMatch = /^(\s*)(.*?)(\s*)$/.exec(valuePart);
  const leadingSpace = leadMatch?.[1] ?? '';
  const core = leadMatch?.[2] ?? valuePart;
  const trailingSpace = leadMatch?.[3] ?? '';

  if (leadingSpace) tokens.push({ type: 'plain', text: leadingSpace });

  if (core) {
    if (
      (core.startsWith('"') && core.endsWith('"') && core.length >= 2) ||
      (core.startsWith("'") && core.endsWith("'") && core.length >= 2)
    ) {
      tokens.push(...tokenizeStringWithMacros(core));
    } else if (/^(true|false|null)$/i.test(core)) {
      tokens.push({ type: 'boolean', text: core });
    } else if (/^-?\d+(\.\d+)?(ms|s|m|h|%|rps)?$/i.test(core)) {
      tokens.push({ type: 'number', text: core });
    } else if (PROTOCOL_WORDS.has(core)) {
      tokens.push({ type: 'protocol', text: core });
    } else if (core.includes('${')) {
      tokens.push(...tokenizeStringWithMacros(core));
    } else if (/^[\[{}\],]+$/.test(core)) {
      tokens.push({ type: 'punctuation', text: core });
    } else {
      tokens.push({ type: 'plain', text: core });
    }
  }

  if (trailingSpace) tokens.push({ type: 'plain', text: trailingSpace });
  if (commentPart) tokens.push({ type: 'comment', text: commentPart });

  return tokens;
}

/**
 * Tokenizes a single line of YAML, TOML, or JSON load-test specification.
 * Guarantees exact round-trip text preservation: tokens.map(t => t.text).join('') === line.
 */
export function tokenizeSpecLine(line: string): HighlightToken[] {
  if (line.length === 0) {
    return [{ type: 'plain', text: '' }];
  }

  const trimmed = line.trimStart();
  const indentLen = line.length - trimmed.length;
  const indent = line.slice(0, indentLen);

  // Full-line comment
  if (trimmed.startsWith('#')) {
    const out: HighlightToken[] = [];
    if (indent) out.push({ type: 'plain', text: indent });
    out.push({ type: 'comment', text: trimmed });
    return out;
  }

  // TOML table headers: [distributed], [[execution]]
  if (/^\[\[?[^\]]+\]\]?$/.test(trimmed)) {
    const out: HighlightToken[] = [];
    if (indent) out.push({ type: 'plain', text: indent });
    out.push({ type: 'keyword', text: trimmed });
    return out;
  }

  // YAML list prefix "- " followed by optional key: value or bare value
  const listMatch = /^(\s*)(-\s+)(.*)$/.exec(line);
  if (listMatch) {
    const [, listIndent, bullet, rest] = listMatch;
    const out: HighlightToken[] = [];
    if (listIndent) out.push({ type: 'plain', text: listIndent });
    out.push({ type: 'punctuation', text: bullet });

    const kvInList = /^([a-zA-Z0-9_.-]+)(\s*:\s*)(.*)$/.exec(rest);
    if (kvInList) {
      const [, keyName, sep, val] = kvInList;
      out.push({
        type: TOP_LEVEL_DIRECTIVES.has(keyName) ? 'keyword' : 'key',
        text: keyName,
      });
      out.push({ type: 'punctuation', text: sep });
      out.push(...tokenizeValueSegment(val));
      return out;
    }

    out.push(...tokenizeValueSegment(rest));
    return out;
  }

  // JSON quoted key: value
  const jsonKvMatch = /^(\s*)("[^"]+")(\s*:\s*)(.*)$/.exec(line);
  if (jsonKvMatch) {
    const [, jIndent, quotedKey, sep, val] = jsonKvMatch;
    const rawKey = quotedKey.slice(1, -1);
    const out: HighlightToken[] = [];
    if (jIndent) out.push({ type: 'plain', text: jIndent });
    out.push({
      type: TOP_LEVEL_DIRECTIVES.has(rawKey) ? 'keyword' : 'key',
      text: quotedKey,
    });
    out.push({ type: 'punctuation', text: sep });
    // Preserve trailing comma in JSON lines cleanly
    if (val.endsWith(',')) {
      out.push(...tokenizeValueSegment(val.slice(0, -1)));
      out.push({ type: 'punctuation', text: ',' });
    } else {
      out.push(...tokenizeValueSegment(val));
    }
    return out;
  }

  // YAML key: value OR TOML key = value
  const kvMatch = /^(\s*)([a-zA-Z0-9_.-]+)(\s*[:=]\s*)(.*)$/.exec(line);
  if (kvMatch) {
    const [, kIndent, keyName, sep, val] = kvMatch;
    const out: HighlightToken[] = [];
    if (kIndent) out.push({ type: 'plain', text: kIndent });
    out.push({
      type: TOP_LEVEL_DIRECTIVES.has(keyName) ? 'keyword' : 'key',
      text: keyName,
    });
    out.push({ type: 'punctuation', text: sep });
    out.push(...tokenizeValueSegment(val));
    return out;
  }

  return tokenizeValueSegment(line);
}

export function tokenizeSpecDocument(content: string): HighlightToken[][] {
  return content.split('\n').map(tokenizeSpecLine);
}
