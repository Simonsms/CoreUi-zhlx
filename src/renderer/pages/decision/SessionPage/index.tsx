import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Message, Modal, Spin, Typography } from '@arco-design/web-react';
import { PlayOne, Robot, Info } from '@icon-park/react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import type { TChatConversation } from '@/common/config/storage';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import { DecisionUIProvider } from '../context/DecisionUIContext';
import { useDecisionSessionDetail } from '../hooks/useDecisionSession';
import { useDecisionDataSync } from '../hooks/useDecisionDataSync';
import StageNavigation from './components/StageNavigation';
import ContextPanel from './components/ContextPanel';
import StageCompleteBar from './components/StageCompleteBar';
import StageAgentModal from './components/StageAgentModal';
import type { StageAgentSelection } from './components/StageAgentModal';
import type { DecisionStage } from '@process/decision/types';
import { STAGE_ORDER } from '@process/decision/types';
import { STAGE_LABELS } from '../constants';
import { resolveModelForConversationType } from '../utils/resolveModel';
import {
  advanceStageConversation,
  appendSessionContextToConversationExtra,
  createDecisionStageConversation,
} from '../utils/stageConversation';

const TeamChatView = React.lazy(() => import('@/renderer/pages/team/components/TeamChatView'));

const { Text } = Typography;

type PendingAction = {
  type: 'advance' | 'revert' | 'skip';
  targetStage: DecisionStage;
};

const SessionPageInner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { session, stageRuns, isLoading, advanceStage, revertStage, skipStage, completeSession } =
    useDecisionSessionDetail(id);

  useDecisionDataSync(id);

  // 补充注入 sessionId 到首次创建的 conversation（WorkbenchPage 创建时不知道 sessionId）
  useEffect(() => {
    if (!session || !stageRuns.length) return;
    const firstRun = stageRuns.find((r) => r.stage === 'problem_definition');
    if (!firstRun || firstRun.conversationId.startsWith('decision-placeholder')) return;

    void (async () => {
      try {
        const conv = await ipcBridge.conversation.get.invoke({ id: firstRun.conversationId });
        const nextExtra = appendSessionContextToConversationExtra(
          conv?.extra as Record<string, unknown> | undefined,
          session.id
        );
        if (nextExtra) {
          await ipcBridge.conversation.update.invoke({
            id: firstRun.conversationId,
            updates: {
              extra: nextExtra,
            },
          });
        }
      } catch {
        // 非关键路径，静默处理
      }
    })();
  }, [session?.id, stageRuns]);

  const [viewStage, setViewStage] = useState<DecisionStage | null>(null);
  const displayStage = viewStage ?? session?.currentStage ?? 'problem_definition';
  const isViewingHistory = session ? displayStage !== session.currentStage : false;

  // Agent 选择模态框状态
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const currentStageRun = useMemo(() => {
    const runs = stageRuns.filter((r) => r.stage === displayStage);
    return runs.length > 0 ? runs[runs.length - 1] : null;
  }, [stageRuns, displayStage]);

  const conversationId = currentStageRun?.conversationId;
  const isPlaceholder = conversationId?.startsWith('decision-placeholder') ?? true;

  const { data: stageConversation } = useSWR(
    conversationId && !isPlaceholder ? ['stage-conv', conversationId] : null,
    () => ipcBridge.conversation.get.invoke({ id: conversationId! })
  );

  // 推进：先弹出 Agent 选择
  const handleAdvance = useCallback(() => {
    if (!session) return;
    const currentIdx = STAGE_ORDER.indexOf(session.currentStage);
    const nextStage = STAGE_ORDER[currentIdx + 1];
    if (!nextStage) return;
    setPendingAction({ type: 'advance', targetStage: nextStage });
  }, [session]);

  // 回退：先确认再选 Agent
  const handleRevert = useCallback(() => {
    if (!session) return;
    const currentIdx = STAGE_ORDER.indexOf(session.currentStage);
    if (currentIdx <= 0) return;
    const targetStage = STAGE_ORDER[currentIdx - 1];

    Modal.confirm({
      title: '确认回退',
      content: `回退到「${STAGE_LABELS[targetStage]}」阶段？当前阶段的数据会保留为历史快照。`,
      onOk: () => {
        setPendingAction({ type: 'revert', targetStage });
      },
    });
  }, [session]);

  // 跳过：先确认再选 Agent
  const handleSkip = useCallback(() => {
    if (!session) return;
    Modal.confirm({
      title: '确认跳过',
      content: '跳过当前阶段？可以随时回退。',
      onOk: () => {
        const nextIdx = STAGE_ORDER.indexOf(session.currentStage) + 1;
        const nextStage = STAGE_ORDER[nextIdx];
        if (!nextStage) return;
        setPendingAction({ type: 'skip', targetStage: nextStage });
      },
    });
  }, [session]);

  // Agent 选择确认后执行实际操作
  const handleAgentConfirm = useCallback(
    async (selection: StageAgentSelection) => {
      if (!pendingAction || !session) return;
      const { type, targetStage } = pendingAction;

      try {
        if (type === 'advance') {
          await advanceStageConversation(
            {
              stage: targetStage,
              sessionId: session.id,
              agentSelection: selection,
            },
            {
              resolveModel: resolveModelForConversationType,
              createConversation: (payload) => ipcBridge.conversation.create.invoke(payload),
              updateConversation: async (conversationId, extra, options) => {
                await ipcBridge.conversation.update.invoke({
                  id: conversationId,
                  updates: { extra },
                  mergeExtra: options?.mergeExtra,
                });
              },
              getContextSummary: async (sessionId) => ipcBridge.decision.analytics.contextSummary.invoke({ sessionId }),
              sendMessage: (payload) => ipcBridge.conversation.sendMessage.invoke(payload),
              scheduleTask: (task, delayMs) => {
                setTimeout(() => {
                  void task();
                }, delayMs);
              },
              advanceStage,
            }
          );
          Message.success('已推进到下一阶段');
        } else if (type === 'revert') {
          const convId = await createDecisionStageConversation(
            {
              stage: targetStage,
              sessionId: session.id,
              agentSelection: selection,
            },
            {
              resolveModel: resolveModelForConversationType,
              createConversation: (payload) => ipcBridge.conversation.create.invoke(payload),
              updateConversation: async (conversationId, extra, options) => {
                await ipcBridge.conversation.update.invoke({
                  id: conversationId,
                  updates: { extra },
                  mergeExtra: options?.mergeExtra,
                });
              },
              getContextSummary: async (sessionId) => ipcBridge.decision.analytics.contextSummary.invoke({ sessionId }),
              sendMessage: (payload) => ipcBridge.conversation.sendMessage.invoke(payload),
              scheduleTask: (task, delayMs) => {
                setTimeout(() => {
                  void task();
                }, delayMs);
              },
            }
          );
          await revertStage(targetStage, convId);
          Message.success(`已回退到${STAGE_LABELS[targetStage]}`);
        } else if (type === 'skip') {
          const convId = await createDecisionStageConversation(
            {
              stage: targetStage,
              sessionId: session.id,
              agentSelection: selection,
            },
            {
              resolveModel: resolveModelForConversationType,
              createConversation: (payload) => ipcBridge.conversation.create.invoke(payload),
              updateConversation: async (conversationId, extra, options) => {
                await ipcBridge.conversation.update.invoke({
                  id: conversationId,
                  updates: { extra },
                  mergeExtra: options?.mergeExtra,
                });
              },
              getContextSummary: async (sessionId) => ipcBridge.decision.analytics.contextSummary.invoke({ sessionId }),
              sendMessage: (payload) => ipcBridge.conversation.sendMessage.invoke(payload),
              scheduleTask: (task, delayMs) => {
                setTimeout(() => {
                  void task();
                }, delayMs);
              },
            }
          );
          await skipStage(convId);
          Message.success('已跳过当前阶段');
        }
        setPendingAction(null);
        setViewStage(null);
      } catch (err) {
        Message.error(`操作失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [pendingAction, session, advanceStage, revertStage, skipStage]
  );

  const handleComplete = useCallback(async () => {
    Modal.confirm({
      title: '确认完成',
      content: '确认决策建议？完成后将无法修改。',
      onOk: async () => {
        try {
          await completeSession();
          Message.success('决策已完成');
        } catch (err) {
          Message.error(`完成失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    });
  }, [completeSession]);

  // 发送预设消息（开始分析 / 继续工作）
  const handleSendPrompt = useCallback(
    async (promptText: string) => {
      if (!conversationId || isPlaceholder) return;
      try {
        await ipcBridge.conversation.sendMessage.invoke({
          conversation_id: conversationId,
          input: promptText,
          msg_id: uuid(),
        });
      } catch {
        Message.error('发送消息失败');
      }
    },
    [conversationId, isPlaceholder]
  );

  // sider: ContextPanel
  const sider = useMemo(() => {
    if (!session) return <div />;
    return <ContextPanel sessionId={session.id} currentStage={displayStage} />;
  }, [session, displayStage]);

  const siderTitle = useMemo(() => <span className='text-16px font-bold text-t-primary'>结构化数据</span>, []);

  if (isLoading) {
    return (
      <div className='w-full h-full flex items-center justify-center'>
        <Spin size={32} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className='w-full h-full flex items-center justify-center'>
        <Text type='secondary'>会话不存在</Text>
      </div>
    );
  }

  return (
    <ChatLayout
      title={`决策会话 - ${STAGE_LABELS[session.currentStage]}`}
      sider={sider}
      siderTitle={siderTitle}
      workspaceEnabled={true}
      tabsSlot={null}
    >
      <div className='flex h-full bg-base'>
        {/* 左栏：竖向 Stepper */}
        <StageNavigation
          currentStage={session.currentStage}
          viewStage={displayStage}
          stageRuns={stageRuns}
          stageConversation={stageConversation}
          onStageClick={(stage) => setViewStage(stage === session.currentStage ? null : stage)}
        />

        {/* 右侧主区：新增内层卡片效果 */}
        <div className='flex-1 flex flex-col min-h-0 p-3'>
          <div className='flex-1 flex flex-col min-h-0 bg-1 rd-2 shadow-sm border border-color-2 overflow-hidden'>
            {/* 历史阶段提示条 */}
            {isViewingHistory && (
              <div className='px-4 py-2.5 bg-[var(--color-warning-light-2)] text-[var(--color-warning-6)] text-sm flex items-center gap-2 shrink-0 border-b border-[var(--color-warning-light-3)]'>
                <Info className='text-lg' />
                <span>
                  正在查看历史阶段：<strong>{STAGE_LABELS[displayStage]}</strong>
                </span>
                <Button type='text' size='small' className='ml-auto font-medium' onClick={() => setViewStage(null)}>
                  返回当前阶段
                </Button>
              </div>
            )}

            {/* 快捷操作栏 */}
            {!isViewingHistory && stageConversation && session && (
              <div className='px-4 py-2 flex items-center justify-end gap-3 shrink-0 border-b border-color-2 bg-fill-1'>
                {displayStage !== 'problem_definition' && (
                  <Button
                    type='text'
                    size='small'
                    className='text-[13px] px-2'
                    onClick={() =>
                      handleSendPrompt(`请基于前序阶段的产出物，开始「${STAGE_LABELS[displayStage]}」阶段的分析工作。`)
                    }
                  >
                    <PlayOne className='mr-1 text-sm' /> 开始分析
                  </Button>
                )}
                <Button
                  type='secondary'
                  size='small'
                  className='text-[13px] px-3'
                  style={{ borderRadius: '4px' }}
                  onClick={() =>
                    handleSendPrompt(
                      `请继续完成「${STAGE_LABELS[session.currentStage]}」阶段的工作，确保所有结构化数据都已通过工具调用保存。`
                    )
                  }
                >
                  <span className='flex items-center gap-1.5'>
                    <Robot className='text-sm' /> 让 AI 继续工作
                  </span>
                </Button>
              </div>
            )}

            {/* 内嵌对话 — 使用 TeamChatView 支持多平台 */}
            <div className='flex-1 flex flex-col min-h-0'>
              {stageConversation ? (
                <Suspense
                  fallback={
                    <div className='flex-1 flex items-center justify-center'>
                      <Spin size={24} />
                    </div>
                  }
                >
                  <TeamChatView
                    key={stageConversation.id}
                    conversation={stageConversation as TChatConversation}
                    hideSendBox={isViewingHistory}
                  />
                </Suspense>
              ) : (
                <div className='flex-1 h-full flex flex-col items-center justify-center bg-fill-1 gap-3'>
                  <Text type='secondary' className='text-sm'>
                    {isPlaceholder ? '当前阶段尚未创建对话' : '加载对话中...'}
                  </Text>
                </div>
              )}
            </div>

            {/* 底部操作栏 */}
            <StageCompleteBar
              sessionId={session.id}
              currentStage={session.currentStage}
              sessionStatus={session.status}
              onAdvance={handleAdvance}
              onRevert={handleRevert}
              onSkip={handleSkip}
              onComplete={handleComplete}
            />
          </div>
        </div>
      </div>

      {/* Agent 选择模态框 */}
      <StageAgentModal
        visible={pendingAction !== null}
        targetStage={pendingAction?.targetStage ?? 'problem_definition'}
        onClose={() => setPendingAction(null)}
        onConfirm={handleAgentConfirm}
      />
    </ChatLayout>
  );
};

const SessionPage: React.FC = () => (
  <DecisionUIProvider>
    <SessionPageInner />
  </DecisionUIProvider>
);

export default SessionPage;
