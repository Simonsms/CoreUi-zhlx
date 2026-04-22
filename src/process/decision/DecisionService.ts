// src/process/decision/DecisionService.ts
// 决策支持工作台 — 业务逻辑层

import { uuid } from '@/common/utils';
import type { IDecisionRepository } from './repository/IDecisionRepository';
import type {
  CandidateOption,
  DecisionRecommendation,
  DecisionSession,
  DecisionStage,
  DecisionWorkspace,
  Evidence,
  Insight,
  ResearchItem,
  ScoreDimension,
  StageCompletionStatus,
  StageRun,
} from './types';
import { STAGE_ORDER } from './types';

const STAGE_LABELS: Record<DecisionStage, string> = {
  problem_definition: '问题定义',
  research: '调研发散',
  comparison: '方案评估',
  convergence: '决策收敛',
};

export class DecisionService {
  constructor(private readonly repo: IDecisionRepository) {}

  private async requireSession(sessionId: string): Promise<DecisionSession> {
    const session = await this.repo.findSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  private assertStageAllowed(session: DecisionSession, allowedStages: DecisionStage[], actionLabel: string): void {
    if (allowedStages.includes(session.currentStage)) {
      return;
    }

    const allowed = allowedStages.map((stage) => STAGE_LABELS[stage]).join(' / ');
    throw new Error(`${actionLabel}仅允许在${allowed}阶段执行，当前阶段为${STAGE_LABELS[session.currentStage]}`);
  }

  private async assertSessionInStage(
    sessionId: string,
    allowedStages: DecisionStage[],
    actionLabel: string
  ): Promise<DecisionSession> {
    const session = await this.requireSession(sessionId);
    this.assertStageAllowed(session, allowedStages, actionLabel);
    return session;
  }

  // ── Workspace ──────────────────────────────────────

  async createWorkspace(userId: string, name: string, description = ''): Promise<DecisionWorkspace> {
    const now = Date.now();
    return this.repo.createWorkspace({
      id: uuid(),
      userId,
      name,
      description,
      createdAt: now,
      updatedAt: now,
    });
  }

  async getWorkspace(id: string): Promise<DecisionWorkspace | null> {
    return this.repo.findWorkspace(id);
  }

  async listWorkspaces(userId: string): Promise<DecisionWorkspace[]> {
    return this.repo.findAllWorkspaces(userId);
  }

  async updateWorkspace(id: string, updates: Partial<DecisionWorkspace>): Promise<DecisionWorkspace> {
    return this.repo.updateWorkspace(id, updates);
  }

  async deleteWorkspace(id: string): Promise<void> {
    return this.repo.deleteWorkspace(id);
  }

  // ── Session ────────────────────────────────────────

  /**
   * 创建决策会话，同时创建第一个 StageRun（problem_definition）。
   * 调用方需要负责创建对应的 Conversation 并传入 conversationId。
   */
  async createSession(
    workspaceId: string,
    firstConversationId: string
  ): Promise<{ session: DecisionSession; stageRun: StageRun }> {
    const now = Date.now();
    const session = await this.repo.createSession({
      id: uuid(),
      workspaceId,
      currentStage: 'problem_definition',
      status: 'active',
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    const stageRun = await this.repo.createStageRun({
      id: uuid(),
      sessionId: session.id,
      stage: 'problem_definition',
      runNumber: 1,
      conversationId: firstConversationId,
      status: 'active',
      output: '{}',
      createdAt: now,
      completedAt: null,
    });

    return { session, stageRun };
  }

  async getSession(id: string): Promise<DecisionSession | null> {
    return this.repo.findSession(id);
  }

  async listSessions(workspaceId: string): Promise<DecisionSession[]> {
    return this.repo.findSessionsByWorkspace(workspaceId);
  }

  async getRecentSessions(userId: string, limit?: number): Promise<DecisionSession[]> {
    return this.repo.getRecentSessions(userId, limit);
  }

  async getSessionWithStages(sessionId: string): Promise<{
    session: DecisionSession;
    stageRuns: StageRun[];
  } | null> {
    const session = await this.repo.findSession(sessionId);
    if (!session) return null;
    const stageRuns = await this.repo.findStageRunsBySession(sessionId);
    return { session, stageRuns };
  }

  async archiveSession(sessionId: string): Promise<DecisionSession> {
    return this.repo.updateSession(sessionId, { status: 'archived' });
  }

  async deleteSession(id: string): Promise<void> {
    return this.repo.deleteSession(id);
  }

  // ── 阶段流转 ──────────────────────────────────────

  /**
   * 推进到下一阶段。
   * 调用方需要为新阶段创建 Conversation 并传入 conversationId。
   */
  async advanceStage(
    sessionId: string,
    newConversationId: string
  ): Promise<{ session: DecisionSession; stageRun: StageRun }> {
    const session = await this.repo.findSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status !== 'active') throw new Error(`Session ${sessionId} is ${session.status}, cannot advance`);

    const currentIdx = STAGE_ORDER.indexOf(session.currentStage);
    if (currentIdx === STAGE_ORDER.length - 1) {
      throw new Error(`Session ${sessionId} is already at final stage: ${session.currentStage}`);
    }

    // 标记当前阶段完成
    const activeRun = await this.repo.findActiveStageRun(sessionId);
    if (activeRun) {
      await this.repo.updateStageRun(activeRun.id, {
        status: 'completed',
        completedAt: Date.now(),
      });
    }

    // 创建下一阶段
    const nextStage = STAGE_ORDER[currentIdx + 1];
    const now = Date.now();

    // 查询该阶段已有的运行记录（回退场景）
    const history = await this.repo.findStageRunHistory(sessionId, nextStage);
    const runNumber = history.length + 1;

    const stageRun = await this.repo.createStageRun({
      id: uuid(),
      sessionId,
      stage: nextStage,
      runNumber,
      conversationId: newConversationId,
      status: 'active',
      output: '{}',
      createdAt: now,
      completedAt: null,
    });

    const updatedSession = await this.repo.updateSession(sessionId, {
      currentStage: nextStage,
    });

    return { session: updatedSession, stageRun };
  }

  /**
   * 回退到指定阶段。保留旧 StageRun 快照，创建新的运行。
   */
  async revertStage(
    sessionId: string,
    targetStage: DecisionStage,
    newConversationId: string
  ): Promise<{ session: DecisionSession; stageRun: StageRun }> {
    const session = await this.repo.findSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const targetIdx = STAGE_ORDER.indexOf(targetStage);
    const currentIdx = STAGE_ORDER.indexOf(session.currentStage);
    if (targetIdx >= currentIdx) {
      throw new Error(`Cannot revert: target stage ${targetStage} is not before current ${session.currentStage}`);
    }

    // 标记当前阶段为 completed（保留快照）
    const activeRun = await this.repo.findActiveStageRun(sessionId);
    if (activeRun) {
      await this.repo.updateStageRun(activeRun.id, {
        status: 'completed',
        completedAt: Date.now(),
      });
    }

    // 创建目标阶段的新运行
    const history = await this.repo.findStageRunHistory(sessionId, targetStage);
    const runNumber = history.length + 1;
    const now = Date.now();

    const stageRun = await this.repo.createStageRun({
      id: uuid(),
      sessionId,
      stage: targetStage,
      runNumber,
      conversationId: newConversationId,
      status: 'active',
      output: '{}',
      createdAt: now,
      completedAt: null,
    });

    const updatedSession = await this.repo.updateSession(sessionId, {
      currentStage: targetStage,
    });

    return { session: updatedSession, stageRun };
  }

  /**
   * 跳过当前阶段，直接进入下一阶段。
   */
  async skipStage(
    sessionId: string,
    newConversationId: string
  ): Promise<{ session: DecisionSession; stageRun: StageRun }> {
    const session = await this.repo.findSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // 先校验再写入，避免写入后抛异常导致数据库污染
    const currentIdx = STAGE_ORDER.indexOf(session.currentStage);
    if (currentIdx === STAGE_ORDER.length - 1) {
      throw new Error(`Cannot skip final stage: ${session.currentStage}`);
    }

    // 标记当前阶段为 skipped
    const activeRun = await this.repo.findActiveStageRun(sessionId);
    if (activeRun) {
      await this.repo.updateStageRun(activeRun.id, {
        status: 'skipped',
        completedAt: Date.now(),
      });
    }

    const nextStage = STAGE_ORDER[currentIdx + 1];
    const now = Date.now();
    const history = await this.repo.findStageRunHistory(sessionId, nextStage);

    const stageRun = await this.repo.createStageRun({
      id: uuid(),
      sessionId,
      stage: nextStage,
      runNumber: history.length + 1,
      conversationId: newConversationId,
      status: 'active',
      output: '{}',
      createdAt: now,
      completedAt: null,
    });

    const updatedSession = await this.repo.updateSession(sessionId, {
      currentStage: nextStage,
    });

    return { session: updatedSession, stageRun };
  }

  /**
   * 完成整个决策会话（在最后阶段确认后调用）。
   */
  async completeSession(sessionId: string): Promise<DecisionSession> {
    const session = await this.repo.findSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status !== 'active') throw new Error(`Session ${sessionId} is ${session.status}, cannot complete`);
    if (session.currentStage !== 'convergence') {
      throw new Error(`Session ${sessionId} is at ${session.currentStage}, must be at convergence to complete`);
    }

    const activeRun = await this.repo.findActiveStageRun(sessionId);
    if (activeRun) {
      await this.repo.updateStageRun(activeRun.id, {
        status: 'completed',
        completedAt: Date.now(),
      });
    }
    return this.repo.updateSession(sessionId, { status: 'completed' });
  }

  // ── 阶段完成条件检测 ──────────────────────────────

  async checkStageCompletion(sessionId: string, stage: DecisionStage): Promise<StageCompletionStatus> {
    const stageRuns = await this.repo.findStageRunHistory(sessionId, stage);
    const activeRun = stageRuns.find((r) => r.status === 'active');
    const output = activeRun ? activeRun.output : '{}';

    switch (stage) {
      case 'problem_definition': {
        const hasNeedBrief = output !== '{}' && output !== '';
        return {
          stage,
          met: hasNeedBrief,
          details: {
            needBrief: { required: true, current: hasNeedBrief, label: '需求简报' },
          },
        };
      }
      case 'research': {
        const items = await this.repo.findResearchItemsBySession(sessionId);
        const candidates = await this.repo.findCandidatesBySession(sessionId);
        return {
          stage,
          met: items.length >= 1 && candidates.length >= 1,
          details: {
            researchItems: { required: true, current: items.length, label: '调研条目数' },
            candidates: { required: true, current: candidates.length, label: '候选方案数' },
          },
        };
      }
      case 'comparison': {
        const candidates = await this.repo.findCandidatesBySession(sessionId);
        const scoredCount = candidates.filter((c) => Object.keys(c.scores).length > 0).length;
        return {
          stage,
          met: scoredCount >= 2,
          details: {
            scoredCandidates: { required: true, current: scoredCount, label: '已评分方案数' },
          },
        };
      }
      case 'convergence': {
        const rec = await this.repo.findRecommendationBySession(sessionId);
        return {
          stage,
          met: rec !== null,
          details: {
            recommendation: { required: true, current: rec !== null, label: '决策建议' },
          },
        };
      }
    }
  }

  // ── 上下文聚合 ─────────────────────────────────────

  async aggregateContextSummary(sessionId: string): Promise<string> {
    const stageRuns = await this.repo.findStageRunsBySession(sessionId);
    const items = await this.repo.findResearchItemsBySession(sessionId);
    const candidates = await this.repo.findCandidatesBySession(sessionId);
    const rec = await this.repo.findRecommendationBySession(sessionId);

    const parts: string[] = [];

    // 问题定义阶段产出
    const defRun = stageRuns.find((r) => r.stage === 'problem_definition' && r.status === 'completed');
    if (defRun && defRun.output !== '{}') {
      parts.push(`## 需求简报\n${defRun.output}`);
    }

    // 调研条目摘要（包含 ID，供后续阶段引用）
    if (items.length > 0) {
      parts.push(
        `## 调研摘要（共 ${items.length} 项）\n` +
          items.map((i) => `- **${i.title}** [id=${i.id}]: ${(i.summary ?? '').substring(0, 100)}`).join('\n')
      );
    }

    // 候选方案摘要（包含 ID，供评分和决策引用）
    if (candidates.length > 0) {
      parts.push(
        `## 候选方案（共 ${candidates.length} 个）\n` +
          candidates
            .map((c) => {
              const scoreCount = Object.keys(c.scores).length;
              const scoreInfo = scoreCount > 0 ? `（已评分 ${scoreCount} 维度）` : '（未评分）';
              return `- **${c.name}** [id=${c.id}]${scoreInfo}: ${(c.description ?? '').substring(0, 100)}`;
            })
            .join('\n')
      );
    }

    // 决策建议
    if (rec) {
      const chosen = candidates.find((c) => c.id === rec.recommendedOptionId);
      parts.push(
        `## 决策建议\n推荐方案：${chosen?.name ?? rec.recommendedOptionId}\n${rec.reasoning.substring(0, 200)}`
      );
    }

    return parts.join('\n\n');
  }

  async aggregateContextDetail(sessionId: string, stage: DecisionStage): Promise<Record<string, unknown>> {
    switch (stage) {
      case 'problem_definition': {
        const runs = await this.repo.findStageRunHistory(sessionId, stage);
        return { stageRuns: runs };
      }
      case 'research': {
        const items = await this.repo.findResearchItemsBySession(sessionId);
        return { researchItems: items };
      }
      case 'comparison': {
        const candidates = await this.repo.findCandidatesBySession(sessionId);
        const dimensions = await this.repo.findDimensionsBySession(sessionId);
        return { candidates, dimensions };
      }
      case 'convergence': {
        const rec = await this.repo.findRecommendationBySession(sessionId);
        const insights = await this.repo.findInsightsBySession(sessionId);
        return { recommendation: rec, insights };
      }
    }
  }

  // ── 数据导出 ───────────────────────────────────────

  async exportSession(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.repo.findSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const stageRuns = await this.repo.findStageRunsBySession(sessionId);
    const researchItems = await this.repo.findResearchItemsBySession(sessionId);
    const candidates = await this.repo.findCandidatesBySession(sessionId);
    const dimensions = await this.repo.findDimensionsBySession(sessionId);
    const recommendation = await this.repo.findRecommendationBySession(sessionId);
    const insights = await this.repo.findInsightsBySession(sessionId);

    // 加载所有 evidence
    const evidenceMap: Record<string, Evidence[]> = {};
    for (const item of researchItems) {
      evidenceMap[item.id] = await this.repo.findEvidenceByResearchItem(item.id);
    }

    return {
      session,
      stageRuns,
      researchItems,
      evidenceMap,
      candidates,
      dimensions,
      recommendation,
      insights,
      exportedAt: Date.now(),
    };
  }

  // ── 数据 CRUD 透传（供 Bridge 使用） ──────────────

  // StageRun
  async getActiveStageRun(sessionId: string): Promise<StageRun | null> {
    return this.repo.findActiveStageRun(sessionId);
  }

  async getStageRunHistory(sessionId: string, stage: string): Promise<StageRun[]> {
    return this.repo.findStageRunHistory(sessionId, stage);
  }

  async updateStageRun(id: string, updates: Partial<StageRun>): Promise<StageRun> {
    return this.repo.updateStageRun(id, updates);
  }

  async getStageRunByConversation(conversationId: string): Promise<StageRun | null> {
    return this.repo.findStageRunByConversation(conversationId);
  }

  // ResearchItem
  async addResearchItem(item: Omit<ResearchItem, 'id' | 'createdAt'>): Promise<ResearchItem> {
    await this.assertSessionInStage(item.sessionId, ['research'], '添加调研条目');
    return this.repo.createResearchItem({ ...item, id: uuid(), createdAt: Date.now() } as ResearchItem);
  }

  async listResearchItems(sessionId: string): Promise<ResearchItem[]> {
    return this.repo.findResearchItemsBySession(sessionId);
  }

  async updateResearchItem(id: string, updates: Partial<ResearchItem>): Promise<ResearchItem> {
    return this.repo.updateResearchItem(id, updates);
  }

  async deleteResearchItem(id: string): Promise<void> {
    return this.repo.deleteResearchItem(id);
  }

  // Evidence
  async addEvidence(evidence: Omit<Evidence, 'id' | 'createdAt'>): Promise<Evidence> {
    const researchItem = await this.repo.findResearchItem(evidence.researchItemId);
    if (!researchItem) {
      throw new Error(`Research item ${evidence.researchItemId} not found`);
    }
    await this.assertSessionInStage(researchItem.sessionId, ['research'], '添加调研证据');
    return this.repo.createEvidence({ ...evidence, id: uuid(), createdAt: Date.now() } as Evidence);
  }

  async listEvidence(researchItemId: string): Promise<Evidence[]> {
    return this.repo.findEvidenceByResearchItem(researchItemId);
  }

  async deleteEvidence(id: string): Promise<void> {
    return this.repo.deleteEvidence(id);
  }

  // CandidateOption
  async addCandidate(candidate: Omit<CandidateOption, 'id' | 'createdAt' | 'updatedAt'>): Promise<CandidateOption> {
    const now = Date.now();
    await this.assertSessionInStage(candidate.sessionId, ['research', 'comparison'], '添加候选方案');
    return this.repo.createCandidate({ ...candidate, id: uuid(), createdAt: now, updatedAt: now } as CandidateOption);
  }

  async listCandidates(sessionId: string): Promise<CandidateOption[]> {
    return this.repo.findCandidatesBySession(sessionId);
  }

  async updateCandidate(id: string, updates: Partial<CandidateOption>): Promise<CandidateOption> {
    if (updates.scores !== undefined) {
      const candidate = await this.repo.findCandidate(id);
      if (!candidate) {
        throw new Error(`Candidate ${id} not found`);
      }
      await this.assertSessionInStage(candidate.sessionId, ['comparison'], '候选方案评分');
    }
    return this.repo.updateCandidate(id, updates);
  }

  async deleteCandidate(id: string): Promise<void> {
    return this.repo.deleteCandidate(id);
  }

  // ScoreDimension
  async addDimension(dimension: Omit<ScoreDimension, 'id' | 'createdAt'>): Promise<ScoreDimension> {
    await this.assertSessionInStage(dimension.sessionId, ['comparison'], '设置评估维度');
    return this.repo.createDimension({ ...dimension, id: uuid(), createdAt: Date.now() } as ScoreDimension);
  }

  async listDimensions(sessionId: string): Promise<ScoreDimension[]> {
    return this.repo.findDimensionsBySession(sessionId);
  }

  async updateDimension(id: string, updates: Partial<ScoreDimension>): Promise<ScoreDimension> {
    const dimension = await this.repo.findDimension(id);
    if (!dimension) {
      throw new Error(`Dimension ${id} not found`);
    }
    await this.assertSessionInStage(dimension.sessionId, ['comparison'], '更新评估维度');
    return this.repo.updateDimension(id, updates);
  }

  async deleteDimension(id: string): Promise<void> {
    const dimension = await this.repo.findDimension(id);
    if (!dimension) {
      throw new Error(`Dimension ${id} not found`);
    }
    await this.assertSessionInStage(dimension.sessionId, ['comparison'], '删除评估维度');
    return this.repo.deleteDimension(id);
  }

  // Recommendation
  async createRecommendation(rec: Omit<DecisionRecommendation, 'id' | 'createdAt'>): Promise<DecisionRecommendation> {
    await this.assertSessionInStage(rec.sessionId, ['convergence'], '生成决策建议');
    return this.repo.createRecommendation({ ...rec, id: uuid(), createdAt: Date.now() } as DecisionRecommendation);
  }

  async getRecommendation(sessionId: string): Promise<DecisionRecommendation | null> {
    return this.repo.findRecommendationBySession(sessionId);
  }

  async updateRecommendation(id: string, updates: Partial<DecisionRecommendation>): Promise<DecisionRecommendation> {
    const recommendation = await this.repo.findRecommendation(id);
    if (!recommendation) {
      throw new Error(`Recommendation ${id} not found`);
    }
    await this.assertSessionInStage(recommendation.sessionId, ['convergence'], '更新决策建议');
    return this.repo.updateRecommendation(id, updates);
  }

  // Insight
  async addInsight(insight: Omit<Insight, 'id' | 'createdAt'>): Promise<Insight> {
    return this.repo.createInsight({ ...insight, id: uuid(), createdAt: Date.now() } as Insight);
  }

  async listInsights(sessionId: string): Promise<Insight[]> {
    return this.repo.findInsightsBySession(sessionId);
  }

  async listInsightsByStage(sessionId: string, stage: string): Promise<Insight[]> {
    return this.repo.findInsightsByStage(sessionId, stage);
  }
}
