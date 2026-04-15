import { useEffect } from 'react';
import { useSWRConfig } from 'swr';
import { ipcBridge } from '@/common';
import { useDecisionUI } from '../context/DecisionUIContext';

/**
 * 监听 decision.dataChanged IPC 事件，自动刷新 SWR 缓存。
 * 新增数据时触发高亮动画。
 */
export function useDecisionDataSync(sessionId: string | undefined) {
  const { mutate } = useSWRConfig();
  const ui = useDecisionUI();

  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = ipcBridge.decision.dataChanged.on((event) => {
      if (event.sessionId && event.sessionId !== sessionId) return;

      // 刷新 session 详情
      void mutate(`decision.session.${sessionId}`);

      // 按类型刷新对应数据
      if (event.type.startsWith('research_')) {
        void mutate(`decision.research.${sessionId}`);
      }
      if (event.type.startsWith('candidate_')) {
        void mutate(`decision.candidates.${sessionId}`);
      }
      if (event.type.startsWith('dimension_')) {
        void mutate(`decision.dimensions.${sessionId}`);
      }
      if (event.type.startsWith('recommendation_')) {
        void mutate(`decision.recommendation.${sessionId}`);
      }
      if (event.type.startsWith('insight_')) {
        void mutate(`decision.insights.${sessionId}`);
      }
      if (event.type.startsWith('evidence_')) {
        void mutate(`decision.evidence.${sessionId}`);
      }

      // 新增数据触发高亮
      if (event.entityId && event.type.endsWith('_added')) {
        ui.addHighlight(event.entityId);
      }
    });

    return unsubscribe;
  }, [sessionId, mutate, ui]);
}
