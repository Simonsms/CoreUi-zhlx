import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initStorage: vi.fn(),
  initBridgeServices: vi.fn(),
  extensionInitialize: vi.fn(),
  channelInitialize: vi.fn(),
}));

vi.mock('@/common/platform/register-electron', () => ({}));
vi.mock('@process/utils/configureChromium', () => ({}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  default: (...args: unknown[]) => mocks.initStorage(...args),
}));

vi.mock('@process/utils/initBridge', () => ({
  initBridgeServices: (...args: unknown[]) => mocks.initBridgeServices(...args),
}));

vi.mock('@process/channels', () => ({
  getChannelManager: () => ({
    initialize: (...args: unknown[]) => mocks.channelInitialize(...args),
  }),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      initialize: (...args: unknown[]) => mocks.extensionInitialize(...args),
    }),
  },
}));

describe('initializeProcess', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.initBridgeServices.mockResolvedValue(undefined);
    mocks.extensionInitialize.mockResolvedValue(undefined);
    mocks.channelInitialize.mockResolvedValue(undefined);
  });

  it('waits for storage before bridge initialization', async () => {
    const order: string[] = [];

    mocks.initStorage.mockImplementation(async () => {
      order.push('storage:start');
      await Promise.resolve();
      order.push('storage:done');
    });

    mocks.initBridgeServices.mockImplementation(async () => {
      order.push('bridge');
    });

    const { initializeProcess } = await import('@process/index');

    await initializeProcess();

    expect(order).toEqual(['storage:start', 'storage:done', 'bridge']);
  });
});
