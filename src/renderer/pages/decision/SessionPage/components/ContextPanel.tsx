import React from 'react';
import { Card, Empty, Tag, Typography } from '@arco-design/web-react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { DecisionStage } from '@process/decision/types';

const { Text, Title } = Typography;

type ContextPanelProps = {
  sessionId: string;
  currentStage: DecisionStage;
};

const ContextPanel: React.FC<ContextPanelProps> = ({ sessionId, currentStage }) => {
  const showResearch = currentStage === 'research' || currentStage === 'comparison';
  const showCandidates = currentStage === 'comparison' || currentStage === 'convergence';

  const { data: researchItems } = useSWR(
    showResearch ? `decision.research.${sessionId}` : null,
    () => ipcBridge.decision.research.list.invoke({ sessionId })
  );

  const { data: candidates } = useSWR(
    showCandidates ? `decision.candidates.${sessionId}` : null,
    () => ipcBridge.decision.candidate.list.invoke({ sessionId })
  );

  const { data: recommendation } = useSWR(
    currentStage === 'convergence' ? `decision.recommendation.${sessionId}` : null,
    () => ipcBridge.decision.recommendation.get.invoke({ sessionId })
  );

  const { data: insights } = useSWR(
    `decision.insights.${sessionId}`,
    () => ipcBridge.decision.insight.list.invoke({ sessionId })
  );

  return (
    <div className='h-full overflow-auto p-3'>
      <Title heading={6} className='!mb-3'>结构化数据</Title>

      {/* 调研条目 */}
      {currentStage === 'research' || currentStage === 'comparison' ? (
        <div className='mb-4'>
          <Text className='text-sm font-bold block mb-2'>
            调研条目 ({researchItems?.length ?? 0})
          </Text>
          {researchItems && researchItems.length > 0 ? (
            researchItems.map((item) => (
              <Card key={item.id} size='small' className='mb-2'>
                <Text className='font-medium block'>{item.title}</Text>
                <Text type='secondary' className='text-xs block mt-1'>
                  {(item.summary ?? '').substring(0, 80)}
                  {(item.summary ?? '').length > 80 ? '...' : ''}
                </Text>
                {(item.tags ?? []).length > 0 && (
                  <div className='mt-1 flex gap-1 flex-wrap'>
                    {item.tags.map((tag) => (
                      <Tag key={tag} size='small' color='arcoblue'>{tag}</Tag>
                    ))}
                  </div>
                )}
              </Card>
            ))
          ) : (
            <Empty className='py-4' description='暂无调研条目' />
          )}
        </div>
      ) : null}

      {/* 候选方案 */}
      {currentStage === 'comparison' || currentStage === 'convergence' ? (
        <div className='mb-4'>
          <Text className='text-sm font-bold block mb-2'>
            候选方案 ({candidates?.length ?? 0})
          </Text>
          {candidates && candidates.length > 0 ? (
            candidates.map((c) => (
              <Card key={c.id} size='small' className='mb-2'>
                <Text className='font-medium block'>{c.name}</Text>
                <Text type='secondary' className='text-xs block mt-1'>
                  {(c.description ?? '').substring(0, 60)}
                  {(c.description ?? '').length > 60 ? '...' : ''}
                </Text>
                {Object.keys(c.scores ?? {}).length > 0 && (
                  <Tag size='small' color='green' className='mt-1'>已评分</Tag>
                )}
              </Card>
            ))
          ) : (
            <Empty className='py-4' description='暂无候选方案' />
          )}
        </div>
      ) : null}

      {/* 决策建议 */}
      {currentStage === 'convergence' && recommendation ? (
        <div className='mb-4'>
          <Text className='text-sm font-bold block mb-2'>决策建议</Text>
          <Card size='small'>
            <Text className='block'>{(recommendation.reasoning ?? '').substring(0, 150)}</Text>
            {(recommendation.nextSteps ?? []).length > 0 && (
              <div className='mt-2'>
                <Text type='secondary' className='text-xs block'>下一步：</Text>
                {recommendation.nextSteps.map((step, i) => (
                  <Text key={i} type='secondary' className='text-xs block'>• {step}</Text>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {/* 洞见 */}
      {insights && insights.length > 0 ? (
        <div className='mb-4'>
          <Text className='text-sm font-bold block mb-2'>
            洞见 ({insights.length})
          </Text>
          {insights.slice(-5).map((insight) => (
            <div key={insight.id} className='mb-2 p-2 bg-fill-2 rd-1'>
              <Text className='text-xs block'>{insight.content}</Text>
              <Tag size='small' color={insight.importance === 'high' ? 'red' : insight.importance === 'medium' ? 'orange' : 'gray'} className='mt-1'>
                {insight.importance}
              </Tag>
            </div>
          ))}
        </div>
      ) : null}

      {/* 问题定义阶段 — 显示提示 */}
      {currentStage === 'problem_definition' && (
        <div className='py-8 text-center'>
          <Text type='secondary'>与 AI 对话，描述你的问题</Text>
          <Text type='secondary' className='block mt-1 text-xs'>
            AI 会帮你梳理成结构化的需求简报
          </Text>
        </div>
      )}
    </div>
  );
};

export default ContextPanel;
