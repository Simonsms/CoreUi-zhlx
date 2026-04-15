// src/process/decision/init.ts
// 决策模块异步初始化入口

import { getDatabase } from '@process/services/database';
import { initDecisionBridge } from '@process/bridge/decisionBridge';
import { runDecisionMigrations } from './migrations';
import { DecisionService } from './DecisionService';
import { DecisionMcpTools } from './DecisionMcpServer';
import { DecisionTcpServer } from './mcp/DecisionTcpServer';
import { SqliteDecisionRepository } from './repository/SqliteDecisionRepository';
import type { StdioMcpConfig } from './mcp/DecisionTcpServer';

let mcpTools: DecisionMcpTools | null = null;
let tcpServer: DecisionTcpServer | null = null;
let stdioConfig: StdioMcpConfig | null = null;

export async function initDecisionModule(): Promise<void> {
  const aionDb = await getDatabase();
  const driver = aionDb.getDriver();

  // 执行独立迁移
  runDecisionMigrations(driver);

  // 初始化 Service + Bridge
  const repo = new SqliteDecisionRepository(driver);
  const service = new DecisionService(repo);
  initDecisionBridge(service);

  // 初始化 MCP 工具 + TCP Server
  mcpTools = new DecisionMcpTools(service);
  tcpServer = new DecisionTcpServer(mcpTools);
  stdioConfig = await tcpServer.start();

  console.log(
    `[Decision] Module initialized: ${mcpTools.getToolDefinitions().length} MCP tools, TCP port ${tcpServer.getPort()}`
  );
}

export function getDecisionMcpTools(): DecisionMcpTools | null {
  return mcpTools;
}

export function getDecisionStdioConfig(): StdioMcpConfig | null {
  return stdioConfig;
}

export async function stopDecisionModule(): Promise<void> {
  if (tcpServer) {
    await tcpServer.stop();
    tcpServer = null;
  }
  mcpTools = null;
  stdioConfig = null;
}
