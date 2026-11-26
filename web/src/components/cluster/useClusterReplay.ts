import { useEffect, useMemo, useState } from 'react';
import {
  buildReplayFrameAtIndex,
  type RecordedTestSession,
} from '../../engine/sessionReplay';
import type { DistributedRunState } from '../../types/pummel';

interface UseClusterReplayParams {
  runState: DistributedRunState;
  recordedSessions: RecordedTestSession[];
  deleteRecordedSession: (sessionId: string) => void;
  onStatusMessage: (msg: string) => void;
}

export function useClusterReplay({
  runState,
  recordedSessions,
  deleteRecordedSession,
  onStatusMessage,
}: UseClusterReplayParams) {
  const [activeReplaySessionId, setActiveReplaySessionId] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);

  const activeReplaySession = useMemo(
    () =>
      activeReplaySessionId
        ? recordedSessions.find((s) => s.id === activeReplaySessionId) ?? null
        : null,
    [activeReplaySessionId, recordedSessions]
  );

  useEffect(() => {
    if (!activeReplaySession || !replayPlaying) return undefined;
    const maxIdx = Math.max(0, activeReplaySession.history.length - 1);
    if (replayIndex >= maxIdx) {
      setReplayPlaying(false);
      return undefined;
    }
    const intervalMs = Math.max(180, Math.round(1000 / replaySpeed));
    const timer = window.setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= maxIdx) {
          setReplayPlaying(false);
          return maxIdx;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [activeReplaySession, replayPlaying, replaySpeed, replayIndex]);

  const effectiveRunState: DistributedRunState = useMemo(() => {
    if (!activeReplaySession) return runState;
    const frame = buildReplayFrameAtIndex(activeReplaySession, replayIndex);
    return {
      ...runState,
      status: activeReplaySession.endStatus,
      elapsedSec: frame.elapsedSec,
      targetConcurrency: activeReplaySession.targetConcurrency,
      activeVUs: frame.activeVUs,
      totalRequests: activeReplaySession.totalRequests,
      totalFailures: activeReplaySession.totalFailures,
      currentRps: frame.currentRps,
      globalAvgMs: frame.globalAvgMs,
      globalP90Ms: frame.globalP90Ms,
      globalP95Ms: frame.globalP95Ms,
      globalP99Ms: frame.globalP99Ms,
      globalFailRatePct: frame.globalFailRatePct,
      workers:
        activeReplaySession.workersSnapshot.length > 0
          ? activeReplaySession.workersSnapshot
          : runState.workers,
      endpoints:
        activeReplaySession.endpoints.length > 0
          ? activeReplaySession.endpoints
          : runState.endpoints,
      slaResults:
        activeReplaySession.slaResults.length > 0
          ? activeReplaySession.slaResults
          : runState.slaResults,
      hookExecutions:
        activeReplaySession.hookExecutions.length > 0
          ? activeReplaySession.hookExecutions
          : runState.hookExecutions,
      history: frame.historySlice,
      logs: frame.logsSlice,
    };
  }, [activeReplaySession, replayIndex, runState]);

  const handleStartReplay = (sessionId: string) => {
    const target = recordedSessions.find((s) => s.id === sessionId);
    if (!target) return;
    setActiveReplaySessionId(target.id);
    setReplayIndex(Math.max(0, target.history.length - 1));
    setReplayPlaying(false);
    onStatusMessage(`Entered Replay Mode: "${target.label}".`);
  };

  const handleExitReplay = () => {
    setActiveReplaySessionId(null);
    setReplayPlaying(false);
    setReplayIndex(0);
    onStatusMessage('Returned to live cluster telemetry stream.');
  };

  const handleDeleteSession = (sessionId: string) => {
    if (activeReplaySessionId === sessionId) {
      setActiveReplaySessionId(null);
      setReplayPlaying(false);
      setReplayIndex(0);
    }
    deleteRecordedSession(sessionId);
    onStatusMessage('Deleted recorded session from localStorage.');
  };

  const handleScrubIndex = (idx: number) => {
    setReplayPlaying(false);
    setReplayIndex(idx);
  };

  const handleTogglePlayReplay = () => {
    setReplayPlaying((prev) => !prev);
  };

  return {
    activeReplaySessionId,
    activeReplaySession,
    replayIndex,
    replayPlaying,
    replaySpeed,
    effectiveRunState,
    setReplaySpeed,
    handleStartReplay,
    handleExitReplay,
    handleDeleteSession,
    handleScrubIndex,
    handleTogglePlayReplay,
  };
}
