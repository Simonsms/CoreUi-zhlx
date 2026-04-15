import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { DecisionStage } from '@process/decision/types';

export function useDecisionSessions(workspaceId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    workspaceId ? `decision.sessions.${workspaceId}` : null,
    () => ipcBridge.decision.session.list.invoke({ workspaceId: workspaceId! })
  );

  return {
    sessions: data ?? [],
    error,
    isLoading,
    refresh: mutate,
  };
}

export function useDecisionSessionDetail(sessionId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    sessionId ? `decision.session.${sessionId}` : null,
    () => ipcBridge.decision.session.getWithStages.invoke({ id: sessionId! })
  );

  const advanceStage = async (conversationId: string) => {
    if (!sessionId) return;
    const result = await ipcBridge.decision.session.advance.invoke({ sessionId, conversationId });
    await mutate();
    return result;
  };

  const revertStage = async (targetStage: DecisionStage, conversationId: string) => {
    if (!sessionId) return;
    const result = await ipcBridge.decision.session.revert.invoke({ sessionId, targetStage, conversationId });
    await mutate();
    return result;
  };

  const skipStage = async (conversationId: string) => {
    if (!sessionId) return;
    const result = await ipcBridge.decision.session.skip.invoke({ sessionId, conversationId });
    await mutate();
    return result;
  };

  const completeSession = async () => {
    if (!sessionId) return;
    await ipcBridge.decision.session.complete.invoke({ sessionId });
    await mutate();
  };

  return {
    session: data?.session ?? null,
    stageRuns: data?.stageRuns ?? [],
    error,
    isLoading,
    refresh: mutate,
    advanceStage,
    revertStage,
    skipStage,
    completeSession,
  };
}
