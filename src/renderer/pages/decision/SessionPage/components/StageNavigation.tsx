import React from 'react';
import { Steps, Tag } from '@arco-design/web-react';
import type { DecisionStage, StageRun } from '@process/decision/types';
import { STAGE_ORDER } from '@process/decision/types';

const STAGE_LABELS: Record<DecisionStage, string> = {
  problem_definition: '问题定义',
  research: '调研发散',
  comparison: '方案评估',
  convergence: '决策收敛',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'arcoblue',
  completed: 'green',
  skipped: 'orangered',
  pending: 'gray',
};

type StageNavigationProps = {
  currentStage: DecisionStage;
  stageRuns: StageRun[];
  onStageClick: (stage: DecisionStage) => void;
};

const StageNavigation: React.FC<StageNavigationProps> = ({ currentStage, stageRuns, onStageClick }) => {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  const getStageStatus = (stage: DecisionStage): string => {
    const runs = stageRuns.filter((r) => r.stage === stage);
    if (runs.length === 0) return 'pending';
    const latest = runs[runs.length - 1];
    return latest.status;
  };

  return (
    <div className='h-full py-4 px-3 border-r border-color-2 overflow-auto' style={{ width: 200 }}>
      <div className='text-sm font-bold text-1 mb-4 px-1'>阶段进度</div>
      <Steps direction='vertical' current={currentIdx + 1} size='small'>
        {STAGE_ORDER.map((stage, idx) => {
          const status = getStageStatus(stage);
          const runs = stageRuns.filter((r) => r.stage === stage);
          const isActive = stage === currentStage;

          return (
            <Steps.Step
              key={stage}
              title={
                <div
                  className={`cursor-pointer py-1 ${isActive ? 'font-bold text-1' : 'text-2'}`}
                  onClick={() => onStageClick(stage)}
                >
                  {STAGE_LABELS[stage]}
                </div>
              }
              description={
                <div className='flex items-center gap-1 mt-1'>
                  <Tag size='small' color={STATUS_COLORS[status]}>
                    {status === 'active' ? '进行中' : status === 'completed' ? '已完成' : status === 'skipped' ? '已跳过' : '待开始'}
                  </Tag>
                  {runs.length > 1 && (
                    <Tag size='small' color='gray'>
                      第{runs.length}轮
                    </Tag>
                  )}
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
