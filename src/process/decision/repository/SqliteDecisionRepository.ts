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

// ── 安全 JSON 解析 ──────────────────────────────────

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn('[Decision] Malformed JSON in database, using fallback:', raw?.substring(0, 100));
    return fallback;
  }
}

// ── Row → Entity 转换 ───────────────────────────────

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
    metadata: safeJsonParse(row.metadata, {}),
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
    tags: safeJsonParse(row.tags, []),
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
    pros: safeJsonParse(row.pros, []),
    cons: safeJsonParse(row.cons, []),
    risks: safeJsonParse(row.risks, []),
    constraints: safeJsonParse(row.constraints, []),
    scores: safeJsonParse(row.scores, {}),
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
    alternativeIds: safeJsonParse(row.alternative_ids, []),
    pendingItems: safeJsonParse(row.pending_items, []),
    nextSteps: safeJsonParse(row.next_steps, []),
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

// ── Repository 实现 ──────────────────────────────────

export class SqliteDecisionRepository implements IDecisionRepository {
  private readonly _driver: ISqliteDriver | undefined;

  /**
   * @param driver 可选，用于构造器注入（测试场景）。
   *   省略时通过 getDatabase() 获取全局单例。
   */
  constructor(driver?: ISqliteDriver) {
    this._driver = driver;
  }

  private async getDb(): Promise<ISqliteDriver> {
    if (this._driver) return this._driver;
    const aionDb = await getDatabase();
    return aionDb.getDriver();
  }

  // ── Workspace ──────────────────────────────────────

  async createWorkspace(workspace: DecisionWorkspace): Promise<DecisionWorkspace> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO decision_workspaces (id, user_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(workspace.id, workspace.userId, workspace.name, workspace.description, workspace.createdAt, workspace.updatedAt);
    return workspace;
  }

  async findWorkspace(id: string): Promise<DecisionWorkspace | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM decision_workspaces WHERE id = ?').get(id) as DecisionWorkspaceRow | undefined;
    return row ? toWorkspace(row) : null;
  }

  async findAllWorkspaces(userId: string): Promise<DecisionWorkspace[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM decision_workspaces WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as DecisionWorkspaceRow[];
    return rows.map(toWorkspace);
  }

  async updateWorkspace(id: string, updates: Partial<DecisionWorkspace>): Promise<DecisionWorkspace> {
    const db = await this.getDb();
    const current = await this.findWorkspace(id);
    if (!current) throw new Error(`Workspace ${id} not found`);
    const merged = { ...current, ...updates, updatedAt: Date.now() };
    db.prepare(
      `UPDATE decision_workspaces SET name = ?, description = ?, updated_at = ? WHERE id = ?`
    ).run(merged.name, merged.description, merged.updatedAt, id);
    return merged;
  }

  async deleteWorkspace(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM decision_workspaces WHERE id = ?').run(id);
  }

  // ── Session ────────────────────────────────────────

  async createSession(session: DecisionSession): Promise<DecisionSession> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO decision_sessions (id, workspace_id, current_stage, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(session.id, session.workspaceId, session.currentStage, session.status, JSON.stringify(session.metadata), session.createdAt, session.updatedAt);
    return session;
  }

  async findSession(id: string): Promise<DecisionSession | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM decision_sessions WHERE id = ?').get(id) as DecisionSessionRow | undefined;
    return row ? toSession(row) : null;
  }

  async findSessionsByWorkspace(workspaceId: string): Promise<DecisionSession[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM decision_sessions WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId) as DecisionSessionRow[];
    return rows.map(toSession);
  }

  async updateSession(id: string, updates: Partial<DecisionSession>): Promise<DecisionSession> {
    const db = await this.getDb();
    const current = await this.findSession(id);
    if (!current) throw new Error(`Session ${id} not found`);
    const merged = { ...current, ...updates, updatedAt: Date.now() };
    db.prepare(
      `UPDATE decision_sessions SET current_stage = ?, status = ?, metadata = ?, updated_at = ? WHERE id = ?`
    ).run(merged.currentStage, merged.status, JSON.stringify(merged.metadata), merged.updatedAt, id);
    return merged;
  }

  async getRecentSessions(userId: string, limit = 20): Promise<DecisionSession[]> {
    const db = await this.getDb();
    const rows = db.prepare(
      `SELECT ds.* FROM decision_sessions ds
       JOIN decision_workspaces dw ON ds.workspace_id = dw.id
       WHERE dw.user_id = ?
       ORDER BY ds.updated_at DESC LIMIT ?`
    ).all(userId, limit) as DecisionSessionRow[];
    return rows.map(toSession);
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM decision_sessions WHERE id = ?').run(id);
  }

  // ── StageRun ───────────────────────────────────────

  async createStageRun(run: StageRun): Promise<StageRun> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO stage_runs (id, session_id, stage, run_number, conversation_id, status, output, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(run.id, run.sessionId, run.stage, run.runNumber, run.conversationId, run.status, run.output, run.createdAt, run.completedAt);
    return run;
  }

  async findStageRun(id: string): Promise<StageRun | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM stage_runs WHERE id = ?').get(id) as StageRunRow | undefined;
    return row ? toStageRun(row) : null;
  }

  async findStageRunsBySession(sessionId: string): Promise<StageRun[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM stage_runs WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as StageRunRow[];
    return rows.map(toStageRun);
  }

  async findActiveStageRun(sessionId: string): Promise<StageRun | null> {
    const db = await this.getDb();
    const row = db.prepare("SELECT * FROM stage_runs WHERE session_id = ? AND status = 'active' LIMIT 1").get(sessionId) as StageRunRow | undefined;
    return row ? toStageRun(row) : null;
  }

  async findStageRunHistory(sessionId: string, stage: string): Promise<StageRun[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM stage_runs WHERE session_id = ? AND stage = ? ORDER BY run_number ASC').all(sessionId, stage) as StageRunRow[];
    return rows.map(toStageRun);
  }

  async findStageRunByConversation(conversationId: string): Promise<StageRun | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM stage_runs WHERE conversation_id = ? LIMIT 1').get(conversationId) as StageRunRow | undefined;
    return row ? toStageRun(row) : null;
  }

  async updateStageRun(id: string, updates: Partial<StageRun>): Promise<StageRun> {
    const db = await this.getDb();
    const current = await this.findStageRun(id);
    if (!current) throw new Error(`StageRun ${id} not found`);
    const merged = { ...current, ...updates };
    db.prepare(
      `UPDATE stage_runs SET status = ?, output = ?, completed_at = ? WHERE id = ?`
    ).run(merged.status, merged.output, merged.completedAt, id);
    return merged;
  }

  // ── ResearchItem ───────────────────────────────────

  async createResearchItem(item: ResearchItem): Promise<ResearchItem> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO research_items (id, session_id, stage_run_id, title, source, source_type, summary, borrowable, not_borrowable, inspiration, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(item.id, item.sessionId, item.stageRunId, item.title, item.source, item.sourceType, item.summary, item.borrowable, item.notBorrowable, item.inspiration, JSON.stringify(item.tags), item.createdAt);
    return item;
  }

  async findResearchItem(id: string): Promise<ResearchItem | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM research_items WHERE id = ?').get(id) as ResearchItemRow | undefined;
    return row ? toResearchItem(row) : null;
  }

  async findResearchItemsBySession(sessionId: string): Promise<ResearchItem[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM research_items WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as ResearchItemRow[];
    return rows.map(toResearchItem);
  }

  async updateResearchItem(id: string, updates: Partial<ResearchItem>): Promise<ResearchItem> {
    const db = await this.getDb();
    const current = await this.findResearchItem(id);
    if (!current) throw new Error(`ResearchItem ${id} not found`);
    const merged = { ...current, ...updates };
    db.prepare(
      `UPDATE research_items SET title = ?, source = ?, source_type = ?, summary = ?, borrowable = ?, not_borrowable = ?, inspiration = ?, tags = ? WHERE id = ?`
    ).run(merged.title, merged.source, merged.sourceType, merged.summary, merged.borrowable, merged.notBorrowable, merged.inspiration, JSON.stringify(merged.tags), id);
    return merged;
  }

  async deleteResearchItem(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM research_items WHERE id = ?').run(id);
  }

  // ── Evidence ───────────────────────────────────────

  async createEvidence(evidence: Evidence): Promise<Evidence> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO evidence (id, research_item_id, content, source_ref, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(evidence.id, evidence.researchItemId, evidence.content, evidence.sourceRef, evidence.confidence, evidence.createdAt);
    return evidence;
  }

  async findEvidence(id: string): Promise<Evidence | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM evidence WHERE id = ?').get(id) as EvidenceRow | undefined;
    return row ? toEvidence(row) : null;
  }

  async findEvidenceByResearchItem(researchItemId: string): Promise<Evidence[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM evidence WHERE research_item_id = ? ORDER BY created_at ASC').all(researchItemId) as EvidenceRow[];
    return rows.map(toEvidence);
  }

  async deleteEvidence(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM evidence WHERE id = ?').run(id);
  }

  // ── CandidateOption ────────────────────────────────

  async createCandidate(candidate: CandidateOption): Promise<CandidateOption> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO candidate_options (id, session_id, name, description, pros, cons, risks, constraints, scores, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(candidate.id, candidate.sessionId, candidate.name, candidate.description, JSON.stringify(candidate.pros), JSON.stringify(candidate.cons), JSON.stringify(candidate.risks), JSON.stringify(candidate.constraints), JSON.stringify(candidate.scores), candidate.createdAt, candidate.updatedAt);
    return candidate;
  }

  async findCandidate(id: string): Promise<CandidateOption | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM candidate_options WHERE id = ?').get(id) as CandidateOptionRow | undefined;
    return row ? toCandidate(row) : null;
  }

  async findCandidatesBySession(sessionId: string): Promise<CandidateOption[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM candidate_options WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as CandidateOptionRow[];
    return rows.map(toCandidate);
  }

  async updateCandidate(id: string, updates: Partial<CandidateOption>): Promise<CandidateOption> {
    const db = await this.getDb();
    const current = await this.findCandidate(id);
    if (!current) throw new Error(`CandidateOption ${id} not found`);
    const merged = { ...current, ...updates, updatedAt: Date.now() };
    db.prepare(
      `UPDATE candidate_options SET name = ?, description = ?, pros = ?, cons = ?, risks = ?, constraints = ?, scores = ?, updated_at = ? WHERE id = ?`
    ).run(merged.name, merged.description, JSON.stringify(merged.pros), JSON.stringify(merged.cons), JSON.stringify(merged.risks), JSON.stringify(merged.constraints), JSON.stringify(merged.scores), merged.updatedAt, id);
    return merged;
  }

  async deleteCandidate(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM candidate_options WHERE id = ?').run(id);
  }

  // ── ScoreDimension ─────────────────────────────────

  async createDimension(dimension: ScoreDimension): Promise<ScoreDimension> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO score_dimensions (id, session_id, name, weight, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(dimension.id, dimension.sessionId, dimension.name, dimension.weight, dimension.description, dimension.createdAt);
    return dimension;
  }

  async findDimension(id: string): Promise<ScoreDimension | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM score_dimensions WHERE id = ?').get(id) as ScoreDimensionRow | undefined;
    return row ? toDimension(row) : null;
  }

  async findDimensionsBySession(sessionId: string): Promise<ScoreDimension[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM score_dimensions WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as ScoreDimensionRow[];
    return rows.map(toDimension);
  }

  async updateDimension(id: string, updates: Partial<ScoreDimension>): Promise<ScoreDimension> {
    const db = await this.getDb();
    const current = await this.findDimension(id);
    if (!current) throw new Error(`ScoreDimension ${id} not found`);
    const merged = { ...current, ...updates };
    db.prepare(
      `UPDATE score_dimensions SET name = ?, weight = ?, description = ? WHERE id = ?`
    ).run(merged.name, merged.weight, merged.description, id);
    return merged;
  }

  async deleteDimension(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM score_dimensions WHERE id = ?').run(id);
  }

  // ── Recommendation ─────────────────────────────────

  async createRecommendation(rec: DecisionRecommendation): Promise<DecisionRecommendation> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO decision_recommendations (id, session_id, recommended_option_id, reasoning, alternative_ids, pending_items, next_steps, adopted, rejection_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(rec.id, rec.sessionId, rec.recommendedOptionId, rec.reasoning, JSON.stringify(rec.alternativeIds), JSON.stringify(rec.pendingItems), JSON.stringify(rec.nextSteps), rec.adopted === null ? null : rec.adopted ? 1 : 0, rec.rejectionReason, rec.createdAt);
    return rec;
  }

  async findRecommendation(id: string): Promise<DecisionRecommendation | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM decision_recommendations WHERE id = ?').get(id) as DecisionRecommendationRow | undefined;
    return row ? toRecommendation(row) : null;
  }

  async findRecommendationBySession(sessionId: string): Promise<DecisionRecommendation | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM decision_recommendations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(sessionId) as DecisionRecommendationRow | undefined;
    return row ? toRecommendation(row) : null;
  }

  async updateRecommendation(id: string, updates: Partial<DecisionRecommendation>): Promise<DecisionRecommendation> {
    const db = await this.getDb();
    const current = await this.findRecommendation(id);
    if (!current) throw new Error(`Recommendation ${id} not found`);
    const merged = { ...current, ...updates };
    db.prepare(
      `UPDATE decision_recommendations SET reasoning = ?, alternative_ids = ?, pending_items = ?, next_steps = ?, adopted = ?, rejection_reason = ? WHERE id = ?`
    ).run(merged.reasoning, JSON.stringify(merged.alternativeIds), JSON.stringify(merged.pendingItems), JSON.stringify(merged.nextSteps), merged.adopted === null ? null : merged.adopted ? 1 : 0, merged.rejectionReason, id);
    return merged;
  }

  // ── Insight ────────────────────────────────────────

  async createInsight(insight: Insight): Promise<Insight> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO insights (id, session_id, stage_run_id, stage, content, importance, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(insight.id, insight.sessionId, insight.stageRunId, insight.stage, insight.content, insight.importance, insight.createdAt);
    return insight;
  }

  async findInsightsBySession(sessionId: string): Promise<Insight[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM insights WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as InsightRow[];
    return rows.map(toInsight);
  }

  async findInsightsByStage(sessionId: string, stage: string): Promise<Insight[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM insights WHERE session_id = ? AND stage = ? ORDER BY created_at ASC').all(sessionId, stage) as InsightRow[];
    return rows.map(toInsight);
  }
}
