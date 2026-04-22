import { beforeEach, describe, expect, it, vi } from 'vitest';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mocks = vi.hoisted(() => {
  const mockConfig = {
    name: 'coreai-decision',
    command: 'node',
    args: ['decision.js'],
    env: [],
  };

  return {
    driver: {
      exec: vi.fn(),
      prepare: vi.fn(),
      pragma: vi.fn(),
      transaction: vi.fn((fn: () => void) => fn),
    },
    getDatabase: vi.fn(),
    runDecisionMigrations: vi.fn(),
    initDecisionBridge: vi.fn(),
    decisionTcpServerStart: vi.fn(),
    decisionTcpServerStop: vi.fn(),
    decisionTcpServerGetPort: vi.fn(() => 4317),
    decisionTcpServerCtor: vi.fn(),
    decisionMcpToolsCtor: vi.fn(),
    mockConfig,
  };
});

vi.mock('@process/services/database', () => ({
  getDatabase: (...args: unknown[]) => mocks.getDatabase(...args),
}));

vi.mock('@process/bridge/decisionBridge', () => ({
  initDecisionBridge: (...args: unknown[]) => mocks.initDecisionBridge(...args),
}));

vi.mock('@process/decision/migrations', () => ({
  runDecisionMigrations: (...args: unknown[]) => mocks.runDecisionMigrations(...args),
}));

vi.mock('@process/decision/DecisionService', () => ({
  DecisionService: class {
    constructor(..._args: unknown[]) {}
  },
}));

vi.mock('@process/decision/repository/SqliteDecisionRepository', () => ({
  SqliteDecisionRepository: class {
    constructor(..._args: unknown[]) {}
  },
}));

vi.mock('@process/decision/DecisionMcpServer', () => ({
  DecisionMcpTools: class {
    constructor(...args: unknown[]) {
      mocks.decisionMcpToolsCtor(...args);
    }

    getToolDefinitions() {
      return [{ name: 'decision_add_candidate' }];
    }
  },
}));

vi.mock('@process/decision/mcp/DecisionTcpServer', () => ({
  DecisionTcpServer: class {
    constructor(...args: unknown[]) {
      mocks.decisionTcpServerCtor(...args);
    }

    start(...args: unknown[]) {
      return mocks.decisionTcpServerStart(...args);
    }

    stop(...args: unknown[]) {
      return mocks.decisionTcpServerStop(...args);
    }

    getPort(...args: unknown[]) {
      return mocks.decisionTcpServerGetPort(...args);
    }
  },
}));

describe('initDecisionModule', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getDatabase.mockResolvedValue({
      getDriver: () => mocks.driver,
    });
    mocks.decisionTcpServerStart.mockResolvedValue(mocks.mockConfig);
    mocks.decisionTcpServerStop.mockResolvedValue(undefined);
  });

  it('initializes only once for concurrent calls', async () => {
    const deferred = createDeferred<typeof mocks.mockConfig>();
    mocks.decisionTcpServerStart.mockReturnValueOnce(deferred.promise);

    const mod = await import('@process/decision/init');

    const first = mod.initDecisionModule();
    const second = mod.initDecisionModule();

    await vi.waitFor(() => {
      expect(mocks.decisionTcpServerCtor).toHaveBeenCalledTimes(1);
    });
    expect(mocks.initDecisionBridge).not.toHaveBeenCalled();

    deferred.resolve(mocks.mockConfig);

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(mocks.initDecisionBridge).toHaveBeenCalledTimes(1);
  });

  it('does not publish global state when tcp server start fails', async () => {
    mocks.decisionTcpServerStart.mockRejectedValueOnce(new Error('listen failed'));

    const mod = await import('@process/decision/init');

    await expect(mod.initDecisionModule()).rejects.toThrow('listen failed');

    expect(mod.getDecisionMcpTools()).toBeNull();
    expect(mod.getDecisionStdioConfig()).toBeNull();
  });

  it('retries cleanly after a failed initialization', async () => {
    mocks.decisionTcpServerStart
      .mockRejectedValueOnce(new Error('listen failed'))
      .mockResolvedValueOnce(mocks.mockConfig);

    const mod = await import('@process/decision/init');

    await expect(mod.initDecisionModule()).rejects.toThrow('listen failed');
    await expect(mod.initDecisionModule()).resolves.toBeUndefined();

    expect(mocks.decisionTcpServerCtor).toHaveBeenCalledTimes(2);
    expect(mocks.initDecisionBridge).toHaveBeenCalledTimes(1);
  });
});
