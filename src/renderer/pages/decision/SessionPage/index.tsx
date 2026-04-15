import React, { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Message, Modal, Spin, Typography } from '@arco-design/web-react';
import { DecisionUIProvider, useDecisionUI } from '../context/DecisionUIContext';
import { useDecisionSessionDetail } from '../hooks/useDecisionSession';
import { useDecisionDataSync } from '../hooks/useDecisionDataSync';
import StageNavigation from './components/StageNavigation';
import ContextPanel from './components/ContextPanel';
import StageCompleteBar from './components/StageCompleteBar';
import type { DecisionStage } from '@process/decision/types';
import { STAGE_ORDER } from '@process/decision/types';

const { Text, Title } = Typography;

const STAGE_LABELS: Record<DecisionStage, string> = {
  problem_definition: '问题定义',
  research: '调研发散',
  comparison: '方案评估',
  convergence: '决策收敛',
};

const SessionPageInner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
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
    // Phase 5 会正式创建 Conversation，目前用占位 ID
    const placeholderConvId = `decision-conv-${Date.now()}`;
    try {
      await advanceStage(placeholderConvId);
      setViewStage(null); // 切换到新阶段
      Message.success('已推进到下一阶段');
    } catch (err) {
      Message.error(`推进失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [advanceStage]);

  const handleRevert = useCallback(async () => {
    if (!session) return;
    const currentIdx = STAGE_ORDER.indexOf(session.currentStage);
    if (currentIdx <= 0) return;
    const targetStage = STAGE_ORDER[currentIdx - 1];

    Modal.confirm({
      title: '确认回退',
      content: `回退到「${STAGE_LABELS[targetStage]}」阶段？当前阶段的数据会保留为历史快照。`,
      onOk: async () => {
        const placeholderConvId = `decision-conv-${Date.now()}`;
        try {
          await revertStage(targetStage, placeholderConvId);
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
        const placeholderConvId = `decision-conv-${Date.now()}`;
        try {
          await skipStage(placeholderConvId);
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

          {/* 消息区占位 — Phase 5 会接入真实的 MessageContainer */}
          <div className='flex-1 flex items-center justify-center bg-fill-1'>
            <div className='text-center'>
              <Text type='secondary' className='block text-lg mb-2'>
                💬 对话区域
              </Text>
              <Text type='secondary' className='text-xs block'>
                {currentStageRun
                  ? `Conversation: ${currentStageRun.conversationId.substring(0, 20)}...`
                  : '等待创建对话'}
              </Text>
              <Text type='secondary' className='text-xs block mt-1'>
                Phase 5 将接入真实的 AI 对话组件
              </Text>
            </div>
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
