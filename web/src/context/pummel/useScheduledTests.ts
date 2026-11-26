import { useCallback, useEffect, useState } from 'react';
import type { PummelConfig } from '../../types/pummel';
import { parseRawConfigCheck, serializeConfig } from '../../engine/configEngine';
import { getTestClusterById, type TestClusterProfile } from '../../engine/testClusters';
import {
  createScheduledTestTask,
  findDueScheduledTests,
  loadScheduledTestsFromStorage,
  markScheduledTaskExecuted,
  saveScheduledTestsToStorage,
  sortScheduledTests,
  type ScheduledTestTask,
  type ScheduleRecurrence,
} from '../../engine/scheduledTests';

interface UseScheduledTestsParams {
  config: PummelConfig;
  quickRunConfig: (params: {
    nextConfig: PummelConfig;
    clusterId: string;
    rawText?: string;
    unknownFields?: string[];
  }) => TestClusterProfile;
}

export function useScheduledTests({ config, quickRunConfig }: UseScheduledTestsParams) {
  const [scheduledTests, setScheduledTests] = useState<ScheduledTestTask[]>(() =>
    loadScheduledTestsFromStorage()
  );

  useEffect(() => {
    saveScheduledTestsToStorage(scheduledTests);
  }, [scheduledTests]);

  const addScheduledTest = useCallback(
    (input: {
      label: string;
      clusterId: string;
      scheduledAtIso: string;
      recurrence: ScheduleRecurrence;
      specConfig?: PummelConfig;
      rawText?: string;
      format?: 'yaml' | 'json' | 'toml';
    }) => {
      const specCfg = input.specConfig ?? config;
      const fmt = input.format ?? 'yaml';
      const raw = input.rawText ?? serializeConfig(specCfg, fmt);
      const cluster = getTestClusterById(input.clusterId);
      const totalVUs = specCfg.execution.reduce((s, ex) => s + ex.concurrency, 0);
      const task = createScheduledTestTask({
        label: input.label,
        specName: specCfg.name,
        format: fmt,
        rawText: raw,
        concurrency: totalVUs,
        clusterId: cluster.id,
        clusterName: cluster.name,
        scheduledAtIso: input.scheduledAtIso,
        recurrence: input.recurrence,
      });
      setScheduledTests((prev) => sortScheduledTests([task, ...prev]));
      return task;
    },
    [config]
  );

  const toggleScheduledTest = useCallback((taskId: string) => {
    setScheduledTests((prev) =>
      sortScheduledTests(prev.map((t) => (t.id === taskId ? { ...t, enabled: !t.enabled } : t)))
    );
  }, []);

  const removeScheduledTest = useCallback((taskId: string) => {
    setScheduledTests((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const runScheduledTestNow = useCallback(
    (taskId: string): TestClusterProfile | null => {
      const task = scheduledTests.find((t) => t.id === taskId);
      if (!task) return null;
      const parsed = parseRawConfigCheck(task.rawText, task.format, config);
      const cluster = quickRunConfig({
        nextConfig: parsed.config,
        clusterId: task.clusterId,
        rawText: task.rawText,
        unknownFields: parsed.unknownFields,
      });
      setScheduledTests((prev) =>
        sortScheduledTests(
          prev.map((t) => (t.id === taskId ? markScheduledTaskExecuted(t, Date.now()) : t))
        )
      );
      return cluster;
    },
    [scheduledTests, config, quickRunConfig]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      const due = findDueScheduledTests(scheduledTests, Date.now());
      if (due.length === 0) return;
      const first = due[0];
      const parsed = parseRawConfigCheck(first.rawText, first.format, config);
      quickRunConfig({
        nextConfig: parsed.config,
        clusterId: first.clusterId,
        rawText: first.rawText,
        unknownFields: parsed.unknownFields,
      });
      const dueIds = new Set(due.map((d) => d.id));
      setScheduledTests((prev) =>
        sortScheduledTests(
          prev.map((t) => (dueIds.has(t.id) ? markScheduledTaskExecuted(t, Date.now()) : t))
        )
      );
    }, 5000);
    return () => window.clearInterval(interval);
  }, [scheduledTests, config, quickRunConfig]);

  return {
    scheduledTests,
    addScheduledTest,
    toggleScheduledTest,
    removeScheduledTest,
    runScheduledTestNow,
  };
}
