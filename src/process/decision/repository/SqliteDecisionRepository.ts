// src/process/decision/repository/SqliteDecisionRepository.ts
import { getDatabase } from '@process/services/database';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import type {
  CandidateOption,
  CandidateOptionRow,
  DecisionRecommendation,
  DecisionRecommendationRow,
  DecisionSession,
  DecisionSessionRow,
  DecisionWorkspace,
  DecisionWorkspaceRow,
  Evidence,
  EvidenceRow,
  Insight,
  InsightRow,
  ResearchItem,
  ResearchItemRow,
  ScoreDimension,
  ScoreDimensionRow,
  StageRun,
  StageRunRow,
} from '../types';
import type { IDecisionRepository } from './IDecisionRepository';

// ── Row ↔ Entity 转换 ───────────────────────────────

function toWorkspace(row: DecisionWorkspaceRow): DecisionWorkspace {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSession(row: DecisionSessionRow): DecisionSession {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    currentStage: row.current_stage as DecisionSession['currentStage'],
    status: row.status as DecisionSession['status'],
    metadata: JSON.parse(row.metadata || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStageRun(row: StageRunRow): StageRun {
  return {
    id: row.id,
    sessionId: row.session_id,
    stage: row.stage as StageRun['stage'],
    runNumber: row.run_number,
    conversationId: row.conversation_id,
    status: row.status as StageRun['status'],
    output: row.output,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function toResearchItem(row: ResearchItemRow): ResearchItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    stageRunId: row.stage_run_id,
    title: row.title,
    source: row.source,
    sourceType: row.source_type as ResearchItem['sourceType'],
    summary: row.summary,
    borrowable: row.borrowable,
    notBorrowable: row.not_borrowable,
    inspiration: row.inspiration,
    tags: JSON.parse(row.tags || '[]'),
    createdAt: row.created_at,
  };
}

function toEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    researchItemId: row.research_item_id,
    content: row.content,
    sourceRef: row.source_ref,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

function toCandidate(row: CandidateOptionRow): CandidateOption {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    description: row.description,
    pros: JSON.parse(row.pros || '[]'),
    cons: JSON.parse(row.cons || '[]'),
    risks: JSON.parse(row.risks || '[]'),
    constraints: JSON.parse(row.constraints || '[]'),
    scores: JSON.parse(row.scores || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDimension(row: ScoreDimensionRow): ScoreDimension {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    weight: row.weight,
    description: row.description,
    createdAt: row.created_at,
  };
}

function toRecommendation(row: DecisionRecommendationRow): DecisionRecommendation {
  return {
    id: row.id,
    sessionId: row.session_id,
    recommendedOptionId: row.recommended_option_id,
    reasoning: row.reasoning,
    alternativeIds: JSON.parse(row.alternative_ids || '[]'),
    pendingItems: JSON.parse(row.pending_items || '[]'),
    nextSteps: JSON.parse(row.next_steps || '[]'),
    adopted: row.adopted === null ? null : row.adopted === 1,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  };
}

function toInsight(row: InsightRow): Insight {
  return {
    id: row.id,
    sessionId: row.session_id,
    stageRunId: row.stage_run_id,
    content: row.content,
    stage: row.stage as Insight['stage'],
    importance: row.importance as Insight['importance'],
    createdAt: row.created_at,
  };
}

// ── 获取数据库实例 ───────────────────────────────────

function db(): ISqliteDriver {
  return getDatabase().db;
}

// ── Repository 实现 ──────────────────────────────────

export class SqliteDecisionRepository implements IDecisionRepository {
  // ── Workspace ──────────────────────────────────────

  async createWorkspace(workspace: DecisionWorkspace): Promise<DecisionWorkspace> {
    db()
      .prepare(
        `INSERT INTO decision_workspaces (id, user_id, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        workspace.id,
        workspace.userId,
        workspace.name,
        workspace.description,
        workspace.createdAt,
        workspace.updatedAt
      );
    return workspace;
  }

  async findWorkspace(id: string): Promise<DecisionWorkspace | null> {
    const row = db()
      .prepare('SELECT * FROM decision_workspaces WHERE id = ?')
      .get(id) as DecisionWorkspaceRow | undefined;
    return row ? toWorkspace(row) : null;
  }

  async findAllWorkspaces(userId: string): Promise<DecisionWorkspace[]> {
    const rows = db()
      .prepare('SELECT * FROM decision_workspaces WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId) as DecisionWorkspaceRow[];
    return rows.map(toWorkspace);
  }

  async updateWorkspace(
    id: string,
    updates: Partial<DecisionWorkspace>
  ): Promise<DecisionWorkspace> {
    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    values.push(id);

    db()
      .prepare(`UPDATE decision_workspaces SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);

    const result = await this.findWorkspace(id);
    if (!result) throw new Error(`Workspace ${id} not found after update`);
    return result;
  }

  async deleteWorkspace(id: string): Promise<void> {
    db().prepare('DELETE FROM decision_workspaces WHERE id = ?').run(id);
  }

  // ── Session ────────────────────────────────────────

  async createSession(session: DecisionSession): Promise<DecisionSession> {
    db()
      .prepare(
        `INSERT INTO decision_sessions (id, workspace_id, current_stage, status, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        session.workspaceId,
        session.currentStage,
        session.status,
        JSON.stringify(session.metadata),
        session.createdAt,
        session.updatedAt
      );
    return session;
  }

  async findSession(id: string): Promise<DecisionSession | null> {
    const row = db()
      .prepare('SELECT * FROM decision_sessions WHERE id = ?')
      .get(id) as DecisionSessionRow | undefined;
    return row ? toSession(row) : null;
  }

  async findSessionsByWorkspace(workspaceId: string): Promise<DecisionSession[]> {
    const rows = db()
      .prepare(
        'SELECT * FROM decision_sessions WHERE workspace_id = ? ORDER BY updated_at DESC'
      )
      .all(workspaceId) as DecisionSessionRow[];
    return rows.map(toSession);
  }

  async updateSession(
    id: string,
    updates: Partial<DecisionSession>
  ): Promise<DecisionSession> {
    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.currentStage !== undefined) {
      fields.push('current_stage = ?');
      values.push(updates.currentStage);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }
    values.push(id);

    db()
      .prepare(`UPDATE decision_sessions SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);

    const result = await this.findSession(id);
    if (!result) throw new Error(`Session ${id} not found after update`);
    return result;
  }

  async getRecentSessions(userId: string, limit = 20): Promise<DecisionSession[]> {
    const rows = db()
      .prepare(
        `SELECT ds.* FROM decision_sessions ds
         JOIN decision_workspaces dw ON ds.workspace_id = dw.id
         WHERE dw.user_id = ?
         ORDER BY ds.updated_at DESC
         LIMIT ?`
      )
      .all(userId, limit) as DecisionSessionRow[];
    return rows.map(toSession);
  }

  async deleteSession(id: string): Promise<void> {
    db().prepare('DELETE FROM decision_sessions WHERE id = ?').run(id);
  }

  // ── StageRun ───────────────────────────────────────

  async createStageRun(run: StageRun): Promise<StageRun> {
    db()
      .prepare(
        `INSERT INTO stage_runs (id, session_id, stage, run_number, conversation_id, status, output, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.id,
        run.sessionId,
        run.stage,
        run.runNumber,
        run.conversationId,
        run.status,
        run.output,
        run.createdAt,
        run.completedAt
      );
    return run;
  }

  async findStageRun(id: string): Promise<StageRun | null> {
    const row = db()
      .prepare('SELECT * FROM stage_runs WHERE id = ?')
      .get(id) as StageRunRow | undefined;
    return row ? toStageRun(row) : null;
  }

  async findStageRunsBySession(sessionId: string): Promise<StageRun[]> {
    const rows = db()
      .prepare('SELECT * FROM stage_runs WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as StageRunRow[];
    return rows.map(toStageRun);
  }

  async findActiveStageRun(sessionId: string): Promise<StageRun | null> {
    const row = db()
      .prepare("SELECT * FROM stage_runs WHERE session_id = ? AND status = 'active' LIMIT 1")
      .get(sessionId) as StageRunRow | undefined;
    return row ? toStageRun(row) : null;
  }

  async findStageRunHistory(sessionId: string, stage: string): Promise<StageRun[]> {
    const rows = db()
      .prepare(
        'SELECT * FROM stage_runs WHERE session_id = ? AND stage = ? ORDER BY run_number ASC'
      )
      .all(sessionId, stage) as StageRunRow[];
    return rows.map(toStageRun);
  }

  async findStageRunByConversation(conversationId: string): Promise<StageRun | null> {
    const row = db()
      .prepare('SELECT * FROM stage_runs WHERE conversation_id = ? LIMIT 1')
      .get(conversationId) as StageRunRow | undefined;
    return row ? toStageRun(row) : null;
  }

  async updateStageRun(id: string, updates: Partial<StageRun>): Promise<StageRun> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.output !== undefined) {
      fields.push('output = ?');
      values.push(updates.output);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt);
    }
    if (fields.length === 0) {
      const run = await this.findStageRun(id);
      if (!run) throw new Error(`StageRun ${id} not found`);
      return run;
    }
    values.push(id);

    db()
      .prepare(`UPDATE stage_runs SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);

    const result = await this.findStageRun(id);
    if (!result) throw new Error(`StageRun ${id} not found after update`);
    return result;
  }

  // ── ResearchItem ───────────────────────────────────

  async createResearchItem(item: ResearchItem): Promise<ResearchItem> {
    db()
      .prepare(
        `INSERT INTO research_items (id, session_id, stage_run_id, title, source, source_type, summary, borrowable, not_borrowable, inspiration, tags, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item.id,
        item.sessionId,
        item.stageRunId,
        item.title,
        item.source,
        item.sourceType,
        item.summary,
        item.borrowable,
        item.notBorrowable,
        item.inspiration,
        JSON.stringify(item.tags),
        item.createdAt
      );
    return item;
  }

  async findResearchItem(id: string): Promise<ResearchItem | null> {
    const row = db()
      .prepare('SELECT * FROM research_items WHERE id = ?')
      .get(id) as ResearchItemRow | undefined;
    return row ? toResearchItem(row) : null;
  }

  async findResearchItemsBySession(sessionId: string): Promise<ResearchItem[]> {
    const rows = db()
      .prepare('SELECT * FROM research_items WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as ResearchItemRow[];
    return rows.map(toResearchItem);
  }

  async updateResearchItem(
    id: string,
    updates: Partial<ResearchItem>
  ): Promise<ResearchItem> {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.source !== undefined) { fields.push('source = ?'); values.push(updates.source); }
    if (updates.sourceType !== undefined) { fields.push('source_type = ?'); values.push(updates.sourceType); }
    if (updates.summary !== undefined) { fields.push('summary = ?'); values.push(updates.summary); }
    if (updates.borrowable !== undefined) { fields.push('borrowable = ?'); values.push(updates.borrowable); }
    if (updates.notBorrowable !== undefined) { fields.push('not_borrowable = ?'); values.push(updates.notBorrowable); }
    if (updates.inspiration !== undefined) { fields.push('inspiration = ?'); values.push(updates.inspiration); }
    if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
    if (fields.length === 0) {
      const item = await this.findResearchItem(id);
      if (!item) throw new Error(`ResearchItem ${id} not found`);
      return item;
    }
    values.push(id);
    db().prepare(`UPDATE research_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const result = await this.findResearchItem(id);
    if (!result) throw new Error(`ResearchItem ${id} not found after update`);
    return result;
  }

  async deleteResearchItem(id: string): Promise<void> {
    db().prepare('DELETE FROM research_items WHERE id = ?').run(id);
  }

  // ── Evidence ───────────────────────────────────────

  async createEvidence(evidence: Evidence): Promise<Evidence> {
    db()
      .prepare(
        `INSERT INTO evidence (id, research_item_id, content, source_ref, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(evidence.id, evidence.researchItemId, evidence.content, evidence.sourceRef, evidence.confidence, evidence.createdAt);
    return evidence;
  }

  async findEvidenceByResearchItem(researchItemId: string): Promise<Evidence[]> {
    const rows = db()
      .prepare('SELECT * FROM evidence WHERE research_item_id = ? ORDER BY created_at ASC')
      .all(researchItemId) as EvidenceRow[];
    return rows.map(toEvidence);
  }

  async deleteEvidence(id: string): Promise<void> {
    db().prepare('DELETE FROM evidence WHERE id = ?').run(id);
  }

  // ── CandidateOption ────────────────────────────────

  async createCandidate(candidate: CandidateOption): Promise<CandidateOption> {
    db()
      .prepare(
        `INSERT INTO candidate_options (id, session_id, name, description, pros, cons, risks, constraints, scores, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        candidate.id,
        candidate.sessionId,
        candidate.name,
        candidate.description,
        JSON.stringify(candidate.pros),
        JSON.stringify(candidate.cons),
        JSON.stringify(candidate.risks),
        JSON.stringify(candidate.constraints),
        JSON.stringify(candidate.scores),
        candidate.createdAt,
        candidate.updatedAt
      );
    return candidate;
  }

  async findCandidate(id: string): Promise<CandidateOption | null> {
    const row = db()
      .prepare('SELECT * FROM candidate_options WHERE id = ?')
      .get(id) as CandidateOptionRow | undefined;
    return row ? toCandidate(row) : null;
  }

  async findCandidatesBySession(sessionId: string): Promise<CandidateOption[]> {
    const rows = db()
      .prepare('SELECT * FROM candidate_options WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as CandidateOptionRow[];
    return rows.map(toCandidate);
  }

  async updateCandidate(
    id: string,
    updates: Partial<CandidateOption>
  ): Promise<CandidateOption> {
    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.pros !== undefined) { fields.push('pros = ?'); values.push(JSON.stringify(updates.pros)); }
    if (updates.cons !== undefined) { fields.push('cons = ?'); values.push(JSON.stringify(updates.cons)); }
    if (updates.risks !== undefined) { fields.push('risks = ?'); values.push(JSON.stringify(updates.risks)); }
    if (updates.constraints !== undefined) { fields.push('constraints = ?'); values.push(JSON.stringify(updates.constraints)); }
    if (updates.scores !== undefined) { fields.push('scores = ?'); values.push(JSON.stringify(updates.scores)); }
    values.push(id);
    db().prepare(`UPDATE candidate_options SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const result = await this.findCandidate(id);
    if (!result) throw new Error(`CandidateOption ${id} not found after update`);
    return result;
  }

  async deleteCandidate(id: string): Promise<void> {
    db().prepare('DELETE FROM candidate_options WHERE id = ?').run(id);
  }

  // ── ScoreDimension ─────────────────────────────────

  async createDimension(dimension: ScoreDimension): Promise<ScoreDimension> {
    db()
      .prepare(
        `INSERT INTO score_dimensions (id, session_id, name, weight, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(dimension.id, dimension.sessionId, dimension.name, dimension.weight, dimension.description, dimension.createdAt);
    return dimension;
  }

  async findDimensionsBySession(sessionId: string): Promise<ScoreDimension[]> {
    const rows = db()
      .prepare('SELECT * FROM score_dimensions WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as ScoreDimensionRow[];
    return rows.map(toDimension);
  }

  async updateDimension(
    id: string,
    updates: Partial<ScoreDimension>
  ): Promise<ScoreDimension> {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.weight !== undefined) { fields.push('weight = ?'); values.push(updates.weight); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (fields.length === 0) {
      const rows = db().prepare('SELECT * FROM score_dimensions WHERE id = ?').get(id) as ScoreDimensionRow | undefined;
      if (!rows) throw new Error(`ScoreDimension ${id} not found`);
      return toDimension(rows);
    }
    values.push(id);
    db().prepare(`UPDATE score_dimensions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const row = db().prepare('SELECT * FROM score_dimensions WHERE id = ?').get(id) as ScoreDimensionRow | undefined;
    if (!row) throw new Error(`ScoreDimension ${id} not found after update`);
    return toDimension(row);
  }

  async deleteDimension(id: string): Promise<void> {
    db().prepare('DELETE FROM score_dimensions WHERE id = ?').run(id);
  }

  // ── Recommendation ─────────────────────────────────

  async createRecommendation(rec: DecisionRecommendation): Promise<DecisionRecommendation> {
    db()
      .prepare(
        `INSERT INTO decision_recommendations (id, session_id, recommended_option_id, reasoning, alternative_ids, pending_items, next_steps, adopted, rejection_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        rec.id,
        rec.sessionId,
        rec.recommendedOptionId,
        rec.reasoning,
        JSON.stringify(rec.alternativeIds),
        JSON.stringify(rec.pendingItems),
        JSON.stringify(rec.nextSteps),
        rec.adopted === null ? null : rec.adopted ? 1 : 0,
        rec.rejectionReason,
        rec.createdAt
      );
    return rec;
  }

  async findRecommendation(id: string): Promise<DecisionRecommendation | null> {
    const row = db()
      .prepare('SELECT * FROM decision_recommendations WHERE id = ?')
      .get(id) as DecisionRecommendationRow | undefined;
    return row ? toRecommendation(row) : null;
  }

  async findRecommendationBySession(sessionId: string): Promise<DecisionRecommendation | null> {
    const row = db()
      .prepare('SELECT * FROM decision_recommendations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(sessionId) as DecisionRecommendationRow | undefined;
    return row ? toRecommendation(row) : null;
  }

  async updateRecommendation(
    id: string,
    updates: Partial<DecisionRecommendation>
  ): Promise<DecisionRecommendation> {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.reasoning !== undefined) { fields.push('reasoning = ?'); values.push(updates.reasoning); }
    if (updates.alternativeIds !== undefined) { fields.push('alternative_ids = ?'); values.push(JSON.stringify(updates.alternativeIds)); }
    if (updates.pendingItems !== undefined) { fields.push('pending_items = ?'); values.push(JSON.stringify(updates.pendingItems)); }
    if (updates.nextSteps !== undefined) { fields.push('next_steps = ?'); values.push(JSON.stringify(updates.nextSteps)); }
    if (updates.adopted !== undefined) { fields.push('adopted = ?'); values.push(updates.adopted === null ? null : updates.adopted ? 1 : 0); }
    if (updates.rejectionReason !== undefined) { fields.push('rejection_reason = ?'); values.push(updates.rejectionReason); }
    if (fields.length === 0) {
      const rec = await this.findRecommendation(id);
      if (!rec) throw new Error(`Recommendation ${id} not found`);
      return rec;
    }
    values.push(id);
    db().prepare(`UPDATE decision_recommendations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const result = await this.findRecommendation(id);
    if (!result) throw new Error(`Recommendation ${id} not found after update`);
    return result;
  }

  // ── Insight ────────────────────────────────────────

  async createInsight(insight: Insight): Promise<Insight> {
    db()
      .prepare(
        `INSERT INTO insights (id, session_id, stage_run_id, stage, content, importance, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(insight.id, insight.sessionId, insight.stageRunId, insight.stage, insight.content, insight.importance, insight.createdAt);
    return insight;
  }

  async findInsightsBySession(sessionId: string): Promise<Insight[]> {
    const rows = db()
      .prepare('SELECT * FROM insights WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as InsightRow[];
    return rows.map(toInsight);
  }

  async findInsightsByStage(sessionId: string, stage: string): Promise<Insight[]> {
    const rows = db()
      .prepare('SELECT * FROM insights WHERE session_id = ? AND stage = ? ORDER BY created_at ASC')
      .all(sessionId, stage) as InsightRow[];
    return rows.map(toInsight);
  }
}
