// src/process/bridge/decisionBridge.ts
// 决策支持工作台 — IPC Bridge 层

import { ipcBridge } from '@/common';
import type { DecisionService } from '@process/decision/DecisionService';
import type { DecisionStage } from '@process/decision/types';

function safeProvider<R, P>(fn: (params: P) => Promise<R>) {
  return async (params: P): Promise<R> => {
    try {
      return await fn(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[decisionBridge] provider error:', message);
      return { __bridgeError: true, message } as unknown as R;
    }
  };
}

export function initDecisionBridge(service: DecisionService): void {
  // ── Workspace ────────────────────────────────────

  ipcBridge.decision.workspace.list.provider(
    safeProvider(async (p) => service.listWorkspaces(p.userId))
  );
  ipcBridge.decision.workspace.create.provider(
    safeProvider(async (p) => service.createWorkspace(p.userId, p.name, p.description))
  );
  ipcBridge.decision.workspace.get.provider(
    safeProvider(async (p) => service.getWorkspace(p.id))
  );
  ipcBridge.decision.workspace.update.provider(
    safeProvider(async (p) => service.updateWorkspace(p.id, p.updates))
  );
  ipcBridge.decision.workspace.delete.provider(
    safeProvider(async (p) => service.deleteWorkspace(p.id))
  );

  // ── Session ──────────────────────────────────────

  ipcBridge.decision.session.list.provider(
    safeProvider(async (p) => service.listSessions(p.workspaceId))
  );
  ipcBridge.decision.session.create.provider(
    safeProvider(async (p) => service.createSession(p.workspaceId, p.conversationId))
  );
  ipcBridge.decision.session.get.provider(
    safeProvider(async (p) => service.getSession(p.id))
  );
  ipcBridge.decision.session.getWithStages.provider(
    safeProvider(async (p) => service.getSessionWithStages(p.id))
  );
  ipcBridge.decision.session.recent.provider(
    safeProvider(async (p) => service.getRecentSessions(p.userId, p.limit))
  );
  ipcBridge.decision.session.advance.provider(
    safeProvider(async (p) => {
      const result = await service.advanceStage(p.sessionId, p.conversationId);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'stage_advanced' });
      return result;
    })
  );
  ipcBridge.decision.session.revert.provider(
    safeProvider(async (p) => {
      const result = await service.revertStage(p.sessionId, p.targetStage as DecisionStage, p.conversationId);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'stage_reverted' });
      return result;
    })
  );
  ipcBridge.decision.session.skip.provider(
    safeProvider(async (p) => {
      const result = await service.skipStage(p.sessionId, p.conversationId);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'stage_skipped' });
      return result;
    })
  );
  ipcBridge.decision.session.complete.provider(
    safeProvider(async (p) => service.completeSession(p.sessionId))
  );
  ipcBridge.decision.session.archive.provider(
    safeProvider(async (p) => service.archiveSession(p.sessionId))
  );
  ipcBridge.decision.session.delete.provider(
    safeProvider(async (p) => service.deleteSession(p.id))
  );

  // ── Stage ────────────────────────────────────────

  ipcBridge.decision.stage.getCurrent.provider(
    safeProvider(async (p) => service.getActiveStageRun(p.sessionId))
  );
  ipcBridge.decision.stage.getHistory.provider(
    safeProvider(async (p) => service.getStageRunHistory(p.sessionId, p.stage))
  );
  ipcBridge.decision.stage.getCompletionStatus.provider(
    safeProvider(async (p) => service.checkStageCompletion(p.sessionId, p.stage as DecisionStage))
  );
  ipcBridge.decision.stage.update.provider(
    safeProvider(async (p) => service.updateStageRun(p.id, p.updates))
  );
  ipcBridge.decision.stage.getByConversation.provider(
    safeProvider(async (p) => service.getStageRunByConversation(p.conversationId))
  );

  // ── ResearchItem ─────────────────────────────────

  ipcBridge.decision.research.list.provider(
    safeProvider(async (p) => service.listResearchItems(p.sessionId))
  );
  ipcBridge.decision.research.add.provider(
    safeProvider(async (p) => {
      const item = await service.addResearchItem(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'research_added', entityId: item.id });
      return item;
    })
  );
  ipcBridge.decision.research.update.provider(
    safeProvider(async (p) => {
      const item = await service.updateResearchItem(p.id, p.updates);
      ipcBridge.decision.dataChanged.emit({ sessionId: item.sessionId, type: 'research_updated', entityId: p.id });
      return item;
    })
  );
  ipcBridge.decision.research.delete.provider(
    safeProvider(async (p) => {
      await service.deleteResearchItem(p.id);
      ipcBridge.decision.dataChanged.emit({ sessionId: '', type: 'research_deleted', entityId: p.id });
    })
  );

  // ── Evidence ─────────────────────────────────────

  ipcBridge.decision.evidence.list.provider(
    safeProvider(async (p) => service.listEvidence(p.researchItemId))
  );
  ipcBridge.decision.evidence.add.provider(
    safeProvider(async (p) => {
      const { sessionId, ...evidenceData } = p;
      const ev = await service.addEvidence(evidenceData);
      ipcBridge.decision.dataChanged.emit({ sessionId, type: 'evidence_added', entityId: ev.id });
      return ev;
    })
  );
  ipcBridge.decision.evidence.delete.provider(
    safeProvider(async (p) => service.deleteEvidence(p.id))
  );

  // ── CandidateOption ──────────────────────────────

  ipcBridge.decision.candidate.list.provider(
    safeProvider(async (p) => service.listCandidates(p.sessionId))
  );
  ipcBridge.decision.candidate.add.provider(
    safeProvider(async (p) => {
      const c = await service.addCandidate(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'candidate_added', entityId: c.id });
      return c;
    })
  );
  ipcBridge.decision.candidate.update.provider(
    safeProvider(async (p) => {
      const c = await service.updateCandidate(p.id, p.updates);
      ipcBridge.decision.dataChanged.emit({ sessionId: c.sessionId, type: 'candidate_updated', entityId: p.id });
      return c;
    })
  );
  ipcBridge.decision.candidate.delete.provider(
    safeProvider(async (p) => {
      await service.deleteCandidate(p.id);
      ipcBridge.decision.dataChanged.emit({ sessionId: '', type: 'candidate_deleted', entityId: p.id });
    })
  );

  // ── ScoreDimension ───────────────────────────────

  ipcBridge.decision.dimension.list.provider(
    safeProvider(async (p) => service.listDimensions(p.sessionId))
  );
  ipcBridge.decision.dimension.add.provider(
    safeProvider(async (p) => {
      const dim = await service.addDimension(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: dim.sessionId, type: 'dimension_added', entityId: dim.id });
      return dim;
    })
  );
  ipcBridge.decision.dimension.update.provider(
    safeProvider(async (p) => {
      const dim = await service.updateDimension(p.id, p.updates);
      ipcBridge.decision.dataChanged.emit({ sessionId: dim.sessionId, type: 'dimension_updated', entityId: p.id });
      return dim;
    })
  );
  ipcBridge.decision.dimension.delete.provider(
    safeProvider(async (p) => {
      await service.deleteDimension(p.id);
      ipcBridge.decision.dataChanged.emit({ sessionId: '', type: 'dimension_deleted', entityId: p.id });
    })
  );

  // ── Recommendation ───────────────────────────────

  ipcBridge.decision.recommendation.get.provider(
    safeProvider(async (p) => service.getRecommendation(p.sessionId))
  );
  ipcBridge.decision.recommendation.create.provider(
    safeProvider(async (p) => {
      const rec = await service.createRecommendation(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'recommendation_created', entityId: rec.id });
      return rec;
    })
  );
  ipcBridge.decision.recommendation.update.provider(
    safeProvider(async (p) => {
      const rec = await service.updateRecommendation(p.id, p.updates);
      ipcBridge.decision.dataChanged.emit({ sessionId: rec.sessionId, type: 'recommendation_updated', entityId: p.id });
      return rec;
    })
  );

  // ── Insight ──────────────────────────────────────

  ipcBridge.decision.insight.list.provider(
    safeProvider(async (p) => service.listInsights(p.sessionId))
  );
  ipcBridge.decision.insight.listByStage.provider(
    safeProvider(async (p) => service.listInsightsByStage(p.sessionId, p.stage))
  );
  ipcBridge.decision.insight.add.provider(
    safeProvider(async (p) => {
      const insight = await service.addInsight(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'insight_added', entityId: insight.id });
      return insight;
    })
  );

  // ── Analytics ────────────────────────────────────

  ipcBridge.decision.analytics.contextSummary.provider(
    safeProvider(async (p) => service.aggregateContextSummary(p.sessionId))
  );
  ipcBridge.decision.analytics.contextDetail.provider(
    safeProvider(async (p) => service.aggregateContextDetail(p.sessionId, p.stage as DecisionStage))
  );
  ipcBridge.decision.analytics.export.provider(
    safeProvider(async (p) => service.exportSession(p.sessionId))
  );

  console.log('[DecisionBridge] Initialized');
}
