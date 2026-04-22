import { describe, expect, it, vi } from 'vitest';
import type { TProviderWithModel } from '@/common/config/storage';
import {
  advanceStageConversation,
  appendSessionContextToConversationExtra,
  createDecisionStageConversation,
} from '@renderer/pages/decision/utils/stageConversation';

function createDeps() {
  let scheduledTask: (() => Promise<void>) | null = null;

  return {
    scheduledTaskRef: {
      get current() {
        return scheduledTask;
      },
    },
    deps: {
      resolveModel: vi.fn(async () => ({}) as TProviderWithModel),
      createConversation: vi.fn(async (payload) => ({
        id: 'conv-1',
        extra: payload.extra,
      })),
      updateConversation: vi.fn(async () => undefined),
      getContextSummary: vi.fn(async () => '## 需求简报\n数据治理优先'),
      sendMessage: vi.fn(async () => undefined),
      scheduleTask: vi.fn((task: () => Promise<void>) => {
        scheduledTask = task;
      }),
      advanceStage: vi.fn(async () => undefined),
    },
  };
}

describe('stageConversation', () => {
  it('injects previous-stage summary only after advance completes', async () => {
    const { deps, scheduledTaskRef } = createDeps();

    await advanceStageConversation(
      {
        stage: 'research',
        sessionId: 'session-1',
        agentSelection: {
          agentKey: 'codex',
          agentType: 'codex',
          conversationType: 'acp',
        },
      },
      deps
    );

    expect(deps.createConversation).toHaveBeenCalledTimes(1);
    expect(deps.advanceStage).toHaveBeenCalledWith('conv-1');
    expect(deps.getContextSummary).toHaveBeenCalledWith('session-1');

    const createdExtra = deps.createConversation.mock.calls[0]?.[0]?.extra as {
      presetContext: string;
    };
    expect(createdExtra.presetContext).not.toContain('前序阶段产出物摘要');

    const updatedExtra = deps.updateConversation.mock.calls[0]?.[1] as {
      presetContext: string;
      presetRules: string;
    };
    const updateOptions = deps.updateConversation.mock.calls[0]?.[2] as {
      mergeExtra?: boolean;
    };
    expect(updatedExtra.presetContext).toContain('前序阶段产出物摘要');
    expect(updatedExtra.presetContext).toContain('数据治理优先');
    expect(updatedExtra.presetRules).toContain('数据治理优先');
    expect(updateOptions).toEqual({ mergeExtra: true });
    expect(deps.advanceStage.mock.invocationCallOrder[0]).toBeLessThan(
      deps.getContextSummary.mock.invocationCallOrder[0]
    );
    expect(scheduledTaskRef.current).toBeTypeOf('function');

    await scheduledTaskRef.current?.();

    expect(deps.sendMessage).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      input: '请基于前序阶段的产出物，开始「调研发散」阶段的分析工作。',
      msg_id: expect.any(String),
    });
  });

  it('falls back to stage prompt when pre-summary lookup fails', async () => {
    const { deps } = createDeps();
    deps.getContextSummary.mockRejectedValueOnce(new Error('summary unavailable'));

    await createDecisionStageConversation(
      {
        stage: 'research',
        sessionId: 'session-1',
        agentSelection: {
          agentKey: 'codex',
          agentType: 'codex',
          conversationType: 'acp',
        },
      },
      deps
    );

    const createdExtra = deps.createConversation.mock.calls[0]?.[0]?.extra as {
      presetContext: string;
    };
    expect(createdExtra.presetContext).not.toContain('前序阶段产出物摘要');
    expect(createdExtra.presetContext).toContain('当前决策会话 ID：session-1');
  });

  it('appends session context to both preset fields when missing', () => {
    const nextExtra = appendSessionContextToConversationExtra(
      {
        presetContext: '问题定义提示',
      },
      'session-1'
    );

    expect(nextExtra).toEqual({
      presetContext: expect.stringContaining('当前决策会话 ID：session-1'),
      presetRules: expect.stringContaining('当前决策会话 ID：session-1'),
    });
  });
});
