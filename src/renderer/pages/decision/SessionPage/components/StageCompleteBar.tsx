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
  const { data: completionStatus } = useSWR(
    `decision.completion.${sessionId}.${currentStage}`,
    () => ipcBridge.decision.stage.getCompletionStatus.invoke({ sessionId, stage: currentStage })
  );

  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const isFirstStage = currentIdx === 0;
  const isLastStage = currentIdx === STAGE_ORDER.length - 1;
  const isMet = completionStatus?.met ?? false;
  const isCompleted = sessionStatus === 'completed';

  if (isCompleted) {
    return (
      <div className='flex items-center justify-center py-3 px-4 border-t border-color-2 bg-fill-1'>
        <Tag color='green' size='large'>决策已完成</Tag>
      </div>
    );
  }

  return (
    <div className='flex items-center justify-between py-2 px-4 border-t border-color-2 bg-fill-1'>
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

      <Space>
        {!isFirstStage && (
          <Button size='small' icon={<Left />} onClick={onRevert}>
            回退
          </Button>
        )}
        {!isLastStage && (
          <Button size='small' icon={<DoubleRight />} onClick={onSkip}>
            跳过
          </Button>
        )}
        {isLastStage ? (
          <Button
            type='primary'
            size='small'
            icon={<CheckOne />}
            disabled={!isMet}
            onClick={onComplete}
          >
            确认决策
          </Button>
        ) : (
          <Button
            type='primary'
            size='small'
            icon={<Right />}
            disabled={!isMet}
            onClick={onAdvance}
          >
            推进到{STAGE_LABELS[STAGE_ORDER[currentIdx + 1]]}
          </Button>
        )}
      </Space>
    </div>
  );
};

export default StageCompleteBar;
