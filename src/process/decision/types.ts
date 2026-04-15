// src/process/decision/types.ts
// 决策支持工作台 — 数据类型定义

// ── 枚举 ──────────────────────────────────────────────

export type DecisionStage = 'problem_definition' | 'research' | 'comparison' | 'convergence';

export type StageStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type SessionStatus = 'active' | 'completed' | 'archived';

export type SourceType = 'project' | 'paper' | 'article' | 'manual';

export type ImportanceLevel = 'low' | 'medium' | 'high';

/** 阶段流转顺序 */
export const STAGE_ORDER: readonly DecisionStage[] = [
  'problem_definition',
  'research',
  'comparison',
  'convergence',
] as const;

// ── 核心数据对象 ──────────────────────────────────────

export type DecisionWorkspace = {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
};

export type DecisionSession = {
  id: string;
  workspaceId: string;
  currentStage: DecisionStage;
  status: SessionStatus;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type StageRun = {
  id: string;
  sessionId: string;
  stage: DecisionStage;
  runNumber: number;
  conversationId: string;
  status: StageStatus;
  /** JSON — 阶段产出物快照 */
  output: string;
  createdAt: number;
  completedAt: number | null;
};

export type ResearchItem = {
  id: string;
  sessionId: string;
  stageRunId: string;
  title: string;
  source: string;
  sourceType: SourceType;
  summary: string;
  borrowable: string;
  notBorrowable: string;
  inspiration: string;
  /** JSON array */
  tags: string[];
  createdAt: number;
};

export type Evidence = {
  id: string;
  researchItemId: string;
  content: string;
  sourceRef: string;
  confidence: number;
  createdAt: number;
};

export type CandidateOption = {
  id: string;
  sessionId: string;
  name: string;
  description: string;
  /** JSON array */
  pros: string[];
  /** JSON array */
  cons: string[];
  /** JSON array */
  risks: string[];
  /** JSON array */
  constraints: string[];
  /** JSON: { [dimensionId]: { value: number, reasoning: string } } */
  scores: Record<string, { value: number; reasoning: string }>;
  createdAt: number;
  updatedAt: number;
};

export type ScoreDimension = {
  id: string;
  sessionId: string;
  name: string;
  weight: number;
  description: string;
  createdAt: number;
};

export type DecisionRecommendation = {
  id: string;
  sessionId: string;
  recommendedOptionId: string;
  reasoning: string;
  /** JSON array */
  alternativeIds: string[];
  /** JSON array — 待确认事项 */
  pendingItems: string[];
  /** JSON array — 下一步建议 */
  nextSteps: string[];
  adopted: boolean | null;
  rejectionReason: string;
  createdAt: number;
};

export type Insight = {
  id: string;
  sessionId: string;
  stageRunId: string | null;
  content: string;
  stage: DecisionStage;
  importance: ImportanceLevel;
  createdAt: number;
};

// ── 阶段完成条件 ────────────────────────────────────

export type StageCompletionStatus = {
  stage: DecisionStage;
  met: boolean;
  details: Record<string, { required: boolean; current: number | boolean; label: string }>;
};

// ── 数据库行类型（内部使用，JSON 字段为 string） ────

export type DecisionWorkspaceRow = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
};

export type DecisionSessionRow = {
  id: string;
  workspace_id: string;
  current_stage: string;
  status: string;
  metadata: string;
  created_at: number;
  updated_at: number;
};

export type StageRunRow = {
  id: string;
  session_id: string;
  stage: string;
  run_number: number;
  conversation_id: string;
  status: string;
  output: string;
  created_at: number;
  completed_at: number | null;
};

export type ResearchItemRow = {
  id: string;
  session_id: string;
  stage_run_id: string;
  title: string;
  source: string;
  source_type: string;
  summary: string;
  borrowable: string;
  not_borrowable: string;
  inspiration: string;
  tags: string;
  created_at: number;
};

export type EvidenceRow = {
  id: string;
  research_item_id: string;
  content: string;
  source_ref: string;
  confidence: number;
  created_at: number;
};

export type CandidateOptionRow = {
  id: string;
  session_id: string;
  name: string;
  description: string;
  pros: string;
  cons: string;
  risks: string;
  constraints: string;
  scores: string;
  created_at: number;
  updated_at: number;
};

export type ScoreDimensionRow = {
  id: string;
  session_id: string;
  name: string;
  weight: number;
  description: string;
  created_at: number;
};

export type DecisionRecommendationRow = {
  id: string;
  session_id: string;
  recommended_option_id: string;
  reasoning: string;
  alternative_ids: string;
  pending_items: string;
  next_steps: string;
  adopted: number | null;
  rejection_reason: string;
  created_at: number;
};

export type InsightRow = {
  id: string;
  session_id: string;
  stage_run_id: string | null;
  stage: string;
  content: string;
  importance: string;
  created_at: number;
};
