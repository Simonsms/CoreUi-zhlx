import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionCallbacks } from '@process/acp/types';
import type { OldAcpAgentConfig } from '@process/acp/compat/typeBridge';
import { AcpAgentV2 } from '@process/acp/compat/AcpAgentV2';

let capturedSessionConfig: Record<string, unknown> | null = null;
const { mockGetDecisionStdioConfig, mockProcessConfigGet } = vi.hoisted(() => ({
  mockGetDecisionStdioConfig: vi.fn(),
  mockProcessConfigGet: vi.fn(),
}));

vi.mock('@process/acp/session/AcpSession', () => ({
  AcpSession: class MockAcpSession {
    constructor(config: unknown, _factory: unknown, _callbacks: SessionCallbacks) {
      capturedSessionConfig = config as Record<string, unknown>;
    }
  },
}));

vi.mock('@process/acp/compat/LegacyConnectorFactory', () => ({
  LegacyConnectorFactory: class {
    constructor() {}
  },
}));

vi.mock('@process/acp/compat/typeBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@process/acp/compat/typeBridge')>();
  return {
    ...actual,
    loadAuthCredentials: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@process/decision/init', () => ({
  getDecisionStdioConfig: mockGetDecisionStdioConfig,
}));

vi.mock('@/process/team/mcp/guide/teamGuideSingleton', () => ({
  getTeamGuideStdioConfig: vi.fn().mockReturnValue(null),
}));

vi.mock('@/process/team/prompts/teamGuideCapability', () => ({
  shouldInjectTeamGuideMcp: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/process/team/mcpReadiness', () => ({
  waitForMcpReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: mockProcessConfigGet,
  },
}));

describe('AcpAgentV2 MCP injection', () => {
  beforeEach(() => {
    capturedSessionConfig = null;
    vi.clearAllMocks();
    mockProcessConfigGet.mockResolvedValue(null);
  });

  function createAgent(overrides?: Partial<OldAcpAgentConfig>): AcpAgentV2 {
    const config: OldAcpAgentConfig = {
      id: 'decision-conv-1',
      backend: 'codex',
      workingDir: 'E:/AionUi_cli/AionUi',
      onStreamEvent: vi.fn(),
      ...overrides,
    };
    return new AcpAgentV2(config);
  }

  it('injects decision MCP into presetMcpServers when stdio config is available', async () => {
    mockGetDecisionStdioConfig.mockReturnValue({
      name: 'coreai-decision',
      command: 'node',
      args: ['dist/decision-mcp.js'],
      env: [{ name: 'DECISION_MCP_PORT', value: '3719' }],
    });

    const agent = createAgent();
    await (agent as unknown as { ensureSession: () => Promise<unknown> }).ensureSession();

    const presetMcpServers = capturedSessionConfig?.presetMcpServers as Array<Record<string, unknown>> | undefined;
    expect(presetMcpServers).toEqual([
      {
        name: 'coreai-decision',
        command: 'node',
        args: ['dist/decision-mcp.js'],
        env: [{ name: 'DECISION_MCP_PORT', value: '3719' }],
      },
    ]);
  });

  it('does not inject decision MCP when stdio config is unavailable', async () => {
    mockGetDecisionStdioConfig.mockReturnValue(null);

    const agent = createAgent();
    await (agent as unknown as { ensureSession: () => Promise<unknown> }).ensureSession();

    expect(capturedSessionConfig?.presetMcpServers).toBeUndefined();
  });
});
