// src/process/decision/repository/IDecisionRepository.ts
import type {
  CandidateOption,
  DecisionRecommendation,
  DecisionSession,
  DecisionWorkspace,
  Evidence,
  Insight,
  ResearchItem,
  ScoreDimension,
  StageRun,
} from '../types';

// ── Workspace ────────────────────────────────────────

export type IWorkspaceRepository = {
  createWorkspace(workspace: DecisionWorkspace): Promise<DecisionWorkspace>;
  findWorkspace(id: string): Promise<DecisionWorkspace | null>;
  findAllWorkspaces(userId: string): Promise<DecisionWorkspace[]>;
  updateWorkspace(id: string, updates: Partial<DecisionWorkspace>): Promise<DecisionWorkspace>;
  deleteWorkspace(id: string): Promise<void>;
};

// ── Session ──────────────────────────────────────────

export type ISessionRepository = {
  createSession(session: DecisionSession): Promise<DecisionSession>;
  findSession(id: string): Promise<DecisionSession | null>;
  findSessionsByWorkspace(workspaceId: string): Promise<DecisionSession[]>;
  updateSession(id: string, updates: Partial<DecisionSession>): Promise<DecisionSession>;
  getRecentSessions(userId: string, limit?: number): Promise<DecisionSession[]>;
  deleteSession(id: string): Promise<void>;
};

// ── StageRun ─────────────────────────────────────────

export type IStageRunRepository = {
  createStageRun(run: StageRun): Promise<StageRun>;
  findStageRun(id: string): Promise<StageRun | null>;
  findStageRunsBySession(sessionId: string): Promise<StageRun[]>;
  findActiveStageRun(sessionId: string): Promise<StageRun | null>;
  findStageRunHistory(sessionId: string, stage: string): Promise<StageRun[]>;
  findStageRunByConversation(conversationId: string): Promise<StageRun | null>;
  updateStageRun(id: string, updates: Partial<StageRun>): Promise<StageRun>;
};

// ── ResearchItem ─────────────────────────────────────

export type IResearchItemRepository = {
  createResearchItem(item: ResearchItem): Promise<ResearchItem>;
  findResearchItem(id: string): Promise<ResearchItem | null>;
  findResearchItemsBySession(sessionId: string): Promise<ResearchItem[]>;
  updateResearchItem(id: string, updates: Partial<ResearchItem>): Promise<ResearchItem>;
  deleteResearchItem(id: string): Promise<void>;
};

// ── Evidence ─────────────────────────────────────────

export type IEvidenceRepository = {
  createEvidence(evidence: Evidence): Promise<Evidence>;
  findEvidence(id: string): Promise<Evidence | null>;
  findEvidenceByResearchItem(researchItemId: string): Promise<Evidence[]>;
  deleteEvidence(id: string): Promise<void>;
};

// ── CandidateOption ──────────────────────────────────

export type ICandidateOptionRepository = {
  createCandidate(candidate: CandidateOption): Promise<CandidateOption>;
  findCandidate(id: string): Promise<CandidateOption | null>;
  findCandidatesBySession(sessionId: string): Promise<CandidateOption[]>;
  updateCandidate(id: string, updates: Partial<CandidateOption>): Promise<CandidateOption>;
  deleteCandidate(id: string): Promise<void>;
};

// ── ScoreDimension ───────────────────────────────────

export type IScoreDimensionRepository = {
  createDimension(dimension: ScoreDimension): Promise<ScoreDimension>;
  findDimension(id: string): Promise<ScoreDimension | null>;
  findDimensionsBySession(sessionId: string): Promise<ScoreDimension[]>;
  updateDimension(id: string, updates: Partial<ScoreDimension>): Promise<ScoreDimension>;
  deleteDimension(id: string): Promise<void>;
};

// ── Recommendation ───────────────────────────────────

export type IRecommendationRepository = {
  createRecommendation(rec: DecisionRecommendation): Promise<DecisionRecommendation>;
  findRecommendation(id: string): Promise<DecisionRecommendation | null>;
  findRecommendationBySession(sessionId: string): Promise<DecisionRecommendation | null>;
  updateRecommendation(
    id: string,
    updates: Partial<DecisionRecommendation>
  ): Promise<DecisionRecommendation>;
};

// ── Insight ──────────────────────────────────────────

export type IInsightRepository = {
  createInsight(insight: Insight): Promise<Insight>;
  findInsightsBySession(sessionId: string): Promise<Insight[]>;
  findInsightsByStage(sessionId: string, stage: string): Promise<Insight[]>;
};

// ── 组合接口 ─────────────────────────────────────────

export type IDecisionRepository = IWorkspaceRepository &
  ISessionRepository &
  IStageRunRepository &
  IResearchItemRepository &
  IEvidenceRepository &
  ICandidateOptionRepository &
  IScoreDimensionRepository &
  IRecommendationRepository &
  IInsightRepository;
