import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Input, Modal, Progress, Space, Tag, Typography } from '@arco-design/web-react';
import { Plus, Delete } from '@icon-park/react';
import { useDecisionWorkspaces } from '../hooks/useDecisionWorkspace';
import { STAGE_LABELS, STAGE_PROMPTS } from '../constants';
import { ipcBridge } from '@/common';
import type { DecisionWorkspaceSummary } from '@process/decision/types';

const { Title, Text } = Typography;

const STATUS_COLOR_MAP: Record<DecisionWorkspaceSummary['progress']['status'], string> = {
  idle: 'gray',
  active: 'arcoblue',
  completed: 'green',
  archived: 'orangered',
};

const STATUS_TEXT_MAP: Record<DecisionWorkspaceSummary['progress']['status'], string> = {
  idle: '未开始',
  active: '进行中',
  completed: '已完成',
  archived: '已归档',
};

const WorkbenchPage: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceSummaries, isLoading, createWorkspace, deleteWorkspace } = useDecisionWorkspaces();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await createWorkspace(newName.trim(), newDesc.trim());
    setCreateModalVisible(false);
    setNewName('');
    setNewDesc('');
    // 创建后自动创建第一个 session 并跳转
    // 暂时先跳转到工作空间，session 创建在 SessionPage 中处理
  }, [newName, newDesc, createWorkspace]);

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      Modal.confirm({
        title: '确认删除',
        content: `确定要删除工作空间「${name}」吗？其下所有会话数据将被删除。`,
        okButtonProps: { status: 'danger' },
        onOk: () => deleteWorkspace(id),
      });
    },
    [deleteWorkspace]
  );

  const handleOpenWorkspace = useCallback(
    async (workspaceId: string) => {
      // 获取该工作空间的 sessions
      const sessions = await ipcBridge.decision.session.list.invoke({ workspaceId });
      if (sessions.length > 0) {
        // 有 session，跳转到最近的
        navigate(`/decision/session/${sessions[0].id}`);
      } else {
        try {
          const conversation = await ipcBridge.conversation.create.invoke({
            type: 'acp',
            name: '决策会话 - 问题定义',
            model: {} as import('@/common/config/storage').TProviderWithModel,
            extra: {
              backend: 'codex',
              presetContext: STAGE_PROMPTS.problem_definition,
            },
          });
          const result = await ipcBridge.decision.session.create.invoke({
            workspaceId,
            conversationId: conversation.id,
          });
          navigate(`/decision/session/${result.session.id}`);
        } catch (err) {
          Modal.error({
            title: '创建失败',
            content: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
    [navigate]
  );

  return (
    <div className='w-full h-full overflow-auto p-6'>
      <div className='max-w-4xl mx-auto'>
        <div className='flex items-center justify-between mb-6'>
          <Title heading={4} className='!mb-0'>
            决策工作台
          </Title>
          <Button type='primary' icon={<Plus />} onClick={() => setCreateModalVisible(true)}>
            新建工作空间
          </Button>
        </div>

        {isLoading ? (
          <div className='flex justify-center py-20'>
            <Text type='secondary'>加载中...</Text>
          </div>
        ) : workspaceSummaries.length === 0 ? (
          <Empty className='py-20' description='暂无工作空间，点击上方按钮创建第一个' />
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {workspaceSummaries.map((summary) => {
              const { workspace, progress } = summary;
              const currentStageLabel = progress.currentStage ? STAGE_LABELS[progress.currentStage] : '未开始';

              return (
                <Card
                  key={workspace.id}
                  hoverable
                  className='cursor-pointer'
                  onClick={() => handleOpenWorkspace(workspace.id)}
                  title={workspace.name}
                  extra={
                    <Button
                      type='text'
                      status='danger'
                      icon={<Delete />}
                      size='small'
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(workspace.id, workspace.name);
                      }}
                    />
                  }
                >
                  <div className='flex flex-col gap-3'>
                    <Text type='secondary'>{workspace.description || '暂无描述'}</Text>

                    <div className='flex items-center justify-between gap-3'>
                      <Tag color={STATUS_COLOR_MAP[progress.status]}>{STATUS_TEXT_MAP[progress.status]}</Tag>
                      <Text type='secondary' className='text-xs'>
                        {summary.sessionCount} 个会话 · 已完成 {summary.completedSessionCount}
                      </Text>
                    </div>

                    <div className='flex flex-col gap-1.5'>
                      <div className='flex items-center justify-between gap-3'>
                        <Text className='text-sm font-medium text-t-primary'>决策进度</Text>
                        <Text type='secondary' className='text-xs'>
                          {progress.reachedStages}/{progress.totalStages}
                        </Text>
                      </div>
                      <Progress percent={progress.percent} showText={false} size='small' />
                      <div className='flex items-center justify-between gap-3'>
                        <Text type='secondary' className='text-xs'>
                          当前阶段 {currentStageLabel}
                        </Text>
                        <Text type='secondary' className='text-xs'>
                          创建于 {new Date(workspace.createdAt).toLocaleDateString('zh-CN')}
                        </Text>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Modal
          title='新建工作空间'
          visible={createModalVisible}
          onOk={handleCreate}
          onCancel={() => setCreateModalVisible(false)}
          okText='创建'
          cancelText='取消'
          autoFocus={false}
        >
          <Space direction='vertical' className='w-full'>
            <div>
              <Text className='mb-1 block'>名称</Text>
              <Input
                placeholder='例如：Q3 产品路线图决策'
                value={newName}
                onChange={setNewName}
                onPressEnter={handleCreate}
              />
            </div>
            <div>
              <Text className='mb-1 block'>描述（可选）</Text>
              <Input.TextArea
                placeholder='简述这个决策要解决的问题'
                value={newDesc}
                onChange={setNewDesc}
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>
          </Space>
        </Modal>
      </div>
    </div>
  );
};

export default WorkbenchPage;
