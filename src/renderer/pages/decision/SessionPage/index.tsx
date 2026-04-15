import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Message, Modal, Spin, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import { DecisionUIProvider, useDecisionUI } from '../context/DecisionUIContext';
import { useDecisionSessionDetail } from '../hooks/useDecisionSession';
import { useDecisionDataSync } from '../hooks/useDecisionDataSync';
import StageNavigation from './components/StageNavigation';
import ContextPanel from './components/ContextPanel';
import StageCompleteBar from './components/StageCompleteBar';
import type { DecisionStage } from '@process/decision/types';
import { STAGE_ORDER } from '@process/decision/types';
import { STAGE_LABELS } from '../constants';

const { Text, Title } = Typography;

const STAGE_PROMPTS: Record<string, string> = {
  problem_definition: '你是问题定义助手，帮助用户将模糊需求梳理成结构化的问题定义和需求简报。使用简体中文回复。',
  research: '你是调研分析助手，帮助用户分析调研材料、提取关键发现、整理候选方向。使用简体中文回复。',
  comparison: '你是方案评估助手，帮助用户对候选方案进行多维度比较和风险评估。使用简体中文回复。',
  convergence: '你是决策收敛助手，帮助用户基于前序分析做出最终决策建议。使用简体中文回复。',
};

async function createStageConversation(stage: string): Promise<string> {
  const conversation = await ipcBridge.conversation.create.invoke({
    type: 'acp',
    name: `决策会话 - ${STAGE_LABELS[stage as DecisionStage] ?? stage}`,
    model: {} as import('@/common/config/storage').TProviderWithModel,
    extra: {
      backend: 'codex',
      presetRules: STAGE_PROMPTS[stage] ?? '',
    },
  });
  return conversation.id;
}

const SessionPageInner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    session,
    stageRuns,
    isLoading,
    advanceStage,
    revertStage,
    skipStage,
    completeSession,
  } = useDecisionSessionDetail(id);
  const ui = useDecisionUI();

  // 监听数据变更事件
  useDecisionDataSync(id);

  // 当前查看的阶段（可以查看非活跃阶段的历史）
  const [viewStage, setViewStage] = useState<DecisionStage | null>(null);
  const displayStage = viewStage ?? session?.currentStage ?? 'problem_definition';

  // 当前阶段对应的 StageRun
  const currentStageRun = useMemo(() => {
    const runs = stageRuns.filter((r) => r.stage === displayStage);
    return runs.length > 0 ? runs[runs.length - 1] : null;
  }, [stageRuns, displayStage]);

  const handleAdvance = useCallback(async () => {
    if (!session) return;
    const currentIdx = STAGE_ORDER.indexOf(session.currentStage);
    const nextStage = STAGE_ORDER[currentIdx + 1];
    try {
      const convId = await createStageConversation(nextStage);
      await advanceStage(convId);
      setViewStage(null);
      Message.success('已推进到下一阶段');
    } catch (err) {
      Message.error(`推进失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [advanceStage, session]);

  const handleRevert = useCallback(async () => {
    if (!session) return;
    const currentIdx = STAGE_ORDER.indexOf(session.currentStage);
    if (currentIdx <= 0) return;
    const targetStage = STAGE_ORDER[currentIdx - 1];

    Modal.confirm({
      title: '确认回退',
      content: `回退到「${STAGE_LABELS[targetStage]}」阶段？当前阶段的数据会保留为历史快照。`,
      onOk: async () => {
        try {
          const convId = await createStageConversation(targetStage);
          await revertStage(targetStage, convId);
          setViewStage(null);
          Message.success(`已回退到${STAGE_LABELS[targetStage]}`);
        } catch (err) {
          Message.error(`回退失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    });
  }, [session, revertStage]);

  const handleSkip = useCallback(async () => {
    Modal.confirm({
      title: '确认跳过',
      content: '跳过当前阶段？可以随时回退。',
      onOk: async () => {
        try {
          const nextIdx = STAGE_ORDER.indexOf(session!.currentStage) + 1;
          const convId = await createStageConversation(STAGE_ORDER[nextIdx]);
          await skipStage(convId);
          setViewStage(null);
          Message.success('已跳过当前阶段');
        } catch (err) {
          Message.error(`跳过失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    });
  }, [skipStage]);

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
    <div className='w-full h-full flex flex-col'>
      {/* 三栏主体 */}
      <div className='flex-1 flex overflow-hidden'>
        {/* 左栏：阶段导航 */}
        <StageNavigation
          currentStage={session.currentStage}
          stageRuns={stageRuns}
          onStageClick={(stage) => setViewStage(stage)}
        />

        {/* 中栏：交互区 */}
        <div className='flex-1 flex flex-col overflow-hidden'>
          <div className='px-4 py-3 border-b border-color-2 flex items-center gap-2'>
            <Title heading={6} className='!mb-0'>
              {STAGE_LABELS[displayStage]}
            </Title>
            {currentStageRun && currentStageRun.runNumber > 1 && (
              <Text type='secondary' className='text-xs'>
                (第 {currentStageRun.runNumber} 轮)
              </Text>
            )}
            {displayStage !== session.currentStage && (
              <Text type='warning' className='text-xs'>
                （正在查看历史阶段，当前活跃阶段是{STAGE_LABELS[session.currentStage]}）
              </Text>
            )}
          </div>

          {/* 对话交互区 — 跳转到真实的 AionUi 对话页面 */}
          <div className='flex-1 flex flex-col items-center justify-center bg-fill-1 gap-4'>
            {currentStageRun && !currentStageRun.conversationId.startsWith('decision-placeholder') ? (
              <>
                <Text type='secondary' className='text-sm'>
                  点击下方按钮进入 AI 对话，与{STAGE_LABELS[displayStage]}助手交互
                </Text>
                <Button
                  type='primary'
                  size='large'
                  onClick={() => navigate(`/conversation/${currentStageRun.conversationId}`)}
                >
                  打开对话 →
                </Button>
                <Text type='secondary' className='text-xs'>
                  对话完成后，点击浏览器返回按钮回到决策工作台
                </Text>
              </>
            ) : (
              <Text type='secondary'>当前阶段尚未创建对话</Text>
            )}
          </div>
        </div>

        {/* 右栏：结构化数据面板 */}
        <ContextPanel
          sessionId={session.id}
          currentStage={displayStage}
          collapsed={ui.rightPanelCollapsed}
        />
      </div>

      {/* 底部：阶段操作栏 */}
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
  );
};

const SessionPage: React.FC = () => (
  <DecisionUIProvider>
    <SessionPageInner />
  </DecisionUIProvider>
);

export default SessionPage;
