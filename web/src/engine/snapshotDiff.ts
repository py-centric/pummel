import type { ConfigSnapshot } from './snapshotStore';

export type DiffRowKind = 'unchanged' | 'modified' | 'added' | 'removed';

export interface SideBySideDiffRow {
  index: number;
  kind: DiffRowKind;
  leftLineNumber: number | null;
  leftText: string | null;
  rightLineNumber: number | null;
  rightText: string | null;
}

export interface SnapshotDiffSummary {
  totalRows: number;
  unchangedCount: number;
  modifiedCount: number;
  addedCount: number;
  removedCount: number;
  changedRowCount: number;
  isIdentical: boolean;
  concurrencyDelta: number;
  scenarioDelta: number;
}

export interface SnapshotDiffResult {
  rows: SideBySideDiffRow[];
  summary: SnapshotDiffSummary;
}

interface RawEditOp {
  type: 'equal' | 'delete' | 'insert';
  leftLineNumber?: number;
  leftText?: string;
  rightLineNumber?: number;
  rightText?: string;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, '\n').split('\n');
}

function computeRawEditOps(leftLines: string[], rightLines: string[]): RawEditOp[] {
  const n = leftLines.length;
  const m = rightLines.length;

  // Standard LCS DP matrix (configs are typically 30-300 lines)
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (leftLines[i] === rightLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        const down = dp[i + 1][j];
        const right = dp[i][j + 1];
        dp[i][j] = down >= right ? down : right;
      }
    }
  }

  const ops: RawEditOp[] = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (leftLines[i] === rightLines[j]) {
      ops.push({
        type: 'equal',
        leftLineNumber: i + 1,
        leftText: leftLines[i],
        rightLineNumber: j + 1,
        rightText: rightLines[j],
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({
        type: 'delete',
        leftLineNumber: i + 1,
        leftText: leftLines[i],
      });
      i++;
    } else {
      ops.push({
        type: 'insert',
        rightLineNumber: j + 1,
        rightText: rightLines[j],
      });
      j++;
    }
  }

  while (i < n) {
    ops.push({
      type: 'delete',
      leftLineNumber: i + 1,
      leftText: leftLines[i],
    });
    i++;
  }

  while (j < m) {
    ops.push({
      type: 'insert',
      rightLineNumber: j + 1,
      rightText: rightLines[j],
    });
    j++;
  }

  return ops;
}

/**
 * Computes an aligned side-by-side diff between two configuration texts or snapshots.
 * Consecutive deleted + inserted blocks are paired 1-to-1 as 'modified' rows so that
 * updated YAML/TOML/JSON fields align horizontally on the same row.
 */
export function buildSideBySideDiff(
  leftInput: Pick<ConfigSnapshot, 'rawText' | 'concurrency' | 'scenarioCount'> | string,
  rightInput: Pick<ConfigSnapshot, 'rawText' | 'concurrency' | 'scenarioCount'> | string
): SnapshotDiffResult {
  const leftText = typeof leftInput === 'string' ? leftInput : leftInput.rawText;
  const rightText = typeof rightInput === 'string' ? rightInput : rightInput.rawText;

  const leftConcurrency = typeof leftInput === 'string' ? 0 : leftInput.concurrency;
  const rightConcurrency = typeof rightInput === 'string' ? 0 : rightInput.concurrency;
  const leftScenarios = typeof leftInput === 'string' ? 0 : leftInput.scenarioCount;
  const rightScenarios = typeof rightInput === 'string' ? 0 : rightInput.scenarioCount;

  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  const ops = computeRawEditOps(leftLines, rightLines);

  const rows: SideBySideDiffRow[] = [];
  let unchangedCount = 0;
  let modifiedCount = 0;
  let addedCount = 0;
  let removedCount = 0;

  let idx = 0;
  while (idx < ops.length) {
    const op = ops[idx];
    if (op.type === 'equal') {
      rows.push({
        index: rows.length,
        kind: 'unchanged',
        leftLineNumber: op.leftLineNumber ?? null,
        leftText: op.leftText ?? '',
        rightLineNumber: op.rightLineNumber ?? null,
        rightText: op.rightText ?? '',
      });
      unchangedCount++;
      idx++;
      continue;
    }

    // Collect contiguous non-equal chunk and pair deletes with inserts
    const deletes: RawEditOp[] = [];
    const inserts: RawEditOp[] = [];
    while (idx < ops.length && ops[idx].type !== 'equal') {
      if (ops[idx].type === 'delete') {
        deletes.push(ops[idx]);
      } else {
        inserts.push(ops[idx]);
      }
      idx++;
    }

    const maxLen = Math.max(deletes.length, inserts.length);
    for (let k = 0; k < maxLen; k++) {
      const del = deletes[k];
      const ins = inserts[k];
      if (del && ins) {
        rows.push({
          index: rows.length,
          kind: 'modified',
          leftLineNumber: del.leftLineNumber ?? null,
          leftText: del.leftText ?? '',
          rightLineNumber: ins.rightLineNumber ?? null,
          rightText: ins.rightText ?? '',
        });
        modifiedCount++;
      } else if (del) {
        rows.push({
          index: rows.length,
          kind: 'removed',
          leftLineNumber: del.leftLineNumber ?? null,
          leftText: del.leftText ?? '',
          rightLineNumber: null,
          rightText: null,
        });
        removedCount++;
      } else if (ins) {
        rows.push({
          index: rows.length,
          kind: 'added',
          leftLineNumber: null,
          leftText: null,
          rightLineNumber: ins.rightLineNumber ?? null,
          rightText: ins.rightText ?? '',
        });
        addedCount++;
      }
    }
  }

  const changedRowCount = modifiedCount + addedCount + removedCount;

  return {
    rows,
    summary: {
      totalRows: rows.length,
      unchangedCount,
      modifiedCount,
      addedCount,
      removedCount,
      changedRowCount,
      isIdentical: changedRowCount === 0,
      concurrencyDelta: rightConcurrency - leftConcurrency,
      scenarioDelta: rightScenarios - leftScenarios,
    },
  };
}

/**
 * Filters side-by-side rows when "Changes Only" mode is active.
 */
export function filterSideBySideRows(
  rows: readonly SideBySideDiffRow[],
  onlyChanges: boolean
): SideBySideDiffRow[] {
  if (!onlyChanges) return [...rows];
  return rows.filter((row) => row.kind !== 'unchanged');
}
