import React from 'react';
import { Card, Empty, Tag, Typography } from '@arco-design/web-react';
import { Inbox } from '@icon-park/react';
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

  const { data: researchItems } = useSWR(showResearch ? `decision.research.${sessionId}` : null, () =>
    ipcBridge.decision.research.list.invoke({ sessionId })
  );

  const { data: candidates } = useSWR(showCandidates ? `decision.candidates.${sessionId}` : null, () =>
    ipcBridge.decision.candidate.list.invoke({ sessionId })
  );

  const { data: recommendation } = useSWR(
    currentStage === 'convergence' ? `decision.recommendation.${sessionId}` : null,
    () => ipcBridge.decision.recommendation.get.invoke({ sessionId })
  );

  const { data: dimensions } = useSWR(showCandidates ? `decision.dimensions.${sessionId}` : null, () =>
    ipcBridge.decision.dimension.list.invoke({ sessionId })
  );

  const { data: insights } = useSWR(`decision.insights.${sessionId}`, () =>
    ipcBridge.decision.insight.list.invoke({ sessionId })
  );

  const dimensionNames = new Map((dimensions ?? []).map((d) => [d.id, d.name]));

  return (
    <div className='h-full overflow-auto p-4'>
      <Title heading={6} className='!mb-4 !mt-0 text-t-primary font-medium'>
        结构化数据
      </Title>

      {/* 调研条目 */}
      {currentStage === 'research' || currentStage === 'comparison' ? (
        <div className='mb-5'>
          <Text className='text-[13px] font-bold block mb-2 text-t-primary'>
            调研条目{' '}
            <Tag size='small' color='arcoblue' className='ml-1 rounded-full px-1.5'>
              {researchItems?.length ?? 0}
            </Tag>
          </Text>
          {researchItems && researchItems.length > 0 ? (
            researchItems.map((item) => (
              <Card key={item.id} size='small' className='mb-2.5 hover:shadow-sm transition-all border border-color-2'>
                <Text className='font-medium block text-t-primary'>{item.title}</Text>
                <Text type='secondary' className='text-xs block mt-1'>
                  {(item.summary ?? '').substring(0, 80)}
                  {(item.summary ?? '').length > 80 ? '...' : ''}
                </Text>
                {(item.tags ?? []).length > 0 && (
                  <div className='mt-1 flex gap-1 flex-wrap'>
                    {item.tags.map((tag) => (
                      <Tag key={tag} size='small' color='arcoblue'>
                        {tag}
                      </Tag>
                    ))}
                  </div>
                )}
              </Card>
            ))
          ) : (
            <Empty
              className='py-6'
              icon={
                <div className='text-3xl text-color-3 mx-auto mb-1 flex justify-center'>
                  <Inbox />
                </div>
              }
              description='暂无调研条目'
            />
          )}
        </div>
      ) : null}

      {/* 候选方案 */}
      {currentStage === 'comparison' || currentStage === 'convergence' ? (
        <div className='mb-5'>
          <Text className='text-[13px] font-bold block mb-2 text-t-primary'>
            候选方案{' '}
            <Tag size='small' color='arcoblue' className='ml-1 rounded-full px-1.5'>
              {candidates?.length ?? 0}
            </Tag>
          </Text>
          {candidates && candidates.length > 0 ? (
            candidates.map((c) => {
              const scores = c.scores ?? {};
              const scoreEntries = Object.entries(scores);
              return (
                <Card key={c.id} size='small' className='mb-2.5 hover:shadow-sm transition-all border border-color-2'>
                  <Text className='font-medium block text-t-primary'>{c.name}</Text>
                  <Text type='secondary' className='text-xs block mt-1'>
                    {(c.description ?? '').substring(0, 60)}
                    {(c.description ?? '').length > 60 ? '...' : ''}
                  </Text>
                  {scoreEntries.length > 0 ? (
                    <div className='mt-2 flex flex-col gap-1'>
                      {scoreEntries.map(([dimId, score]) => {
                        const dimName = dimensionNames.get(dimId) ?? '评估维度';
                        const val = typeof score.value === 'number' ? score.value : '-';
                        return (
                          <div key={dimId} className='flex items-center justify-between text-xs'>
                            <Text type='secondary' className='truncate max-w-120px'>
                              {dimName}
                            </Text>
                            <Tag size='small' color='green'>
                              {val} 分
                            </Tag>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Tag size='small' color='gray' className='mt-1'>
                      未评分
                    </Tag>
                  )}
                </Card>
              );
            })
          ) : (
            <Empty
              className='py-6'
              icon={
                <div className='text-3xl text-color-3 mx-auto mb-1 flex justify-center'>
                  <Inbox />
                </div>
              }
              description='暂无候选方案'
            />
          )}
        </div>
      ) : null}

      {/* 决策建议 */}
      {currentStage === 'convergence' && recommendation ? (
        <div className='mb-5'>
          <Text className='text-[13px] font-bold block mb-2 text-t-primary'>决策建议</Text>
          <Card size='small' className='border border-[var(--color-primary-light-3)] bg-[var(--color-primary-light-1)]'>
            <Text className='block font-medium text-[var(--color-primary-7)]'>
              {(recommendation.reasoning ?? '').substring(0, 150)}
            </Text>
            {(recommendation.nextSteps ?? []).length > 0 && (
              <div className='mt-2'>
                <Text type='secondary' className='text-xs block'>
                  下一步：
                </Text>
                {recommendation.nextSteps.map((step, i) => (
                  <Text key={i} type='secondary' className='text-xs block'>
                    • {step}
                  </Text>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {/* 洞见 */}
      {insights && insights.length > 0 ? (
        <div className='mb-5'>
          <Text className='text-[13px] font-bold block mb-2 text-t-primary'>
            洞见{' '}
            <Tag size='small' color='arcoblue' className='ml-1 rounded-full px-1.5'>
              {insights.length}
            </Tag>
          </Text>
          {insights.slice(-5).map((insight) => (
            <div key={insight.id} className='mb-2 p-2.5 bg-fill-1 rd-1 border border-color-2'>
              <Text className='text-xs block'>{insight.content}</Text>
              <Tag
                size='small'
                color={insight.importance === 'high' ? 'red' : insight.importance === 'medium' ? 'orange' : 'gray'}
                className='mt-1'
              >
                {insight.importance}
              </Tag>
            </div>
          ))}
        </div>
      ) : null}

      {/* 问题定义阶段 — 显示提示 */}
      {currentStage === 'problem_definition' && (
        <div className='py-8 mt-4 text-center bg-fill-1 rd-2 border border-color-2'>
          <div className='text-[40px] text-color-3 mb-3 flex justify-center opacity-50'>
            <Inbox />
          </div>
          <Text type='secondary' className='font-medium text-[13px]'>
            与 AI 对话，描述你的问题
          </Text>
          <Text type='secondary' className='block mt-1.5 text-xs px-4 opacity-80'>
            AI 会帮你梳理成结构化的需求简报
          </Text>
        </div>
      )}
    </div>
  );
};

export default ContextPanel;
