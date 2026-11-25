import React, { useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { ConfigFormat } from '../types/pummel';
import { tokenizeSpecDocument, type HighlightTokenType } from '../engine/yamlHighlighter';

interface YamlCodeEditorProps {
  id: string;
  value: string;
  format: ConfigFormat;
  onChange: (nextValue: string) => void;
  ariaLabel?: string;
}

const TOKEN_CLASSES: Record<HighlightTokenType, string> = {
  plain: 'text-slate-200',
  comment: 'text-slate-500 italic',
  keyword: 'text-orange-400 font-semibold',
  key: 'text-sky-300',
  punctuation: 'text-slate-400',
  string: 'text-emerald-300',
  macro: 'text-amber-300 underline decoration-amber-400/50 underline-offset-2',
  number: 'text-violet-300',
  boolean: 'text-rose-300',
  protocol: 'text-cyan-300 font-medium',
};

const FILE_NAMES: Record<ConfigFormat, string> = {
  yaml: 'pummel.yaml',
  toml: 'pummel.toml',
  json: 'pummel.json',
};

export function YamlCodeEditor({
  id,
  value,
  format,
  onChange,
  ariaLabel = 'Pummel configuration source editor',
}: YamlCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  const highlightedLines = useMemo(() => tokenizeSpecDocument(value), [value]);
  const lineCount = highlightedLines.length;
  const byteSize = useMemo(() => new Blob([value]).size, [value]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const updated = `${value.slice(0, start)}  ${value.slice(end)}`;
    onChange(updated);
    window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = start + 2;
        textareaRef.current.selectionEnd = start + 2;
      }
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-[#0B1120]">
      {/* Code-Block Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-4 py-2 font-mono text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">{FILE_NAMES[format]}</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="tabular-nums">{lineCount} lines</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="tabular-nums">{byteSize.toLocaleString()} B</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-[10px] sm:inline-flex">
            <span className="text-orange-400">directive</span>
            <span className="text-sky-300">field</span>
            <span className="text-amber-300">{'${macro}'}</span>
            <span className="text-violet-300">metric</span>
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-6 items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 text-[11px] font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" aria-hidden="true" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor Surface: Line Gutter + Synchronized Syntax Overlay + Transparent Textarea */}
      <div className="relative flex h-[410px] w-full overflow-hidden">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="w-11 shrink-0 select-none overflow-hidden border-r border-slate-800/90 bg-slate-950/60 py-3 pr-2.5 text-right font-mono text-xs leading-6 tabular-nums text-slate-500"
        >
          {highlightedLines.map((_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>

        <div className="relative flex-1 overflow-hidden">
          <pre
            ref={preRef}
            aria-hidden="true"
            data-testid="yaml-highlighted-code"
            className="pointer-events-none absolute inset-0 m-0 overflow-hidden px-4 py-3 font-mono text-xs leading-6 whitespace-pre"
          >
            <code>
              {highlightedLines.map((tokens, lineIdx) => (
                <div key={lineIdx} className="min-h-6">
                  {tokens.map((tok, tokIdx) => (
                    <span key={tokIdx} className={TOKEN_CLASSES[tok.type]}>
                      {tok.text}
                    </span>
                  ))}
                </div>
              ))}
            </code>
          </pre>

          <label htmlFor={id} className="sr-only">
            {ariaLabel}
          </label>
          <textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            wrap="off"
            className="relative z-10 h-full w-full resize-none overflow-auto bg-transparent px-4 py-3 font-mono text-xs leading-6 whitespace-pre text-transparent caret-orange-400 selection:bg-sky-500/30 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
