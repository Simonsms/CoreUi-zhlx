// src/process/decision/init.ts
// 决策模块异步初始化入口

import { getDatabase } from '@process/services/database';
import { initDecisionBridge } from '@process/bridge/decisionBridge';
import { runDecisionMigrations } from './migrations';
import { DecisionService } from './DecisionService';
import { DecisionMcpTools } from './DecisionMcpServer';
import { SqliteDecisionRepository } from './repository/SqliteDecisionRepository';

let mcpTools: DecisionMcpTools | null = null;

export async function initDecisionModule(): Promise<void> {
  const aionDb = await getDatabase();
  const driver = aionDb.getDriver();

  // 执行独立迁移
  runDecisionMigrations(driver);

  // 初始化 Service + Bridge + MCP 工具
  const repo = new SqliteDecisionRepository(driver);
  const service = new DecisionService(repo);
  initDecisionBridge(service);
  mcpTools = new DecisionMcpTools(service);

  console.log('[Decision] Module initialized with', mcpTools.getToolDefinitions().length, 'MCP tools');
}

export function getDecisionMcpTools(): DecisionMcpTools | null {
  return mcpTools;
}
