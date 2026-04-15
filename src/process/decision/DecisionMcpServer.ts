// src/process/decision/DecisionMcpServer.ts
// 决策模块 MCP 工具服务器 — 供 AI Agent 在对话中操作决策数据

import { ipcBridge } from '@/common';
import type { DecisionService } from './DecisionService';
import type { DecisionStage, ImportanceLevel, SourceType } from './types';

/**
 * MCP 工具定义。每个工具对应一个 DecisionService 操作。
 * AI Agent 通过调用这些工具将对话中的结构化数据写入数据库。
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export class DecisionMcpTools {
  private tools: Map<string, { description: string; handler: ToolHandler }> = new Map();

  constructor(private readonly service: DecisionService) {
    this.registerTools();
  }

  private registerTools(): void {
    // ── 上下文查询 ──────────────────────────────────

    this.register('decision_get_context_summary', {
      description: '获取当前决策会话的摘要版上下文（前序阶段产出物概要，≤500 token）',
      handler: async (args) => {
        const sessionId = String(args.sessionId);
        return this.service.aggregateContextSummary(sessionId);
      },
    });

    this.register('decision_get_context_detail', {
      description: '获取指定阶段的完整数据',
      handler: async (args) => {
        const sessionId = String(args.sessionId);
        const stage = String(args.stage) as DecisionStage;
        return this.service.aggregateContextDetail(sessionId, stage);
      },
    });

    // ── 需求简报 ────────────────────────────────────

    this.register('decision_save_need_brief', {
      description: '保存需求简报到当前阶段的 output 字段',
      handler: async (args) => {
        const sessionId = String(args.sessionId);
        const content = String(args.content);
        const activeRun = await this.service.getActiveStageRun(sessionId);
        if (!activeRun) throw new Error('No active stage run');
        const updated = await this.service.updateStageRun(activeRun.id, { output: content });
        this.emitChange(sessionId, 'stage_updated', activeRun.id);
        return { success: true, stageRunId: updated.id };
      },
    });

    // ── 调研条目 ────────────────────────────────────

    this.register('decision_add_research_item', {
      description: '添加一个调研条目（项目、论文、文章等）',
      handler: async (args) => {
        const activeRun = await this.service.getActiveStageRun(String(args.sessionId));
        const item = await this.service.addResearchItem({
          sessionId: String(args.sessionId),
          stageRunId: activeRun?.id ?? '',
          title: String(args.title),
          source: String(args.source ?? ''),
          sourceType: (String(args.sourceType ?? 'manual')) as SourceType,
          summary: String(args.summary ?? ''),
          borrowable: String(args.borrowable ?? ''),
          notBorrowable: String(args.notBorrowable ?? ''),
          inspiration: String(args.inspiration ?? ''),
          tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
        });
        this.emitChange(String(args.sessionId), 'research_added', item.id);
        return item;
      },
    });

    // ── 证据 ────────────────────────────────────────

    this.register('decision_add_evidence', {
      description: '为某个调研条目添加一条证据',
      handler: async (args) => {
        const evidence = await this.service.addEvidence({
          researchItemId: String(args.researchItemId),
          content: String(args.content),
          sourceRef: String(args.sourceRef ?? ''),
          confidence: Number(args.confidence ?? 0.5),
        });
        this.emitChange(String(args.sessionId ?? ''), 'evidence_added', evidence.id);
        return evidence;
      },
    });

    // ── 候选方案 ────────────────────────────────────

    this.register('decision_add_candidate', {
      description: '添加一个候选方案',
      handler: async (args) => {
        const candidate = await this.service.addCandidate({
          sessionId: String(args.sessionId),
          name: String(args.name),
          description: String(args.description ?? ''),
          pros: Array.isArray(args.pros) ? args.pros.map(String) : [],
          cons: Array.isArray(args.cons) ? args.cons.map(String) : [],
          risks: Array.isArray(args.risks) ? args.risks.map(String) : [],
          constraints: Array.isArray(args.constraints) ? args.constraints.map(String) : [],
          scores: (args.scores as Record<string, { value: number; reasoning: string }>) ?? {},
        });
        this.emitChange(String(args.sessionId), 'candidate_added', candidate.id);
        return candidate;
      },
    });

    // ── 评估维度 ────────────────────────────────────

    this.register('decision_set_dimensions', {
      description: '设置评估维度（批量替换）',
      handler: async (args) => {
        const sessionId = String(args.sessionId);
        const dimensions = args.dimensions as Array<{ name: string; weight: number; description: string }>;
        if (!Array.isArray(dimensions)) throw new Error('dimensions must be an array');

        // 删除旧维度
        const existing = await this.service.listDimensions(sessionId);
        for (const dim of existing) {
          await this.service.deleteDimension(dim.id);
        }

        // 创建新维度
        const created = [];
        for (const dim of dimensions) {
          const d = await this.service.addDimension({
            sessionId,
            name: String(dim.name),
            weight: Number(dim.weight),
            description: String(dim.description ?? ''),
          });
          created.push(d);
        }
        this.emitChange(sessionId, 'dimension_added');
        return created;
      },
    });

    // ── 方案评分 ────────────────────────────────────

    this.register('decision_score_candidate', {
      description: '为候选方案设置评分',
      handler: async (args) => {
        const candidateId = String(args.candidateId);
        const scores = args.scores as Record<string, { value: number; reasoning: string }>;
        if (!scores || typeof scores !== 'object') throw new Error('scores must be an object');

        const updated = await this.service.updateCandidate(candidateId, { scores });
        this.emitChange(updated.sessionId, 'candidate_updated', candidateId);
        return updated;
      },
    });

    // ── 决策建议 ────────────────────────────────────

    this.register('decision_create_recommendation', {
      description: '生成决策建议',
      handler: async (args) => {
        const rec = await this.service.createRecommendation({
          sessionId: String(args.sessionId),
          recommendedOptionId: String(args.recommendedOptionId),
          reasoning: String(args.reasoning ?? ''),
          alternativeIds: Array.isArray(args.alternativeIds) ? args.alternativeIds.map(String) : [],
          pendingItems: Array.isArray(args.pendingItems) ? args.pendingItems.map(String) : [],
          nextSteps: Array.isArray(args.nextSteps) ? args.nextSteps.map(String) : [],
          adopted: null,
          rejectionReason: '',
        });
        this.emitChange(String(args.sessionId), 'recommendation_created', rec.id);
        return rec;
      },
    });

    // ── 洞见 ────────────────────────────────────────

    this.register('decision_add_insight', {
      description: '记录一个洞见',
      handler: async (args) => {
        const activeRun = await this.service.getActiveStageRun(String(args.sessionId));
        const insight = await this.service.addInsight({
          sessionId: String(args.sessionId),
          stageRunId: activeRun?.id ?? null,
          content: String(args.content),
          stage: String(args.stage ?? 'problem_definition') as DecisionStage,
          importance: (String(args.importance ?? 'medium')) as ImportanceLevel,
        });
        this.emitChange(String(args.sessionId), 'insight_added', insight.id);
        return insight;
      },
    });

    // ── 完成条件检查 ────────────────────────────────

    this.register('decision_check_completion', {
      description: '检查当前阶段的完成条件是否满足',
      handler: async (args) => {
        const sessionId = String(args.sessionId);
        const stage = String(args.stage) as DecisionStage;
        return this.service.checkStageCompletion(sessionId, stage);
      },
    });
  }

  // ── 工具注册与执行 ─────────────────────────────────

  private register(name: string, tool: { description: string; handler: ToolHandler }): void {
    this.tools.set(name, tool);
  }

  getToolDefinitions(): Array<{ name: string; description: string }> {
    return Array.from(this.tools.entries()).map(([name, t]) => ({
      name,
      description: t.description,
    }));
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown decision tool: ${name}`);
    return tool.handler(args);
  }

  private emitChange(sessionId: string, type: string, entityId?: string): void {
    ipcBridge.decision.dataChanged.emit({ sessionId, type, entityId });
  }
}
