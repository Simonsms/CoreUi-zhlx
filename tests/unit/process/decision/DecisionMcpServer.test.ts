import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emitDataChanged: vi.fn(),
  addCandidate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    decision: {
      dataChanged: {
        emit: (...args: unknown[]) => mocks.emitDataChanged(...args),
      },
    },
  },
}));

describe('DecisionMcpTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addCandidate.mockResolvedValue({
      id: 'candidate-1',
      sessionId: 'session-1',
      name: 'option-a',
    });
  });

  it('does not fail a write tool when dataChanged emit throws', async () => {
    mocks.emitDataChanged.mockImplementation(() => {
      throw new Error('emit failed');
    });

    const { DecisionMcpTools } = await import('@process/decision/DecisionMcpServer');
    const tools = new DecisionMcpTools({
      addCandidate: (...args: unknown[]) => mocks.addCandidate(...args),
    } as never);

    await expect(
      tools.executeTool('decision_add_candidate', {
        sessionId: 'session-1',
        name: 'option-a',
      })
    ).resolves.toMatchObject({
      id: 'candidate-1',
    });
  });
});
