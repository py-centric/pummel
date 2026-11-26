import { useEffect, useState } from 'react';
import {
  createSnapshotRecord,
  deleteConfigSnapshot,
  listConfigSnapshots,
  saveConfigSnapshot,
  sortSnapshotsNewestFirst,
  type ConfigSnapshot,
} from '../../engine/snapshotStore';
import {
  applyCliOverrides,
  createDefaultPresetConfig,
  parseRawConfigCheck,
  runDryRunValidation,
  serializeConfig,
} from '../../engine/configEngine';
import { getTemplateById } from '../../engine/templateLibrary';
import type { ConfigFormat, PummelConfig, ValidationDiagnostic } from '../../types/pummel';

interface UseWorkspaceSnapshotsParams {
  draftConfig: PummelConfig;
  format: ConfigFormat;
  rawText: string;
  onApplyRestored: (next: {
    format: ConfigFormat;
    rawText: string;
    config: PummelConfig;
    parseError: string | null;
    diagnostics: ValidationDiagnostic[];
    statusMessage: string;
  }) => void;
  onParsedDraft: (next: {
    config: PummelConfig;
    parseError: string | null;
    statusMessage: string;
  }) => void;
  onStatusMessage: (message: string) => void;
}

export function useWorkspaceSnapshots({
  draftConfig,
  format,
  rawText,
  onApplyRestored,
  onParsedDraft,
  onStatusMessage,
}: UseWorkspaceSnapshotsParams) {
  const [snapshots, setSnapshots] = useState<ConfigSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBaseId, setCompareBaseId] = useState<string | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listConfigSnapshots()
      .then((items) => {
        if (!active) return;
        setSnapshots(items);
        if (items.length >= 2) {
          setCompareBaseId(items[1].id);
          setCompareTargetId(items[0].id);
        } else if (items.length === 1) {
          setCompareBaseId(items[0].id);
          setCompareTargetId(items[0].id);
        }
        setSnapshotError(null);
      })
      .catch((err) => {
        if (!active) return;
        setSnapshotError(
          err instanceof Error ? err.message : 'Unable to access IndexedDB snapshots.'
        );
      })
      .finally(() => {
        if (active) setSnapshotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSaveSnapshot = async (customLabel = '') => {
    try {
      const parsed = parseRawConfigCheck(rawText, format, draftConfig);
      const record = createSnapshotRecord({
        label: customLabel,
        config: parsed.config,
        format,
        rawText,
      });
      await saveConfigSnapshot(record);
      setSnapshots((prev) => {
        const next = sortSnapshotsNewestFirst([record, ...prev]);
        if (next.length >= 2) {
          setCompareBaseId((currBase) => currBase ?? next[1].id);
          setCompareTargetId(record.id);
        } else {
          setCompareBaseId(record.id);
          setCompareTargetId(record.id);
        }
        return next;
      });
      setActiveSnapshotId(record.id);
      setSnapshotError(null);
      onParsedDraft({
        config: parsed.config,
        parseError: parsed.parseError ?? null,
        statusMessage: `Saved snapshot "${record.label}" (${record.format.toUpperCase()} · ${record.concurrency.toLocaleString()} VUs) to IndexedDB.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save snapshot to IndexedDB.';
      setSnapshotError(msg);
      onStatusMessage(msg);
    }
  };

  const handleRestoreSnapshot = (snapshot: ConfigSnapshot) => {
    const parsed = parseRawConfigCheck(snapshot.rawText, snapshot.format, draftConfig);
    setActiveSnapshotId(snapshot.id);
    onApplyRestored({
      format: snapshot.format,
      rawText: snapshot.rawText,
      config: parsed.config,
      parseError: parsed.parseError ?? null,
      diagnostics: runDryRunValidation(parsed.config, snapshot.rawText, parsed.unknownFields),
      statusMessage: `Restored snapshot "${snapshot.label}" (${snapshot.format.toUpperCase()} · ${snapshot.concurrency.toLocaleString()} VUs).`,
    });
  };

  const handleDeleteSnapshot = async (id: string) => {
    try {
      const target = snapshots.find((s) => s.id === id);
      await deleteConfigSnapshot(id);
      setSnapshots((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (compareBaseId === id) {
          setCompareBaseId(next[1]?.id ?? next[0]?.id ?? null);
        }
        if (compareTargetId === id) {
          setCompareTargetId(next[0]?.id ?? null);
        }
        return next;
      });
      if (activeSnapshotId === id) {
        setActiveSnapshotId(null);
      }
      setSnapshotError(null);
      if (target) {
        onStatusMessage(`Deleted snapshot "${target.label}" from IndexedDB.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete snapshot from IndexedDB.';
      setSnapshotError(msg);
    }
  };

  const handleToggleCompare = () => {
    setCompareOpen((prev) => {
      const nextOpen = !prev;
      if (nextOpen && snapshots.length >= 2) {
        setCompareBaseId((curr) =>
          curr && snapshots.some((s) => s.id === curr) ? curr : snapshots[1].id
        );
        setCompareTargetId((curr) =>
          curr && snapshots.some((s) => s.id === curr) ? curr : snapshots[0].id
        );
      }
      return nextOpen;
    });
  };

  const handleCompareSnapshot = (id: string) => {
    setCompareOpen(true);
    if (!compareBaseId || compareBaseId === id) {
      const fallbackOther = snapshots.find((s) => s.id !== id)?.id ?? id;
      setCompareBaseId(fallbackOther);
      setCompareTargetId(id);
    } else {
      setCompareTargetId(id);
    }
  };

  const handleSwapCompareSides = () => {
    setCompareBaseId(compareTargetId);
    setCompareTargetId(compareBaseId);
  };

  const handleSeedComparisonPair = async () => {
    try {
      const baseCfg = createDefaultPresetConfig();
      const baseRecord = createSnapshotRecord({
        label: 'Baseline 600 VU',
        config: baseCfg,
        format: 'yaml',
        rawText: serializeConfig(baseCfg, 'yaml'),
        now: new Date(Date.now() - 1000),
      });

      const spikeTemplate = getTemplateById('spike');
      const spikeCfg = spikeTemplate
        ? spikeTemplate.buildConfig()
        : applyCliOverrides(baseCfg, ['execution.0.concurrency=1400']);
      const spikeRecord = createSnapshotRecord({
        label: 'Spike 1,400 VU',
        config: spikeCfg,
        format: 'yaml',
        rawText: serializeConfig(spikeCfg, 'yaml'),
        now: new Date(),
      });

      await saveConfigSnapshot(baseRecord);
      await saveConfigSnapshot(spikeRecord);

      setSnapshots((prev) => sortSnapshotsNewestFirst([spikeRecord, baseRecord, ...prev]));
      setCompareBaseId(baseRecord.id);
      setCompareTargetId(spikeRecord.id);
      setCompareOpen(true);
      setSnapshotError(null);
      onStatusMessage(
        'Saved "Baseline 600 VU" and "Spike 1,400 VU" snapshots to IndexedDB for side-by-side comparison.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to seed comparison snapshots.';
      setSnapshotError(msg);
    }
  };

  return {
    snapshots,
    activeSnapshotId,
    snapshotsLoading,
    snapshotError,
    compareOpen,
    compareBaseId,
    compareTargetId,
    setCompareOpen,
    setCompareBaseId,
    setCompareTargetId,
    handleSaveSnapshot,
    handleRestoreSnapshot,
    handleDeleteSnapshot,
    handleToggleCompare,
    handleCompareSnapshot,
    handleSwapCompareSides,
    handleSeedComparisonPair,
  };
}
