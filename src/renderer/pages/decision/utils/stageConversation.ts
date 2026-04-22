import { uuid } from '@/common/utils';
import type { TProviderWithModel } from '@/common/config/storage';
import type { AgentBackend } from '@/common/types/acpTypes';
import type { DecisionStage } from '@process/decision/types';
import { STAGE_LABELS, STAGE_PROMPTS, buildSessionContext } from '../constants';

type StageConversationType = 'gemini' | 'acp' | 'aionrs' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote';

type StageAgentSelectionLike = {
  agentType?: string;
  conversationType?: StageConversationType;
  cliPath?: string;
  customAgentId?: string;
};

type StageConversationExtra = {
  backend: AgentBackend;
  presetContext: string;
  presetRules: string;
  cliPath?: string;
  customAgentId?: string;
};

type CreateConversationPayload = {
  type: StageConversationType;
  name: string;
  model: TProviderWithModel;
  extra: StageConversationExtra;
};

type DecisionStageConversationDeps = {
  resolveModel: (conversationType: StageConversationType) => Promise<TProviderWithModel>;
  createConversation: (payload: CreateConversationPayload) => Promise<{ id: string }>;
  updateConversation: (
    conversationId: string,
    extra: StageConversationExtra,
    options?: { mergeExtra?: boolean }
  ) => Promise<unknown>;
  getContextSummary: (sessionId: string) => Promise<string>;
  sendMessage: (payload: { conversation_id: string; input: string; msg_id: string }) => Promise<unknown>;
  scheduleTask: (task: () => Promise<void>, delayMs: number) => void;
  advanceStage: (conversationId: string) => Promise<unknown>;
};

type StageConversationParams = {
  stage: DecisionStage;
  sessionId: string;
  agentSelection?: StageAgentSelectionLike;
};

const SESSION_CONTEXT_MARKER = '当前决策会话 ID：';
const AUTO_SEND_SUPPORTED_TYPES = new Set<StageConversationType>(['acp', 'codex', 'gemini']);

function withSessionContext(prompt: string, sessionId: string): string {
  if (prompt.includes(SESSION_CONTEXT_MARKER)) {
    return prompt;
  }
  return prompt + buildSessionContext(sessionId);
}

function getConversationType(agentSelection?: StageAgentSelectionLike): StageConversationType {
  return agentSelection?.conversationType ?? 'acp';
}

function getBackend(agentSelection?: StageAgentSelectionLike): AgentBackend {
  return (agentSelection?.agentType ?? 'codex') as AgentBackend;
}

async function tryGetContextSummary(
  stage: DecisionStage,
  sessionId: string,
  deps: Pick<DecisionStageConversationDeps, 'getContextSummary'>
): Promise<string> {
  if (stage === 'problem_definition') {
    return '';
  }

  try {
    return await deps.getContextSummary(sessionId);
  } catch {
    return '';
  }
}

export function buildStageConversationPrompt(stage: DecisionStage, sessionId: string, contextSummary = ''): string {
  const contextPreamble = contextSummary ? `\n\n**前序阶段产出物摘要：**\n${contextSummary}\n` : '';
  return withSessionContext(STAGE_PROMPTS[stage] + contextPreamble, sessionId);
}

export function appendSessionContextToConversationExtra(
  extra: Record<string, unknown> | undefined,
  sessionId: string
): (Record<string, unknown> & { presetContext: string; presetRules: string }) | null {
  if (!extra) {
    return null;
  }

  const presetContext = typeof extra.presetContext === 'string' ? extra.presetContext : '';
  if (!presetContext) {
    return null;
  }

  const nextPresetContext = withSessionContext(presetContext, sessionId);
  const presetRulesSource = typeof extra.presetRules === 'string' ? extra.presetRules : presetContext;
  const nextPresetRules = withSessionContext(presetRulesSource, sessionId);
  const changed =
    nextPresetContext !== extra.presetContext ||
    nextPresetRules !== (typeof extra.presetRules === 'string' ? extra.presetRules : '');

  if (!changed) {
    return null;
  }

  return {
    ...extra,
    presetContext: nextPresetContext,
    presetRules: nextPresetRules,
  };
}

function buildConversationExtra(params: StageConversationParams, contextSummary: string): StageConversationExtra {
  return {
    backend: getBackend(params.agentSelection),
    presetContext: buildStageConversationPrompt(params.stage, params.sessionId, contextSummary),
    presetRules: buildStageConversationPrompt(params.stage, params.sessionId, contextSummary),
    cliPath: params.agentSelection?.cliPath,
    customAgentId: params.agentSelection?.customAgentId,
  };
}

export async function createDecisionStageConversation(
  params: StageConversationParams,
  deps: Omit<DecisionStageConversationDeps, 'advanceStage'>,
  options?: { includeContextSummary?: boolean; autoSend?: boolean }
): Promise<string> {
  const conversationType = getConversationType(params.agentSelection);
  const model = await deps.resolveModel(conversationType);
  const shouldIncludeContextSummary = options?.includeContextSummary ?? params.stage !== 'problem_definition';
  const contextSummary = shouldIncludeContextSummary
    ? await tryGetContextSummary(params.stage, params.sessionId, deps)
    : '';

  const conversation = await deps.createConversation({
    type: conversationType,
    name: `决策会话 - ${STAGE_LABELS[params.stage]}`,
    model,
    extra: buildConversationExtra(params, contextSummary),
  });

  if (options?.autoSend ?? params.stage !== 'problem_definition') {
    scheduleStageAutoSend(params.stage, conversation.id, conversationType, deps);
  }

  return conversation.id;
}

export async function enrichStageConversationWithSummary(
  conversationId: string,
  params: StageConversationParams,
  deps: Pick<DecisionStageConversationDeps, 'getContextSummary' | 'updateConversation'>
): Promise<void> {
  const contextSummary = await tryGetContextSummary(params.stage, params.sessionId, deps);
  if (!contextSummary) {
    return;
  }

  try {
    await deps.updateConversation(conversationId, buildConversationExtra(params, contextSummary), {
      mergeExtra: true,
    });
  } catch {
    // 非关键路径，允许 AI 在运行中自行拉取摘要
  }
}

export function scheduleStageAutoSend(
  stage: DecisionStage,
  conversationId: string,
  conversationType: StageConversationType,
  deps: Pick<DecisionStageConversationDeps, 'scheduleTask' | 'sendMessage'>
): void {
  if (stage === 'problem_definition' || !AUTO_SEND_SUPPORTED_TYPES.has(conversationType)) {
    return;
  }

  deps.scheduleTask(async () => {
    try {
      await deps.sendMessage({
        conversation_id: conversationId,
        input: `请基于前序阶段的产出物，开始「${STAGE_LABELS[stage]}」阶段的分析工作。`,
        msg_id: uuid(),
      });
    } catch {
      // 非关键路径，静默处理
    }
  }, 2000);
}

export async function advanceStageConversation(
  params: StageConversationParams,
  deps: DecisionStageConversationDeps
): Promise<string> {
  const conversationId = await createDecisionStageConversation(params, deps, {
    includeContextSummary: false,
    autoSend: false,
  });

  await deps.advanceStage(conversationId);
  await enrichStageConversationWithSummary(conversationId, params, deps);
  scheduleStageAutoSend(params.stage, conversationId, getConversationType(params.agentSelection), deps);

  return conversationId;
}
