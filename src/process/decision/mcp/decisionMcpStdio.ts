/**
 * Standalone stdio MCP server for Decision Workbench tools.
 *
 * Spawned by AI Agent as a stdio MCP server. Communicates with
 * the main process TCP server via DECISION_MCP_PORT environment variable.
 *
 * TCP protocol: 4-byte big-endian length header + UTF-8 JSON body.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as net from 'node:net';

const DECISION_MCP_PORT = parseInt(process.env.DECISION_MCP_PORT || '0', 10);
const DECISION_MCP_TOKEN = process.env.DECISION_MCP_TOKEN || undefined;

process.stderr.write(
  `[decision-mcp-stdio] Script started. PID=${process.pid}, PORT=${DECISION_MCP_PORT || 'unset'}\n`
);

if (!DECISION_MCP_PORT) {
  process.stderr.write('DECISION_MCP_PORT environment variable is required\n');
  process.exit(1);
}
if (!DECISION_MCP_TOKEN) {
  process.stderr.write('DECISION_MCP_TOKEN environment variable is required\n');
  process.exit(1);
}

// ── TCP helpers ─────────────────────────────────────

function sendTcpRequest(port: number, data: unknown): Promise<{ result?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      const json = JSON.stringify(data);
      const body = Buffer.from(json, 'utf-8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);
      socket.write(Buffer.concat([header, body]));
    });

    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
    });

    socket.on('end', () => {
      if (buffer.length < 4) {
        reject(new Error('Incomplete TCP response'));
        return;
      }
      const bodyLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + bodyLen) {
        reject(new Error('Incomplete TCP response body'));
        return;
      }
      const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
      try {
        resolve(JSON.parse(jsonStr) as { result?: string; error?: string });
      } catch (err) {
        reject(new Error(`Failed to parse TCP response: ${(err as Error).message}`));
      }
    });

    socket.on('error', (err: Error) => {
      reject(new Error(`TCP connection error: ${err.message}`));
    });

    socket.setTimeout(120_000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('TCP request timeout'));
    });
  });
}

// ── Tool registration helper ────────────────────────

function createDecisionTool(
  mcpServer: McpServer,
  toolName: string,
  description: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  tcpPort: number,
  authToken: string
): void {
  mcpServer.tool(toolName, description, schema, async (args: Record<string, unknown>) => {
    try {
      const payload = { tool: toolName, args, auth_token: authToken };
      const response = await sendTcpRequest(tcpPort, payload);

      if (response.error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: response.result || '' }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });
}

// ── Register all decision tools ─────────────────────

const server = new McpServer(
  { name: 'coreai-decision', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// 上下文查询
createDecisionTool(server, 'decision_get_context_summary', '获取当前决策会话的摘要版上下文', { sessionId: z.string().describe('决策会话 ID') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);
createDecisionTool(server, 'decision_get_context_detail', '获取指定阶段的完整数据', { sessionId: z.string().describe('决策会话 ID'), stage: z.enum(['problem_definition', 'research', 'comparison', 'convergence']).describe('阶段名') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// 需求简报
createDecisionTool(server, 'decision_save_need_brief', '保存需求简报到当前阶段', { sessionId: z.string().describe('决策会话 ID'), content: z.string().describe('需求简报内容 markdown') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// 调研条目
createDecisionTool(server, 'decision_add_research_item', '添加调研条目', { sessionId: z.string().describe('决策会话 ID'), title: z.string().describe('调研对象名称'), source: z.string().optional().describe('来源 URL'), sourceType: z.enum(['project', 'paper', 'article', 'manual']).optional().describe('来源类型'), summary: z.string().optional().describe('核心发现摘要'), borrowable: z.string().optional().describe('可借鉴部分'), notBorrowable: z.string().optional().describe('不建议借鉴部分'), inspiration: z.string().optional().describe('对当前问题的启发'), tags: z.array(z.string()).optional().describe('标签') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// 证据
createDecisionTool(server, 'decision_add_evidence', '为调研条目添加证据', { sessionId: z.string().describe('决策会话 ID'), researchItemId: z.string().describe('调研条目 ID'), content: z.string().describe('证据内容'), sourceRef: z.string().optional().describe('来源引用'), confidence: z.number().optional().describe('可信度 0-1') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// 候选方案
createDecisionTool(server, 'decision_add_candidate', '添加候选方案', { sessionId: z.string().describe('决策会话 ID'), name: z.string().describe('方案名称'), description: z.string().optional().describe('方案描述'), pros: z.array(z.string()).optional().describe('优点'), cons: z.array(z.string()).optional().describe('缺点'), risks: z.array(z.string()).optional().describe('风险'), constraints: z.array(z.string()).optional().describe('约束') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// 评估维度
createDecisionTool(server, 'decision_set_dimensions', '设置评估维度', { sessionId: z.string().describe('决策会话 ID'), dimensions: z.array(z.object({ name: z.string(), weight: z.number(), description: z.string().optional() })).describe('维度列表') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// 方案评分
createDecisionTool(server, 'decision_score_candidate', '为候选方案评分', { sessionId: z.string().describe('决策会话 ID'), candidateId: z.string().describe('候选方案 ID'), scores: z.record(z.object({ value: z.number(), reasoning: z.string() })).describe('评分') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// 决策建议
createDecisionTool(server, 'decision_create_recommendation', '生成决策建议', { sessionId: z.string().describe('决策会话 ID'), recommendedOptionId: z.string().describe('推荐方案 ID'), reasoning: z.string().describe('推荐理由'), alternativeIds: z.array(z.string()).optional().describe('备选方案 ID'), pendingItems: z.array(z.string()).optional().describe('待确认事项'), nextSteps: z.array(z.string()).optional().describe('下一步行动') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// 洞见
createDecisionTool(server, 'decision_add_insight', '记录决策洞见', { sessionId: z.string().describe('决策会话 ID'), content: z.string().describe('洞见内容'), stage: z.enum(['problem_definition', 'research', 'comparison', 'convergence']).optional().describe('所属阶段'), importance: z.enum(['low', 'medium', 'high']).optional().describe('重要程度') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// 完成条件检查
createDecisionTool(server, 'decision_check_completion', '检查阶段完成条件', { sessionId: z.string().describe('决策会话 ID'), stage: z.enum(['problem_definition', 'research', 'comparison', 'convergence']).describe('阶段名') }, DECISION_MCP_PORT, DECISION_MCP_TOKEN);

// ── Start stdio transport ───────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[decision-mcp-stdio] MCP server ready\n`);
}

main().catch((err) => {
  process.stderr.write(`[decision-mcp-stdio] Fatal error: ${err}\n`);
  process.exit(1);
});
