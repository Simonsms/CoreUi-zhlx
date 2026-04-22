import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerMap = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

const mocks = vi.hoisted(() => ({
  emitDataChanged: vi.fn(),
}));

function makeNode(path: string): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        const nextPath = path ? `${path}.${String(prop)}` : String(prop);
        if (prop === 'provider') {
          return vi.fn((cb: (...args: unknown[]) => unknown) => {
            providerMap.set(path, cb);
          });
        }
        if (prop === 'emit') {
          return (...args: unknown[]) => mocks.emitDataChanged(path, ...args);
        }
        return makeNode(nextPath);
      },
    }
  );
}

vi.mock('@/common', () => ({
  ipcBridge: makeNode(''),
}));

function createDecisionService() {
  return {
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    getWorkspace: vi.fn(),
    updateWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    getSessionWithStages: vi.fn(),
    getRecentSessions: vi.fn(),
    advanceStage: vi.fn(),
    revertStage: vi.fn(),
    skipStage: vi.fn(),
    completeSession: vi.fn(),
    archiveSession: vi.fn(),
    deleteSession: vi.fn(),
    getActiveStageRun: vi.fn(),
    getStageRunHistory: vi.fn(),
    checkStageCompletion: vi.fn(),
    updateStageRun: vi.fn(),
    getStageRunByConversation: vi.fn(),
    listResearchItems: vi.fn(),
    addResearchItem: vi.fn(),
    updateResearchItem: vi.fn(),
    deleteResearchItem: vi.fn(),
    listEvidence: vi.fn(),
    addEvidence: vi.fn(),
    deleteEvidence: vi.fn(),
    listCandidates: vi.fn(),
    addCandidate: vi.fn(),
    updateCandidate: vi.fn(),
    deleteCandidate: vi.fn(),
    listDimensions: vi.fn(),
    addDimension: vi.fn(),
    updateDimension: vi.fn(),
    deleteDimension: vi.fn(),
    getRecommendation: vi.fn(),
    createRecommendation: vi.fn(),
    updateRecommendation: vi.fn(),
    listInsights: vi.fn(),
    listInsightsByStage: vi.fn(),
    addInsight: vi.fn(),
    aggregateContextSummary: vi.fn(),
    aggregateContextDetail: vi.fn(),
    exportSession: vi.fn(),
  };
}

describe('initDecisionBridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    providerMap.clear();
  });

  it('registers providers once and routes calls through the latest service', async () => {
    const { ipcBridge } = await import('@/common');
    const { initDecisionBridge } = await import('@process/bridge/decisionBridge');
    const serviceA = createDecisionService();
    const serviceB = createDecisionService();
    serviceB.completeSession.mockResolvedValue({ ok: true });

    initDecisionBridge(serviceA as never);
    const firstProviderCalls = vi.mocked(ipcBridge.decision.session.complete.provider).mock.calls.length;

    initDecisionBridge(serviceB as never);
    const secondProviderCalls = vi.mocked(ipcBridge.decision.session.complete.provider).mock.calls.length;

    expect(secondProviderCalls).toBe(firstProviderCalls);

    const handler = providerMap.get('decision.session.complete');
    await expect(handler?.({ sessionId: 'session-1' })).resolves.toEqual({ ok: true });

    expect(serviceA.completeSession).not.toHaveBeenCalled();
    expect(serviceB.completeSession).toHaveBeenCalledWith('session-1');
  });

  it('emits session_completed after completing a session', async () => {
    const { initDecisionBridge } = await import('@process/bridge/decisionBridge');
    const service = createDecisionService();
    service.completeSession.mockResolvedValue({ ok: true });

    initDecisionBridge(service as never);

    const handler = providerMap.get('decision.session.complete');
    await handler?.({ sessionId: 'session-1' });

    expect(mocks.emitDataChanged).toHaveBeenCalledWith('decision.dataChanged', {
      sessionId: 'session-1',
      type: 'session_completed',
    });
  });
});
