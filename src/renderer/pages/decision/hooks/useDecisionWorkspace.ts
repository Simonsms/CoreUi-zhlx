import useSWR from 'swr';
import { ipcBridge } from '@/common';

const DEFAULT_USER_ID = 'system';

export function useDecisionWorkspaces() {
  const { data, error, isLoading, mutate } = useSWR('decision.workspace.summaries', () =>
    ipcBridge.decision.workspace.listSummary.invoke({ userId: DEFAULT_USER_ID })
  );

  const createWorkspace = async (name: string, description?: string) => {
    const workspace = await ipcBridge.decision.workspace.create.invoke({
      userId: DEFAULT_USER_ID,
      name,
      description,
    });
    await mutate();
    return workspace;
  };

  const deleteWorkspace = async (id: string) => {
    await ipcBridge.decision.workspace.delete.invoke({ id });
    await mutate();
  };

  return {
    workspaceSummaries: data ?? [],
    error,
    isLoading,
    createWorkspace,
    deleteWorkspace,
    refresh: mutate,
  };
}
