import React from 'react';
import { Button, Space, Tag, Tooltip } from '@arco-design/web-react';
import { Right, Left, DoubleRight, CheckOne } from '@icon-park/react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { DecisionStage } from '@process/decision/types';
import { STAGE_ORDER } from '@process/decision/types';
import { STAGE_LABELS } from '../../constants';

type StageCompleteBarProps = {
  sessionId: string;
  currentStage: DecisionStage;
  sessionStatus: string;
  onAdvance: () => void;
  onRevert: () => void;
  onSkip: () => void;
  onComplete: () => void;
};

const StageCompleteBar: React.FC<StageCompleteBarProps> = ({
  sessionId,
  currentStage,
  sessionStatus,
  onAdvance,
  onRevert,
  onSkip,
  onComplete,
}) => {
  const { data: completionStatus } = useSWR(`decision.completion.${sessionId}.${currentStage}`, () =>
    ipcBridge.decision.stage.getCompletionStatus.invoke({ sessionId, stage: currentStage })
  );

  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const isFirstStage = currentIdx === 0;
  const isLastStage = currentIdx === STAGE_ORDER.length - 1;
  const isMet = completionStatus?.met ?? false;
  const isCompleted = sessionStatus === 'completed';

  if (isCompleted) {
    return (
      <div className='flex items-center justify-center py-3.5 px-5 border-t border-color-2 bg-2 shadow-sm z-10'>
        <Tag color='green' size='large' icon={<CheckOne />}>
          决策已完成
        </Tag>
      </div>
    );
  }

  return (
    <div className='flex items-center justify-between py-3 px-5 border-t border-color-2 bg-2 shadow-sm z-10'>
      <div className='flex items-center gap-2'>
        <Tag color={isMet ? 'green' : 'orangered'} size='small'>
          {isMet ? '条件已满足' : '条件未满足'}
        </Tag>
        {completionStatus?.details &&
          Object.entries(completionStatus.details).map(([key, detail]) => (
            <Tooltip key={key} content={`${detail.label}: ${String(detail.current)}`}>
              <Tag size='small' color={detail.current ? 'green' : 'gray'}>
                {detail.label}
              </Tag>
            </Tooltip>
          ))}
      </div>

      <Space size={12}>
        {!isFirstStage && (
          <Button onClick={onRevert} className='px-4' style={{ borderRadius: '4px' }}>
            <span className='flex items-center gap-1.5'><Left /> 回退</span>
          </Button>
        )}
        {!isLastStage && (
          <Button type='secondary' onClick={onSkip} className='px-4' style={{ borderRadius: '4px' }}>
            <span className='flex items-center gap-1.5'><DoubleRight /> 跳过</span>
          </Button>
        )}
        {isLastStage ? (
          <Button
            type='primary'
            status={isMet ? undefined : 'warning'}
            onClick={onComplete}
            className='px-5 font-medium'
            style={{ borderRadius: '4px' }}
          >
            <span className='flex items-center gap-1.5'><CheckOne /> 确认决策</span>
          </Button>
        ) : (
          <Button
            type='primary'
            status={isMet ? undefined : 'warning'}
            onClick={onAdvance}
            className='px-5 font-medium'
            style={{ borderRadius: '4px' }}
          >
            <span className='flex items-center gap-1.5'><Right /> 推进到 {STAGE_LABELS[STAGE_ORDER[currentIdx + 1]]}</span>
          </Button>
        )}
      </Space>
    </div>
  );
};

export default StageCompleteBar;
