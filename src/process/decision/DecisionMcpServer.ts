// src/process/decision/DecisionMcpServer.ts
// 决策模块 MCP 工具 — 业务逻辑层
// 注意：当前版本是纯内存工具注册，Phase 5 将改造为 TCP MCP Server

import { ipcBridge } from '@/common';
import type { DecisionService } from './DecisionService';
import type { DecisionStage, ImportanceLevel, SourceType } from './types';

type JsonSchema = {
  type: string;
  properties?: Record<string, { type: string; description?: string; items?: { type: string }; enum?: string[] }>;
  required?: string[];
};

type ToolDef = {
  description: string;
  inputSchema: JsonSchema;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

function requireString(args: Record<string, unknown>, key: string): string {
  const val = args[key];
  if (val === undefined || val === null || val === '') {
    throw new Error(`Missing required parameter: ${key}`);
  }
  return String(val);
}

function optionalString(args: Record<string, unknown>, key: string, fallback = ''): string {
  const val = args[key];
  return val !== undefined && val !== null ? String(val) : fallback;
}

function optionalNumber(args: Record<string, unknown>, key: string, fallback: number): number {
  const val = args[key];
  return val !== undefined && val !== null ? Number(val) : fallback;
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] {
  const val = args[key];
  return Array.isArray(val) ? val.map(String) : [];
}

export class DecisionMcpTools {
  private tools: Map<string, ToolDef> = new Map();

  constructor(private readonly service: DecisionService) {
    this.registerTools();
  }

  private registerTools(): void {
    // ── 上下文查询 ──────────────────────────────────

    this.register('decision_get_context_summary', {
      description: '获取当前决策会话的摘要版上下文（前序阶段产出物概要）',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
        },
        required: ['sessionId'],
      },
      handler: async (args) => {
        return this.service.aggregateContextSummary(requireString(args, 'sessionId'));
      },
    });

    this.register('decision_get_context_detail', {
      description: '获取指定阶段的完整数据',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
          stage: { type: 'string', description: '阶段名', enum: ['problem_definition', 'research', 'comparison', 'convergence'] },
        },
        required: ['sessionId', 'stage'],
      },
      handler: async (args) => {
        return this.service.aggregateContextDetail(
          requireString(args, 'sessionId'),
          requireString(args, 'stage') as DecisionStage
        );
      },
    });

    // ── 需求简报 ────────────────────────────────────

    this.register('decision_save_need_brief', {
      description: '保存需求简报到当前阶段的 output 字段',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
          content: { type: 'string', description: '需求简报内容（markdown）' },
        },
        required: ['sessionId', 'content'],
      },
      handler: async (args) => {
        const sessionId = requireString(args, 'sessionId');
        const content = requireString(args, 'content');
        const activeRun = await this.service.getActiveStageRun(sessionId);
        if (!activeRun) throw new Error('No active stage run for this session');
        const updated = await this.service.updateStageRun(activeRun.id, { output: content });
        this.emitChange(sessionId, 'stage_updated', activeRun.id);
        return { success: true, stageRunId: updated.id };
      },
    });

    // ── 调研条目 ────────────────────────────────────

    this.register('decision_add_research_item', {
      description: '添加一个调研条目（项目、论文、文章等的分析结果）',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
          title: { type: 'string', description: '调研对象名称' },
          source: { type: 'string', description: '来源 URL 或引用' },
          sourceType: { type: 'string', description: '来源类型', enum: ['project', 'paper', 'article', 'manual'] },
          summary: { type: 'string', description: '核心发现摘要' },
          borrowable: { type: 'string', description: '可借鉴部分' },
          notBorrowable: { type: 'string', description: '不建议借鉴部分' },
          inspiration: { type: 'string', description: '对当前问题的启发' },
          tags: { type: 'array', description: '标签', items: { type: 'string' } },
        },
        required: ['sessionId', 'title'],
      },
      handler: async (args) => {
        const sessionId = requireString(args, 'sessionId');
        const activeRun = await this.service.getActiveStageRun(sessionId);
        if (!activeRun) throw new Error('No active stage run — cannot add research item without an active stage');
        const item = await this.service.addResearchItem({
          sessionId,
          stageRunId: activeRun.id,
          title: requireString(args, 'title'),
          source: optionalString(args, 'source'),
          sourceType: (optionalString(args, 'sourceType', 'manual')) as SourceType,
          summary: optionalString(args, 'summary'),
          borrowable: optionalString(args, 'borrowable'),
          notBorrowable: optionalString(args, 'notBorrowable'),
          inspiration: optionalString(args, 'inspiration'),
          tags: optionalStringArray(args, 'tags'),
        });
        this.emitChange(sessionId, 'research_added', item.id);
        return item;
      },
    });

    // ── 证据 ────────────────────────────────────────

    this.register('decision_add_evidence', {
      description: '为某个调研条目添加一条证据',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID（用于事件通知）' },
          researchItemId: { type: 'string', description: '关联的调研条目 ID' },
          content: { type: 'string', description: '证据内容' },
          sourceRef: { type: 'string', description: '来源引用' },
          confidence: { type: 'number', description: '可信度 0-1' },
        },
        required: ['sessionId', 'researchItemId', 'content'],
      },
      handler: async (args) => {
        const sessionId = requireString(args, 'sessionId');
        const evidence = await this.service.addEvidence({
          researchItemId: requireString(args, 'researchItemId'),
          content: requireString(args, 'content'),
          sourceRef: optionalString(args, 'sourceRef'),
          confidence: optionalNumber(args, 'confidence', 0.5),
        });
        this.emitChange(sessionId, 'evidence_added', evidence.id);
        return evidence;
      },
    });

    // ── 候选方案 ────────────────────────────────────

    this.register('decision_add_candidate', {
      description: '添加一个候选方案',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
          name: { type: 'string', description: '方案名称' },
          description: { type: 'string', description: '方案描述' },
          pros: { type: 'array', description: '优点', items: { type: 'string' } },
          cons: { type: 'array', description: '缺点', items: { type: 'string' } },
          risks: { type: 'array', description: '风险', items: { type: 'string' } },
          constraints: { type: 'array', description: '约束', items: { type: 'string' } },
        },
        required: ['sessionId', 'name'],
      },
      handler: async (args) => {
        const sessionId = requireString(args, 'sessionId');
        const candidate = await this.service.addCandidate({
          sessionId,
          name: requireString(args, 'name'),
          description: optionalString(args, 'description'),
          pros: optionalStringArray(args, 'pros'),
          cons: optionalStringArray(args, 'cons'),
          risks: optionalStringArray(args, 'risks'),
          constraints: optionalStringArray(args, 'constraints'),
          scores: {},
        });
        this.emitChange(sessionId, 'candidate_added', candidate.id);
        return candidate;
      },
    });

    // ── 评估维度（批量设置）────────────────────────

    this.register('decision_set_dimensions', {
      description: '设置评估维度（替换已有维度）',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
          dimensions: { type: 'array', description: '维度列表', items: { type: 'object' } },
        },
        required: ['sessionId', 'dimensions'],
      },
      handler: async (args) => {
        const sessionId = requireString(args, 'sessionId');
        const dimensions = args.dimensions as Array<{ name: string; weight: number; description?: string }>;
        if (!Array.isArray(dimensions)) throw new Error('dimensions must be an array');

        // 先创建新维度，全部成功后再删除旧维度（防止中途失败丢数据）
        const created = [];
        for (const dim of dimensions) {
          if (!dim.name) throw new Error('Each dimension must have a name');
          const d = await this.service.addDimension({
            sessionId,
            name: String(dim.name),
            weight: Number(dim.weight ?? 1.0),
            description: String(dim.description ?? ''),
          });
          created.push(d);
        }

        // 新维度全部创建成功，删除旧维度
        const existing = await this.service.listDimensions(sessionId);
        const newIds = new Set(created.map((d) => d.id));
        for (const dim of existing) {
          if (!newIds.has(dim.id)) {
            await this.service.deleteDimension(dim.id);
          }
        }

        this.emitChange(sessionId, 'dimension_added');
        return created;
      },
    });

    // ── 方案评分 ────────────────────────────────────

    this.register('decision_score_candidate', {
      description: '为候选方案设置各维度评分',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
          candidateId: { type: 'string', description: '候选方案 ID' },
          scores: { type: 'object', description: '评分 { dimensionId: { value: number, reasoning: string } }' },
        },
        required: ['sessionId', 'candidateId', 'scores'],
      },
      handler: async (args) => {
        const sessionId = requireString(args, 'sessionId');
        const candidateId = requireString(args, 'candidateId');
        const scores = args.scores as Record<string, { value: number; reasoning: string }>;
        if (!scores || typeof scores !== 'object') throw new Error('scores must be an object');
        const updated = await this.service.updateCandidate(candidateId, { scores });
        this.emitChange(sessionId, 'candidate_updated', candidateId);
        return updated;
      },
    });

    // ── 决策建议 ────────────────────────────────────

    this.register('decision_create_recommendation', {
      description: '生成最终决策建议',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
          recommendedOptionId: { type: 'string', description: '推荐的候选方案 ID' },
          reasoning: { type: 'string', description: '推荐理由' },
          alternativeIds: { type: 'array', description: '备选方案 ID', items: { type: 'string' } },
          pendingItems: { type: 'array', description: '待确认事项', items: { type: 'string' } },
          nextSteps: { type: 'array', description: '下一步行动', items: { type: 'string' } },
        },
        required: ['sessionId', 'recommendedOptionId', 'reasoning'],
      },
      handler: async (args) => {
        const sessionId = requireString(args, 'sessionId');
        const rec = await this.service.createRecommendation({
          sessionId,
          recommendedOptionId: requireString(args, 'recommendedOptionId'),
          reasoning: requireString(args, 'reasoning'),
          alternativeIds: optionalStringArray(args, 'alternativeIds'),
          pendingItems: optionalStringArray(args, 'pendingItems'),
          nextSteps: optionalStringArray(args, 'nextSteps'),
          adopted: null,
          rejectionReason: '',
        });
        this.emitChange(sessionId, 'recommendation_created', rec.id);
        return rec;
      },
    });

    // ── 洞见 ────────────────────────────────────────

    this.register('decision_add_insight', {
      description: '记录一个决策过程中的洞见',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
          content: { type: 'string', description: '洞见内容' },
          stage: { type: 'string', description: '所属阶段', enum: ['problem_definition', 'research', 'comparison', 'convergence'] },
          importance: { type: 'string', description: '重要程度', enum: ['low', 'medium', 'high'] },
        },
        required: ['sessionId', 'content'],
      },
      handler: async (args) => {
        const sessionId = requireString(args, 'sessionId');
        const activeRun = await this.service.getActiveStageRun(sessionId);
        const insight = await this.service.addInsight({
          sessionId,
          stageRunId: activeRun?.id ?? null,
          content: requireString(args, 'content'),
          stage: (optionalString(args, 'stage', 'problem_definition')) as DecisionStage,
          importance: (optionalString(args, 'importance', 'medium')) as ImportanceLevel,
        });
        this.emitChange(sessionId, 'insight_added', insight.id);
        return insight;
      },
    });

    // ── 完成条件检查 ────────────────────────────────

    this.register('decision_check_completion', {
      description: '检查指定阶段的完成条件是否满足',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '决策会话 ID' },
          stage: { type: 'string', description: '阶段名', enum: ['problem_definition', 'research', 'comparison', 'convergence'] },
        },
        required: ['sessionId', 'stage'],
      },
      handler: async (args) => {
        return this.service.checkStageCompletion(
          requireString(args, 'sessionId'),
          requireString(args, 'stage') as DecisionStage
        );
      },
    });
  }

  // ── 公开 API ──────────────────────────────────────

  private register(name: string, tool: ToolDef): void {
    this.tools.set(name, tool);
  }

  getToolDefinitions(): Array<{ name: string; description: string; inputSchema: JsonSchema }> {
    return Array.from(this.tools.entries()).map(([name, t]) => ({
      name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown decision tool: ${name}`);
    try {
      return await tool.handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[DecisionMcpTools] ${name} failed:`, message);
      throw err;
    }
  }

  private emitChange(sessionId: string, type: string, entityId?: string): void {
    if (sessionId) {
      ipcBridge.decision.dataChanged.emit({ sessionId, type, entityId });
    }
  }
}
