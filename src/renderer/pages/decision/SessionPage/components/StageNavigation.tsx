import React from 'react';
import { Steps, Tag } from '@arco-design/web-react';
import type { DecisionStage, StageRun } from '@process/decision/types';
import { STAGE_ORDER } from '@process/decision/types';
import { STAGE_LABELS } from '../../constants';
import type { TChatConversation } from '@/common/config/storage';

const STATUS_COLORS: Record<string, string> = {
  active: 'arcoblue',
  completed: 'green',
  skipped: 'orangered',
  pending: 'gray',
};

const STATUS_TEXT: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  skipped: '已跳过',
  pending: '待开始',
};

type StageNavigationProps = {
  currentStage: DecisionStage;
  viewStage: DecisionStage;
  stageRuns: StageRun[];
  /** 当前查看阶段的 conversation，用于显示 Agent 信息 */
  stageConversation?: TChatConversation | null;
  onStageClick: (stage: DecisionStage) => void;
  unreadStages?: Set<DecisionStage>;
};

/** 从 conversation 中提取 Agent 显示名 */
function getAgentLabel(conversation: TChatConversation | null | undefined): string | null {
  if (!conversation) return null;
  const backend = (conversation.extra as { backend?: string })?.backend;
  if (conversation.type === 'gemini') return 'Gemini';
  if (conversation.type === 'aionrs') return 'Aionrs';
  if (backend === 'codex') return 'Codex';
  if (backend === 'claude') return 'Claude';
  if (backend) return backend;
  return conversation.type;
}

const StageNavigation: React.FC<StageNavigationProps> = ({
  currentStage,
  viewStage,
  stageRuns,
  stageConversation,
  onStageClick,
  unreadStages,
}) => {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  const getStageStatus = (stage: DecisionStage): string => {
    const runs = stageRuns.filter((r) => r.stage === stage);
    if (runs.length === 0) return 'pending';
    return runs[runs.length - 1].status;
  };

  return (
    <div className='h-full py-4 px-3 border-r border-color-2 overflow-auto shrink-0' style={{ width: 200 }}>
      <div className='text-sm font-bold text-1 mb-4 px-1'>阶段进度</div>
      <Steps direction='vertical' current={currentIdx + 1} size='small'>
        {STAGE_ORDER.map((stage) => {
          const status = getStageStatus(stage);
          const runs = stageRuns.filter((r) => r.stage === stage);
          const isActive = stage === currentStage;
          const isViewing = stage === viewStage;
          const hasUnread = unreadStages?.has(stage) ?? false;

          // 当前查看阶段显示 Agent 信息
          const agentLabel = isViewing ? getAgentLabel(stageConversation) : null;

          return (
            <Steps.Step
              key={stage}
              title={
                <div
                  className={`cursor-pointer transition-colors flex flex-col gap-1 pt-0.5 pb-3 ${isViewing && !isActive ? 'font-bold text-t-primary' : isActive ? 'text-[var(--color-primary-6)] font-medium' : 'text-t-secondary hover:text-t-primary'} ${isActive && status === 'active' ? 'decision-stage-breathe' : ''}`}
                  onClick={() => onStageClick(stage)}
                >
                  <div className='flex items-center justify-between'>
                    <span>{STAGE_LABELS[stage]}</span>
                    {hasUnread && (
                      <span className='w-6px h-6px rd-full bg-[var(--color-danger-6)] mt-1' />
                    )}
                  </div>
                  <div className='flex flex-col gap-1.5 font-normal mt-1'>
                    <div className='flex items-center gap-1.5 flex-wrap'>
                      <Tag size='small' color={STATUS_COLORS[status]} className='rounded-sm border-none bg-opacity-80'>
                        {STATUS_TEXT[status] ?? status}
                      </Tag>
                      {runs.length > 1 && (
                        <Tag size='small' color='gray' className='rounded-sm border-none'>
                          第{runs.length}轮
                        </Tag>
                      )}
                    </div>
                    {agentLabel && (
                      <Tag size='small' color='purple' className='max-w-full rounded-sm border-none bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300'>
                        {agentLabel}
                      </Tag>
                    )}
                    {isViewing && !isActive && (
                      <Tag size='small' color='blue' className='rounded-sm border-none'>
                        查看中
                      </Tag>
                    )}
                  </div>
                </div>
              }
            />
          );
        })}
      </Steps>
    </div>
  );
};

export default StageNavigation;
