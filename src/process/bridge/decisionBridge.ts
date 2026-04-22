// src/process/bridge/decisionBridge.ts
// 决策支持工作台 — IPC Bridge 层

import { ipcBridge } from '@/common';
import type { DecisionService } from '@process/decision/DecisionService';
import type { DecisionStage } from '@process/decision/types';

let currentDecisionService: DecisionService | null = null;
let providersRegistered = false;

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

function getDecisionService(): DecisionService {
  if (!currentDecisionService) {
    throw new Error('Decision service is not initialized');
  }

  return currentDecisionService;
}

function safeDecisionProvider<R, P>(fn: (service: DecisionService, params: P) => Promise<R>) {
  return safeProvider(async (params: P) => fn(getDecisionService(), params));
}

export function initDecisionBridge(service: DecisionService): void {
  currentDecisionService = service;

  if (providersRegistered) {
    return;
  }
  providersRegistered = true;

  // ── Workspace ────────────────────────────────────

  ipcBridge.decision.workspace.list.provider(
    safeDecisionProvider(async (service, p) => service.listWorkspaces(p.userId))
  );
  ipcBridge.decision.workspace.create.provider(
    safeDecisionProvider(async (service, p) => service.createWorkspace(p.userId, p.name, p.description))
  );
  ipcBridge.decision.workspace.get.provider(safeDecisionProvider(async (service, p) => service.getWorkspace(p.id)));
  ipcBridge.decision.workspace.update.provider(
    safeDecisionProvider(async (service, p) => service.updateWorkspace(p.id, p.updates))
  );
  ipcBridge.decision.workspace.delete.provider(
    safeDecisionProvider(async (service, p) => service.deleteWorkspace(p.id))
  );

  // ── Session ──────────────────────────────────────

  ipcBridge.decision.session.list.provider(
    safeDecisionProvider(async (service, p) => service.listSessions(p.workspaceId))
  );
  ipcBridge.decision.session.create.provider(
    safeDecisionProvider(async (service, p) => service.createSession(p.workspaceId, p.conversationId))
  );
  ipcBridge.decision.session.get.provider(safeDecisionProvider(async (service, p) => service.getSession(p.id)));
  ipcBridge.decision.session.getWithStages.provider(
    safeDecisionProvider(async (service, p) => service.getSessionWithStages(p.id))
  );
  ipcBridge.decision.session.recent.provider(
    safeDecisionProvider(async (service, p) => service.getRecentSessions(p.userId, p.limit))
  );
  ipcBridge.decision.session.advance.provider(
    safeDecisionProvider(async (service, p) => {
      const result = await service.advanceStage(p.sessionId, p.conversationId);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'stage_advanced' });
      return result;
    })
  );
  ipcBridge.decision.session.revert.provider(
    safeDecisionProvider(async (service, p) => {
      const result = await service.revertStage(p.sessionId, p.targetStage as DecisionStage, p.conversationId);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'stage_reverted' });
      return result;
    })
  );
  ipcBridge.decision.session.skip.provider(
    safeDecisionProvider(async (service, p) => {
      const result = await service.skipStage(p.sessionId, p.conversationId);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'stage_skipped' });
      return result;
    })
  );
  ipcBridge.decision.session.complete.provider(
    safeDecisionProvider(async (service, p) => {
      const result = await service.completeSession(p.sessionId);
      ipcBridge.decision.dataChanged.emit({
        sessionId: p.sessionId,
        type: 'session_completed',
      });
      return result;
    })
  );
  ipcBridge.decision.session.archive.provider(
    safeDecisionProvider(async (service, p) => service.archiveSession(p.sessionId))
  );
  ipcBridge.decision.session.delete.provider(safeDecisionProvider(async (service, p) => service.deleteSession(p.id)));

  // ── Stage ────────────────────────────────────────

  ipcBridge.decision.stage.getCurrent.provider(
    safeDecisionProvider(async (service, p) => service.getActiveStageRun(p.sessionId))
  );
  ipcBridge.decision.stage.getHistory.provider(
    safeDecisionProvider(async (service, p) => service.getStageRunHistory(p.sessionId, p.stage))
  );
  ipcBridge.decision.stage.getCompletionStatus.provider(
    safeDecisionProvider(async (service, p) => service.checkStageCompletion(p.sessionId, p.stage as DecisionStage))
  );
  ipcBridge.decision.stage.update.provider(
    safeDecisionProvider(async (service, p) => service.updateStageRun(p.id, p.updates))
  );
  ipcBridge.decision.stage.getByConversation.provider(
    safeDecisionProvider(async (service, p) => service.getStageRunByConversation(p.conversationId))
  );

  // ── ResearchItem ─────────────────────────────────

  ipcBridge.decision.research.list.provider(
    safeDecisionProvider(async (service, p) => service.listResearchItems(p.sessionId))
  );
  ipcBridge.decision.research.add.provider(
    safeDecisionProvider(async (service, p) => {
      const item = await service.addResearchItem(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'research_added', entityId: item.id });
      return item;
    })
  );
  ipcBridge.decision.research.update.provider(
    safeDecisionProvider(async (service, p) => {
      const item = await service.updateResearchItem(p.id, p.updates);
      ipcBridge.decision.dataChanged.emit({ sessionId: item.sessionId, type: 'research_updated', entityId: p.id });
      return item;
    })
  );
  ipcBridge.decision.research.delete.provider(
    safeDecisionProvider(async (service, p) => {
      await service.deleteResearchItem(p.id);
      ipcBridge.decision.dataChanged.emit({ sessionId: '', type: 'research_deleted', entityId: p.id });
    })
  );

  // ── Evidence ─────────────────────────────────────

  ipcBridge.decision.evidence.list.provider(
    safeDecisionProvider(async (service, p) => service.listEvidence(p.researchItemId))
  );
  ipcBridge.decision.evidence.add.provider(
    safeDecisionProvider(async (service, p) => {
      const { sessionId, ...evidenceData } = p;
      const ev = await service.addEvidence(evidenceData);
      ipcBridge.decision.dataChanged.emit({ sessionId, type: 'evidence_added', entityId: ev.id });
      return ev;
    })
  );
  ipcBridge.decision.evidence.delete.provider(safeDecisionProvider(async (service, p) => service.deleteEvidence(p.id)));

  // ── CandidateOption ──────────────────────────────

  ipcBridge.decision.candidate.list.provider(
    safeDecisionProvider(async (service, p) => service.listCandidates(p.sessionId))
  );
  ipcBridge.decision.candidate.add.provider(
    safeDecisionProvider(async (service, p) => {
      const c = await service.addCandidate(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'candidate_added', entityId: c.id });
      return c;
    })
  );
  ipcBridge.decision.candidate.update.provider(
    safeDecisionProvider(async (service, p) => {
      const c = await service.updateCandidate(p.id, p.updates);
      ipcBridge.decision.dataChanged.emit({ sessionId: c.sessionId, type: 'candidate_updated', entityId: p.id });
      return c;
    })
  );
  ipcBridge.decision.candidate.delete.provider(
    safeDecisionProvider(async (service, p) => {
      await service.deleteCandidate(p.id);
      ipcBridge.decision.dataChanged.emit({ sessionId: '', type: 'candidate_deleted', entityId: p.id });
    })
  );

  // ── ScoreDimension ───────────────────────────────

  ipcBridge.decision.dimension.list.provider(
    safeDecisionProvider(async (service, p) => service.listDimensions(p.sessionId))
  );
  ipcBridge.decision.dimension.add.provider(
    safeDecisionProvider(async (service, p) => {
      const dim = await service.addDimension(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: dim.sessionId, type: 'dimension_added', entityId: dim.id });
      return dim;
    })
  );
  ipcBridge.decision.dimension.update.provider(
    safeDecisionProvider(async (service, p) => {
      const dim = await service.updateDimension(p.id, p.updates);
      ipcBridge.decision.dataChanged.emit({ sessionId: dim.sessionId, type: 'dimension_updated', entityId: p.id });
      return dim;
    })
  );
  ipcBridge.decision.dimension.delete.provider(
    safeDecisionProvider(async (service, p) => {
      await service.deleteDimension(p.id);
      ipcBridge.decision.dataChanged.emit({ sessionId: '', type: 'dimension_deleted', entityId: p.id });
    })
  );

  // ── Recommendation ───────────────────────────────

  ipcBridge.decision.recommendation.get.provider(
    safeDecisionProvider(async (service, p) => service.getRecommendation(p.sessionId))
  );
  ipcBridge.decision.recommendation.create.provider(
    safeDecisionProvider(async (service, p) => {
      const rec = await service.createRecommendation(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'recommendation_created', entityId: rec.id });
      return rec;
    })
  );
  ipcBridge.decision.recommendation.update.provider(
    safeDecisionProvider(async (service, p) => {
      const rec = await service.updateRecommendation(p.id, p.updates);
      ipcBridge.decision.dataChanged.emit({ sessionId: rec.sessionId, type: 'recommendation_updated', entityId: p.id });
      return rec;
    })
  );

  // ── Insight ──────────────────────────────────────

  ipcBridge.decision.insight.list.provider(
    safeDecisionProvider(async (service, p) => service.listInsights(p.sessionId))
  );
  ipcBridge.decision.insight.listByStage.provider(
    safeDecisionProvider(async (service, p) => service.listInsightsByStage(p.sessionId, p.stage))
  );
  ipcBridge.decision.insight.add.provider(
    safeDecisionProvider(async (service, p) => {
      const insight = await service.addInsight(p);
      ipcBridge.decision.dataChanged.emit({ sessionId: p.sessionId, type: 'insight_added', entityId: insight.id });
      return insight;
    })
  );

  // ── Analytics ────────────────────────────────────

  ipcBridge.decision.analytics.contextSummary.provider(
    safeDecisionProvider(async (service, p) => service.aggregateContextSummary(p.sessionId))
  );
  ipcBridge.decision.analytics.contextDetail.provider(
    safeDecisionProvider(async (service, p) => service.aggregateContextDetail(p.sessionId, p.stage as DecisionStage))
  );
  ipcBridge.decision.analytics.export.provider(
    safeDecisionProvider(async (service, p) => service.exportSession(p.sessionId))
  );

  console.log('[DecisionBridge] Initialized');
}
