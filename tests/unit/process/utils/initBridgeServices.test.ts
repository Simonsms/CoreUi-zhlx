import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerConfig: vi.fn(),
  initAllBridges: vi.fn(),
  cronInit: vi.fn(),
  initTeamGuideService: vi.fn(),
  initDecisionModule: vi.fn(),
}));

vi.mock('@office-ai/platform', () => ({
  logger: {
    config: (...args: unknown[]) => mocks.loggerConfig(...args),
  },
}));

vi.mock('@process/services/database/SqliteChannelRepository', () => ({
  SqliteChannelRepository: class {},
}));

vi.mock('@process/services/database/SqliteConversationRepository', () => ({
  SqliteConversationRepository: class {},
}));

vi.mock('@process/services/ConversationServiceImpl', () => ({
  ConversationServiceImpl: class {},
}));

vi.mock('@process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {},
}));

vi.mock('@process/team', () => ({
  SqliteTeamRepository: class {},
  TeamSessionService: class {},
}));

vi.mock('@/process/bridge', () => ({
  initAllBridges: (...args: unknown[]) => mocks.initAllBridges(...args),
}));

vi.mock('@process/services/cron/cronServiceSingleton', () => ({
  cronService: {
    init: (...args: unknown[]) => mocks.cronInit(...args),
  },
}));

vi.mock('@process/team/mcp/guide/teamGuideSingleton', () => ({
  initTeamGuideService: (...args: unknown[]) => mocks.initTeamGuideService(...args),
}));

vi.mock('@process/decision/init', () => ({
  initDecisionModule: (...args: unknown[]) => mocks.initDecisionModule(...args),
}));

describe('initBridgeServices', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.cronInit.mockResolvedValue(undefined);
    mocks.initTeamGuideService.mockResolvedValue(undefined);
  });

  it('rejects when Decision initialization fails and retries on the next call', async () => {
    mocks.initDecisionModule.mockRejectedValueOnce(new Error('decision init failed')).mockResolvedValueOnce(undefined);

    const { initBridgeServices } = await import('@process/utils/initBridge');

    await expect(initBridgeServices()).rejects.toThrow('decision init failed');
    await expect(initBridgeServices()).resolves.toBeUndefined();

    expect(mocks.initDecisionModule).toHaveBeenCalledTimes(2);
    expect(mocks.initAllBridges).toHaveBeenCalledTimes(2);
  });
});
