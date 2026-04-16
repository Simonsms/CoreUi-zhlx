import React, { useEffect, useState } from 'react';
import { Button, Select } from '@arco-design/web-react';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpInitializeResult } from '@/common/types/acpTypes';
import AionModal from '@renderer/components/base/AionModal';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import {
  agentKey,
  agentFromKey,
  filterTeamSupportedAgents,
  AgentOptionLabel,
  resolveTeamAgentType,
  resolveConversationType,
} from '@renderer/pages/team/components/agentSelectUtils';
import type { DecisionStage } from '@process/decision/types';
import { STAGE_LABELS } from '../../constants';

export type StageAgentSelection = {
  agentKey: string;
  agentType: string;
  conversationType: 'gemini' | 'acp' | 'aionrs' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote';
  cliPath?: string;
  customAgentId?: string;
};

type Props = {
  visible: boolean;
  targetStage: DecisionStage;
  onClose: () => void;
  onConfirm: (selection: StageAgentSelection) => void;
};

const StageAgentModal: React.FC<Props> = ({ visible, targetStage, onClose, onConfirm }) => {
  const { cliAgents, presetAssistants } = useConversationAgents();
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [cachedInitResults, setCachedInitResults] = useState<Record<string, AcpInitializeResult> | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    ConfigStorage.get('acp.cachedInitializeResult')
      .then((data) => {
        if (active) setCachedInitResults(data ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible]);

  const allAgents = filterTeamSupportedAgents([...cliAgents, ...presetAssistants], cachedInitResults);

  const handleClose = () => {
    setSelectedKey(undefined);
    onClose();
  };

  const handleConfirm = () => {
    if (!selectedKey) return;
    const agent = agentFromKey(selectedKey, allAgents);
    const agentType = resolveTeamAgentType(agent, 'claude');
    onConfirm({
      agentKey: selectedKey,
      agentType,
      conversationType: resolveConversationType(agentType),
      cliPath: agent?.cliPath,
      customAgentId: agent?.customAgentId,
    });
    handleClose();
  };

  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      header={`为「${STAGE_LABELS[targetStage]}」选择 AI 助手`}
      footer={
        <div className='flex justify-end pt-4px'>
          <Button
            type='primary'
            disabled={!selectedKey}
            onClick={handleConfirm}
            className='px-20px min-w-80px'
            style={{ borderRadius: 8 }}
          >
            确认
          </Button>
        </div>
      }
      size='small'
    >
      <div className='flex flex-col gap-4 p-5'>
        <div className='text-[13px] text-[var(--color-primary-7)] bg-[var(--color-primary-light-1)] p-3 rd-1 border border-[var(--color-primary-light-2)] leading-relaxed'>
          选择一个 AI 助手来处理「<strong>{STAGE_LABELS[targetStage]}</strong>
          」阶段的对话。不同的模型可以提供不同的分析视角。
        </div>
        <div className='flex flex-col gap-2'>
          <label className='text-[13px] text-t-primary font-medium'>AI 助手</label>
          <Select
            placeholder={allAgents.length === 0 ? '未检测到可用 Agent' : '选择 AI 助手'}
            value={selectedKey}
            onChange={setSelectedKey}
            showSearch
            allowClear
            disabled={allAgents.length === 0}
            getPopupContainer={() => document.body}
            renderFormat={(option) => {
              const agent = option?.value ? allAgents.find((a) => agentKey(a) === option.value) : undefined;
              return agent ? <AgentOptionLabel agent={agent} /> : <span>{option?.children}</span>;
            }}
          >
            {allAgents.map((agent) => (
              <Select.Option key={agentKey(agent)} value={agentKey(agent)}>
                <AgentOptionLabel agent={agent} />
              </Select.Option>
            ))}
          </Select>
        </div>
      </div>
    </AionModal>
  );
};

export default StageAgentModal;
